import test from 'node:test';
import assert from 'node:assert/strict';
import {schedule,defaultWindows} from '../core/scheduler.mjs';
import {wall,validDate,instant,localDate} from '../core/time.mjs';
const stamp=(clock,day='2026-11-04')=>`${day}T${clock}:00+03:00`;
const windows=[{start:stamp('09:00'),end:stamp('13:00')}];
const task=(id,durationMinutes,more={})=>({id,title:id,durationMinutes,dependsOn:[],order:0,...more});
test('Cue: work window, fixed call, three tasks and breaks',()=>{
 const result=schedule({tasks:[task('slides',60),task('mail',45,{order:1}),task('review',30,{order:2})],events:[{start:stamp('11:00'),end:stamp('11:30')}],windows,breakMinutes:10});
 assert.equal(result.scheduled.length,3);assert.equal(result.unscheduled.length,0);
 const slots=result.scheduled;for(const item of slots){assert.ok(Date.parse(item.start)>=Date.parse(windows[0].start));assert.ok(Date.parse(item.end)<=Date.parse(windows[0].end));assert.ok(Date.parse(item.end)<=Date.parse(stamp('10:50'))||Date.parse(item.start)>=Date.parse(stamp('11:40')));}
 for(let i=1;i<slots.length;i++)assert.ok(Date.parse(slots[i].start)-Date.parse(slots[i-1].end)>=600000);
});
test('dependencies preserve order across a week and propagate blocked stages',()=>{
 const result=schedule({tasks:[task('shoot',45,{dependsOn:['script']}),task('script',60),task('edit',30,{dependsOn:['shoot']})],windows,breakMinutes:10});
 assert.deepEqual(result.scheduled.map(t=>t.id),['script','shoot','edit']);
 const blocked=schedule({tasks:[task('a',null),task('b',30,{dependsOn:['a']})],windows});assert.equal(blocked.unscheduled.length,2);assert.match(blocked.unscheduled[1].reason,/предыдущий/);
});
test('insufficient time and unknown durations remain explicit',()=>{
 const result=schedule({tasks:[task('large',300),task('unknown',null)],windows});assert.equal(result.scheduled.length,0);assert.equal(result.unscheduled.length,2);
});
test('explicit fixed start never shifts into a later slot',()=>{
 const result=schedule({tasks:[task('x',30,{fixedStart:stamp('11:00')})],events:[{start:stamp('11:00'),end:stamp('11:30')}],windows});assert.equal(result.scheduled.length,0);
});
test('deadline and not-before both constrain placement',()=>{
 const result=schedule({tasks:[task('x',60,{notBefore:stamp('12:30'),deadlineAt:stamp('13:00')})],windows});assert.equal(result.unscheduled.length,1);
});
test('cycles, invalid dependency and overlapping windows are rejected',()=>{
 assert.throws(()=>schedule({tasks:[task('a',30,{dependsOn:['b']}),task('b',30,{dependsOn:['a']})],windows}),e=>e.code==='dependency_cycle');
 assert.throws(()=>schedule({tasks:[task('a',30,{dependsOn:['missing']})],windows}),e=>e.code==='dependency');
 assert.throws(()=>schedule({tasks:[],windows:[...windows,...windows]}),e=>e.code==='window');
});
test('past times are excluded',()=>{const now=Date.parse(stamp('12:00'));const result=schedule({tasks:[task('a',30)],windows,now});assert.ok(Date.parse(result.scheduled[0].start)>=now);});
test('timezones, leap dates and daylight-saving ambiguity',()=>{
 assert.equal(wall('2026-11-04','09:00','Europe/Moscow'),'2026-11-04T06:00:00.000Z');
 assert.equal(localDate('2026-11-03T23:00:00Z','Europe/Moscow'),'2026-11-04');
 assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2026-02-29'),false);
 assert.throws(()=>wall('2026-03-08','02:30','America/New_York'),e=>e.code==='time_gap');
 assert.throws(()=>wall('2026-11-01','01:30','America/New_York'),e=>e.code==='time_ambiguous');
 assert.throws(()=>instant('2026-11-04T09:00:00'),e=>e.code==='timestamp');
});
test('work days and 31-day horizon',()=>{const p={timeZone:'Europe/Moscow',workDays:[1,2,3,4,5],dayStart:'09:00',dayEnd:'18:00'};assert.equal(defaultWindows(p,'2026-11-02','2026-11-08').length,5);assert.throws(()=>defaultWindows(p,'2026-11-01','2026-12-02'),e=>e.code==='horizon');});
