import assert from 'node:assert/strict';
import {BACKUP_VERSION,validateBackup} from '../js/backup.js';
import {KEY_PATHS,LEARNING_STORES,replaceStoresAtomically} from '../js/db.js';

const record=(store,index)=>({[KEY_PATHS[store]]:`${store}-${index}`});
const snapshot=answerCount=>({backupVersion:BACKUP_VERSION,createdAt:'2026-09-13T12:00:00.000Z',appVersion:'0.4.5',stores:Object.fromEntries(LEARNING_STORES.map(store=>[store,store==='answers'?Array.from({length:answerCount},(_,index)=>record(store,index)):[record(store,0)]]))});
const good=snapshot(800);
assert.equal(validateBackup(good).stats.answers,800);
assert.throws(()=>validateBackup(null),/无效/,'损坏 JSON 必须拒绝');
assert.throws(()=>validateBackup({...good,backupVersion:undefined}),/不兼容/,'缺少 backupVersion 必须拒绝');
assert.throws(()=>validateBackup({...good,backupVersion:BACKUP_VERSION+1}),/不兼容/,'不支持 backupVersion 必须拒绝');
assert.throws(()=>validateBackup({...good,stores:{...good.stores,answers:{}}}),/answers 必须是数组/,'非数组 Store 必须拒绝');
assert.throws(()=>validateBackup({...good,stores:{...good.stores,answers:[{}]}}),/answers 缺失关键字段 key/,'缺 keyPath 必须拒绝');

class MemoryDb{
  constructor(data,failStore=null){this.data=structuredClone(data);this.failStore=failStore}
  transaction(){const staged=structuredClone(this.data),db=this;let aborted=false;const tx={error:null,oncomplete:null,onerror:null,onabort:null,objectStore(store){return {clear(){staged[store]=[]},put(item){if(store===db.failStore)throw Error(`simulated ${store} failure`);staged[store].push(structuredClone(item))}}},abort(){aborted=true;queueMicrotask(()=>tx.onabort?.())}};queueMicrotask(()=>{if(!aborted){db.data=staged;tx.oncomplete?.()}});return tx}
}
const current=Object.fromEntries(LEARNING_STORES.map(store=>[store,store==='answers'?Array.from({length:1000},(_,index)=>record(store,index)):[record(store,'old')]]));
const db=new MemoryDb(current);await replaceStoresAtomically(db,good.stores);
for(const store of LEARNING_STORES)assert.equal(db.data[store].length,good.stores[store].length,`${store} 必须完整恢复且不保留多余记录`);
assert.equal(db.data.answers.length,800,'1000 条 answers 恢复 800 条后不得保留旧记录');

const failing=new MemoryDb(current,'wrongQuestions'),before=structuredClone(failing.data);
await assert.rejects(()=>replaceStoresAtomically(failing,good.stores),/simulated wrongQuestions failure/);
assert.deepEqual(failing.data,before,'事务中途失败必须回滚，不得半恢复');
console.log('Backup validation and atomic restore scenarios passed.');
