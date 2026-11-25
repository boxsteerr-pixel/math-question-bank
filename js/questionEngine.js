import {all,get,openDB,setting,saveSetting} from './db.js';
import {summarizeKnowledge} from './statistics.js';
import {KNOWLEDGE_POINTS,includeNewKnowledgePoints} from './knowledgePoints.js';
import {freezeTaskScoringPolicy} from './scoringPolicy.js';
const hash=s=>[...s].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,2166136261);
const daysAgo=(date,then)=>then?Math.max(0,Math.round((new Date(`${date}T00:00:00`)-new Date(`${then}T00:00:00`))/86400000)):9999;
export const POWER_BOOST_DAYS=14;
const POWER_BOOST_IDS=new Set(Array.from({length:20},(_,index)=>`Q${String(index+180).padStart(4,'0')}`));
const POWER_BOOST_HIGH_IDS=new Set(['Q0183','Q0184','Q0186','Q0189','Q0190','Q0191','Q0192','Q0194','Q0197','Q0198']);
export const powerBoostActive=(checkinCount,startCheckinCount)=>Number.isInteger(startCheckinCount)&&checkinCount>=startCheckinCount&&checkinCount-startCheckinCount<POWER_BOOST_DAYS;
export function powerBoostStatus(questionId,answers=[]){let streak=0;for(const record of answers.filter(item=>item.questionId===questionId).slice().sort((a,b)=>String(a.submittedOn||a.date||'').localeCompare(String(b.submittedOn||b.date||''))||(a.submittedAt||0)-(b.submittedAt||0))){if(record.firstAttemptCorrect===true)streak++;else if(record.firstAttemptCorrect===false)streak=0}return streak>=3?'excluded':streak>=2?'normal':'priority'}
export const today=()=>new Date().toLocaleDateString('en-CA');
const DAILY_QUESTION_COUNT=10;
const SCOPE_KEY='enabledKnowledgePoints';
const BOOST_KEY='powerBoostStartCheckinCount';
const selectedPoints=points=>includeNewKnowledgePoints(Array.isArray(points)?points:[]).filter(point=>KNOWLEDGE_POINTS.includes(point));
export async function enabledPoints(){
  const saved=await get('settings',SCOPE_KEY);
  return selectedPoints(saved===undefined?KNOWLEDGE_POINTS:saved.value);
}

function questionPool(questions,points){
  const byId=new Map();
  const enabled=new Set(points);
  for(const question of questions){
    if(typeof question?.id==='string'&&question.id.trim()&&enabled.has(question.knowledgePoint)&&!byId.has(question.id))byId.set(question.id,question);
  }
  return byId;
}

export function inspectLearningScope(questions,selected){
  const points=selectedPoints(selected);
  const eligibleCount=questionPool(questions,points).size;
  const missingCount=Math.max(0,DAILY_QUESTION_COUNT-eligibleCount);
  return {points,selectedCount:points.length,eligibleCount,missingCount,valid:missingCount===0};
}

export class LearningScopeError extends Error{
  constructor(code,message,{date,scope}={}){
    super(message);
    this.name='LearningScopeError';
    this.code=code;
    this.date=date;
    this.scope=scope;
  }
}

function requireValidScope(questions,selected,date){
  const scope=inspectLearningScope(questions,selected);
  if(!scope.valid)throw new LearningScopeError('INSUFFICIENT_LEARNING_SCOPE',`当前范围有 ${scope.eligibleCount} 道可用正式题目，还差 ${scope.missingCount} 道。请调整学习范围，原设置与记录已保留。`,{date,scope});
  return scope;
}

function readRequest(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function writeTransaction(stores,work){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(stores,'readwrite');
    let result,error;
    transaction.oncomplete=()=>resolve(result);
    transaction.onabort=()=>reject(error||transaction.error||Error('学习数据事务已中止'));
    work(transaction).then(value=>{result=value},cause=>{
      error=cause;
      try{transaction.abort()}catch{reject(cause)}
    });
  });
}

