import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as statistics from '../js/statistics.js';
import * as points from '../js/knowledgePoints.js';
import * as policy from '../js/scoringPolicy.js';
import * as scoring from '../js/scoring.js';
import * as attempts from '../js/attemptPolicy.js';
import * as format from '../js/formatMath.js';
import {KEY_PATHS,DB_VERSION} from '../js/db.js';
import {QUESTION_BANK_FIX_VERSION} from '../js/questionBankFix.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const bank=JSON.parse(read('data/questions.json'));assert.equal(bank.length,350);
const selectorBaseline=JSON.parse(read('tests/fixtures/carryover-selector-baseline.json'));
const engineSource=read('js/questionEngine.js').replace(/\r\n/g,'\n');
assert.equal(engineSource.slice(engineSource.indexOf('export function buildAdaptiveTask('),engineSource.indexOf('\nasync function recordHistory(')),selectorBaseline.selector,'每日基础10题的选题算法逐字冻结');
assert.match(read('js/app.js'),/date=today\(\);workload=await getDailyWorkload\(\);task=await getOrCreateToday\(\)/,'先按日期补生成欠题，再读取当天组，避免历史顺序倒置');
let clock;const setDate=s=>clock=new Date(s+'T12:00:00').valueOf();setDate('2026-10-22');
class TestDate extends Date{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
const state=new Map,writes=[],effects={stats:[],wrong:[],review:[]};
const key=(store,row)=>row[KEY_PATHS[store]],get=(store,k)=>structuredClone(state.get(store)?.get(k));
const seed=(store,rows)=>state.set(store,new Map(rows.map(r=>[key(store,r),structuredClone(r)])));
const put=async(store,row)=>{if(!state.has(store))state.set(store,new Map);state.get(store).set(key(store,row),structuredClone(row));writes.push({store,row:structuredClone(row)})};
const db={all:async store=>structuredClone([...(state.get(store)?.values()||[])]),get:async(s,k)=>get(s,k),put,setting:async(k,f)=>get('settings',k)?.value??f,saveSetting:(k,value)=>put('settings',{key:k,value})};
const context=vm.createContext({console,Date:TestDate,Math,structuredClone});
const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v)},{context});
const dependencies={'./db.js':db,'./statistics.js':statistics,'./knowledgePoints.js':points,'./scoringPolicy.js':policy};
const mod=new vm.SourceTextModule(read('js/questionEngine.js'),{context});await mod.link(s=>synthetic(dependencies[s]));await mod.evaluate();
const engine=mod.namespace,startKey=engine.CARRYOVER_START_SETTING;
const readWorkload=async()=>structuredClone(await engine.getDailyWorkload());
function reset(){
  state.clear();writes.length=0;effects.stats.length=effects.wrong.length=effects.review.length=0;setDate('2026-10-22');
  seed('questions',bank);seed('checkins',Array.from({length:5},(_,i)=>({date:`2026-10-0${i+1}`,firstCorrect:8,wrong:2})));
  seed('knowledgeStats',points.KNOWLEDGE_POINTS.map(knowledgePoint=>({questionId:knowledgePoint,knowledgePoint,attempts:10,firstCorrect:6,recentAccuracy:60,consecutiveWrong:1,historicalWrong:4,last20Attempts:[true,false,true,false,true]})));
}
const qs=t=>t.questionIds.map(id=>bank.find(q=>q.id===id));
async function drafts(task,n){for(const q of qs(task).slice(0,n))await put('answers',{key:`${task.date}:${q.id}`,date:task.date,questionId:q.id,draftSaved:true,currentInputs:Array.isArray(q.answer)?q.answer:[q.answer],...policy.freezeAttemptScoringPolicy(task,q.id)})}
reset();let work=await readWorkload();assert.equal(work.remaining,10);assert.equal(work.carryRemaining,0);assert.equal(get('settings',startKey).value,'2026-10-22');
const originalTask=get('dailyTasks','2026-10-22');const w=writes.length;assert.deepEqual(await readWorkload(),work);assert.equal(writes.length,w,'同日重开不写任务/起始日');
await drafts(originalTask,4);const retained=await db.all('answers'),frozenStores=await Promise.all(['checkins','knowledgeStats','wrongQuestions'].map(db.all));
setDate('2026-10-23');work=await readWorkload();assert.equal(work.remaining,16);assert.equal(work.carryRemaining,6);assert.equal(work.newRemaining,10);
assert.deepEqual(get('dailyTasks','2026-10-22'),originalTask);assert.deepEqual(await db.all('answers'),retained,'4份已填答案不搬迁/覆盖/重判');
assert.deepEqual(await Promise.all(['checkins','knowledgeStats','wrongQuestions'].map(db.all)),frozenStores,'汇总欠题不改统计');
assert.deepEqual(work.batches[0].remainingIndices,[4,5,6,7,8,9]);
assert.equal(writes.filter(w=>w.store==='settings'&&w.row.key===startKey).length,1);
// Same question on two dates remains two independent attempts.
const repeat={...structuredClone(originalTask),date:'2026-10-23'};await put('dailyTasks',repeat);await drafts(repeat,1);
work=await readWorkload();assert.equal(work.remaining,15);assert.equal((await db.all('answers')).filter(r=>r.questionId===repeat.questionIds[0]).length,2);
reset();await readWorkload();setDate('2026-10-23');assert.equal((await readWorkload()).remaining,20);setDate('2026-10-24');assert.equal((await readWorkload()).remaining,30);
assert.deepEqual((await db.all('dailyTasks')).map(t=>t.questionIds.length),[10,10,10]);
reset();await readWorkload();setDate('2026-10-25');work=await readWorkload();assert.equal(work.remaining,40,'不打开页面的日期也累计新10题');assert.equal(work.batches.length,4);
assert.deepEqual(await db.all('answers'),[]);assert.equal((await db.all('checkins')).length,5,'生成欠题不伪造打卡');
reset();const old={date:'2026-10-20',questionIds:originalTask.questionIds,scoringPolicyVersion:1};await put('dailyTasks',old);
const together=await Promise.all([readWorkload(),readWorkload()]);assert.equal(together[0].remaining,10);assert.deepEqual(together[0],together[1]);
assert.deepEqual(get('dailyTasks','2026-10-20'),old);assert.equal(writes.filter(w=>w.store==='dailyTasks'&&w.row.date==='2026-10-22').length,1);
assert.equal(get('dailyTasks','2026-10-21'),undefined,'启用前漏打卡不追补');
setDate('2026-10-21');await assert.rejects(readWorkload(),/设备日期/);assert.equal(get('settings',startKey).value,'2026-10-22');
for(const [a,b]of [['2026-10-31','2026-11-01'],['2026-11-01','2026-11-02'],['2028-02-28','2028-02-29'],['2026-02-28','2026-03-01'],['2026-12-31','2027-01-01']])assert.equal(engine.nextCalendarDate(a),b);
reset();work=await readWorkload();await drafts(work.batches[0].task,10);work=await readWorkload();assert.equal(work.remaining,0);assert.equal(work.needsSubmission,true,'暂存完不等于已提交/已打卡');
// Actual production app: submit the retained batch and current batch; count only
// one real completion day and retain original date:questionId answer identities.
const elements=new Map;context.document={querySelector:s=>{if(!elements.has(s))elements.set(s,{innerHTML:'',addEventListener(){}});return elements.get(s)},querySelectorAll:()=>[]};context.clearInterval=()=>{};context.setInterval=()=>0;
const appDeps={...dependencies,'./questionEngine.js':Object.fromEntries(Object.keys(engine).map(k=>[k,engine[k]])),
  './db.js':{...db,openDB:async()=>{},importQuestions:async()=>{},runQuestionBankFixMigration:async()=>{}},
  './scoring.js':scoring,'./attemptPolicy.js':attempts,'./formatMath.js':format,
  './statistics.js':{...statistics,updateKnowledge:async(q,date,correct)=>effects.stats.push({id:q.id,date,correct})},
  './wrongQuestions.js':{recordWrong:async(id,date)=>effects.wrong.push({id,date}),recordReviewCorrect:async id=>effects.review.push(id)},'./updateManager.js':{initPwaUpdates(){}}};
