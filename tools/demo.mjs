import {mkdir,writeFile} from 'node:fs/promises';
import {initialState,publicSnapshot} from '../core/state.mjs';
import {buildProposal} from '../core/proposal.mjs';
const state=initialState();state.profile.name='';
state.projects=[{id:'project-film',title:'Три коротких ролика',goal:'Подготовить три ролика к концу недели без спешки.',revision:1},{id:'project-music',title:'Новый трек',goal:'Довести аранжировку и подготовить демо.',revision:1}];
state.events=[{id:'event-call',title:'Созвон по проекту',start:'2026-11-04T08:00:00.000Z',end:'2026-11-04T08:30:00.000Z',fixed:true,source:'local',revision:1}];
state.tasks=[
 {id:'task-script',title:'Переснять первый ролик: сценарий',durationMinutes:60,durationEstimated:false,priority:1,dueDate:'2026-11-04',start:'2026-11-04T06:00:00.000Z',end:'2026-11-04T07:00:00.000Z',projectID:'project-film',status:'open',revision:1,dependsOn:[]},
 {id:'task-voice',title:'Записать озвучку',durationMinutes:35,durationEstimated:true,priority:2,start:'2026-11-04T07:10:00.000Z',end:'2026-11-04T07:45:00.000Z',projectID:'project-film',status:'open',revision:1,dependsOn:['task-script']},
 {id:'task-track',title:'Доработать аранжировку',durationMinutes:90,durationEstimated:true,priority:2,start:'2026-11-04T08:40:00.000Z',end:'2026-11-04T10:10:00.000Z',projectID:'project-music',status:'open',revision:1,dependsOn:[]},
 {id:'task-topic',title:'Выбрать темы двух следующих роликов',durationMinutes:null,dueDate:'2026-11-06',status:'open',priority:2,projectID:'project-film',revision:1},
 {id:'task-trip',title:'Уточнить время поездки',durationMinutes:null,dueDate:'2026-11-09',status:'open',priority:2,revision:1},
 {id:'task-done',title:'Собрать референсы',durationMinutes:20,projectID:'project-film',status:'done',priority:2,revision:1}
];
const raw={intent:'plan',reply:'Перенесу созвон на 12:00 и перестрою остальные дела. Длительности сохранятся, между блоками останутся перерывы.',questions:[],tasks:[],projects:[],eventMoves:[{id:'event-call',start:'2026-11-04T09:00:00.000Z',quote:'Созвон перенесли на 12:00'}],newEvents:[],memories:[],windows:[{start:'2026-11-04T06:00:00.000Z',end:'2026-11-04T13:00:00.000Z'}],from:'2026-11-04',to:'2026-11-04',reschedule:true,breakMinutes:10};
const p=buildProposal(raw,state,{id:'demo-reschedule',now:Date.parse('2026-11-03T08:00:00Z')});
state.proposals.push(p);
state.messages=[{id:'demo-user',role:'user',text:'Созвон перенесли на 12:00. Перестрой утро, пожалуйста. Длительности дел не меняй и оставь перерывы.',at:'2026-11-03T08:00:00Z',proposalID:null},{id:'demo-answer',role:'assistant',text:raw.reply,at:'2026-11-03T08:00:08Z',proposalID:p.id}];
state.memory=[{id:'demo-pref',text:'Между рабочими блоками нужен небольшой перерыв.',revision:1}];
const snapshot=publicSnapshot(state,{aiAvailable:true,now:Date.parse('2026-11-03T08:00:08Z')});
await mkdir(new URL('../ios/App/Resources/',import.meta.url),{recursive:true});
await writeFile(new URL('../ios/App/Resources/demo.json',import.meta.url),JSON.stringify(snapshot,null,2));
console.log('Generated explicit simulator-only sample data');
