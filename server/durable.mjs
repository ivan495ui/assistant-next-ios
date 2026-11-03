import {MemoryRepository} from './repository.mjs';
import {assertState,initialState} from '../core/state.mjs';
import {ensure} from '../core/errors.mjs';

// Durable Object values have a size limit. A long dictation and its draft must
// not fail merely because the serialized owner record crosses one value.
export class DurableRepository extends MemoryRepository {
  constructor(storage,state){super(state);this.storage=storage;}
  static async open(storage) {
    const manifest=await storage.get('manifest');
    if(!manifest)return new DurableRepository(storage,(await storage.get('state'))||initialState());
    ensure(Number.isInteger(manifest.count)&&manifest.count>0&&manifest.count<=1024,'storage_manifest','Повреждён индекс хранилища. Сброс не выполняется.',500);
    const buffers=[];let size=0;
    for(let i=0;i<manifest.count;i++) {
      const part=await storage.get(`data-${manifest.generation}-${i}`);
      ensure(part instanceof Uint8Array||part instanceof ArrayBuffer,'storage_chunk','Не удалось прочитать часть сохранённых данных.',500);
      const bytes=new Uint8Array(part);buffers.push(bytes);size+=bytes.length;
    }
    ensure(size===manifest.bytes,'storage_size','Сохранённые данные прочитаны не полностью.',500);
    const all=new Uint8Array(size);let offset=0;for(const bytes of buffers){all.set(bytes,offset);offset+=bytes.length;}
    let state;try{state=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}catch{ensure(false,'storage_json','Не удалось прочитать сохранённые данные.',500);}
    return new DurableRepository(storage,assertState(state));
  }
  async persist(value) {
    assertState(value);const bytes=new TextEncoder().encode(JSON.stringify(value));
    ensure(bytes.length<=16000000,'storage_capacity','Хранилище достигло предела этой версии. Экспорт остаётся доступен; данные не обрезаны.',409);
    const count=Math.ceil(bytes.length/60000),generation=crypto.randomUUID();
    await this.storage.transaction(async tx=>{
      const old=await tx.get('manifest');
      for(let i=0;i<count;i++)await tx.put(`data-${generation}-${i}`,bytes.slice(i*60000,(i+1)*60000));
      await tx.put('manifest',{generation,count,bytes:bytes.length});
      if(old)for(let i=0;i<old.count;i++)await tx.delete(`data-${old.generation}-${i}`);
      else await tx.delete('state');
    });
    await super.persist(value);
  }
}