export function saveLearningScope(selected){
  return writeTransaction(['questions','settings'],async transaction=>{
    const questions=await readRequest(transaction.objectStore('questions').getAll());
    const scope=requireValidScope(questions,selected);
    transaction.objectStore('settings').put({key:SCOPE_KEY,value:scope.points});
    return scope;
  });
}
function ordered(pool,date,history,seed){return pool.slice().sort((a,b)=>{const ah=history.get(a.id),bh=history.get(b.id),au=ah?0:1,bu=bh?0:1;if(au!==bu)return bu-au;const ad=daysAgo(date,ah?.lastShownDate),bd=daysAgo(date,bh?.lastShownDate);if(ad!==bd)return bd-ad;const ac=ah?.shownCount||0,bc=bh?.shownCount||0;if(ac!==bc)return ac-bc;return (hash(`${a.id}:${seed}`)%997)-(hash(`${b.id}:${seed}`)%997)})}
function choose(pool,used,date,history,seed){return ordered(pool.filter(q=>!used.has(q.id)),date,history,seed)[0]}
function add(out,q,sourceType,reason,used){if(!q)return false;out.push({questionId:q.id,sourceType,targetKnowledgePoint:q.knowledgePoint,selectionReason:reason});used.add(q.id);return true}
function stateMap(enabled,stats){const raw=new Map(stats.map(s=>[s.knowledgePoint,s]));return enabled.map(k=>summarizeKnowledge(raw.get(k)||{knowledgePoint:k})).sort((a,b)=>b.weaknessScore-a.weaknessScore||a.knowledgePoint.localeCompare(b.knowledgePoint))}
function selectAcross(out,questions,kps,count,sourceType,date,history,used,reasonFor,limit=3){const picked=new Map;for(const item of out)if(item.sourceType===sourceType)picked.set(item.targetKnowledgePoint,(picked.get(item.targetKnowledgePoint)||0)+1);let guard=0;while(out.length<count&&guard++<100){let added=false;for(const kp of kps){if(out.length===count)break;if((picked.get(kp.knowledgePoint)||0)>=limit)continue;const q=choose(questions.filter(x=>x.knowledgePoint===kp.knowledgePoint),used,date,history,`${sourceType}:${guard}:${kp.knowledgePoint}`);if(add(out,q,sourceType,reasonFor(kp,q),used)){picked.set(kp.knowledgePoint,(picked.get(kp.knowledgePoint)||0)+1);added=true}}if(!added)break}return out}
function unseenExposure(out,questions,states,date,history,used){const unseen=states.filter(state=>state.attempts===0).sort((a,b)=>a.knowledgePoint.localeCompare(b.knowledgePoint));for(const state of unseen){const question=choose(questions.filter(item=>item.knowledgePoint===state.knowledgePoint),used,date,history,`unseen:${state.knowledgePoint}`);if(add(out,question,'review','unseen_knowledge_exposure',used))return state.knowledgePoint}return null}
function normalFill(out,questions,kps,count,date,history,used){const start=out.length,preferred=kps.filter(x=>['mastered','mostly_mastered'].includes(x.state));const order=preferred.length?preferred:kps;let n=0;while(out.length<start+count&&n++<100){let added=false;for(const kp of order){if(out.length>=start+count)break;const q=choose(questions.filter(x=>x.knowledgePoint===kp.knowledgePoint),used,date,history,`review:${n}:${kp.knowledgePoint}`);if(q&&add(out,q,'review',`normal_review: ${kp.knowledgePoint} lastShown=${history.get(q.id)?.lastShownDate||'never'}`,used))added=true}if(!added)break}return out}
function selectPowerBoost(out,questions,count,date,history,used,answers){let selected=0;const base=questions.filter(question=>POWER_BOOST_IDS.has(question.id)&&powerBoostStatus(question.id,answers)!=='excluded'),groupFor=question=>powerBoostStatus(question.id,answers)==='priority'&&POWER_BOOST_HIGH_IDS.has(question.id)?'high':'ordinary';for(let slot=0;slot<count;slot++){const groups=slot%3!==1?['high','ordinary']:['ordinary','high'];let question;for(const allowRecent of [false,true]){for(const group of groups){const pool=base.filter(item=>groupFor(item)===group&&!used.has(item.id)&&(allowRecent||daysAgo(date,history.get(item.id)?.lastShownDate)>2));question=ordered(pool,date,history,`power_boost:${slot}:${group}`).at(0);if(question)break}if(question)break}if(!question)break;const tier=POWER_BOOST_HIGH_IDS.has(question.id)&&powerBoostStatus(question.id,answers)==='priority'?'高优先级':'普通';if(add(out,question,'review',`power_boost: 幂运算14日强化（${tier}·${question.subKnowledgePoint}）`,used))selected++}return selected}
export function buildAdaptiveTask({date,questions,enabled,checkins=[],stats=[],wrongQuestions=[],history=[],answers=[],powerBoost=false}){
  const bank=questions.filter(q=>enabled.includes(q.knowledgePoint)),historyMap=new Map(history.map(x=>[x.questionId,x])),states=stateMap(enabled,stats),used=new Set,items=[],diagnostic=checkins.length<5;
  if(diagnostic){
    if(powerBoost)selectPowerBoost(items,bank,3,date,historyMap,used,answers);
    let turn=0;
    while(items.length<10&&turn++<100){let added=false;for(const kp of states){if(items.length===10)break;const q=choose(bank.filter(x=>x.knowledgePoint===kp.knowledgePoint),used,date,historyMap,`diagnostic:${turn}:${kp.knowledgePoint}`);if(add(items,q,'review',`diagnostic: balanced coverage for ${kp.knowledgePoint}`,used))added=true}if(!added)break}
  }else{
    const due=wrongQuestions.filter(w=>!w.mastered&&w.nextReviewDate&&w.nextReviewDate<=date).map(w=>({w,q:bank.find(q=>q.id===w.questionId)})).filter(x=>x.q).sort((a,b)=>a.w.nextReviewDate.localeCompare(b.w.nextReviewDate)||b.w.wrongCount-a.wrongCount||b.w.lastWrongDate.localeCompare(a.w.lastWrongDate));
    for(const {w,q} of due.slice(0,2))add(items,q,'wrong_review',`wrong_review: reviewStage=${w.reviewStage}, due=${w.nextReviewDate}`,used);
    const sampled=states.filter(s=>s.attempts>0),sampledPoints=new Set(sampled.map(s=>s.knowledgePoint)),reviewBank=bank.filter(q=>sampledPoints.has(q.knowledgePoint));
    const ranked=sampled.filter(s=>s.state!=='insufficient_data').sort((a,b)=>b.weaknessScore-a.weaknessScore),weak=ranked.filter(s=>['priority_weak','weak'].includes(s.state)),focus=weak.length?weak:ranked,cap=focus.length===1?4:3;
    selectAcross(items,bank,focus,items.length+5,'weakness',date,historyMap,used,s=>`${s.state}: ${s.knowledgePoint} recentAccuracy=${Math.round(s.recentAccuracy)}%`,cap);
    if(items.filter(x=>x.sourceType==='weakness').length<5)selectAcross(items,bank,ranked,items.length+(5-items.filter(x=>x.sourceType==='weakness').length),'weakness',date,historyMap,used,s=>`relative_lowest: ${s.knowledgePoint} recentAccuracy=${Math.round(s.recentAccuracy)}%`,cap);
    const reviewCount=10-items.length,reviewStart=items.length,duePower=due.filter(item=>POWER_BOOST_IDS.has(item.q.id)).length,boostCount=powerBoost?Math.min(reviewCount,Math.max(0,3-Math.min(3,duePower))):0;
    selectPowerBoost(items,reviewBank,boostCount,date,historyMap,used,answers);
    if(reviewCount>(items.length-reviewStart))unseenExposure(items,bank,states,date,historyMap,used);
    normalFill(items,reviewBank,sampled,reviewCount-(items.length-reviewStart),date,historyMap,used);
  }
if(items.length<10){const sampledPoints=new Set(states.filter(s=>s.attempts>0).map(s=>s.knowledgePoint)),fallback=ordered(bank.filter(q=>!used.has(q.id)&&(diagnostic||sampledPoints.has(q.knowledgePoint))),date,historyMap,'fallback');for(const q of fallback){if(items.length===10)break;add(items,q,'review',`normal_review: fallback ${q.knowledgePoint}`,used)}}return freezeTaskScoringPolicy({date,questionIds:items.map(x=>x.questionId),items,createdAt:Date.now(),mode:diagnostic?'diagnosticPhase':'adaptive_5_3_2',selectionReason:Object.fromEntries(items.map(x=>[x.questionId,x.selectionReason]))},bank)}

