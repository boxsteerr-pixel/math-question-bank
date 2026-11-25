import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {KEY_PATHS} from '../js/db.js';
import * as engine from '../js/questionEngine.js';

// Exercise the actual IndexedDB request/transaction callers against isolated records.
// The queue models store access order, completion, rollback and a competing writer.
class MemoryDb{
  constructor(){this.tail=Promise.resolve()}
  reset(stores){
    this.data=Object.fromEntries(Object.keys(KEY_PATHS).map(name=>[name,structuredClone(stores[name]||[])]));
    this.failStore=null;
  }
  transaction(names,mode){
    const scope=new Set(Array.isArray(names)?names:[names]);
    const requests=[];
    let finish;
    let aborted=false;
    const done=new Promise(resolve=>{finish=resolve});
    const tx={
      error:null,
      abort(){aborted=true},
      objectStore(name){
        assert.ok(scope.has(name),`store ${name} must be in transaction scope`);
        const request=action=>{
          const handle={};
          requests.push(snapshot=>pending({handle,action},snapshot));
          return handle;
        };
        const key=KEY_PATHS[name];
        return {
          get:id=>request(rows=>rows.find(row=>row[key]===id)),
          getAll:()=>request(rows=>rows),
          put:item=>request(rows=>{
            assert.equal(mode,'readwrite');
            if(name===db.failStore)throw Error(`simulated ${name} write failure`);
            const index=rows.findIndex(row=>row[key]===item[key]);
            if(index===-1)rows.push(item);
            else rows[index]=item;
          }),
          delete:id=>request(rows=>{
            assert.equal(mode,'readwrite');
            const index=rows.findIndex(row=>row[key]===id);
            if(index!==-1)rows.splice(index,1);
          })
        };
        function pending({handle,action},snapshot){
          try{
            handle.result=structuredClone(action(snapshot[name]));
            handle.onsuccess?.();
          }catch(error){
            handle.error=error;
            tx.error=error;
            handle.onerror?.();
            tx.onerror?.();
            tx.abort();
          }
        }
      }
    };
    const db=this;
    this.tail.then(()=>{
      const snapshot=structuredClone(this.data);
      const run=()=>{
        if(!aborted&&requests.length){
          requests.shift()(snapshot);
          setImmediate(run);
          return;
        }
        if(aborted)tx.onabort?.();
        else{
          if(mode==='readwrite')this.data=snapshot;
          tx.oncomplete?.();
        }
        finish();
      };
      setImmediate(run);
    });
    this.tail=done;
    return tx;
  }
}

const db=new MemoryDb();
globalThis.indexedDB={open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request}};
const date='2026-09-13',earlier='2026-09-12',later='2026-09-14',point='相反数';
const other='整式乘除综合',scopeKey='enabledKnowledgePoints';
const questions=Array.from({length:11},(_,i)=>({id:`Q${i}`,knowledgePoint:point}));
const elsewhere={id:'Q-other',knowledgePoint:other};
const select=(value=[point])=>({key:scopeKey,value});
const reset=(stores={})=>db.reset({questions:[...questions,elsewhere],settings:[select()],...stores});
const asTask=(date,questionIds,extra={})=>({date,questionIds,...extra});
const rejectScope=operation=>assert.rejects(operation,error=>error.code==='INSUFFICIENT_LEARNING_SCOPE');
const rejectProtected=operation=>assert.rejects(operation,error=>error.code==='PROTECTED_INCOMPLETE_TASK'&&error.date===date);

reset({questions:questions.slice(0,9)});
await rejectScope(()=>engine.getOrCreateDailyTask(date));
assert.deepEqual(db.data.dailyTasks,[],'不足 10 题时不能保存任务');
assert.deepEqual(db.data.questionHistory,[],'不足 10 题时不能写入出题记录');

