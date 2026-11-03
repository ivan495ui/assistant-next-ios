import {MemoryRepository} from './repository.mjs';
import {initialState,assertState} from '../core/state.mjs';
import {Engine} from './engine.mjs';
import {DeepSeekModel} from './model.mjs';
import {handle,authorized,json} from './http.mjs';
class DurableRepository extends MemoryRepository {
  constructor(storage,state){super(state);this.storage=storage;}
  async persist(value){assertState(value);await this.storage.put('state',value);await super.persist(value);}
}
export class AssistantOwner {
  constructor(ctx,env){this.ctx=ctx;this.env=env;ctx.blockConcurrencyWhile(async()=>{const stored=await ctx.storage.get('state');this.repository=new DurableRepository(ctx.storage,stored||initialState());this.engine=new Engine(this.repository,{model:new DeepSeekModel(env),limits:{day:Number(env.AI_DAILY_LIMIT||0.10),month:Number(env.AI_MONTHLY_LIMIT||1)}});await this.engine.recoverInterrupted();});}
  async fetch(request){return handle(request,this.engine,{token:this.env.APP_TOKEN,scheduleJob:async()=>{await this.ctx.storage.setAlarm(Date.now()+50);}});}
  async alarm(){
    const jobs=(await this.repository.read()).jobs.filter(j=>j.status==='queued');
    if(jobs.length){await this.engine.run(jobs[0].id);if((await this.repository.read()).jobs.some(j=>j.status==='queued'))await this.ctx.storage.setAlarm(Date.now()+100);}
  }
}
export default {async fetch(request,env){
  if(new URL(request.url).pathname==='/health')return json({ok:true,version:'next-0.1',mode:'candidate'});
  const owner=await authorized(request.headers.get('Authorization'),env.APP_TOKEN);
  const testing=!owner&&await authorized(request.headers.get('Authorization'),env.TEST_TOKEN);
  if(!owner&&!testing)return json({ok:false,error:'Нужно подключить приложение.'},401);
  const id=env.OWNER.idFromName(testing?'synthetic-review':'owner');
  const forwarded=new Request(request);forwarded.headers.set('Authorization','Bearer '+env.APP_TOKEN);
  return env.OWNER.get(id).fetch(forwarded);
}};
