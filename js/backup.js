import {all,saveSetting,LEARNING_STORES,KEY_PATHS,readLearningData,restoreLearningData,equalBackupValue} from './db.js';

export const BACKUP_VERSION=1;
const SNAPSHOT_DB='grade7MathCheckinRestoreSnapshots',SNAPSHOT_STORE='snapshots';
const own=(object,key)=>Object.hasOwn(object,key);
const object=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&Boolean(value.trim())&&value.trim()===value;
const questionId=value=>text(value)&&/^Q\d+$/.test(value);
const count=value=>Number.isSafeInteger(value)&&value>=0;
const strings=value=>Array.isArray(value)&&value.every(item=>typeof item==='string');
const date=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const parsed=new Date(value+'T00:00:00.000Z');
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
};
const dateList=value=>Array.isArray(value)&&value.every(date)&&new Set(value).size===value.length;
const questionList=value=>Array.isArray(value)&&value.every(questionId)&&new Set(value).size===value.length;

function field(condition,store,key,index){
  if(!condition)throw Error(`数据异常：${store} 第 ${index+1} 条记录缺失或包含无效字段 ${key}`);
}

const storeRules={
  dailyTasks:{
    date,
    questionIds:questionList,
  },
  answers:{
    key:text,
    date,
    questionId,
  },
  wrongQuestions:{
    questionId,
    firstWrongDate:date,
    lastWrongDate:date,
    wrongCount:count,
  },
  knowledgeStats:{
    questionId:text,
    knowledgePoint:text,
    attempts:count,
    firstCorrect:count,
  },
  questionHistory:{
    questionId,
    shownCount:count,
    lastShownDate:value=>value===null||date(value),
  },
  checkins:{
    date,
    firstCorrect:count,
    wrong:count,
  },
  settings:{key:text,value:value=>value!==undefined},
};

function validateLearningRows(stores){
  const tasks=new Map();
  const taskQuestions=new Map();
  const stats={};
  for(const store of LEARNING_STORES){
    const items=stores[store],keyPath=KEY_PATHS[store],seen=new Set();
    if(!Array.isArray(items))throw Error(`数据异常：${store} 必须是数组`);
    for(const [index,item] of items.entries()){
      if(!object(item))throw Error(`数据异常：${store} 包含非对象记录`);
      for(const [key,valid] of Object.entries(storeRules[store])){
        field(own(item,key)&&valid(item[key]),store,key,index);
      }
      const key=item[keyPath];
      if(seen.has(key))throw Error(`数据异常：${store} 的主键 ${keyPath} 重复（${key}）`);
      seen.add(key);
      if(store==='dailyTasks'){
        tasks.set(key,item);
        taskQuestions.set(key,new Set(item.questionIds));
      }
    }
    stats[store]=items.length;
  }

  for(const [index,task] of stores.dailyTasks.entries()){
    if(own(task,'items')){
      field(Array.isArray(task.items)&&task.items.length===task.questionIds.length
        &&task.items.every((item,i)=>item?.questionId===task.questionIds[i]),'dailyTasks','items',index);
    }
  }
  for(const [index,answer] of stores.answers.entries()){
    field(answer.key===`${answer.date}:${answer.questionId}`,'answers','key',index);
    field(taskQuestions.get(answer.date)?.has(answer.questionId),'answers','date / questionId（未找到对应任务题目）',index);
    for(const key of ['currentInputs','firstAnswer','correctionInputs','finalAnswer']){
      if(own(answer,key))field(strings(answer[key]),'answers',key,index);
    }
  }
  for(const [index,checkin] of stores.checkins.entries()){
    if(own(checkin,'corrected'))field(count(checkin.corrected),'checkins','corrected',index);
    if(own(checkin,'taskDates')){
      field(dateList(checkin.taskDates)&&checkin.taskDates.length>0&&checkin.taskDates.every(day=>tasks.has(day)&&day<=checkin.date),'checkins','taskDates',index);
    }else{
      field(tasks.has(checkin.date),'checkins','date（未找到对应任务）',index);
    }
  }
  for(const [index,record] of stores.knowledgeStats.entries()){
    field(record.knowledgePoint===record.questionId,'knowledgeStats','knowledgePoint',index);
    field(record.firstCorrect<=record.attempts,'knowledgeStats','firstCorrect',index);
    if(own(record,'last20Attempts')){
      field(Array.isArray(record.last20Attempts)&&record.last20Attempts.every(value=>typeof value==='boolean'),'knowledgeStats','last20Attempts',index);
    }
    if(own(record,'recentAttempts')){
      field(Array.isArray(record.recentAttempts)&&record.recentAttempts.every(value=>typeof value==='boolean'||object(value)&&typeof value.firstCorrect==='boolean'),'knowledgeStats','recentAttempts',index);
    }
  }
  for(const [index,record] of stores.wrongQuestions.entries()){
    if(own(record,'nextReviewDate'))field(record.nextReviewDate===null||date(record.nextReviewDate),'wrongQuestions','nextReviewDate',index);
  }
  for(const [index,record] of stores.settings.entries()){
    if(record.key==='enabledKnowledgePoints')field(Array.isArray(record.value)&&record.value.every(text),'settings','enabledKnowledgePoints',index);
  }
  return stats;
}

