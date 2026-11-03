import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
async function walk(path){let result=[];for(const item of await readdir(path,{withFileTypes:true})){if(['build','.git','node_modules'].includes(item.name))continue;const full=path+'/'+item.name;if(item.isDirectory())result.push(...await walk(full));else result.push(full);}return result;}
const files=await walk('.');let failed=false;
for(const file of files){if(file.endsWith('.mjs')){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status){console.error(r.stderr);failed=true;}}if(/\.(mjs|swift|md|yml|json|jsonc)$/.test(file)){const text=await readFile(file,'utf8');if(/sk-[a-zA-Z0-9]{20,}|gh[pousr]_[a-zA-Z0-9]{20,}|BEGIN (?:RSA |EC )?PRIVATE KEY/.test(text)){console.error('Credential-shaped content: '+file);failed=true;}}}
if(failed)process.exit(1);console.log(`Syntax and credential scan passed: ${files.length} files`);
