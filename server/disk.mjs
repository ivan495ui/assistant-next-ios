import {readFile,writeFile,rename,mkdir,copyFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {MemoryRepository} from './repository.mjs';
import {assertState,initialState} from '../core/state.mjs';
import {AppError} from '../core/errors.mjs';
export class DiskRepository extends MemoryRepository {
  static async open(path) {
    let state;
    try{state=assertState(JSON.parse(await readFile(path,'utf8')));}
    catch(error){
      if(error.code==='ENOENT'){
        // A missing primary with an existing backup is recovery, never a fresh start.
        try{state=assertState(JSON.parse(await readFile(path+'.backup','utf8')));}catch(backupError){if(backupError.code==='ENOENT')state=initialState();else throw new AppError('recovery','Хранилище требует восстановления. Ничего не сброшено.',500);}
      }else{
        try{state=assertState(JSON.parse(await readFile(path+'.backup','utf8')));}catch{throw new AppError('recovery','Обе копии хранилища повреждены. Данные не заменены пустыми.',500);}
      }
    }
    const repo=new DiskRepository(state);repo.path=path;return repo;
  }
  async persist(value) {
    assertState(value);await mkdir(dirname(this.path),{recursive:true});
    const temp=this.path+'.pending';await writeFile(temp,JSON.stringify(value),{encoding:'utf8',mode:0o600,flush:true});
    // Back up the last known valid state, not a possibly corrupted on-disk primary.
    await writeFile(this.path+'.backup.pending',JSON.stringify(this.value),{encoding:'utf8',mode:0o600,flush:true});
    await rename(this.path+'.backup.pending',this.path+'.backup');await rename(temp,this.path);await super.persist(value);
  }
}
