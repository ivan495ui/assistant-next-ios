import {ensure,safeError} from '../core/errors.mjs';
export const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function authorized(header,token) {
  if(typeof token!=='string'||token.length<32)return false;
  const expected=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('Bearer '+token)));
  const actual=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(header||'')));
  let difference=0;for(let i=0;i<expected.length;i++)difference|=expected[i]^actual[i];return difference===0;
}
export async function handle(request,engine,{token,scheduleJob=()=>{},health=true}={}) {
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET')return json({ok:true,version:'next-0.1',mode:'candidate'});
  if(!await authorized(request.headers.get('Authorization'),token))return json({ok:false,code:'auth',error:'Нужно подключить приложение.'},401);
  try {
    if(path==='/v1/snapshot'&&request.method==='GET')return json(await engine.snapshot());
    if(path==='/v1/export'&&request.method==='GET')return json({ok:true,exportedAt:new Date().toISOString(),data:await engine.repository.read()});
    ensure(request.method==='POST','method','Используй POST.',405);
    const length=Number(request.headers.get('Content-Length')||0);ensure(length<=160000,'body_size','Запрос слишком большой.',413);
    const bodyText=await request.text();ensure(new TextEncoder().encode(bodyText).length<=160000,'body_size','Запрос слишком большой.',413);
    let body;try{body=JSON.parse(bodyText||'{}');}catch{ensure(false,'json','Не удалось прочитать запрос.');}
    if(path==='/v1/messages'){const result=await engine.enqueue(body);if(result.job.status==='queued')await scheduleJob(result.job.id);return json({ok:true,jobID:result.job.id,status:result.job.status},202);}
    if(path==='/v1/proposals/confirm')return json(await engine.confirm(body.proposalID));
    if(path==='/v1/proposals/decline')return json(await engine.decline(body.proposalID));
    if(path==='/v1/proposals/edit')return json(await engine.editProposal(body));
    if(path==='/v1/tasks')return json(await engine.saveTask(body));
    if(path==='/v1/profile')return json(await engine.updateProfile(body.profile,body.expectedRevision));
    ensure(false,'not_found','Такого действия нет.',404);
  }catch(error){return json(safeError(error),error.status||503);}
}