const official=JSON.parse(readFileSync(new URL('../data/questions.json',import.meta.url),'utf8'));
const power=engine.inspectLearningScope(official,['幂的乘方']);
assert.ok(power.eligibleCount>0&&power.eligibleCount<10);
assert.equal(power.missingCount,10-power.eligibleCount);
for(const size of [0,1,9,10,11]){
  const bank=[...questions.slice(0,size),elsewhere,{knowledgePoint:point}];
  if(size)bank.push(bank[0]);
  const inspected=engine.inspectLearningScope(bank,[point,point]);
  assert.deepEqual(inspected,{points:[point],selectedCount:1,eligibleCount:size,missingCount:Math.max(0,10-size),valid:size>=10});
  reset({questions:bank.filter(question=>question.id)});
  if(size<10){
    const before=structuredClone(db.data);
    await rejectScope(()=>engine.getOrCreateDailyTask(date));
    await rejectScope(()=>engine.getOrCreateDailyTask(date));
    assert.deepEqual(db.data,before);
    continue;
  }
  const [first,second]=await Promise.all([engine.getOrCreateDailyTask(date),engine.getOrCreateDailyTask(date)]);
  assert.deepEqual(first,second);
  assert.equal(first.questionIds.length,10);
  assert.equal(new Set(first.questionIds).size,10);
  assert.ok(first.items.every(item=>item.targetKnowledgePoint===point));
  assert.equal(db.data.dailyTasks.length,1);
  assert.equal(db.data.questionHistory.length,10);
  assert.ok(db.data.questionHistory.every(row=>row.shownCount===1&&row.lastShownDate===date));
}

reset();
assert.deepEqual(await engine.enabledPoints(),[point], 'a new knowledge point cannot broaden a stored choice');
await rejectScope(()=>engine.saveLearningScope([other]));
assert.deepEqual(db.data.settings,[select()]);
assert.equal((await engine.saveLearningScope([point,point])).valid,true);
assert.deepEqual(db.data.settings,[select()]);
reset({settings:[select([])]});
assert.deepEqual(await engine.enabledPoints(),[],'an explicit empty historical scope requires a new choice');
await rejectScope(()=>engine.getOrCreateDailyTask(date));
reset({settings:[select(null)]});
assert.deepEqual(await engine.enabledPoints(),[],'a malformed historical scope cannot activate default points');
await rejectScope(()=>engine.getOrCreateDailyTask(date));

const full=questions.slice(0,10).map(question=>question.id);
const sparse=full.slice();
delete sparse[9];
const damaged=[['Q0'],['Q0','Q0'],[...full.slice(0,9),'missing'],sparse,undefined];
for(const ids of damaged){
  const previous=asTask(date,ids,{items:[{questionId:'Q0'}]});
  reset({questions:questions.slice(0,10),dailyTasks:[previous],questionHistory:[{questionId:'Q0',shownCount:1,lastShownDate:date}]});
  const repaired=await engine.getOrCreateDailyTask(date);
  assert.equal(repaired.questionIds.length,10);
  assert.equal(db.data.dailyTasks.length,1);
  assert.equal(db.data.questionHistory.length,10);
  assert.ok(db.data.questionHistory.every(row=>row.shownCount===1));
  await engine.getOrCreateDailyTask(date);
  assert.ok(db.data.questionHistory.every(row=>row.shownCount===1));
}

const previous=asTask(date,['Q0','Q1']);
const previousHistory=[{questionId:'Q0',shownCount:1,lastShownDate:date}];
const protectedCases=[
  {answers:[{key:`${date}:Q0`,date,questionId:'Q0',draftSaved:true}]},
  {answers:[{key:`${date}:Q0`,questionId:'Q0',firstAttemptCorrect:false}]},
  {answers:[{key:`${date}:Q0`,date,questionId:'Q0',correctionInputs:['1']}]},
  {dailyTasks:[{...previous,startedAt:123}]},
  {dailyTasks:[{...previous,phase:'submitting'}]},
  {dailyTasks:[{...previous,phase:'complete'}]},
  {checkins:[{date}]},
  {checkins:[{date:later,taskDates:[date]}]}
];
for(const evidence of protectedCases){
  reset({dailyTasks:[previous],questionHistory:previousHistory,...evidence});
  const before=structuredClone(db.data);
  await rejectProtected(()=>engine.getOrCreateDailyTask(date));
  assert.deepEqual(db.data,before);
}

reset({dailyTasks:[previous],questionHistory:previousHistory,questions:questions.slice(0,9)});
let before=structuredClone(db.data);
await rejectScope(()=>engine.getOrCreateDailyTask(date));
assert.deepEqual(db.data,before,'failed repair must retain both the original task and history');

