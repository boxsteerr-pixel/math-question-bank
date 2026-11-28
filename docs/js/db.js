import {applyQuestionBankFix,FIXED_QUESTION_IDS,QUESTION_BANK_FIX_VERSION} from './questionBankFix.js';
/* IndexedDB migration contract: v1 created learning stores; v2 added questionHistory; v3 adds non-destructive migration checks. Normal releases must never delete, clear, or recreate this database. */
const config=globalThis.MATH_PWA_VERSION||{dbVersion:4,questionBankVersion:'dev'};
const DB='grade7MathCheckin';export const DB_VERSION=config.dbVersion;
export const KEY_PATHS={questions:'id',dailyTasks:'date',answers:'key',wrongQuestions:'questionId',knowledgeStats:'questionId',questionHistory:'questionId',checkins:'date',settings:'key'};
const definitions=KEY_PATHS;
const METADATA_STORE='learningMetadata', GENERATION_KEY='learningDataGeneration';
export class StaleLearningDataError extends Error{
  constructor(){super('学习数据已恢复或发生变化，请保存当前内容后重新打开页面。');this.name='StaleLearningDataError'}
}
let stale=false;
function rejectStale(){
  stale=true;
  globalThis.dispatchEvent?.(new Event('learning-data-stale'));
}
function fencedDatabase(db,generation){
  return new Proxy(db,{get(target,property){
    if(property==='transaction')return (names,mode='readonly',options)=>{
      if(stale&&mode==='readwrite')throw new StaleLearningDataError();
      const stores=Array.isArray(names)?names:[names];
      if(mode!=='readwrite')return target.transaction(names,mode,options);
      const transaction=target.transaction([...new Set([...stores,METADATA_STORE])],mode,options);
      const check=transaction.objectStore(METADATA_STORE).get(GENERATION_KEY);
      check.onsuccess=()=>{
        if(check.result?.value!==generation){transaction.abort();rejectStale()}
      };
      return transaction;
    };
    const item=Reflect.get(target,property,target);
    return typeof item==='function'?item.bind(target):item;
  }});
}
export const LEARNING_SESSION_LOCK='grade7-math-learning-session';
export const LEARNING_STORES=['dailyTasks','answers','wrongQuestions','knowledgeStats','questionHistory','checkins','settings'];
const CRITICAL_STORES=['dailyTasks','answers','wrongQuestions','knowledgeStats','questionHistory','checkins'];let instance;
const value=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
async function countStores(db,names){const existing=names.filter(name=>db.objectStoreNames.contains(name)),out={};if(!existing.length)return out;const transaction=db.transaction(existing,'readonly');await Promise.all(existing.map(async name=>{out[name]=await value(transaction.objectStore(name).count())}));return out}
export function compareLearningCounts(before={},after={}){return Object.entries(before).filter(([name,count])=>count>0&&(after[name]??0)===0).map(([name])=>name)}
export function openDB(){
  if(stale)return Promise.reject(new StaleLearningDataError());
  if(instance)return instance;
  instance=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,DB_VERSION);
    let beforeCounts=null,abandoned=false;
    const fail=message=>{abandoned=true;instance=null;reject(Error(message))};
    request.onblocked=()=>fail('数据库正在由旧版页面使用。请关闭旧版页面后刷新。');
    request.onupgradeneeded=event=>{
      if(abandoned){request.transaction.abort();return}
      const db=request.result,transaction=request.transaction;
      beforeCounts={};
      for(const name of CRITICAL_STORES)if(db.objectStoreNames.contains(name)){
        const count=transaction.objectStore(name).count();
        count.onsuccess=()=>{beforeCounts[name]=count.result};
      }
      for(const [name,keyPath] of Object.entries(definitions))if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath});
      if(!db.objectStoreNames.contains(METADATA_STORE))db.createObjectStore(METADATA_STORE,{keyPath:'key'}).add({key:GENERATION_KEY,value:0});
    };
    request.onsuccess=async()=>{
      const db=request.result;
      if(abandoned){db.close();return}
      db.onversionchange=()=>{db.close();rejectStale()};
      try{
        if(beforeCounts){
          const afterCounts=await countStores(db,CRITICAL_STORES),lost=compareLearningCounts(beforeCounts,afterCounts);
          if(lost.length){db.close();fail('数据库升级安全检查失败：'+lost.join('、'));return}
        }
        const transaction=db.transaction(METADATA_STORE,'readonly');
        const generation=await value(transaction.objectStore(METADATA_STORE).get(GENERATION_KEY));
        if(!Number.isSafeInteger(generation?.value)||generation.value<0)throw Error('学习数据代际无效');
        if(abandoned){db.close();return}
        resolve(fencedDatabase(db,generation.value));
      }catch(error){db.close();fail('数据库升级安全检查失败：'+error.message)}
    };
    request.onerror=()=>{if(!abandoned)fail(request.error?.message||'无法打开学习数据')};
  });
  return instance;
}
async function tx(store,mode,fn){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(store,mode),result=fn(transaction.objectStore(store));
    transaction.oncomplete=()=>resolve(result?.result);
    transaction.onerror=()=>reject(transaction.error||new StaleLearningDataError());
    transaction.onabort=()=>reject(stale?new StaleLearningDataError():transaction.error||Error('学习数据事务中止'));
  });
}
export const get=(store,key)=>tx(store,'readonly',objectStore=>objectStore.get(key));export const put=(store,item)=>tx(store,'readwrite',objectStore=>objectStore.put(item));export const all=store=>tx(store,'readonly',objectStore=>objectStore.getAll());export const setMany=(store,items)=>tx(store,'readwrite',objectStore=>{items.forEach(item=>objectStore.put(item))});
export const setting=async(key,fallback)=>((await get('settings',key))?.value??fallback);export const saveSetting=(key,value)=>put('settings',{key,value});
export const questionSignature=question=>JSON.stringify({question:question.question,answer:question.answer,answerType:question.answerType});
export function mergeQuestionRecord(existing,incoming,warn=console.warn){if(!existing)return {record:incoming,changed:true};if(questionSignature(existing)!==questionSignature(incoming)){if(FIXED_QUESTION_IDS.has(incoming.id))return {record:incoming,changed:true,forced:true};warn(`题库保护：${incoming.id} 的核心题面或答案发生变化，已保留设备中的旧题记录。新题请使用新的 question.id。`);return {record:existing,changed:false,warning:true}}return {record:{...existing,...incoming},changed:true}}
export async function importQuestions({deferFixedQuestionSync=false}={}){const response=await fetch('./data/questions.json');if(!response.ok)throw Error('无法读取正式题库');const incoming=await response.json();if(!Array.isArray(incoming)||!incoming.length)throw Error('正式题库为空或格式错误');if(new Set(incoming.map(question=>question.id)).size!==incoming.length)throw Error('正式题库存在重复 question.id');const defer=deferFixedQuestionSync&&(await setting('questionBankFixVersion',0))<QUESTION_BANK_FIX_VERSION;for(const question of incoming){if(!question?.id)throw Error('正式题库存在缺少 question.id 的题目');const existing=await get('questions',question.id);if(defer&&FIXED_QUESTION_IDS.has(question.id)&&existing&&questionSignature(existing)!==questionSignature(question))continue;const merged=mergeQuestionRecord(existing,question);if(merged.changed)await put('questions',merged.record)}await saveSetting('questionBankVersion',config.questionBankVersion);return defer?{questions:await all('questions'),incoming}:all('questions')}
const FIX_STORES=['questions','answers','wrongQuestions','knowledgeStats','dailyTasks','checkins','settings'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function runQuestionBankFixMigration(incomingQuestions=[]){const done=await setting('questionBankFixVersion',0);if(done>=QUESTION_BANK_FIX_VERSION)return {alreadyComplete:true,log:await setting('questionBankFixLog',null)};const snapshot=Object.fromEntries(await Promise.all(FIX_STORES.filter(store=>store!=='settings').map(async store=>[store,await all(store)]))),backup={backupVersion:1,createdAt:new Date().toISOString(),appVersion:config.appVersion||'dev',reason:`questionBankFixVersion:${QUESTION_BANK_FIX_VERSION}`,stores:structuredClone(snapshot)},incoming=new Map(incomingQuestions.map(question=>[question.id,question])),working=structuredClone(snapshot);working.questions=working.questions.map(question=>FIXED_QUESTION_IDS.has(question.id)&&incoming.has(question.id)?incoming.get(question.id):question);const result=applyQuestionBankFix(working),db=await openDB();await new Promise((resolve,reject)=>{const transaction=db.transaction(FIX_STORES,'readwrite');for(const store of FIX_STORES.filter(name=>name!=='settings')){const oldRows=new Map(snapshot[store].map(row=>[row[KEY_PATHS[store]],row])),newRows=new Map(result.snapshot[store].map(row=>[row[KEY_PATHS[store]],row])),objectStore=transaction.objectStore(store);for(const [key,row] of newRows)if(!same(oldRows.get(key),row))objectStore.put(row);for(const key of oldRows.keys())if(!newRows.has(key))objectStore.delete(key)}transaction.objectStore('settings').put({key:'questionBankFixBackupV2',value:backup});transaction.objectStore('settings').put({key:'questionBankFixLog',value:result.log});transaction.objectStore('settings').put({key:'questionBankFixVersion',value:QUESTION_BANK_FIX_VERSION});transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error||Error('题库修复迁移失败'));transaction.onabort=()=>reject(transaction.error||Error('题库修复迁移中止'))});return {alreadyComplete:false,log:result.log}}
export async function dataSafetyStatus(){const db=await openDB();return {counts:await countStores(db,CRITICAL_STORES),migration:await setting('migrationSafety',null),lastBackupAt:await setting('lastFullBackupAt',null),questionBankVersion:await setting('questionBankVersion',config.questionBankVersion)}}
/* Explicit parent/developer test action only; updates and imports never call this. */
export function equalBackupValue(left,right){
  if(Object.is(left,right))return true;
  if(!left||!right||typeof left!=='object'||typeof right!=='object')return false;
  if(Array.isArray(left)!==Array.isArray(right)||Object.getPrototypeOf(left)!==Object.getPrototypeOf(right))return false;
  if(left instanceof Date)return left.getTime()===right.getTime();
  if(!Array.isArray(left)&&Object.getPrototypeOf(left)!==Object.prototype&&Object.getPrototypeOf(left)!==null)return false;
  if(Array.isArray(left)&&left.length!==right.length)return false;
  const keys=Object.keys(left);
  return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&equalBackupValue(left[key],right[key]));
}

