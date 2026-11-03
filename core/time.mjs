import {ensure} from './errors.mjs';
export const minute = 60000;
export function validDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const timestamp=Date.parse(value+'T12:00:00Z');return Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===value;
}
export function zoneValid(zone) { try { new Intl.DateTimeFormat('en', {timeZone:zone}).format(); return true; } catch { return false; } }
export function localDate(now, zone) { return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)); }
export function addDays(date, days) { return new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10); }
export function parts(timestamp, zone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(timestamp)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
export function wall(date, clock, zone) {
  ensure(validDate(date)&&/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)&&zoneValid(zone),'time','Нужны существующая дата, время и часовой пояс.');
  const target=Date.parse(date+'T'+clock+':00Z');
  let value=target;
  for(let i=0;i<4;i++) { const p=parts(value,zone); const represented=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`); const delta=target-represented; if(!delta) break; value+=delta; }
  const p=parts(value,zone);
  ensure(`${p.year}-${p.month}-${p.day}`===date&&`${p.hour}:${p.minute}`===clock,'time_gap','Этого местного времени не существует из-за смены часового пояса.');
  // Reject ambiguous fall-back times rather than guessing an offset.
  for(const delta of [-120,-90,-60,-30,30,60,90,120]) { const q=parts(value+delta*minute,zone); ensure(`${q.year}-${q.month}-${q.day} ${q.hour}:${q.minute}`!==`${date} ${clock}`,'time_ambiguous','Время встречается дважды при переводе часов. Укажи точное время с часовым поясом.'); }
  return new Date(value).toISOString();
}
export function instant(value) {
  ensure(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value)),'timestamp','Нужно время с явным часовым поясом.');
  ensure(validDate(value.slice(0,10)),'timestamp','Такой даты не существует.');
  return new Date(value).toISOString();
}
export const overlap=(a,b)=>Date.parse(a.start)<Date.parse(b.end)&&Date.parse(b.start)<Date.parse(a.end);
