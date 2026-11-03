// The transport is supplied by a private Python bridge. This file contains only
// synthetic scenarios and assertions, never provider or device credentials.
import {readFile,writeFile} from 'node:fs/promises';
import {validateExtraction} from '../core/contract.mjs';
import {buildProposal} from '../core/proposal.mjs';
import {initialState} from '../core/state.mjs';
const input=JSON.parse(await readFile(process.argv[2],'utf8'));
const reports=[];
for(const item of input.cases){
 try{
  const state=item.state||initialState();const raw=validateExtraction(item.extraction,{sourceTexts:[item.text],state});
  const proposal=raw.intent==='chat'?null:buildProposal(raw,state,{id:item.id,now:Date.parse(item.now)});
  if(item.expect.taskCount!==undefined&&raw.tasks.length!==item.expect.taskCount)throw Error('Wrong number of extracted tasks');
  if(item.expect.intent&&raw.intent!==item.expect.intent)throw Error('Wrong intent');
  if(item.expect.noInventedTopics&&raw.tasks.some(t=>/ролик.*(?:гитара|сведение|биты)/i.test(t.title)))throw Error('Invented topic');
  if(item.expect.noTrip&&raw.tasks.some(t=>/поездк|рождени/i.test(t.title)))throw Error('Already-created item duplicated');
  if(item.expect.scheduled!==undefined&&proposal?.actions.filter(a=>a.kind==='task'&&a.after.start).length!==item.expect.scheduled)throw Error('Wrong number of scheduled tasks');
  reports.push({id:item.id,ok:true,intent:raw.intent,tasks:raw.tasks.length,actions:proposal?.actions.length||0,unscheduled:proposal?.unscheduled.length||0});
 }catch(error){reports.push({id:item.id,ok:false,code:error.code||'evaluation',error:error.message});}
}
await writeFile(process.argv[3],JSON.stringify({cases:reports,allPassed:reports.every(r=>r.ok)},null,2));
console.log(JSON.stringify(reports));if(reports.some(r=>!r.ok))process.exitCode=1;