function verifyLearningRows(expected,actual,message){
  for(const name of LEARNING_STORES){
    const keyPath=KEY_PATHS[name],rows=new Map(actual[name].map(row=>[row[keyPath],row]));
    if(rows.size!==expected[name].length||expected[name].some(row=>!equalBackupValue(row,rows.get(row[keyPath])))){
      throw Error(`${message}：${name} 内容不一致`);
    }
  }
}

// Keep the final callback inside an IndexedDB request event so it can queue writes or abort.
function readLearningStores(transaction,onRead){
  const stores={};
  let remaining=LEARNING_STORES.length;
  for(const name of LEARNING_STORES){
    const request=transaction.objectStore(name).getAll();
    request.onsuccess=()=>{
      stores[name]=request.result;
      if(--remaining===0)onRead(stores);
    };
  }
}

export async function readLearningData(){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(LEARNING_STORES,'readonly');
    let stores;
    transaction.oncomplete=()=>resolve(stores);
    transaction.onabort=()=>reject(transaction.error||Error('读取学习数据中止'));
    readLearningStores(transaction,result=>{stores=result});
  });
}

export function replaceStoresAtomically(db,snapshot,expectedOriginal){
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(LEARNING_STORES,'readwrite');
    let failure;
    transaction.oncomplete=resolve;
    transaction.onabort=()=>reject(failure||transaction.error||Error('恢复过程中止'));
    const attempt=operation=>{
      try{operation()}
      catch(error){failure=error;transaction.abort()}
    };
    const replace=()=>{
      const metadata=transaction.objectStore(METADATA_STORE);
      const generation=metadata.get(GENERATION_KEY);
      generation.onsuccess=()=>attempt(()=>{
        if(!Number.isSafeInteger(generation.result?.value)||generation.result.value>=Number.MAX_SAFE_INTEGER)throw Error('学习数据代际无效');
        metadata.put({key:GENERATION_KEY,value:generation.result.value+1});
      });
      for(const name of LEARNING_STORES){
        const store=transaction.objectStore(name);
        store.clear();
        for(const item of snapshot[name])store.add(item);
      }
      readLearningStores(transaction,actual=>attempt(()=>verifyLearningRows(snapshot,actual,'提交前恢复校验失败')));
    };
    attempt(()=>{
      if(!expectedOriginal){replace();return}
      readLearningStores(transaction,actual=>attempt(()=>{
        verifyLearningRows(expectedOriginal,actual,'生成快照后学习数据发生变化，请重新确认恢复');
        replace();
      }));
    });
  });
}

export async function restoreLearningData(snapshot,expectedOriginal){
  const db=await openDB();
  await replaceStoresAtomically(db,snapshot,expectedOriginal);
  try{
    verifyLearningRows(snapshot,await readLearningData(),'恢复后校验失败');
  }catch(error){
    throw Error(`${error.message}。恢复事务已提交，请检查学习数据或使用本机恢复前快照回退。`,{cause:error});
  }
}