const app=new vm.SourceTextModule(read('js/app.js').replace(/boot\(\);\s*$/,'')+'\nexport {home,openBatch,finalSubmit,writeCheckin};',{context});await app.link(s=>synthetic(appDeps[s]));await app.evaluate();
reset();work=await readWorkload();const first=work.batches[0].task;await drafts(first,4);const oldDrafts=await db.all('answers');
setDate('2026-10-23');await app.namespace.home();assert.match(elements.get('#app').innerHTML,/id="workload-remaining">16 题/);
await app.namespace.openBatch('2026-10-22');assert.match(elements.get('#app').innerHTML,/本组第 5 \/ 10/,'跳过已暂存4题');
await drafts(first,10);await app.namespace.finalSubmit();assert.equal(effects.stats.length,10);assert.ok(effects.stats.every(x=>x.date==='2026-10-23'));
assert.equal(get('checkins','2026-10-22'),undefined);assert.equal(get('checkins','2026-10-23'),undefined,'当前新10题未提交不能提前打卡');
for(const r of oldDrafts){const saved=get('answers',r.key);assert.deepEqual(saved.firstAnswer,r.currentInputs);assert.equal(saved.scoringPolicyVersion,r.scoringPolicyVersion);}
const second=get('dailyTasks','2026-10-23');await drafts(second,10);await app.namespace.openBatch(second.date);await app.namespace.finalSubmit();
const receipt=get('checkins','2026-10-23');assert.ok(receipt);assert.deepEqual(receipt.taskDates,['2026-10-22','2026-10-23']);assert.equal(receipt.totalQuestions,20);
assert.equal((await db.all('checkins')).length,6,'补做两组只增加一个实际打卡日，不加速14打卡日强化');
assert.equal(effects.stats.length,20);await app.namespace.finalSubmit();assert.equal(effects.stats.length,20,'重复提交不再次记首答统计');
await app.namespace.home();assert.match(elements.get('#app').innerHTML,/id="workload-remaining">0 题/);
setDate('2026-10-24');assert.equal((await readWorkload()).remaining,10,'已提交的补做题不再累计');
const oldAnswer=get('answers',`${first.date}:${first.questionIds[0]}`);oldAnswer.corrected=true;await put('answers',oldAnswer);
await app.namespace.openBatch(first.date);await app.namespace.writeCheckin(await db.all('answers'));
assert.equal(get('checkins','2026-10-23').corrected,1,'跨日订正更新原实际打卡日的订正数');assert.equal(get('checkins','2026-10-24'),undefined);
assert.equal(engine.powerBoostStatus('Q0184',[
  {questionId:'Q0184',date:'2026-10-22',submittedOn:'2026-10-24',submittedAt:200,firstAttemptCorrect:true},
  {questionId:'Q0184',date:'2026-10-23',submittedOn:'2026-10-24',submittedAt:300,firstAttemptCorrect:true},
  {questionId:'Q0184',date:'2026-10-24',submittedOn:'2026-10-24',submittedAt:100,firstAttemptCorrect:false}
]),'normal','补做按实际提交顺序计算幂强化掌握程度，不按原任务日期倒序');
assert.equal(DB_VERSION,3);assert.equal(QUESTION_BANK_FIX_VERSION,2);
console.log('Carryover PASS: 10/20/30, partial4=>16, unopened dates, frozen batches/answers/policies, no pre-activation arrears, repeat question keys, same-day stability, calendar/DST, real app resume/submission and one actual check-in day.');
