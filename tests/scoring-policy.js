import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {score,scoreForFrozenPolicy} from '../js/scoring.js';
import {freezeTaskScoringPolicy,freezeAttemptScoringPolicy,questionForFrozenPolicy,CURRENT_SCORING_POLICY_VERSION} from '../js/scoringPolicy.js';
import {currentFirstCorrect} from '../js/attemptPolicy.js';
import * as statistics from '../js/statistics.js';
import * as points from '../js/knowledgePoints.js';
import * as scoringPolicy from '../js/scoringPolicy.js';
import * as scoring from '../js/scoring.js';
import * as attemptPolicy from '../js/attemptPolicy.js';
import * as formatMath from '../js/formatMath.js';
const q={id:'ISO-Q',knowledgePoint:'相反数',question:'因式分解：x^2-4',answerType:'expression',answer:'(x-2)(x+2)',answerConstraint:'fully_factored',fullyFactored:true};
const plain={...q};delete plain.answerConstraint;
const oldTask={date:'2026-10-14',questionIds:[q.id],items:[{questionId:q.id,sourceType:'review'}]};
const before=structuredClone(oldTask);
assert.equal(scoreForFrozenPolicy(q,['x^2-4'],oldTask).correct,true);
assert.deepEqual(oldTask,before);
const newTask=freezeTaskScoringPolicy(oldTask,[q]);
assert.equal(newTask.scoringPolicyVersion,CURRENT_SCORING_POLICY_VERSION);
assert.equal(scoreForFrozenPolicy(q,['x^2-4'],newTask).correct,false);
assert.equal(scoreForFrozenPolicy(q,[q.answer],newTask).correct,true);
const noConstraintTask=freezeTaskScoringPolicy(oldTask,[plain]);
assert.equal(scoreForFrozenPolicy(q,['x^2-4'],noConstraintTask).correct,true,'升级后新增约束不能改变已生成任务');
const attempt={key:'old',questionId:q.id,initialSubmitted:true,firstAnswer:['x^2-4']};
const oldAttempt=structuredClone(attempt);
assert.equal(scoreForFrozenPolicy(q,attempt.firstAnswer,attempt).correct,true);
assert.equal(currentFirstCorrect(q,attempt,(question,inputs)=>scoreForFrozenPolicy(question,inputs,attempt).correct),true);
for(const state of [true,false,null]){const r={...attempt,firstAttemptCorrect:state};assert.equal(currentFirstCorrect(q,r,()=>{throw Error('不能重判已有首答状态')}),state)}
assert.deepEqual(attempt,oldAttempt);
const newAttempt={...attempt,...freezeAttemptScoringPolicy(newTask,q.id)};
assert.equal(scoreForFrozenPolicy(q,newAttempt.firstAnswer,newAttempt).correct,false);
assert.equal(scoreForFrozenPolicy(q,['x^2-4'],{scoringPolicyVersion:99}).manualCheck,true);
assert.equal(scoreForFrozenPolicy(q,['x^2-4'],{scoringPolicyVersion:2}).manualCheck,true);
assert.equal(questionForFrozenPolicy(q,{scoringPolicyVersion:null}).manualCheck,true);

