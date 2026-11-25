import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {KEY_PATHS,LEARNING_STORES,replaceStoresAtomically} from '../js/db.js';

const clone=structuredClone;
let moduleCounter=0;
let backup;
async function freshBackup(){
  const dbUrl=new URL('../js/db.js',import.meta.url);
  dbUrl.search='?backupTest='+(++moduleCounter);
  const source=readFileSync(new URL('../js/backup.js',import.meta.url),'utf8').replace("'./db.js'",JSON.stringify(dbUrl.href));
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const dateFor=index=>new Date(Date.UTC(2026,0,index+1)).toISOString().slice(0,10);
const questionFor=index=>'Q'+String(index+1).padStart(4,'0');
function file(answerCount=10,prefix='incoming'){
  const stores=Object.fromEntries(LEARNING_STORES.map(store=>[store,[]]));
  for(let i=0;i<Math.ceil(answerCount/10);i++){
    const date=dateFor(i),questionIds=Array.from({length:10},(_,n)=>questionFor(n));
    stores.dailyTasks.push({date,questionIds,items:questionIds.map(questionId=>({questionId,sourceType:'review'}))});
    for(const questionId of questionIds.slice(0,answerCount-i*10)){
      stores.answers.push({key:date+':'+questionId,date,questionId,firstAnswer:[prefix],firstAttemptCorrect:false});
    }
  }
  stores.wrongQuestions.push({questionId:'Q0001',firstWrongDate:dateFor(0),lastWrongDate:dateFor(0),wrongCount:1,nextReviewDate:dateFor(1)});
  stores.knowledgeStats.push({questionId:'相反数',knowledgePoint:'相反数',attempts:1,firstCorrect:0,last20Attempts:[false]});
  stores.questionHistory.push({questionId:'Q0001',shownCount:1,lastShownDate:dateFor(0)});
  stores.checkins.push({date:dateFor(0),firstCorrect:0,wrong:1,corrected:0,taskDates:[dateFor(0)]});
  stores.settings.push({key:'enabledKnowledgePoints',value:['相反数']},{key:'test',value:prefix});
  return {backupVersion:1,createdAt:'2026-09-13T12:00:00.000Z',appVersion:'0.5.2',stores};
}
const good=file(800),current=file(1000,'original');
const changed=(store,change)=>{
  const output=clone(good);
  change(output.stores[store]);
  return output;
};

class MemoryDb{
  constructor(data={},keys=KEY_PATHS){
    this.data=clone(data);
    this.metadata=[{key:'learningDataGeneration',value:0}];
    this.keys={...keys,learningMetadata:'key'};
    this.objectStoreNames={contains:name=>Object.hasOwn(this.data,name)};
    this.nextKey=1;
    this.calls=[];
  }
  createObjectStore(name,{keyPath}){
    this.data[name]=[];
    this.keys[name]=keyPath;
  }
  close(){}
  transaction(names,mode){
    const db=this,staged=clone(db.data),requests=[];
    staged.learningMetadata=clone(db.metadata);
    let aborted=false,completed=false;
    db.calls.push({names,mode});
    const enqueue=run=>{
      const request={result:undefined,error:null,onsuccess:null,onerror:null};
      requests.push(()=>{
        request.result=run();
        request.onsuccess?.();
      });
      return request;
    };
    const transaction={
      error:null,
      objectStore(store){
        const key=db.keys[store];
        const write=(row,addOnly)=>{
          if(db.failStore===store)throw Error('simulated '+store+' failure');
          return enqueue(()=>{
            if(db.abortStore===store){transaction.abort();return}
            const copy=clone(row);
            copy[key]??=db.nextKey++;
            const index=staged[store].findIndex(item=>item[key]===copy[key]);
            if(index===-1)staged[store].push(copy);
            else if(addOnly)throw Error('ConstraintError');
            else staged[store][index]=copy;
            if(db.corruptStore===store)copy.integrityFault=true;
            return copy[key];
          });
        };
        return {
          clear:()=>enqueue(()=>{staged[store]=[]}),
          put:row=>write(row,false),
          add:row=>write(row,true),
          getAll:()=>enqueue(()=>clone(staged[store]??db.officialQuestions)),
          count:()=>enqueue(()=>staged[store].length),
          get:id=>enqueue(()=>clone(staged[store].find(item=>item[key]===id))),
          openCursor:()=>enqueue(()=>{
            const row=staged[store].at(-1);
            return row?{value:clone(row)}:null;
          })
        };
      },
      abort(){
        assert.equal(completed,false);
        aborted=true;
        queueMicrotask(()=>transaction.onabort?.());
      }
    };
    queueMicrotask(()=>{
      try{
        while(!aborted&&requests.length)requests.shift()();
      }catch(error){
        transaction.error=error;
        transaction.onerror?.();
        if(!aborted)transaction.abort();
      }
      if(aborted)return;
      if(mode==='readwrite'){
        db.metadata=staged.learningMetadata;
        delete staged.learningMetadata;
        db.data=staged;
      }
      db.beforeComplete?.(names,mode);
      completed=true;
      transaction.oncomplete?.();
    });
    return transaction;
  }
}

const db=new MemoryDb(current.stores),recovery=new MemoryDb();
db.officialQuestions=Array.from({length:10},(_,i)=>({id:questionFor(i)}));
const formalQuestions=clone(db.officialQuestions);
globalThis.fetch=async()=>({ok:true,json:async()=>clone(formalQuestions)});
globalThis.indexedDB={open(name){
  const request={};
  queueMicrotask(()=>{
    request.result=name==='grade7MathCheckin'?db:recovery;
    if(request.result===recovery&&!Object.keys(recovery.data).length)request.onupgradeneeded?.();
    request.onsuccess?.();
  });
  return request;
}};
const expectUnchanged=(actual,before)=>assert.deepEqual(actual,before,'所有学习 store 的完整内容必须保持一致');

const tests=[
  ['restore uses database isolation even when Web Locks is present',async()=>{
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{request(){throw Error('Web Locks must not gate database fencing')}}}});
    try{
      await backup.importBackup(good);
      expectUnchanged(db.data,good.stores);
    }finally{
      if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);
      else delete globalThis.navigator;
    }
  }],
  ['export includes a consistent full snapshot and backup timestamp',async()=>{
    const result=await backup.exportBackup();
    assert.equal(backup.validateBackup(result).stats.answers,1000);
    expectUnchanged(result.stores,db.data);
    assert.equal(result.stores.settings.find(row=>row.key==='lastFullBackupAt')?.value,result.createdAt);
  }],
  ['valid backups',()=>{
    assert.equal(backup.validateBackup(good).stats.answers,800);
    assert.throws(()=>backup.validateBackup(null),/无效/);
    assert.throws(()=>backup.validateBackup({...good,backupVersion:undefined}),/不兼容/);
    assert.throws(()=>backup.validateBackup({...good,backupVersion:2}),/不兼容/);
    assert.throws(()=>backup.validateBackup({...good,stores:{...good.stores,answers:{}}}),/answers 必须是数组/);
  }],
  ['all primary keys reject duplicates and invalid types',()=>{
    for(const store of LEARNING_STORES){
      const key=KEY_PATHS[store];
      assert.throws(()=>backup.validateBackup(changed(store,rows=>rows.push(clone(rows[0])))),/重复/);
      for(const invalid of [null,undefined,[],{},1,true,' ','\n'])assert.throws(()=>backup.validateBackup(changed(store,rows=>{rows[0][key]=invalid})),new RegExp(store));
    }
    assert.throws(()=>backup.validateBackup(changed('dailyTasks',rows=>{rows[0].date='2026-02-31'})),/dailyTasks/);
  }],
  ['essential fields and references',()=>{
    assert.throws(()=>backup.validateBackup(changed('dailyTasks',rows=>{delete rows[0].questionIds})),/dailyTasks.*questionIds/);
    assert.throws(()=>backup.validateBackup(changed('answers',rows=>{delete rows[0].questionId})),/answers.*questionId/);
    assert.throws(()=>backup.validateBackup(changed('settings',rows=>{delete rows[0].value})),/settings.*value/);
    assert.throws(()=>backup.validateBackup(changed('answers',rows=>{rows[0].questionId='Q0099'})),/answers/);
    assert.throws(()=>backup.validateBackup(changed('answers',rows=>Object.assign(rows[0],{questionId:'Q0099',key:rows[0].date+':Q0099'}))),/answers/);
    assert.throws(()=>backup.validateBackup(changed('dailyTasks',rows=>{rows[0].items[0].questionId='Q0099'})),/dailyTasks.*items/);
    assert.throws(()=>backup.validateBackup(changed('checkins',rows=>{rows[0].taskDates=['2026-01-01','2026-12-01']})),/checkins.*taskDates/);
    assert.throws(()=>backup.validateBackup(changed('wrongQuestions',rows=>{delete rows[0].lastWrongDate})),/wrongQuestions.*lastWrongDate/);
    assert.throws(()=>backup.validateBackup(changed('knowledgeStats',rows=>{delete rows[0].knowledgePoint})),/knowledgeStats.*knowledgePoint/);
    assert.throws(()=>backup.validateBackup(changed('questionHistory',rows=>{delete rows[0].shownCount})),/questionHistory.*shownCount/);
  }],
  ['write failure and asynchronous abort preserve every record',async()=>{
    const target=new MemoryDb(current.stores),before=clone(target.data);
    target.failStore='wrongQuestions';
    await assert.rejects(()=>replaceStoresAtomically(target,good.stores),/simulated wrongQuestions failure/);
    expectUnchanged(target.data,before);
    assert.equal(target.metadata[0].value,0,'failed transaction must roll back generation');
    target.failStore=null;
    target.abortStore='wrongQuestions';
    await assert.rejects(()=>replaceStoresAtomically(target,good.stores),/中止/);
    expectUnchanged(target.data,before);
    assert.equal(target.metadata[0].value,0,'aborted transaction must roll back generation');
  }],
  ['equal-count altered writes are rejected before commit',async()=>{
    const target=new MemoryDb(current.stores),before=clone(target.data);
    target.corruptStore='answers';
    await assert.rejects(()=>replaceStoresAtomically(target,good.stores),/answers/);
    expectUnchanged(target.data,before);
  }],
  ['preflight and independent snapshot failure block any learning write',async()=>{
    const before=clone(db.data),calls=db.calls.length;
    await assert.rejects(()=>backup.importBackup(changed('answers',rows=>rows.push(clone(rows[0])))),/重复/);
    assert.equal(db.calls.length,calls);
    recovery.abortStore='snapshots';
    try{await assert.rejects(()=>backup.importBackup(good),/快照/)}
    finally{recovery.abortStore=null}
    expectUnchanged(db.data,before);
    assert.equal(db.calls.slice(calls).some(call=>call.mode==='readwrite'),false);
  }],
  ['unverified independent snapshot blocks replacement',async()=>{
    const before=clone(db.data),calls=db.calls.length;
    recovery.corruptStore='snapshots';
    try{await assert.rejects(()=>backup.importBackup(good),/快照/)}
    finally{recovery.corruptStore=null}
    expectUnchanged(db.data,before);
    assert.equal(db.calls.slice(calls).some(call=>call.mode==='readwrite'),false);
  }],
  ['unknown official question stops before snapshot on a fresh device',async()=>{
    db.officialQuestions=[];
    const missing=changed('questionHistory',rows=>{rows[0].questionId='Q9999'});
    const before=clone(db.data),calls=db.calls.length,snapshotCalls=recovery.calls.length;
    await assert.rejects(()=>backup.importBackup(missing),/Q9999/);
    expectUnchanged(db.data,before);
    assert.equal(db.calls.slice(calls).some(call=>call.mode==='readwrite'),false);
    assert.equal(recovery.calls.length,snapshotCalls);
  }],
  ['a learning write after capturing the snapshot is preserved',async()=>{
    const before=clone(db.data);
    before.answers[0].firstAnswer=['new answer from another tab'];
    recovery.beforeComplete=(_names,mode)=>{
      if(mode==='readwrite')db.data.answers[0].firstAnswer=['new answer from another tab'];
    };
    try{await assert.rejects(()=>backup.importBackup(good),/学习数据发生变化/)}
    finally{recovery.beforeComplete=null}
    expectUnchanged(db.data,before);
  }],
  ['successful import replaces all stores and local snapshot really rolls back',async()=>{
    const before=clone(db.data);
    const oldDbUrl=new URL('../js/db.js',import.meta.url);
    oldDbUrl.search='?backupTest='+moduleCounter;
    const oldDb=await import(oldDbUrl.href);
    assert.equal((await backup.importBackup(good)).stats.answers,800);
    expectUnchanged(db.data,good.stores);
    assert.equal(db.metadata[0].value,1);
    await assert.rejects(()=>oldDb.put('settings',{key:'lateWrite',value:true}),/变化|中止/);
    expectUnchanged(db.data,good.stores);
    const rollback=await backup.readRestoreSnapshot();
    expectUnchanged(rollback.stores,before);
    backup=await freshBackup();
    await backup.rollbackRestoreSnapshot(rollback);
    expectUnchanged(db.data,before);
    assert.equal(db.metadata[0].value,2,'rollback is another monotonic generation');
    expectUnchanged((await backup.readRestoreSnapshot()).stores,good.stores);
  }],
  ['legacy backup without modern metadata or optional fields still imports',async()=>{
    const legacy=file(20,'legacy');
    legacy.appVersion='0.4.5';
    for(const task of legacy.stores.dailyTasks)delete task.items;
    for(const checkin of legacy.stores.checkins){delete checkin.taskDates;delete checkin.corrected;}
    legacy.stores.knowledgeStats[0].recentAttempts=[false];
    delete legacy.stores.knowledgeStats[0].last20Attempts;
    await backup.importBackup(legacy);
    expectUnchanged(db.data,legacy.stores);
  }]
];
let failures=0;
for(const [name,test] of tests){
  try{db.data=clone(current.stores);db.metadata=[{key:'learningDataGeneration',value:0}];db.officialQuestions=clone(formalQuestions);backup=await freshBackup();await test();console.log('PASS '+name)}
  catch(error){failures++;console.error('FAIL '+name);console.error(error)}
}
process.exitCode=Number(failures>0);
