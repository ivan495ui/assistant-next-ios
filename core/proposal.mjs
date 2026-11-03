import {copy,ensure} from './errors.mjs';
import {defaultWindows,schedule} from './scheduler.mjs';
import {addDays,wall,localDate,overlap} from './time.mjs';
function unchangedTask(before,after) {
  if(!before)return false;
  const fields=['title','durationMinutes','dueDate','priority','projectID','status'];
  if(fields.some(key=>(before[key]??null)!==(after[key]??null)))return false;
  if(!!before.durationEstimated!==!!after.durationEstimated)return false;
  for(const key of ['start','end','deadlineAt','notBefore','fixedStart'])if((before[key]?Date.parse(before[key]):null)!==(after[key]?Date.parse(after[key]):null))return false;
  return JSON.stringify(before.dependsOn||[])===JSON.stringify(after.dependsOn||[]);
}

export function buildProposal(raw,state,{id,now=Date.now()}) {
  const actions=[],warnings=[],projectIDs=new Map();
  raw.projects.forEach((p,i)=>{const pid=p.id||`${id}-project-${i}`;projectIDs.set(p.ref,pid);actions.push({kind:'project',id:pid,title:p.title,before:p.id?copy(state.projects.find(x=>x.id===p.id)):null,after:{id:pid,title:p.title,goal:p.goal,nextStep:'',revision:1}});});
  const events=copy(state.events);
  for(const move of raw.eventMoves) {
    const before=events.find(e=>e.id===move.id),length=Date.parse(before.end)-Date.parse(before.start);
    const after={...before,start:move.start,end:new Date(Date.parse(move.start)+length).toISOString(),revision:before.revision+1};
    events.splice(events.indexOf(before),1,after);
    if(Date.parse(before.start)!==Date.parse(after.start))actions.push({kind:'event',id:before.id,title:before.title,before:copy(before),after});
  }
  raw.newEvents.forEach((e,i)=>{const eid=`${id}-event-${i}`,after={id:eid,title:e.title,start:e.start,end:e.end,allDayDate:null,fixed:true,source:'assistant',revision:1};events.push(after);actions.push({kind:'event',id:eid,title:e.title,before:null,after});});
  // Refuse explicit moves into another fixed event. Never silently shift a meeting.
  for(const action of actions.filter(a=>a.kind==='event'))ensure(!events.some(e=>e.id!==action.id&&e.start&&overlap(action.after,e)),'event_conflict','Встреча пересекается с другой. Выбери другое время перед сохранением.');
  const normalize=title=>title.toLocaleLowerCase('ru').replace(/\s+/g,' ').trim();
  const resolved=raw.tasks.map(t=>{
    if(t.id)return t;
    const matches=state.tasks.filter(x=>x.status==='open'&&normalize(x.title)===normalize(t.title)&&(x.dueDate||null)===(t.dueDate||null));
    ensure(matches.length<=1,'duplicate_ambiguous','Найдено несколько похожих дел. Уточни, какое нужно изменить.');
    return matches.length?{...t,id:matches[0].id}:t;
  });
  const refIDs=new Map(resolved.map((t,i)=>[t.ref,t.id||`${id}-task-${i}`]));
  ensure(new Set(refIDs.values()).size===refIDs.size,'duplicate_task','Один пункт повторяется в плане. Объедини его перед сохранением.');
  const planned=resolved.map(t=>{
    const before=t.id?state.tasks.find(x=>x.id===t.id):null;
    return {...(before||{}),id:refIDs.get(t.ref),title:t.title,durationMinutes:t.durationMinutes,durationEstimated:t.durationEstimated,dueDate:t.dueDate,deadlineAt:t.deadlineAt||(t.dueDate?wall(addDays(t.dueDate,1),'00:00',state.profile.timeZone):null),notBefore:t.notBefore,fixedStart:t.fixedStart,priority:t.priority,projectID:projectIDs.get(t.projectRef)||t.projectRef||null,dependsOn:t.dependsOn.map(ref=>refIDs.get(ref)||ref),order:t.order,status:before?.status||'open',revision:(before?.revision||0)+1};
  });
  if(raw.reschedule)for(const task of state.tasks) {
    if(task.status!=='open'||planned.some(t=>t.id===task.id))continue;
    if(task.start) {const day=localDate(task.start,state.profile.timeZone);if(day>=raw.from&&day<=raw.to)planned.push({...copy(task),order:planned.length,revision:task.revision+1});}
  }
  const ids=new Set(planned.map(t=>t.id));
  for(const action of actions.filter(a=>a.kind==='event'))ensure(!state.tasks.some(t=>t.start&&t.end&&t.status==='open'&&!ids.has(t.id)&&overlap(action.after,t)),'event_task_conflict','В это время запланировано дело. Попроси перестроить день вместе с переносом встречи.');
  // Dependencies outside this plan use their known scheduled result, not a new invented task.
  for(const t of planned) {
    const external=(t.dependsOn||[]).filter(dep=>!ids.has(dep));
    for(const dep of external){const previous=state.tasks.find(x=>x.id===dep);ensure(previous&&(previous.status==='done'||previous.end),'dependency','Сначала нужно определить время предыдущего этапа.');if(previous.end&&(!t.notBefore||t.notBefore<previous.end))t.notBefore=previous.end;}
    t.allDependencies=copy(t.dependsOn||[]);t.dependsOn=(t.dependsOn||[]).filter(dep=>ids.has(dep));
  }
  const occupied=[...events.filter(e=>e.start&&e.end),...state.tasks.filter(t=>t.start&&t.end&&t.status==='open'&&!ids.has(t.id)).map(t=>({id:t.id,start:t.start,end:t.end}))];
  // All-day entries block the complete local day.
  for(const e of events.filter(e=>e.allDayDate))occupied.push({id:e.id,start:wall(e.allDayDate,'00:00',state.profile.timeZone),end:wall(addDays(e.allDayDate,1),'00:00',state.profile.timeZone)});
  let windows=raw.windows;
  if(!windows.length&&raw.from)windows=defaultWindows(state.profile,raw.from,raw.to);
  let result;
  if(windows.length)result=schedule({tasks:planned,events:occupied,windows,breakMinutes:raw.breakMinutes??state.profile.breakMinutes,now});
  else result={scheduled:[],unscheduled:planned.map(t=>({...t,start:null,end:null,reason:'Сохранится в списке без назначенного времени'}))};
  for(const task of [...result.scheduled,...result.unscheduled]) {
    const before=state.tasks.find(t=>t.id===task.id)||null;
    const {order,reason,allDependencies,...after}=task;after.dependsOn=allDependencies||task.dependsOn;
    if(unchangedTask(before,after))continue;
    if(task.durationEstimated)warnings.push(`«${task.title}»: ${task.durationMinutes} мин — оценка, её можно изменить.`);
    actions.push({kind:'task',id:task.id,title:task.title,before:before?copy(before):null,after});
  }
  raw.memories.forEach((m,i)=>{const found=state.memory.find(x=>x.text===m.text);if(!found)actions.push({kind:'memory',id:`${id}-memory-${i}`,title:m.text,before:null,after:{id:`${id}-memory-${i}`,text:m.text,revision:1}});});
  const unscheduled=result.unscheduled.map(t=>({id:t.id,title:t.title,reason:t.reason}));
  return {id,status:'draft',baseRevision:state.dataRevision,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+86400000).toISOString(),title:raw.reschedule?'Обновлённый план':'Предложение помощника',reply:raw.reply,questions:raw.questions,actions,warnings,unscheduled,raw};
}