function completeSparseTask(task,bank,history){
  if(task.questionIds.length===DAILY_QUESTION_COUNT)return task;
  const items=task.items.slice(),used=new Set(task.questionIds);
  const remaining=ordered(bank.filter(question=>!used.has(question.id)),task.date,history,'fallback');
  for(const question of remaining){
    if(items.length===DAILY_QUESTION_COUNT)break;
    add(items,question,'review',`normal_review: fallback ${question.knowledgePoint}`,used);
  }
  return freezeTaskScoringPolicy({...task,items,questionIds:items.map(item=>item.questionId),
    selectionReason:Object.fromEntries(items.map(item=>[item.questionId,item.selectionReason]))},bank);
}

function hasCompleteQuestions(task,byId){
  const ids=task?.questionIds;
  if(!Array.isArray(ids)||ids.length!==DAILY_QUESTION_COUNT)return false;
  const unique=new Set(ids);
  return unique.size===DAILY_QUESTION_COUNT&&[...unique].every(id=>typeof id==='string'&&id.trim()&&byId.has(id));
}

const isTaskReceipt=(receipt,date)=>Array.isArray(receipt.taskDates)?receipt.taskDates.includes(date):receipt.date===date;
function hasLearningActivity(task,date,answers,checkins){
  // Preserve even a started session: another page may still hold unsubmitted input.
  return Boolean(task?.startedAt||task?.submittedOn||task?.endedAt||task?.completedAt||
    task?.phase&&!['pending','practice'].includes(task.phase)||
    answers.some(answer=>answer.date===date||typeof answer.key==='string'&&answer.key.startsWith(`${date}:`))||
    checkins.some(receipt=>isTaskReceipt(receipt,date)));
}

