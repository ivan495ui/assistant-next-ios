import {validateExtraction} from '../core/contract.mjs';
import {buildProposal} from '../core/proposal.mjs';
import {safeError} from '../core/errors.mjs';
export const agentTools=[
  {type:'function',function:{name:'lookup_records',description:'Найти существующие записи владельца по словам или датам. Только чтение. Для точного изменения используй ID из результатов.',parameters:{type:'object',properties:{query:{type:'string'},kind:{type:'string',enum:['tasks','events','projects','memory']},from:{type:'string'},to:{type:'string'}},required:['kind']}}},
  {type:'function',function:{name:'preview_plan',description:'Проверить полный черновик изменений и рассчитать расписание с конфликтами, зависимостями и перерывами. Записи не сохраняются. plan имеет формат финального JSON.',parameters:{type:'object',properties:{plan:{type:'object',additionalProperties:true}},required:['plan']}}}
];
export function previewPlan(extraction,state,text,now){
  const sourceTexts=[...state.messages.filter(m=>m.role==='user').slice(-16).map(m=>m.text),text];
  const raw=validateExtraction(extraction,{sourceTexts,state});
  if(raw.intent==='chat')return {ok:true,answerOnly:true};
  const p=buildProposal(raw,state,{id:'agent-preview',now});
  return {ok:true,changes:p.actions.map(a=>({kind:a.kind,id:a.before?.id||null,title:a.title,start:a.after.start||null,end:a.after.end||null,durationMinutes:a.after.durationMinutes??null,estimated:a.after.durationEstimated||false})),unscheduled:p.unscheduled,warnings:p.warnings};
}
export function executeAgentTool(name,args,state,text,now){
  try{
    if(name==='preview_plan')return previewPlan(args.plan,state,text,now);
    if(name!=='lookup_records'||!['tasks','events','projects','memory'].includes(args.kind))return {ok:false,error:'Неизвестный инструмент или вид записей.'};
    const words=(args.query||'').toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
    const items=state[args.kind].filter(x=>{
      const date=(x.start||x.allDayDate||x.dueDate||'').slice(0,10);
      return (!args.from||date>=args.from)&&(!args.to||date<=args.to)&&(!words.length||words.some(w=>(x.title||x.text||'').toLocaleLowerCase('ru').includes(w)));
    });
    const records=items.slice(-30).map(x=>Object.fromEntries(Object.entries(x).filter(([k])=>!['quote','legacy','raw','payload'].includes(k))));
    while(JSON.stringify(records).length>14000)records.shift();
    return {ok:true,records,total:items.length,omitted:items.length-records.length};
  }catch(e){return {ok:false,...safeError(e)};}
}
