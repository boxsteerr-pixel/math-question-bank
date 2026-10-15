import fs from 'node:fs';
import assert from 'node:assert/strict';
import {auditPromotion,applyDocxPromotions,formalFromCandidate,hash,PROMOTION_IDS} from '../tools/docxPromotion.js';
import {beforePromotionLifecycle} from './helpers/promotion-baseline.js';
import {score,scoreForFrozenPolicy} from '../js/scoring.js';
import {formatMath} from '../js/formatMath.js';
import {buildAdaptiveTask} from '../js/questionEngine.js';
import {afterWrong} from '../js/wrongQuestions.js';
import {KNOWLEDGE_POINTS} from '../js/knowledgePoints.js';
import {weaknessScore} from '../js/statistics.js';
import {freezeTaskScoringPolicy} from '../js/scoringPolicy.js';
import {DB_VERSION,KEY_PATHS,mergeQuestionRecord} from '../js/db.js';
import {QUESTION_BANK_FIX_VERSION,FIXED_QUESTION_IDS} from '../js/questionBankFix.js';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const bank=read('data/questions.json'),pending=read('data/questions_pending.json'),manifest=read('data/docx-promotion-2026-10.json');
const old=bank.slice(0,199),added=bank.slice(199),byId=new Map(bank.map(q=>[q.id,q]));
assert.equal(bank.length,287);assert.equal(pending.length,280);assert.equal(added.length,88);
assert.deepEqual(bank.map(q=>q.id),Array.from({length:287},(_,i)=>`Q${String(i+1).padStart(4,'0')}`));
assert.equal(hash(old),manifest.baselineFingerprint,'完整旧199题逐字段冻结');
assert.deepEqual(auditPromotion(old,pending.map(beforePromotionLifecycle)),manifest,'重复执行promotion前审计88/88');
const frozenPending=structuredClone(pending),frozenBank=structuredClone(bank);
assert.deepEqual(applyDocxPromotions(old,structuredClone(pending),manifest),bank);
assert.deepEqual(applyDocxPromotions(old,structuredClone(pending),manifest),bank,'promotion幂等');
assert.equal(pending.filter(q=>PROMOTION_IDS.includes(q.candidateId)&&q.status==='promoted').length,88);
assert.equal(pending.filter(q=>!PROMOTION_IDS.includes(q.candidateId)).length,192);
assert.equal(bank.filter(q=>q.answerConstraint==='fully_factored').length,67);
assert.equal(added.filter(q=>q.answerConstraint==='fully_factored').length,50);
for(const entry of manifest.entries){
  const q=byId.get(entry.formalId),p=pending.find(p=>p.candidateId===entry.candidateId);
  assert.equal(p.finalId,q.id);assert.equal(p.status,'promoted');
  assert.deepEqual(q,formalFromCandidate(p,entry));
  assert.equal(hash(q.question),entry.questionFingerprint);assert.equal(hash(q.answer),entry.answerFingerprint);
  const inputs=Array.isArray(q.answer)?q.answer:[q.answer],r=score(q,inputs);
  assert.equal(r.correct,true,q.id);assert.ok(!r.manualCheck);
  for(const value of [q.question,q.displayQuestion,q.displayAnswer])assert.doesNotMatch(formatMath(value),/\^/,q.id+'指数正常显示');
  const merged=mergeQuestionRecord(undefined,q);assert.equal(merged.changed,true);assert.deepEqual(merged.record,q);
  assert.ok(!FIXED_QUESTION_IDS.has(q.id));
}
for(const q of old){const m=mergeQuestionRecord(q,q);assert.deepEqual(m.record,q);assert.ok(!m.forced);}

