import {ensure,copy} from './errors.mjs';
import {validDate,instant} from './time.mjs';
const text=(v,n=500)=>{ensure(typeof v==='string'&&v.trim().length>0&&v.length<=n,'model_contract','Помощник вернул неполные данные. Исходная просьба сохранена.');return v.trim();};
function list(value,max=64) {ensure(Array.isArray(value)&&value.length<=max,'model_contract','Помощник вернул слишком большой или неполный список.');return value;}
export function validateExtraction(raw,{sourceTexts, state}) {
  ensure(raw&&typeof raw==='object'&&!Array.isArray(raw),'model_contract','Ответ помощника не удалось прочитать.');
  ensure(['chat','plan','remember'].includes(raw.intent),'model_contract','Не удалось определить, это обсуждение или поручение.');
  const reply=text(raw.reply,8000);
  const questions=list(raw.questions||[],8).map(q=>text(q,500));
  if(raw.intent==='chat') {
    ensure(!['tasks','eventMoves','newEvents','projects','memories'].some(k=>(raw[k]||[]).length),'model_contract','Обычный ответ не должен содержать скрытые изменения.');
    return {intent:'chat',reply,questions,tasks:[],eventMoves:[],newEvents:[],projects:[],memories:[],windows:[],reschedule:false};
  }
  const evidence=quote=>{const q=text(quote,24000);ensure(sourceTexts.some(s=>s.includes(q)),'source_missing','В плане появился пункт без подтверждения в твоих словах. Просьба сохранена, записи не изменены.');return q;};
  const projects=list(raw.projects||[],16).map(p=>({ref:text(p.ref,80),id:p.id||null,title:text(p.title,120),goal:text(p.goal,1500),quote:evidence(p.quote)}));
  for(const p of projects)if(p.id)ensure(state.projects.some(x=>x.id===p.id),'project_missing','Проект уже изменился. Обновим данные.');
  const refs=new Set();
  const tasks=list(raw.tasks||[]).map((t,order)=>{
    const ref=text(t.ref,80);ensure(!refs.has(ref),'duplicate_ref','Помощник повторил один этап.');refs.add(ref);
    ensure(t.owner==='user','owner','В план попало чужое поручение.');
    const existing=t.id?state.tasks.find(x=>x.id===t.id):null;
    if(t.id)ensure(existing,'task_missing','Дело уже изменилось. Обновим данные.');
    const durationMinutes=t.durationMinutes??existing?.durationMinutes??null;
    if(durationMinutes!=null)ensure(Number.isInteger(durationMinutes)&&durationMinutes>=5&&durationMinutes<=1440,'duration','Не удалось проверить длительность дела.');
    ensure(['explicit','estimate','unknown'].includes(t.durationSource),'duration','Помощник не указал, известна ли длительность.');
    ensure(t.durationSource!=='unknown'||durationMinutes===null,'duration','Неизвестную длительность нельзя выдавать за известную.');
    const quote=evidence(t.quote);
    if(t.durationSource==='explicit')evidence(t.durationQuote);
    const dueDate=t.dueDate??existing?.dueDate??null;
    if(dueDate)ensure(validDate(dueDate),'date','В плане несуществующий срок.');
    const projectRef=t.projectRef||null;
    if(projectRef)ensure(projects.some(p=>p.ref===projectRef)||state.projects.some(p=>p.id===projectRef),'project','Не найден проект для этапа.');
    const deps=list(t.dependsOn||[],64).map(d=>text(d,80));
    return {ref,id:existing?.id||null,title:text(t.title,200),durationMinutes,durationEstimated:t.durationSource==='estimate',dueDate,deadlineAt:t.deadlineAt?instant(t.deadlineAt):null,notBefore:t.notBefore?instant(t.notBefore):null,fixedStart:t.fixedStart?instant(t.fixedStart):null,priority:[1,2,3].includes(t.priority)?t.priority:2,projectRef,dependsOn:deps,quote,order};
  });
  for(const t of tasks)ensure(t.dependsOn.every(id=>refs.has(id)),'dependency','Ссылка на предыдущий этап не найдена.');
  const eventMoves=list(raw.eventMoves||[],32).map(e=>{
    ensure(state.events.some(x=>x.id===e.id&&!x.allDayDate),'event_missing','Для переноса нужна существующая встреча со временем.');
    return {id:e.id,start:instant(e.start),quote:evidence(e.quote)};
  });
  ensure(new Set(eventMoves.map(e=>e.id)).size===eventMoves.length,'event_duplicate','Одна встреча перенесена дважды.');
  const newEvents=list(raw.newEvents||[],32).map(e=>({title:text(e.title,200),start:instant(e.start),end:instant(e.end),quote:evidence(e.quote)}));
  for(const e of newEvents)ensure(Date.parse(e.end)>Date.parse(e.start),'event_duration','Встреча должна заканчиваться позже начала.');
  const memories=list(raw.memories||[],16).map(m=>({text:text(m.text,1000),quote:evidence(m.quote)}));
  const windows=list(raw.windows||[],31).map(w=>({start:instant(w.start),end:instant(w.end)}));
  const from=raw.from||null,to=raw.to||from;
  if(from)ensure(validDate(from)&&validDate(to)&&from<=to,'range','Не удалось проверить период планирования.');
  const reschedule=raw.reschedule===true;
  if(reschedule)ensure(from&&to,'range','Для перестройки нужен точный период.');
  const scheduleMode=['timed','inbox','none'].includes(raw.scheduleMode)?raw.scheduleMode:null;
  if(scheduleMode==='timed'){
    ensure(from||windows.length,'schedule_period','Чтобы распределить дела по часам, нужно определить день или период.');
    ensure(tasks.every(t=>t.durationMinutes!=null),'schedule_duration','Для расписания нужны оценки длительности. Предложи оценки гибких дел или уточни важные ограничения.');
  }
  if(raw.breakMinutes!=null)ensure(Number.isInteger(raw.breakMinutes)&&raw.breakMinutes>=0&&raw.breakMinutes<=120,'break','Неподходящая длительность перерыва.');
  return {intent:raw.intent,scheduleMode,reply,questions,tasks,eventMoves,newEvents,projects,memories,windows,from,to,reschedule,breakMinutes:raw.breakMinutes??null};
}
export const cleanExtraction=value=>copy(value);
