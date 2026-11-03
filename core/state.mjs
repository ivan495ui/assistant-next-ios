import {copy, ensure} from './errors.mjs';
import {zoneValid} from './time.mjs';
export function initialState() {
  return {schema:1,dataRevision:0,profile:{name:'',timeZone:'Europe/Moscow',dayStart:'09:00',dayEnd:'21:00',workDays:[0,1,2,3,4,5,6],breakMinutes:10},tasks:[],events:[],projects:[],memory:[],messages:[],proposals:[],jobs:[],receipts:[],syncJobs:[],usage:[],legacyImports:[]};
}
export function assertState(state) {
  ensure(state?.schema===1&&Number.isSafeInteger(state.dataRevision),'state_corrupt','Хранилище повреждено. Автоматическая замена пустыми данными запрещена.',500);
  for(const name of ['tasks','events','projects','memory','messages','proposals','jobs','receipts','syncJobs','usage','legacyImports'])ensure(Array.isArray(state[name]),'state_corrupt','Не удалось прочитать '+name+'.',500);
  ensure(zoneValid(state.profile?.timeZone),'state_corrupt','Не удалось прочитать часовой пояс.',500);
  return state;
}
export function publicSnapshot(state,{aiAvailable=false,now=Date.now()}={}) {
  const value=copy(state);
  return {ok:true,schema:1,serverTime:new Date(now).toISOString(),dataRevision:value.dataRevision,profile:value.profile,tasks:value.tasks,events:value.events,projects:value.projects,memory:value.memory,messages:value.messages,proposals:value.proposals.map(({raw,...p})=>({...p,editable:!!raw,actions:p.actions.map(a=>a.kind==='archive'?{...a,after:{id:a.id,title:a.title,revision:1}}:a)})),jobs:value.jobs.map(({inputHash,text,lease,reservation,...j})=>j),syncJobs:value.syncJobs,aiAvailable};
}
