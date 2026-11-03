import {copy,digest,ensure} from './errors.mjs';
import {validDate,zoneValid} from './time.mjs';

export async function previewLegacyImport(input,state,{now=Date.now()}={}) {
  const source=input?.data?.schema===2?input.data:input;
  ensure(source?.schema===2&&source.profile&&Array.isArray(source.memory)&&Array.isArray(source.projects),'legacy_format','Нужен JSON-экспорт личного помощника 25.3. Файл не изменён.');
  ensure(JSON.stringify(source).length<=1000000,'legacy_capacity','Этот экспорт слишком большой для одного переноса. Исходный файл сохранён; нужен перенос архива по частям.');
  const fingerprint=await digest(source),id='import-'+fingerprint.slice(0,32);
  const existing=state.proposals.find(p=>p.id===id);
  if(existing)return {proposal:copy(existing),duplicate:true};
  const actions=[],warnings=['Старое приложение и записи Google останутся без изменений. Финансовые лимиты и разрешения не переносятся автоматически.'];
  const add=(kind,record)=>{
    const collection={project:'projects',memory:'memory',task:'tasks',message:'messages'}[kind];
    if(!state[collection].some(x=>x.id===record.id))actions.push({kind,id:record.id,title:record.title||record.text?.slice(0,120)||'Запись',before:null,after:record});
  };
  for(const [i,p] of source.projects.entries()) {
    ensure(typeof p.title==='string'&&p.title.length<=200,'legacy_project','В экспорте повреждено название проекта.');
    const pid='legacy-project-'+(await digest(String(p.id||i))).slice(0,24);
    add('project',{id:pid,title:p.title,goal:String(p.goal||''),nextStep:Array.isArray(p.nextSteps)?p.nextSteps[0]||'':'',revision:1});
    for(const [index,step] of (p.nextSteps||[]).entries()) {
      ensure(typeof step==='string'&&step.length<=2000,'legacy_step','В экспорте повреждён этап проекта.');
      add('task',{id:pid+'-step-'+index,title:step,status:'open',durationMinutes:null,durationEstimated:false,dueDate:null,start:null,end:null,projectID:pid,priority:2,dependsOn:[],revision:1});
    }
  }
  for(const [i,m] of source.memory.entries()) {
    ensure(typeof m.text==='string'&&m.text.length<=10000,'legacy_memory','В экспорте повреждена запись памяти.');
    add('memory',{id:'legacy-memory-'+(await digest(String(m.id||i))).slice(0,24),text:m.text,revision:1});
  }
  if(source.profile.about)add('memory',{id:id+'-about',text:'Из прежнего профиля: '+String(source.profile.about),revision:1});
  if(source.profile.instructions)add('memory',{id:id+'-preferences',text:'Предпочтения из прежнего профиля: '+String(source.profile.instructions),revision:1});
  if(source.profile.schedule)add('memory',{id:id+'-schedule',text:'Сохранённый прежний распорядок (не подтверждает часы отдельных уроков): '+JSON.stringify(source.profile.schedule),revision:1});
  for(const [i,turn] of (source.conversation?.turns||[]).entries()) {
    ensure(['user','assistant'].includes(turn.role)&&typeof turn.text==='string','legacy_message','В экспорте повреждена реплика.');
    const mid='legacy-message-'+(await digest(String(turn.id||i))).slice(0,24);
    add('message',{id:mid,role:turn.role,text:turn.text,at:turn.at||new Date(now).toISOString(),proposalID:null,revision:1});
  }
  if(source.conversation?.archiveCount)warnings.push('Экспорт содержит активную часть разговора. Отдельные архивы истории остаются доступны в старой версии.');
  if(source.profile.timeZone&&source.profile.timeZone!==state.profile.timeZone)warnings.push('Прежний часовой пояс: '+String(source.profile.timeZone)+'. Рабочие часы новой версии проверь отдельно в настройках.');
  actions.push({kind:'archive',id,title:'Полная исходная копия экспорта',before:null,after:{id,title:'Экспорт прежней версии',revision:1,data:copy(source),fingerprint,importedAt:new Date(now).toISOString()}});
  const proposal={id,status:'draft',baseRevision:state.dataRevision,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+86400000).toISOString(),title:'Перенос из версии 25.3',reply:'Проверь перенос проектов, следующих шагов, памяти и доступной истории. Время неизвестных этапов не назначено.',questions:[],actions,warnings,unscheduled:actions.filter(a=>a.kind==='task').map(a=>({id:a.id,title:a.title,reason:'Перенесено без выдуманной длительности и времени'})),raw:null};
  return {proposal,duplicate:false};
}
