import {copy} from '../core/errors.mjs';
import {assertState,initialState} from '../core/state.mjs';
export class MemoryRepository {
  constructor(state=initialState()){this.value=assertState(copy(state));this.tail=Promise.resolve();}
  async read(){await this.tail;return copy(this.value);}
  async persist(value){this.value=copy(value);}
  async transact(fn){
    let release;const before=this.tail;this.tail=new Promise(resolve=>release=resolve);await before;
    try {const next=copy(this.value);const result=await fn(next);assertState(next);await this.persist(next);return result;} finally{release();}
  }
}
