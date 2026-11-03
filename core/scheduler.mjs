import {ensure, copy} from './errors.mjs';
import {minute, instant, overlap, wall, addDays, validDate} from './time.mjs';

export function defaultWindows(profile, from, to) {
  ensure(validDate(from)&&validDate(to)&&from<=to,'range','Нужен период планирования.');
  const windows=[];
  for(let day=from, count=0;day<=to;day=addDays(day,1),count++) {
    ensure(count<31,'horizon','За один план можно распределить до 31 дня. Остальные дела сохранятся в списке.');
    const weekday=new Date(day+'T12:00:00Z').getUTCDay();
    if(!profile.workDays.includes(weekday))continue;
    windows.push({start:wall(day,profile.dayStart,profile.timeZone),end:wall(day,profile.dayEnd,profile.timeZone)});
  }
  return windows;
}

export function schedule({tasks, events=[], windows, breakMinutes=10, now=0}) {
  ensure(Array.isArray(tasks)&&tasks.length<=64,'capacity','Один план может включать до 64 дел.');
  ensure(Number.isInteger(breakMinutes)&&breakMinutes>=0&&breakMinutes<=120,'break','Перерыв должен быть от 0 до 120 минут.');
  const slots=windows.map(w=>({start:instant(w.start),end:instant(w.end)})).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  for(let i=0;i<slots.length;i++) {
    ensure(Date.parse(slots[i].end)>Date.parse(slots[i].start),'window','Окончание рабочего окна должно быть позже начала.');
    if(i)ensure(!overlap(slots[i-1],slots[i]),'window','Рабочие окна не должны пересекаться.');
  }
  const ids=new Set(tasks.map(t=>t.id));ensure(ids.size===tasks.length,'ids','У дел должны быть разные идентификаторы.');
  const occupied=events.filter(e=>e.start&&e.end).map(e=>({start:Date.parse(instant(e.start)),end:Date.parse(instant(e.end)),kind:'event'}));
  ensure(occupied.every(e=>e.end>e.start),'event','Встреча имеет некорректную длительность.');
  const remaining=new Map(tasks.map(t=>[t.id,copy(t)])), finished=new Map(), scheduled=[],unscheduled=[];
  for(const task of remaining.values()) {
    ensure(Array.isArray(task.dependsOn||[])&&(task.dependsOn||[]).every(id=>ids.has(id)),'dependency','Зависимость должна ссылаться на дело в этом плане.');
    if(task.durationMinutes!=null)ensure(Number.isInteger(task.durationMinutes)&&task.durationMinutes>=5&&task.durationMinutes<=1440,'duration','Длительность дела должна быть от 5 до 1440 минут.');
  }
  while(remaining.size) {
    const ready=[...remaining.values()].filter(t=>(t.dependsOn||[]).every(id=>finished.has(id)));
    ensure(ready.length,'dependency_cycle','Этапы зависят друг от друга по кругу. Исправим зависимости перед сохранением.');
    ready.sort((a,b)=>(Date.parse(a.deadlineAt||'9999-12-31')-Date.parse(b.deadlineAt||'9999-12-31'))||((a.priority??2)-(b.priority??2))||a.order-b.order||a.id.localeCompare(b.id));
    const task=ready[0];remaining.delete(task.id);
    const blocked=(task.dependsOn||[]).some(id=>finished.get(id)==null);
    let chosen=null,reason=blocked?'Не запланирован предыдущий этап':!task.durationMinutes?'Нужно оценить длительность':null;
    if(!reason) {
      const length=task.durationMinutes*minute, gap=breakMinutes*minute;
      const after=Math.max(now,task.notBefore?Date.parse(task.notBefore):0,...(task.dependsOn||[]).map(id=>finished.get(id)+gap));
      const deadline=task.deadlineAt?Date.parse(task.deadlineAt):Infinity;
      for(const slot of slots) {
        let start=task.fixedStart?Date.parse(task.fixedStart):Math.max(Date.parse(slot.start),after);
        const endLimit=Math.min(Date.parse(slot.end),deadline);
        if(start<Math.max(Date.parse(slot.start),after))continue;
        while(start+length<=endLimit) {
          const hit=occupied.filter(b=>start<b.end+gap&&b.start-gap<start+length).sort((a,b)=>a.end-b.end)[0];
          if(!hit){chosen={start:new Date(start).toISOString(),end:new Date(start+length).toISOString()};break;}
          if(task.fixedStart)break;
          start=Math.max(start,hit.end+gap);
        }
        if(chosen)break;
      }
      if(!chosen)reason=task.fixedStart?'Указанное время занято или недоступно':'Не хватает свободного времени до срока';
    }
    if(chosen) {occupied.push({start:Date.parse(chosen.start),end:Date.parse(chosen.end),kind:'task'});scheduled.push({...task,...chosen});finished.set(task.id,Date.parse(chosen.end));}
    else {unscheduled.push({...task,start:null,end:null,reason});finished.set(task.id,null);}
  }
  return {scheduled:scheduled.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)),unscheduled};
}
