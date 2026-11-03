import test from 'node:test';import assert from 'node:assert/strict';
import {modelContext,SYSTEM} from '../server/prompt.mjs';
import {DeepSeekModel} from '../server/model.mjs';
import {previewPlan} from '../server/agent.mjs';
import {initialState} from '../core/state.mjs';
const now=Date.parse('2026-11-03T17:00:00Z');
test('archive growth does not grow paid conversation without bound or duplicate current input',()=>{
 const s=initialState();s.messages=Array.from({length:4000},(_,i)=>({id:String(i),role:i%2?'assistant':'user',text:'давние сообщения '.repeat(2000),at:'2026-11-02'}));
 s.messages.push({id:'current',role:'user',text:'Завтра видео',at:'2026-11-03'});
 const c=modelContext(s,'Завтра видео',now);assert.ok(c.recent.length<=12);assert.ok(c.recent.reduce((n,m)=>n+m.text.length,0)<=10000);assert.ok(!c.recent.some(m=>m.text==='Завтра видео'));assert.equal(s.messages.length,4001);
});
test('timed plan cannot silently degrade to unknown duration inbox',()=>{
 const s=initialState();assert.throws(()=>previewPlan({intent:'plan',scheduleMode:'timed',reply:'План',from:'2026-11-04',tasks:[{ref:'a',title:'Видео',owner:'user',quote:'видео',durationSource:'unknown'}]},s,'Завтра видео',now),e=>e.code==='schedule_duration');
});
test('agent reads old record through tool, then answers without a write',async()=>{
 const s=initialState();s.tasks.push({id:'old',title:'Ролик',status:'open',revision:1});let calls=0;
 const model=new DeepSeekModel({DEEPSEEK_API_KEY:'test'},{fetcher:async(_,options)=>{
  const p=JSON.parse(options.body);calls++;assert.equal(p.thinking.type,'enabled');assert.ok(p.tools.length===2);
  if(calls===1)return new Response(JSON.stringify({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,reasoning_content:'private',tool_calls:[{id:'find',type:'function',function:{name:'lookup_records',arguments:JSON.stringify({kind:'tasks',query:'Ролик'})}}]}}],usage:{prompt_tokens:10,completion_tokens:5}}));
  assert.ok(p.messages.some(m=>m.role==='tool'&&m.content.includes('old')));assert.ok(p.messages.some(m=>m.reasoning_content==='private'));
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({intent:'chat',reply:'Ролик есть в делах.'})}}],usage:{prompt_tokens:10,completion_tokens:5}}));
 }});const r=await model.extract(s,'Что с роликом?',now);assert.equal(r.usage.calls,2);assert.equal(s.tasks.length,1);assert.equal(s.messages.length,0);
});
test('decision instructions contain a general policy, no product-specific scenario recipes',()=>{assert.match(SYSTEM,/Порядок принятия решений/);assert.ok(!SYSTEM.includes('русскому'));assert.ok(!SYSTEM.includes('видео'));});
