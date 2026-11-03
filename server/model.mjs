import {AppError,ensure} from '../core/errors.mjs';
import {SYSTEM,modelContext} from './prompt.mjs';
// Peak, cache-miss rates are a conservative upper bound; discounts never increase the cap.
export const rates={input:0.30,output:1.20};
export function reservationFor(context) {
  // UTF-8 bytes conservatively cover token count; leave an explicit generation ceiling.
  const bytes=new TextEncoder().encode(SYSTEM+JSON.stringify(context)).length;
  ensure(bytes<100000,'context_capacity','В этом плане накопилось слишком много данных. История сохранена; выбери период до 31 дня.');
  return (bytes*rates.input+6000*rates.output)/1000000;
}
export class DeepSeekModel {
  constructor(env,{fetcher=(...args)=>fetch(...args)}={}) {this.env=env;this.fetcher=fetcher;}
  get available(){return !!this.env.DEEPSEEK_API_KEY;}
  async extract(state,text,now) {
    ensure(this.available,'ai_not_connected','ИИ пока не подключён. Можно вручную добавлять дела и пользоваться расписанием.',503);
    let response;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
    try {response=await this.fetcher('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+this.env.DEEPSEEK_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-flash',thinking:{type:'disabled'},temperature:0.2,max_tokens:6000,response_format:{type:'json_object'},messages:[{role:'system',content:SYSTEM},{role:'user',content:JSON.stringify(modelContext(state,text,now))}]}),signal:controller.signal});}
    catch(error) {
      const diagnostic=error?.name==='TypeError'&&/invocation/i.test(error.message)?'binding':error?.name==='TimeoutError'||error?.name==='AbortError'?'timeout':error?.name==='TypeError'&&/AbortSignal|timeout is not/i.test(error.message)?'timeout_api':'network';
      throw new AppError('ai_uncertain','Ответ ИИ не получен. Просьба сохранена; платный запрос автоматически не повторяется. Код: '+diagnostic+'.',503);
    }finally{clearTimeout(timer);}
    ensure(response.ok,'ai_http','Сервис ИИ временно недоступен (HTTP '+response.status+'). Просьба сохранена.',503);
    let data;try{data=await response.json();}catch{throw new AppError('ai_uncertain','Сервис вернул неполный ответ. Просьба сохранена.',503);}
    ensure(data.choices?.[0]?.finish_reason==='stop','ai_truncated','Ответ ИИ оборвался. Ничего из неполного плана не применено.',503);
    let extraction;try{extraction=JSON.parse(data.choices[0].message.content);}catch{throw new AppError('ai_json','Не удалось прочитать план. Исходный текст сохранён.',503);}
    const usage=data.usage||{};
    return {extraction,usage:{input:usage.prompt_tokens||0,output:usage.completion_tokens||0,usd:((usage.prompt_tokens||0)*rates.input+(usage.completion_tokens||0)*rates.output)/1000000}};
  }
}