const newPoints=['同底数幂乘法','同底数幂除法','幂的乘方','积的乘方','幂的运算综合','单项式乘法','多项式乘多项式','乘法公式','整式乘法综合','整式化简求值'];
assert.ok(newPoints.every(point=>added.some(q=>q.knowledgePoint===point)));
const oldPoints=[...new Set(old.map(q=>q.knowledgePoint))];
const mature=knowledgePoint=>({knowledgePoint,attempts:10,firstCorrect:7,last20Attempts:[false,false,false,true,true,true,true,true,true,true],recentAccuracy:70,consecutiveWrong:0,historicalWrong:3});
const zero=newPoints.map(knowledgePoint=>({knowledgePoint,attempts:0,firstCorrect:0,last20Attempts:[]}));
for(const stat of zero)assert.equal(weaknessScore(stat),0);
const due=['Q0001','Q0002'].map(questionId=>afterWrong({questionId},'2026-10-13'));
const checkins=Array.from({length:5},(_,i)=>({date:`2026-10-0${i+1}`}));
const build=extra=>buildAdaptiveTask({date:'2026-10-14',questions:bank,enabled:KNOWLEDGE_POINTS,stats:[...oldPoints.map(mature),...zero],checkins,wrongQuestions:due,history:[],...extra});
const assertTask=(task,weak)=>{
  assert.equal(task.questionIds.length,10);assert.equal(new Set(task.questionIds).size,10);
  assert.equal(task.items.filter(i=>i.sourceType==='weakness').length,weak);
  assert.deepEqual(task.items.filter(i=>i.sourceType==='wrong_review').map(i=>i.questionId),['Q0001','Q0002']);
  assert.ok(!task.items.some(i=>i.sourceType==='weakness'&&newPoints.includes(i.targetKnowledgePoint)));
  const exposures=task.items.filter(i=>i.selectionReason==='unseen_knowledge_exposure');
  assert.equal(exposures.length,1);assert.equal(exposures[0].sourceType,'review');
  assert.ok(newPoints.includes(exposures[0].targetKnowledgePoint));
  assert.ok(Number(exposures[0].questionId.slice(1))>=200,'使用真实晋升题，不是虚构fixture');
  assert.equal(task.scoringPolicyVersion,2);
  for(const id of task.questionIds){const q=byId.get(id);assert.equal(task.scoringQuestionPolicies[id].answerConstraint,q.answerConstraint??null);}
};
const normal=build({});assertTask(normal,5);
assert.equal(normal.items.filter(i=>i.sourceType==='review').length,3);
const four=build({enabled:['相反数',...newPoints],stats:[mature('相反数'),...zero]});assertTask(four,4);
assert.equal(four.items.filter(i=>i.sourceType==='review').length,4);
const first={knowledgePoint:'相反数',attempts:1,firstCorrect:1,last20Attempts:[true],recentAccuracy:100};
const none=build({enabled:['相反数',...newPoints],stats:[first,...zero]});assertTask(none,0);
assert.equal(none.items.filter(i=>i.sourceType==='review').length,8);
const exposed=normal.items.find(i=>i.selectionReason==='unseen_knowledge_exposure').targetKnowledgePoint;
const next=build({stats:[...oldPoints.map(mature),...zero.filter(x=>x.knowledgePoint!==exposed),{knowledgePoint:exposed,attempts:1,firstCorrect:1,last20Attempts:[true],recentAccuracy:100}]});
assert.ok(!next.items.some(i=>i.selectionReason==='unseen_knowledge_exposure'&&i.targetKnowledgePoint===exposed));
const covered=build({stats:KNOWLEDGE_POINTS.map(mature)});
assert.equal(covered.items.filter(i=>i.selectionReason==='unseen_knowledge_exposure').length,0);
assert.deepEqual(['weakness','review','wrong_review'].map(type=>covered.items.filter(i=>i.sourceType===type).length),[5,3,2]);
const diagnostic=build({questions:added,wrongQuestions:[],checkins:[],stats:[]});
assert.equal(diagnostic.questionIds.length,10);assert.ok(diagnostic.questionIds.every(id=>Number(id.slice(1))>=200));
for(const id of diagnostic.questionIds)assert.equal(diagnostic.scoringQuestionPolicies[id].answerConstraint,byId.get(id).answerConstraint??null);
for(const entry of manifest.entries){
  const q=byId.get(entry.formalId),oldTask={questionIds:[q.id]};
  const task=freezeTaskScoringPolicy(oldTask,[q]);
  assert.equal(task.scoringPolicyVersion,2);assert.equal(task.scoringQuestionPolicies[q.id].answerConstraint,q.answerConstraint??null);
  if(q.answerConstraint==='fully_factored'){
    const review=read('reports/fully_factored_phase_b/audit.json').find(r=>r.id===entry.candidateId);
    assert.equal(scoreForFrozenPolicy(q,[review.counterexample],oldTask).correct,true);
    assert.equal(scoreForFrozenPolicy(q,[review.counterexample],task).correct,false);
    assert.equal(scoreForFrozenPolicy(q,[q.answer],task).correct,true);
  }
}
assert.equal(QUESTION_BANK_FIX_VERSION,2);assert.equal(DB_VERSION,3);
assert.deepEqual(KEY_PATHS,{questions:'id',dailyTasks:'date',answers:'key',wrongQuestions:'questionId',knowledgeStats:'questionId',questionHistory:'questionId',checkins:'date',settings:'key'});
assert.deepEqual(pending,frozenPending);assert.deepEqual(bank,frozenBank,'隔离测试不得更改正式数据');
console.log('DOCX promotion PASS: 88/88 preflight; old199 frozen; formal287; constraints67; real-bank zero-sample 5/4/0 weakness boundaries, wrong reviews, policy-v2/legacy, metadata merge and schema compatibility.');