export function confirmProposal(state,proposalID,{now=Date.now()}={}) {
  const receipt=state.receipts.find(r=>r.proposalID===proposalID);
  if(receipt)return {state,receipt,duplicate:true};
  const proposal=state.proposals.find(p=>p.id===proposalID);
  ensure(proposal&&proposal.status==='draft','proposal_missing','Это предложение уже закрыто. Открой актуальный план.',409);
  ensure(Date.parse(proposal.expiresAt)>now,'proposal_expired','План устарел. Пересобери его по актуальным данным.',409);
  ensure(proposal.baseRevision===state.dataRevision,'proposal_stale','Дела изменились после подготовки плана. Обнови предложение перед подтверждением.',409);
  const next=copy(state),results=[];
  for(const action of proposal.actions) {
    const collection={task:'tasks',event:'events',project:'projects',memory:'memory',message:'messages',archive:'legacyImports'}[action.kind];
    ensure(collection,'action','Неизвестное действие.',500);
    const list=next[collection],index=list.findIndex(x=>x.id===action.id);
    ensure(action.before?(index>=0&&list[index].revision===action.before.revision):index<0,'revision','Запись изменилась после подготовки плана.',409);
    if(index<0)list.push(copy(action.after));else list[index]=copy(action.after);
    results.push({id:action.id,title:action.title,status:'saved'});
    // Google is an explicit second stage; local success does not claim external success.
    if(action.after.externalID)next.syncJobs.push({id:`${proposalID}-${action.id}`,entityID:action.id,kind:action.kind,status:'pending',revision:action.after.revision});
  }
  next.dataRevision++;next.proposals.find(p=>p.id===proposalID).status='confirmed';
  const value={id:proposalID,proposalID,status:'saved',at:new Date(now).toISOString(),results};next.receipts.push(value);
  const timed=proposal.actions.filter(a=>['task','event'].includes(a.kind)&&a.after.start).length;
  const inbox=proposal.actions.filter(a=>a.kind==='task'&&!a.after.start).length;
  const summary=timed?`План сохранил. Блоков по времени: ${timed}. Смотри «Сегодня».`:`Изменения сохранил: ${results.length}.`;
  next.messages.push({id:`${proposalID}-receipt`,role:'assistant',text:summary+(inbox?` Без времени осталось: ${inbox}. Они в «Делах».`:'')+(next.syncJobs.some(j=>j.status==='pending')?' Синхронизация с Google ожидает отдельной проверки.':''),at:value.at,proposalID:null});
  return {state:next,receipt:value,duplicate:false};
}