reset({dailyTasks:[previous],questionHistory:previousHistory});
before=structuredClone(db.data);
db.failStore='questionHistory';
await assert.rejects(()=>engine.getOrCreateDailyTask(date),/simulated questionHistory write failure/);
assert.deepEqual(db.data,before,'a failure after the task write must roll back the old task and history together');

reset({dailyTasks:[asTask(earlier,full),asTask(date,[elsewhere.id]),asTask(later,[elsewhere.id,...full.slice(0,9)])],questionHistory:[
  {questionId:elsewhere.id,shownCount:2,lastShownDate:later},
  {questionId:'Q0',shownCount:1,lastShownDate:earlier}
]});
const repairedWithOtherDates=await engine.getOrCreateDailyTask(date);
assert.ok(!repairedWithOtherDates.questionIds.includes(elsewhere.id));
assert.deepEqual(db.data.questionHistory.find(row=>row.questionId===elsewhere.id),{questionId:elsewhere.id,shownCount:1,lastShownDate:later});

reset({dailyTasks:[asTask(earlier,full),previous],answers:[{key:`${earlier}:Q0`,date:earlier,questionId:'Q0',draftSaved:true}],settings:[select(),{key:engine.CARRYOVER_START_SETTING,value:earlier}]});
const work=await engine.getDailyWorkload(date);
assert.equal(work.carryRemaining,9);
assert.equal(work.newRemaining,10);
assert.equal(work.batches[0].task.date,earlier);
assert.deepEqual(work.batches[0].task.questionIds,full);
assert.equal(work.batches[1].task.date,date);
assert.equal(work.batches[1].task.questionIds.length,10);

reset({checkins:[{date,taskDates:[earlier]}],settings:[select(),{key:engine.CARRYOVER_START_SETTING,value:date}]});
assert.equal((await engine.getDailyWorkload(date)).newRemaining,10,'a receipt for only earlier batches cannot suppress today’s tasks');
console.log('Learning scope, daily-task transactions, protected repair, and carryover scenarios passed.');

reset({checkins:Array.from({length:5},(_,i)=>({date:`2026-09-0${i+1}`}))});
const sparseTask=await engine.getOrCreateDailyTask(date);
assert.equal(sparseTask.mode,'adaptive_5_3_2');
assert.equal(new Set(sparseTask.questionIds).size,10,'a sufficient explicit range can fill a batch before statistics exist');
assert.ok(sparseTask.items.every(item=>item.targetKnowledgePoint===point));
assert.deepEqual(Object.keys(sparseTask.scoringQuestionPolicies).sort(),sparseTask.questionIds.slice().sort());

const protectedTask=asTask(earlier,[questions[0].id],{phase:'complete'});
reset({dailyTasks:[protectedTask],settings:[select(),{key:engine.CARRYOVER_START_SETTING,value:date}]});
const protectedWorkload=await engine.getDailyWorkload(date);
assert.equal(protectedWorkload.batches.length,1);
assert.equal(protectedWorkload.batches[0].date,date);
assert.equal(protectedWorkload.batches[0].total,10);
assert.deepEqual(protectedWorkload.anomalies.map(({date,blocksCheckin})=>({date,blocksCheckin})),[{date:earlier,blocksCheckin:false}]);
assert.deepEqual(db.data.dailyTasks.find(task=>task.date===earlier),protectedTask);

const protectedDraft={key:earlier+':'+questions[0].id,date:earlier,questionId:questions[0].id,draftSaved:true};
reset({dailyTasks:[asTask(earlier,[questions[0].id])],answers:[protectedDraft],settings:[select(),{key:engine.CARRYOVER_START_SETTING,value:earlier}]});
const current=await engine.getOrCreateDailyTask(date);
for(const questionId of current.questionIds)db.data.answers.push({key:date+':'+questionId,date,questionId,initialSubmitted:true});
const unfinished=await engine.getDailyWorkload(date);
assert.equal(unfinished.batches[0].submitted,true);
assert.equal(unfinished.needsSubmission,true,'an unsubmitted protected batch blocks an otherwise premature daily check-in');
assert.deepEqual(unfinished.anomalies.map(({date,blocksCheckin})=>({date,blocksCheckin})),[{date:earlier,blocksCheckin:true}]);
assert.deepEqual(db.data.answers.find(row=>row.key===protectedDraft.key),protectedDraft);