// Real questionEngine module, isolated store connector. No browser/global DB.
const state=new Map, writes=[];
const read=(store,key)=>structuredClone(state.get(store)?.get(key));
const db={all:async store=>structuredClone([...(state.get(store)?.values()||[])]),get:async(store,key)=>read(store,key),put:async(store,row)=>{writes.push({store,row:structuredClone(row)});if(!state.has(store))state.set(store,new Map);const key={dailyTasks:'date',answers:'key',checkins:'date',settings:'key',questions:'id'}[store]||'questionId';state.get(store).set(row[key],structuredClone(row));},setting:async(key,fallback)=>read('settings',key)?.value??fallback,saveSetting:async(key,value)=>{writes.push({store:'settings',key});if(!state.has('settings'))state.set('settings',new Map);state.get('settings').set(key,{key,value});}};
const context=vm.createContext({console,Date,Math,structuredClone});
const synthetic=exports=>new vm.SyntheticModule(Object.keys(exports),function(){for(const[name,value]of Object.entries(exports))this.setExport(name,value)},{context});
const dependencies={'./db.js':db,'./statistics.js':statistics,'./knowledgePoints.js':points,'./scoringPolicy.js':scoringPolicy};
const source=fs.readFileSync(new URL('../js/questionEngine.js',import.meta.url),'utf8');
const module=new vm.SourceTextModule(source,{context});
await module.link(specifier=>synthetic(dependencies[specifier]));await module.evaluate();
const engine=module.namespace,today=engine.today();
const savedOld={...oldTask,date:today};state.set('dailyTasks',new Map([[today,structuredClone(savedOld)]]));
assert.deepEqual(await engine.getOrCreateToday(),savedOld);assert.equal(writes.length,0,'已有任务不得重写/升级策略');
state.get('dailyTasks').clear();
const bank=Array.from({length:12},(_,i)=>({...q,id:`ISO-${i}`}));
state.set('questions',new Map(bank.map(item=>[item.id,item])));
const generated=await engine.getOrCreateToday();assert.equal(generated.questionIds.length,10);assert.equal(generated.scoringPolicyVersion,2);
assert.ok(Object.values(generated.scoringQuestionPolicies).every(x=>x.answerConstraint==='fully_factored'));
const writeCount=writes.length;assert.deepEqual(await engine.getOrCreateToday(),structuredClone(generated));assert.equal(writes.length,writeCount,'同日重开不生成新题/新策略');
assert.ok(writes.every(w=>['dailyTasks','questionHistory','settings'].includes(w.store)),'生成任务不得重算学习统计或历史答案');
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
assert.ok(!/\bscore\(/.test(app),'所有学生判分调用必须使用冻结策略');
assert.match(app,/scoreForFrozenPolicy\(q,values,r\)/);
assert.match(app,/newAttempt\(q,\{currentInputs/);
// Exercise the actual app submission/correction functions using an isolated
// store and DOM shell. Inject only connectors, never a student's IndexedDB.
const elements=new Map;context.document={querySelector:key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',addEventListener(){}});return elements.get(key)},querySelectorAll:()=>[]};context.clearInterval=()=>{};context.setInterval=()=>0;
const effects={stats:[],wrong:[],review:[]};
const appDeps={...dependencies,'./scoring.js':scoring,'./attemptPolicy.js':attemptPolicy,'./formatMath.js':formatMath,'./questionEngine.js':Object.fromEntries(Object.keys(engine).map(k=>[k,engine[k]])),
  './db.js':{...db,openDB:async()=>{},importQuestions:async()=>{},runQuestionBankFixMigration:async()=>{}},
  './statistics.js':{...statistics,updateKnowledge:async(q,date,correct)=>effects.stats.push(correct)},
  './wrongQuestions.js':{recordWrong:async()=>effects.wrong.push(true),recordReviewCorrect:async()=>effects.review.push(true)},
  './updateManager.js':{initPwaUpdates(){}}};
const appModule=new vm.SourceTextModule(app.replace(/boot\(\);\s*$/,'')+'\nexport {finalSubmit,correctionSubmit,currentFirstCorrect};export function fixtureContext(t,qs,d){task=t;questions=qs;date=d;}\n',{context});
await appModule.link(specifier=>synthetic(appDeps[specifier]));await appModule.evaluate();
async function submit(task,fields={}){
  state.clear();effects.stats.length=effects.wrong.length=effects.review.length=0;
  const answer={key:`${task.date}:${q.id}`,date:task.date,questionId:q.id,currentInputs:['x^2-4'],draftSaved:true,gaveUp:false,...fields};
  state.set('answers',new Map([[answer.key,answer]]));
  appModule.namespace.fixtureContext(structuredClone(task),[q],task.date);
  await appModule.namespace.finalSubmit();return read('answers',answer.key);
}
const oldSubmitted=await submit(oldTask);assert.equal(oldSubmitted.firstAttemptCorrect,true);assert.ok(!Object.hasOwn(oldSubmitted,'scoringPolicyVersion'));
const strictSubmitted=await submit(newTask,freezeAttemptScoringPolicy(newTask,q.id));assert.equal(strictSubmitted.firstAttemptCorrect,false);assert.deepEqual(effects.stats,[false]);
await appModule.namespace.correctionSubmit(q,strictSubmitted,[q.answer]);assert.equal(read('answers',strictSubmitted.key).corrected,true);
assert.deepEqual(effects.stats,[false],'订正不能重复增加首答统计');
const legacyWrong={...oldSubmitted,firstAttemptCorrect:false,resolved:false,attemptCount:1};
await appModule.namespace.correctionSubmit(q,legacyWrong,['x^2-4']);assert.equal(read('answers',legacyWrong.key).corrected,true,'旧订正仍使用legacy');
const strictManual=await submit(newTask,{...freezeAttemptScoringPolicy(newTask,q.id),currentInputs:['x^m']});
assert.equal(strictManual.firstAttemptCorrect,null);assert.equal(strictManual.manualCheck,true);assert.deepEqual(effects.stats,[]);assert.deepEqual(effects.wrong,[]);
const historical={initialSubmitted:true,firstAnswer:['x^2-4']};const historicalBefore=structuredClone(historical);
assert.equal(appModule.namespace.currentFirstCorrect(q,historical),true);assert.deepEqual(historical,historicalBefore);
console.log('Scoring policy tests PASS: legacy tasks/attempts, real module generation, same-day persistence, actual app submission/correction, manual tri-state and history compatibility.');