function previousQuestionIds(task){
  return new Set([
    ...(Array.isArray(task.questionIds)?task.questionIds:[]),
    ...(Array.isArray(task.items)?task.items.map(item=>item?.questionId):[])
  ].filter(id=>typeof id==='string'&&id.trim()));
}

function reconcilePreviousHistory(previous,tasks,history){
  const changed=new Set();
  for(const questionId of previousQuestionIds(previous)){
    const row=history.get(questionId);
    if(!row||!Number.isInteger(row.shownCount)||row.shownCount<1||row.lastShownDate<previous.date)continue;
    const otherDates=tasks.filter(task=>task.date!==previous.date&&previousQuestionIds(task).has(questionId)).map(task=>task.date);
    // Legacy history is aggregated. A matching latest date identifies a write;
    // for an older batch, only remove a count beyond the other retained batches.
    const laterBatchAccountsForLastShown=otherDates.includes(row.lastShownDate)&&row.shownCount===otherDates.length+1;
    if(row.lastShownDate!==previous.date&&!laterBatchAccountsForLastShown)continue;
    changed.add(questionId);
    if(row.shownCount===1){history.delete(questionId);continue}
    const lastShownDate=row.lastShownDate===previous.date
      ? otherDates.filter(date=>date<previous.date).sort().at(-1)??null
      : row.lastShownDate;
    history.set(questionId,{...row,shownCount:row.shownCount-1,lastShownDate});
  }
  return changed;
}

