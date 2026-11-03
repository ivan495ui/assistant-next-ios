import {ensure,identifier,digest,copy,safeError,AppError} from '../core/errors.mjs';
import {publicSnapshot} from '../core/state.mjs';
import {validateExtraction} from '../core/contract.mjs';
import {buildProposal,confirmProposal} from '../core/proposal.mjs';
import {validDate,zoneValid,localDate} from '../core/time.mjs';
import {reservationFor,DeepSeekModel} from './model.mjs';
import {modelContext} from './prompt.mjs';
import {previewLegacyImport} from '../core/legacy.mjs';

export class Engine {
  constructor(repository,{model=new DeepSeekModel({}),now=()=>Date.now(),limits={day:0.10,month:1}}={}){Object.assign(this,{repository,model,now,limits});}
  async snapshot(){return {...publicSnapshot(await this.repository.read(),{aiAvailable:this.model.available,now:this.now()}),build:'next-durable-2'};}
  async enqueue({requestID,text}) {
    ensure(typeof requestID==='string'&&/^[a-zA-Z0-9_-]{12,80}$/.test(requestID),'request_id','Не удалось определить запрос.');
    ensure(typeof text==='string'&&text.trim()&&text.length<=24000,'input','Сообщение должно содержать от 1 до 24 000 символов.');
    const hash=await digest(text),now=this.now();
    return this.repository.transact(state=>{
      const found=state.jobs.find(j=>j.id===requestID);
      if(found){ensure(found.inputHash===hash,'request_reused','Этот запрос уже содержит другой текст.',409);return {ok:true,job:copy(found),duplicate:true};}
      const job={id:requestID,inputHash:hash,text,status:'queued',createdAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),proposalID:null,error:null};
      state.jobs.push(job);state.messages.push({id:requestID,role:'user',text,at:job.createdAt,proposalID:null});return {ok:true,job:copy(job),duplicate:false};
    });
  }
  async recoverInterrupted(){return this.repository.transact(s=>{for(const job of s.jobs.filter(j=>j.status==='running')){job.status='uncertain';job.error='Работа сервера прервалась. Исходная просьба сохранена; платный вызов не повторялся.';}});}
  async run(jobID) {
    let context;
    try {
      context=await this.repository.transact(state=>{
        const job=state.jobs.find(j=>j.id===jobID);ensure(job,'job_missing','Запрос не найден.',404);
        if(job.status!=='queued')return null;
        ensure(this.model.available,'ai_not_connected','ИИ пока не подключён. Текст сохранён, ручные дела доступны.',503);
        const now=this.now(),day=localDate(now,state.profile.timeZone),month=day.slice(0,7),reserve=reservationFor(modelContext(state,job.text,now));
        const used=range=>state.usage.filter(u=>u.day.startsWith(range)).reduce((sum,u)=>sum+u.charged,0)+(range===this.limits.baselineDay||range===this.limits.baselineMonth?Number(this.limits.baselineUsd||0):0);
        ensure(used(day)+reserve<=this.limits.day+1e-9&&used(month)+reserve<=this.limits.month+1e-9,'budget','Достигнут установленный бюджет ИИ. Текст сохранён; ручное планирование доступно.',429);
        state.usage.push({id:job.id,day,reserved:reserve,charged:reserve,status:'reserved'});
        job.status='running';job.updatedAt=new Date(now).toISOString();job.reservation=reserve;
        return {state:copy(state),job:copy(job),now};
      });
      if(!context)return;
      const result=await this.model.extract(context.state,context.job.text,context.now);
      await this.repository.transact(state=>{
        const job=state.jobs.find(j=>j.id===jobID);if(job.status!=='running')return;
        const sources=context.state.messages.filter(m=>m.role==='user').slice(-16).map(m=>m.text);
        const raw=validateExtraction(result.extraction,{sourceTexts:sources,state:context.state});
        const usage=state.usage.find(u=>u.id===jobID);
        if(result.usage&&Number.isFinite(result.usage.usd)&&result.usage.usd>=0){usage.charged=Math.max(result.usage.usd,0);usage.status='measured';usage.tokens=result.usage;}
        let proposal=null;
        if(raw.intent!=='chat') {
          ensure(state.dataRevision===context.state.dataRevision,'context_stale','Во время подготовки дела изменились. Просьба сохранена; обнови план.',409);
          proposal=buildProposal(raw,state,{id:jobID,now:this.now()});
          if(proposal.actions.length){for(const p of state.proposals)if(p.status==='draft')p.status='superseded';state.proposals.push(proposal);}
          else proposal=null;
        }
        job.status='completed';job.proposalID=proposal?.id||null;job.updatedAt=new Date(this.now()).toISOString();
        state.messages.push({id:`${jobID}-answer`,role:'assistant',text:raw.reply+(raw.questions.length?'\n'+raw.questions.join('\n'):''),at:job.updatedAt,proposalID:proposal?.id||null});
      });
    }catch(error){await this.repository.transact(state=>{const job=state.jobs.find(j=>j.id===jobID);if(!job||job.status==='completed')return;job.status=error.code==='ai_uncertain'?'uncertain':'failed';job.error=safeError(error).error;job.updatedAt=new Date(this.now()).toISOString();if(!state.messages.some(m=>m.id===`${jobID}-error`))state.messages.push({id:`${jobID}-error`,role:'assistant',text:job.error,at:job.updatedAt,proposalID:null});});}
  }
  async confirm(proposalID){return this.repository.transact(state=>{const result=confirmProposal(state,proposalID,{now:this.now()});Object.assign(state,result.state);return {ok:true,receipt:result.receipt,duplicate:result.duplicate};});}
  async decline(proposalID){return this.repository.transact(state=>{const p=state.proposals.find(p=>p.id===proposalID);ensure(p&&p.status==='draft','proposal_missing','Предложение уже закрыто.',409);p.status='declined';return {ok:true};});}
  async importPreview(input){return this.repository.transact(async state=>{const result=await previewLegacyImport(input,state,{now:this.now()});if(!result.duplicate){for(const p of state.proposals)if(p.status==='draft')p.status='superseded';state.proposals.push(result.proposal);}return {ok:true,proposalID:result.proposal.id,duplicate:result.duplicate};});}
  async editProposal({proposalID,taskID,durationMinutes,dueDate}) {
    return this.repository.transact(state=>{
      const p=state.proposals.find(p=>p.id===proposalID);ensure(p&&p.status==='draft','proposal_missing','Предложение уже закрыто.',409);
      ensure(p.raw,'import_edit','Перенос сохраняет исходные данные. Пункты можно изменить после подтверждения переноса.');
      ensure(p.baseRevision===state.dataRevision,'proposal_stale','Дела изменились. Сначала обнови предложение.',409);
      const action=p.actions.find(a=>a.id===taskID&&a.kind==='task');ensure(action,'task_missing','Пункт не найден.');
      const raw=copy(p.raw);let rawTask=raw.tasks.find(t=>t.id===taskID)||raw.tasks.find((t,i)=>`${p.id}-task-${i}`===taskID);
      if(!rawTask){const item=action.after;rawTask={...copy(item),ref:'edited-'+item.id,id:item.id,projectRef:item.projectID||null,order:raw.tasks.length,quote:'Изменено владельцем в карточке плана',dependsOn:item.dependsOn||[]};raw.tasks.push(rawTask);}
      ensure(Number.isInteger(durationMinutes)&&durationMinutes>=5&&durationMinutes<=1440,'duration','Длительность от 5 до 1440 минут.');
      ensure(dueDate==null||validDate(dueDate),'date','Нужна существующая дата.');
      rawTask.durationMinutes=durationMinutes;rawTask.durationEstimated=false;rawTask.dueDate=dueDate||null;
      const updated=buildProposal(raw,state,{id:p.id,now:this.now()});state.proposals[state.proposals.indexOf(p)]=updated;return {ok:true};
    });
  }
  async saveTask({id,expectedRevision,title,durationMinutes=null,dueDate=null,projectID=null,status='open',requestID}) {
    ensure(typeof title==='string'&&title.trim()&&title.length<=200,'title','Назови дело.');
    ensure(durationMinutes===null||Number.isInteger(durationMinutes)&&durationMinutes>=5&&durationMinutes<=1440,'duration','Длительность от 5 до 1440 минут.');
    ensure(dueDate===null||validDate(dueDate),'date','Нужна существующая дата.');
    ensure(['open','done'].includes(status),'status','Неизвестное состояние дела.');
    ensure(typeof requestID==='string'&&/^[a-zA-Z0-9_-]{12,80}$/.test(requestID),'request_id','Нужен идентификатор изменения.');
    const bodyHash=await digest({id,expectedRevision,title,durationMinutes,dueDate,projectID,status});
    return this.repository.transact(state=>{
      const receipt=state.receipts.find(r=>r.id===requestID);
      if(receipt){ensure(receipt.bodyHash===bodyHash,'request_reused','Идентификатор уже использован для другого изменения.',409);return {ok:true,duplicate:true};}
      const before=id?state.tasks.find(t=>t.id===id):null;
      if(id)ensure(before&&before.revision===expectedRevision,'revision','Дело изменилось. Обнови его перед сохранением.',409);
      if(projectID)ensure(state.projects.some(p=>p.id===projectID),'project_missing','Проект не найден.');
      const task={...(before||{}),id:before?.id||requestID,title:title.trim(),durationMinutes,durationEstimated:false,dueDate,projectID,status,revision:(before?.revision||0)+1,priority:before?.priority||2,dependsOn:before?.dependsOn||[],start:before?.start||null,end:before?.end||null};
      if(before&&before.durationMinutes!==durationMinutes){task.start=null;task.end=null;}
      if(before)state.tasks[state.tasks.indexOf(before)]=task;else state.tasks.push(task);
      state.dataRevision++;state.receipts.push({id:requestID,bodyHash,status:'saved',at:new Date(this.now()).toISOString(),results:[{id:task.id,title:task.title,status:'saved'}]});return {ok:true};
    });
  }
  async updateProfile(profile,expectedRevision){
    ensure(zoneValid(profile.timeZone)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(profile.dayStart)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(profile.dayEnd)&&profile.dayStart<profile.dayEnd,'profile','Проверь часовой пояс и рабочие часы.');
    ensure(Array.isArray(profile.workDays)&&profile.workDays.length&&profile.workDays.every(d=>Number.isInteger(d)&&d>=0&&d<=6),'profile','Выбери рабочие дни.');
    ensure(Number.isInteger(profile.breakMinutes)&&profile.breakMinutes>=0&&profile.breakMinutes<=120,'profile','Перерыв от 0 до 120 минут.');
    return this.repository.transact(state=>{ensure(state.dataRevision===expectedRevision,'revision','Настройки изменились. Обнови данные.',409);state.profile={...profile,name:String(profile.name||'').slice(0,80)};state.dataRevision++;return {ok:true};});
  }
}
