import {AppError,ensure} from '../core/errors.mjs';
import {SYSTEM,modelContext} from './prompt.mjs';
import {agentTools,executeAgentTool,previewPlan} from './agent.mjs';
// Peak, cache-miss rates are a conservative upper bound; discounts never increase the cap.
export const rates={input:0.30,output:1.20};
export function reservationFor(context) {
  // UTF-8 bytes conservatively cover token count; leave an explicit generation ceiling.
  const bytes=new TextEncoder().encode(SYSTEM+JSON.stringify(context)).length;
  ensure(bytes<220000,'context_capacity','Этот черновик слишком большой для одного запроса. Разделим его на несколько частей. История сохранена.');
  return 3*(bytes*rates.input+12000*rates.output)/1000000;
}
export class DeepSeekModel {
  constructor(env,{fetcher=(...args)=>fetch(...args)}={}) {this.env=env;this.fetcher=fetcher;}
  get available(){return !!this.env.DEEPSEEK_API_KEY;}
  async extract(state,text,now) {
    ensure(this.available,'ai_not_connected','ИИ пока не подключён. Можно вручную добавлять дела и пользоваться расписанием.',503);
    const messages=[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify(modelContext(state,text,now))}];
    const total={input:0,output:0,usd:0,calls:0};
    let checkedChanges=null;
    try {for(let turn=0;turn<3;turn++){
    let response;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
    try {response=await this.fetcher('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+this.env.DEEPSEEK_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-flash',thinking:{type:'enabled'},reasoning_effort:'low',max_tokens:12000,response_format:{type:'json_object'},tools:agentTools,tool_choice:turn===2?'none':'auto',messages}),signal:controller.signal});}
    catch(error) {
      clearTimeout(timer);
      const diagnostic=error?.name==='TypeError'&&/invocation/i.test(error.message)?'binding':error?.name==='TimeoutError'||error?.name==='AbortError'?'timeout':error?.name==='TypeError'&&/AbortSignal|timeout is not/i.test(error.message)?'timeout_api':'network';
      throw new AppError('ai_uncertain','Ответ ИИ не получен. Просьба сохранена; платный запрос автоматически не повторяется. Код: '+diagnostic+'.',503);
    }
    if(!response.ok)clearTimeout(timer);
    ensure(response.ok,'ai_http',response.status===402?'На счёте DeepSeek закончились средства. Порог приложения работу не блокирует, но провайдер требует пополнение. Просьба сохранена.':'Сервис ИИ временно недоступен (HTTP '+response.status+'). Просьба сохранена.',503);
    let data;try{data=await response.json();}catch{throw new AppError('ai_uncertain','Сервис вернул неполный ответ. Просьба сохранена.',503);}finally{clearTimeout(timer);}
    const usage=data.usage||{};
    total.input+=usage.prompt_tokens||0;total.output+=usage.completion_tokens||0;total.calls++;
    total.usd=total.input*rates.input/1000000+total.output*rates.output/1000000;
    const choice=data.choices?.[0],message=choice?.message;
    ensure(['stop','tool_calls'].includes(choice?.finish_reason),'ai_truncated','Ответ ИИ оборвался. Ничего из неполного плана не применено.',503);
    if(message?.tool_calls?.length){
      ensure(turn<2&&message.tool_calls.length<=4,'agent_steps','Для этой просьбы понадобилось слишком много шагов. Уточни часть, с которой начнём.',503);
      messages.push(message);
      for(const call of message.tool_calls){let args;try{args=JSON.parse(call.function.arguments);}catch{args={};}
        const result=executeAgentTool(call.function.name,args,state,text,now);
        if(call.function.name==='preview_plan'&&result.ok)checkedChanges=JSON.stringify(result.changes);
        messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
      }
      continue;
    }
    let extraction;try{extraction=JSON.parse(message.content);}catch{
      if(turn<2){messages.push(message,{role:'user',content:'Ответ не удалось прочитать как JSON. Верни один корректный JSON по контракту, без обрамления. Ничего не сохранено.'});continue;}
      throw new AppError('ai_json','Не удалось прочитать план. Исходный текст сохранён.',503);
    }
    try{
      const checked=previewPlan(extraction,state,text,now);
      if(!checked.answerOnly&&JSON.stringify(checked.changes)!==checkedChanges&&turn<2){
        checkedChanges=JSON.stringify(checked.changes);
        messages.push(message,{role:'user',content:JSON.stringify({previewResult:checked,instruction:'Планировщик проверил твой черновик. Поясни реальные времена и причины из результата. Верни финальный JSON с теми же изменениями или исправь черновик. Записи ещё не сохранены.'})});
        continue;
      }
      return {extraction,usage:total};
    }
    catch(error){
      if(turn===2)throw error;
      messages.push(message,{role:'user',content:JSON.stringify({systemValidation:{error:error.message,code:error.code},instruction:'Исправь черновик по результату проверки. Если не хватает существенного факта, задай короткий вопрос, intent=chat. Ничего не сохранено.'})});
    }
    }
    throw new AppError('agent_steps','Не удалось завершить проверку. Исходная просьба сохранена.',503);
    }catch(error){if(total.calls&&error.code!=='ai_uncertain')error.usage=total;throw error;}
  }
}
