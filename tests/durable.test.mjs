import test from 'node:test';import assert from 'node:assert/strict';
import {DurableRepository} from '../server/durable.mjs';
class FakeStorage {
 constructor(){this.values=new Map();this.failAfter=null;}
 async get(k){return structuredClone(this.values.get(k));}
 async put(k,v){this.values.set(k,structuredClone(v));}
 async delete(k){this.values.delete(k);}
 async transaction(fn){const before=structuredClone(this.values);let puts=0;try{return await fn({get:k=>this.get(k),delete:k=>this.delete(k),put:async(k,v)=>{if(this.failAfter!=null&&++puts>this.failAfter)throw Error('storage');await this.put(k,v);}});}catch(e){this.values=before;throw e;}}
}
test('long Unicode conversations survive chunked storage and restart',async()=>{const storage=new FakeStorage(),repo=await DurableRepository.open(storage);const text='Длинная диктовка 🎵 '.repeat(20000);await repo.transact(s=>s.messages.push({id:'a',role:'user',text,at:'2026-11-03T00:00:00Z'}));const manifest=await storage.get('manifest');assert.ok(manifest.count>2);const restored=await DurableRepository.open(storage);assert.equal((await restored.read()).messages[0].text,text);});
test('partial storage failure preserves previous manifest and all previous chunks',async()=>{const storage=new FakeStorage(),repo=await DurableRepository.open(storage);await repo.transact(s=>{s.profile.name='Сохранено';});const manifest=await storage.get('manifest');storage.failAfter=1;await assert.rejects(repo.transact(s=>s.messages.push({id:'x',text:'т'.repeat(100000)})));assert.deepEqual(await storage.get('manifest'),manifest);const restored=await DurableRepository.open(storage);assert.equal((await restored.read()).profile.name,'Сохранено');assert.equal((await restored.read()).messages.length,0);});
test('missing chunk is an error, not an empty new owner state',async()=>{const storage=new FakeStorage(),repo=await DurableRepository.open(storage);await repo.transact(s=>{s.profile.name='Имя';});const manifest=await storage.get('manifest');storage.values.delete('data-'+manifest.generation+'-0');await assert.rejects(DurableRepository.open(storage),e=>e.code==='storage_chunk');});
