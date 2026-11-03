import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {DiskRepository} from './disk.mjs';
import {DeepSeekModel} from './model.mjs';
import {Engine} from './engine.mjs';
import {handle} from './http.mjs';
const folder=resolve(process.env.ASSISTANT_DATA||'../../private/assistant-next');await mkdir(folder,{recursive:true});
let token=process.env.APP_TOKEN;
if(!token){try{token=(await readFile(folder+'/app-token','utf8')).trim();}catch(error){if(error.code!=='ENOENT')throw error;token=randomBytes(32).toString('hex');await writeFile(folder+'/app-token',token,{mode:0o600});}}
const repository=await DiskRepository.open(folder+'/state.json'),model=new DeepSeekModel(process.env),engine=new Engine(repository,{model});
await engine.recoverInterrupted();
const pending=new Set();
const scheduleJob=async id=>{if(pending.has(id))return;pending.add(id);setImmediate(()=>engine.run(id).finally(()=>pending.delete(id)));};
const server=http.createServer(async(req,res)=>{
  try {
    const maximum=req.url==='/v1/import/preview'?1200000:160000;
    let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>maximum){res.writeHead(413);res.end();return;}chunks.push(chunk);}
    const request=new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await handle(request,engine,{token,scheduleJob});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'Не удалось завершить запрос.'}));}
});
const port=Number(process.env.PORT||8137);server.listen(port,'127.0.0.1',async()=>{console.log(`Assistant Next: http://127.0.0.1:${port}; AI ${model.available?'connected':'not configured'}. Credentials stay in the private data directory.`);for(const job of (await repository.read()).jobs.filter(j=>j.status==='queued'))scheduleJob(job.id);});