const TASK_STORES=['questions','dailyTasks','questionHistory','answers','checkins','settings','wrongQuestions','knowledgeStats'];
export async function getOrCreateDailyTask(date){
  if(!validDate(date))throw Error('无效任务日期');
  return writeTransaction(TASK_STORES,async transaction=>{
    const store=name=>transaction.objectStore(name);
    const [questions,existing]=await Promise.all([readRequest(store('questions').getAll()),readRequest(store('dailyTasks').get(date))]);
    if(hasCompleteQuestions(existing,new Map(questions.map(question=>[question.id,question]))))return existing;
    const [checkins,answers]=await Promise.all([readRequest(store('checkins').getAll()),readRequest(store('answers').getAll())]);
    if(hasLearningActivity(existing,date,answers,checkins)){
      throw new LearningScopeError('PROTECTED_INCOMPLETE_TASK',`${date} 的任务不完整，相关学习记录已保留。请在家长模式导出完整备份后联系维护者核查。`,{date});
    }
    const settings=store('settings');
    const savedScope=await readRequest(settings.get(SCOPE_KEY));
    const scope=requireValidScope(questions,savedScope===undefined?KNOWLEDGE_POINTS:savedScope.value,date);
    const [stats,wrongs,historyRows,boostSetting,tasks]=await Promise.all([
      readRequest(store('knowledgeStats').getAll()),readRequest(store('wrongQuestions').getAll()),
      readRequest(store('questionHistory').getAll()),readRequest(settings.get(BOOST_KEY)),
      existing?readRequest(store('dailyTasks').getAll()):[]
    ]);
    const history=new Map(historyRows.map(row=>[row.questionId,row]));
    const changed=existing?reconcilePreviousHistory(existing,tasks,history):new Set();
    const boostStart=Number.isInteger(boostSetting?.value)?boostSetting.value:checkins.length;
    const pool=questionPool(questions,scope.points),eligible=[...pool.values()];
    const selected=buildAdaptiveTask({date,questions:eligible,enabled:scope.points,checkins,stats,wrongQuestions:wrongs,history:[...history.values()],answers,powerBoost:powerBoostActive(checkins.length,boostStart)});
    const task=completeSparseTask(selected,eligible,history);
    if(!hasCompleteQuestions(task,pool))throw Error('任务完整性校验失败，原学习记录已保留。');
    store('dailyTasks').put(task);
    for(const questionId of task.questionIds){
      const old=history.get(questionId);
      history.set(questionId,{...old,questionId,shownCount:(old?.shownCount||0)+1,lastShownDate:old?.lastShownDate>date?old.lastShownDate:date});
      changed.add(questionId);
    }
    const historyStore=store('questionHistory');
    for(const questionId of changed){
      if(history.has(questionId))historyStore.put(history.get(questionId));
      else historyStore.delete(questionId);
    }
    if(!Number.isInteger(boostSetting?.value))settings.put({key:BOOST_KEY,value:boostStart});
    return task;
  });
}
export const getOrCreateToday=()=>getOrCreateDailyTask(today());
export const CARRYOVER_START_SETTING='unfinishedPracticeStartDate';
export function nextCalendarDate(date){const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10)}
const validDate=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+'T00:00:00Z'))&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
const initiallySubmitted=r=>Boolean(r?.initialSubmitted||r?.resolved||r?.firstAttemptCorrect!==undefined||r?.firstAnswer!==undefined);
// Keep the original daily batches and answer keys (date:questionId). Flattening
// dates into one questionIds array would overwrite repeated questions and lose
// frozen scoring policies. Only the outstanding count is accumulated.
export function summarizeDailyWorkload(date,startDate,tasks,answers){
  const byKey=new Map(answers.map(r=>[r.key||`${r.date}:${r.questionId}`,r]));
  const batches=tasks.filter(t=>t.date>=startDate&&t.date<=date).slice().sort((a,b)=>a.date.localeCompare(b.date)).map(task=>{
    const records=task.questionIds.map(id=>byKey.get(`${task.date}:${id}`));
    const submitted=['review','correction','complete'].includes(task.phase)||records.length>0&&records.every(initiallySubmitted);
    const remainingIndices=records.flatMap((r,i)=>!r?.draftSaved&&!initiallySubmitted(r)?[i]:[]);
    return {task,date:task.date,total:task.questionIds.length,remaining:submitted?0:remainingIndices.length,remainingIndices,submitted,needsSubmission:!submitted,isOverdue:task.date<date,corrections:records.filter(r=>initiallySubmitted(r)&&(r.firstAttemptCorrect===null||r.firstAttemptCorrect===false&&!r.resolved)).length};
  });
  const pending=batches.filter(b=>b.needsSubmission);
  return {date,startDate,batches,remaining:pending.reduce((n,b)=>n+b.remaining,0),carryRemaining:pending.filter(b=>b.isOverdue).reduce((n,b)=>n+b.remaining,0),newRemaining:pending.filter(b=>!b.isOverdue).reduce((n,b)=>n+b.remaining,0),needsSubmission:pending.length>0};
}
let workloadInFlight;
export async function getDailyWorkload(date=today()){
  if(!validDate(date))throw Error('无效任务日期');
  if(workloadInFlight?.date===date)return workloadInFlight.promise;
  const promise=(async()=>{
    let start=await setting(CARRYOVER_START_SETTING,null);
    if(!validDate(start)){start=date;await saveSetting(CARRYOVER_START_SETTING,start)}
    // A device-clock rollback must neither reset activation nor invent arrears.
    if(start>date)throw Error('设备日期早于规则启用日期，请检查设备日期设置');
    const [existing,questions,receipts]=await Promise.all([all('dailyTasks'),all('questions'),all('checkins')]);
    const byId=new Map(questions.map(question=>[question.id,question]));
    const tasks=new Map(existing.map(task=>[task.date,task]));
    const completed=new Set(receipts.flatMap(receipt=>Array.isArray(receipt.taskDates)?receipt.taskDates:[receipt.date]));
    const anomalies=[];
    const isolate=(task,message)=>{
      const knownDate=validDate(task.date);
      const blocksCheckin=knownDate&&task.date>=start&&!completed.has(task.date)
        &&!['review','correction','complete'].includes(task.phase);
      anomalies.push({date:knownDate?task.date:null,message,blocksCheckin});
      tasks.delete(task.date);
    };
    const existingDates=new Set(tasks.keys());
    for(const task of existing){
      if(!validDate(task.date)){
        isolate(task,'有一组任务的日期异常，原记录已保留。');
      }else if(task.date<=date&&!hasCompleteQuestions(task,byId)){
        try{tasks.set(task.date,await getOrCreateDailyTask(task.date))}
        catch(error){
          if(error.code==='PROTECTED_INCOMPLETE_TASK'||task.date<start&&error.code==='INSUFFICIENT_LEARNING_SCOPE'){
            isolate(task,error.message);
          }else throw error;
        }
      }
    }
    for(let cursor=start;cursor<=date;cursor=nextCalendarDate(cursor)){
      if(!existingDates.has(cursor)&&!completed.has(cursor))tasks.set(cursor,await getOrCreateDailyTask(cursor));
    }
    const workload=summarizeDailyWorkload(date,start,[...tasks.values()],await all('answers'));
    return {...workload,anomalies,needsSubmission:workload.needsSubmission||anomalies.some(item=>item.blocksCheckin)};
  })();
  workloadInFlight={date,promise};try{return await promise}finally{if(workloadInFlight?.promise===promise)workloadInFlight=null}
}
export async function questionsFor(task){const q=await all('questions'),m=new Map(q.map(x=>[x.id,x]));return task.questionIds.map(id=>{const item=m.get(id);return Array.isArray(item.answer)?{...item,answerType:'multiple_blank'}:item;});}