function backupFile(stores,createdAt=new Date().toISOString()){
  return {backupVersion:BACKUP_VERSION,createdAt,appVersion:globalThis.MATH_PWA_VERSION?.appVersion||'dev',stores};
}

export async function exportBackup(){
  const createdAt=new Date().toISOString();
  await saveSetting('lastFullBackupAt',createdAt);
  return backupFile(await readLearningData(),createdAt);
}

export function validateBackup(data){
  if(!object(data))throw Error('无效的备份文件');
  if(!own(data,'backupVersion')||data.backupVersion!==BACKUP_VERSION)throw Error('该备份版本与当前应用不兼容。');
  if(typeof data.createdAt!=='string'||Number.isNaN(Date.parse(data.createdAt)))throw Error('数据异常：缺少或无法识别备份时间');
  if(typeof data.appVersion!=='string'||!data.appVersion.trim())throw Error('数据异常：缺少应用版本');
  if(!object(data.stores))throw Error('数据异常：缺少 stores 数据结构');
  const stats=validateLearningRows(data.stores);
  return {backupVersion:data.backupVersion,createdAt:data.createdAt,appVersion:data.appVersion,stats};
}

function openSnapshotDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(SNAPSHOT_DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(SNAPSHOT_STORE,{keyPath:'id',autoIncrement:true});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('无法打开独立快照库'));
  });
}

async function snapshotRequest(mode,operation){
  const db=await openSnapshotDb();
  try{
    return await new Promise((resolve,reject)=>{
      const transaction=db.transaction(SNAPSHOT_STORE,mode,mode==='readwrite'?{durability:'strict'}:undefined);
      transaction.onabort=()=>reject(transaction.error||Error('快照事务中止'));
      const request=operation(transaction.objectStore(SNAPSHOT_STORE));
      transaction.oncomplete=()=>resolve(request.result);
    });
  }finally{db.close()}
}

async function saveRestoreSnapshot(snapshot){
  try{
    const id=await snapshotRequest('readwrite',store=>store.add({snapshot}));
    const saved=await snapshotRequest('readonly',store=>store.get(id));
    if(!equalBackupValue(saved,{id,snapshot}))throw Error('读取到的快照内容不一致');
    return saved.snapshot;
  }catch(error){
    throw Error(`无法保存并核验本机恢复前快照，已停止恢复：${error.message}`,{cause:error});
  }
}

export async function readRestoreSnapshot(){
  // A cursor is valid only during its readonly transaction; copy its value in the request callback.
  const record=await snapshotRequest('readonly',store=>{
    const cursor=store.openCursor(null,'prev'),result={};
    cursor.onsuccess=()=>{result.result=cursor.result?.value};
    return result;
  });
  return record?{...record.snapshot,restoreSnapshotId:record.id}:null;
}

async function restoreWithSnapshot(stores){
  const original=await saveRestoreSnapshot(backupFile(await readLearningData()));
  await restoreLearningData(stores,original.stores);
}

async function verifyQuestionReferences(stores){
  const referenced=new Set();
  for(const task of stores.dailyTasks)for(const id of task.questionIds)referenced.add(id);
  for(const store of ['wrongQuestions','questionHistory']){
    for(const row of stores[store])referenced.add(row.questionId);
  }
  if(!referenced.size)return;

  const known=new Set((await all('questions')).map(question=>question.id));
  const missing=[...referenced].filter(id=>!known.has(id));
  if(!missing.length)return;
  let formalBank;
  try{
    const response=await fetch('./data/questions.json');
    if(!response.ok)throw Error('无法读取正式题库');
    formalBank=new Set((await response.json()).map(question=>question.id));
  }catch(error){
    throw Error('无法读取正式题库以核对备份中的题目，已停止恢复。',{cause:error});
  }
  const unknown=missing.find(id=>!formalBank.has(id));
  if(unknown)throw Error(`数据异常：备份引用了题库中不存在的题目 ${unknown}`);
}
export async function importBackup(data){
  const incoming=structuredClone(data),meta=validateBackup(incoming);
  await verifyQuestionReferences(incoming.stores);
  await restoreWithSnapshot(incoming.stores);
  return meta;
}

export async function rollbackRestoreSnapshot(snapshot){
  const {restoreSnapshotId,...expected}=snapshot;
  const saved=await snapshotRequest('readonly',store=>store.get(restoreSnapshotId));
  if(!saved||!equalBackupValue(saved.snapshot,expected))throw Error('本机恢复前快照不可读取或已变化');
  // Recover every original record, including historical anomalies the incoming-file preflight rejects.
  await restoreWithSnapshot(saved.snapshot.stores);
}
