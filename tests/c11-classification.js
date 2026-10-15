import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {KNOWLEDGE_POINTS,FACTORIZATION_POINTS} from '../js/knowledgePoints.js';
import {QUESTION_BANK_FIX_VERSION} from '../js/questionBankFix.js';
import {score} from '../js/scoring.js';
import {knowledgeState,weaknessScore,summarizeKnowledge} from '../js/statistics.js';
import {buildAdaptiveTask} from '../js/questionEngine.js';
import {afterWrong} from '../js/wrongQuestions.js';
import {beforePhaseBConstraint} from './helpers/phase-b-baseline.js';

const expectedNewPoints=['同底数幂乘法','同底数幂除法','幂的乘方','积的乘方','幂的运算综合','单项式乘法','多项式乘多项式','乘法公式','整式乘法综合','整式化简求值'];
const originalPoints=['相反数','绝对值','去括号','添括号','合并同类项','整式加减综合','因式分解·提公因式法','因式分解·平方差公式','因式分解·完全平方公式','因式分解·综合方法'];
assert.deepEqual(KNOWLEDGE_POINTS,[...originalPoints,...expectedNewPoints]);
assert.equal(new Set(KNOWLEDGE_POINTS).size,20);
assert.deepEqual(FACTORIZATION_POINTS,originalPoints.slice(6));
assert.ok(!KNOWLEDGE_POINTS.includes('整式乘除综合'));
for(const label of ['平方差公式（乘法）','完全平方公式（乘法）','待定系数','系数约束','整体平方差'])assert.ok(!KNOWLEDGE_POINTS.includes(label));

const formalBytes=fs.readFileSync(new URL('../data/questions.json',import.meta.url));
const formal=JSON.parse(formalBytes).slice(0,199); // Frozen pre-promotion baseline; new 88 tested separately.
assert.equal(crypto.createHash('sha256').update(JSON.stringify(formal.map(beforePhaseBConstraint))).digest('hex'),'70b6b1c95ae2cf4aebac88eb3b4e38b166ea25ef6a0651bca80688923570663f','除阶段B获准的约束元数据外，正式题库必须保持冻结');
assert.equal(formal.length,199);
assert.deepEqual(formal.map(q=>q.id),Array.from({length:199},(_,i)=>`Q${String(i+1).padStart(4,'0')}`));
assert.equal(QUESTION_BANK_FIX_VERSION,2);
const pending=JSON.parse(fs.readFileSync(new URL('../data/questions_pending.json',import.meta.url),'utf8'));
const c11=pending.filter(q=>q.batchId==='docx-2026-10-c11');
assert.equal(c11.length,29);
const frozenFields=['candidateId','question','displayQuestion','answer','displayAnswer','auditStatus','scoringSupport'];
assert.equal(crypto.createHash('sha256').update(JSON.stringify(c11.map(q=>Object.fromEntries(frozenFields.map(key=>[key,q[key]]))))).digest('hex'),'7bb4252dfbdaab81dfec91aa4e7154e37b456cc3ca4ba15e47718578b3e4ddb0','29题题面、答案和审核/判分状态不得变更');
assert.equal(c11[28].knowledgePoint,'整式乘法综合');
assert.equal(c11[10].sourceParagraphIndex,156);
assert.match(c11[10].sourceIndex,/OOXML段落156$/);
assert.equal(c11[19].sourceParagraphIndex,296);
assert.match(c11[19].sourceIndex,/OOXML段落296$/);
for(const q of c11){
  assert.ok(KNOWLEDGE_POINTS.includes(q.knowledgePoint),q.candidateId);
  assert.equal(q.auditStatus,'verified');assert.equal(q.scoringSupport,'auto');
  assert.equal(q.questionPage,null);assert.equal(q.answerPage,null);
  assert.equal(q.pageStatus,'unstable_docx_pagination');
  assert.ok(!Object.hasOwn(q,'id'),'本轮不分配正式ID');
  const result=score(q,Array.isArray(q.answer)?q.answer:[q.answer]);
  assert.equal(result.correct,true,q.candidateId);assert.ok(!result.manualCheck);
}
const distribution=c11.reduce((m,q)=>(m[q.knowledgePoint]=(m[q.knowledgePoint]||0)+1,m),{});
assert.deepEqual(distribution,{'同底数幂乘法':1,'幂的乘方':1,'幂的运算综合':4,'积的乘方':4,'同底数幂除法':1,'单项式乘法':1,'乘法公式':9,'多项式乘多项式':5,'因式分解·完全平方公式':1,'整式化简求值':1,'整式乘法综合':1});
console.log('C11 metadata, frozen questions, source locations and automatic scoring passed (29/29).');

const date='2026-10-14',checkins=Array.from({length:5},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`}));
const mature=knowledgePoint=>({knowledgePoint,attempts:10,firstCorrect:8,last20Attempts:[true,true,true,true,true,true,true,true,false,false],recentAccuracy:80,consecutiveWrong:0,historicalWrong:2});
for(const point of expectedNewPoints){
  assert.equal(knowledgeState({knowledgePoint:point,attempts:0}),'insufficient_data');
  assert.equal(weaknessScore({knowledgePoint:point,attempts:0}),0);
  assert.equal(summarizeKnowledge(mature(point)).knowledgePoint,point);
  assert.ok(weaknessScore(mature(point))>0);
}
// Candidate copies have isolated IDs and are used only in pure selection simulations.
const isolated=c11.map(q=>({...q,id:`ISOLATED-${q.candidateId}`}));
const questions=[...formal,...isolated],enabled=[...KNOWLEDGE_POINTS];
const due=[afterWrong({questionId:'Q0001'},'2026-10-13'),afterWrong({questionId:'Q0002'},'2026-10-13')];
const build=extra=>buildAdaptiveTask({date,questions,enabled,checkins,stats:originalPoints.map(mature),wrongQuestions:due,...extra});
const task=build({});
assert.equal(task.questionIds.length,10);assert.equal(new Set(task.questionIds).size,10);
assert.equal(task.items.filter(x=>x.sourceType==='weakness').length,5);
assert.equal(task.items.filter(x=>x.sourceType==='review').length,3);
assert.equal(task.items.filter(x=>x.sourceType==='wrong_review').length,2);
const exposure=task.items.filter(x=>x.selectionReason==='unseen_knowledge_exposure');
assert.equal(exposure.length,1);assert.equal(exposure[0].sourceType,'review');
assert.ok(expectedNewPoints.includes(exposure[0].targetKnowledgePoint));
assert.equal(task.items.filter(x=>x.sourceType==='weakness'&&expectedNewPoints.includes(x.targetKnowledgePoint)).length,0);
assert.deepEqual(task.items.filter(x=>x.sourceType==='wrong_review').map(x=>x.questionId),['Q0001','Q0002']);
const sampled=build({stats:[...originalPoints.map(mature),{knowledgePoint:exposure[0].targetKnowledgePoint,attempts:1,firstCorrect:1,last20Attempts:[true],recentAccuracy:100}]});
assert.ok(sampled.items.filter(x=>x.selectionReason==='unseen_knowledge_exposure').length<=1);
assert.ok(!sampled.items.some(x=>x.selectionReason==='unseen_knowledge_exposure'&&x.targetKnowledgePoint===exposure[0].targetKnowledgePoint));
const covered=build({stats:KNOWLEDGE_POINTS.map(mature)});
assert.equal(covered.items.filter(x=>x.selectionReason==='unseen_knowledge_exposure').length,0);
assert.equal(covered.items.filter(x=>x.sourceType==='weakness').length,5);
assert.equal(covered.items.filter(x=>x.sourceType==='review').length,3);
assert.equal(covered.items.filter(x=>x.sourceType==='wrong_review').length,2);
console.log('C11 zero-sample states, one-slot exposure, first-sample exit and normal 5+3+2 scenarios passed.');

// Regression required by this change: a narrow learning range must not label a
// zero-sample topic as weakness merely to fill the fifth weakness slot.
const narrow=build({enabled:['相反数','积的乘方'],stats:[mature('相反数')]});
assert.equal(narrow.items.filter(x=>x.sourceType==='weakness'&&x.targetKnowledgePoint==='积的乘方').length,0,'零样本知识点不得兜底进入第5个weakness槽');
assert.equal(narrow.items.filter(x=>x.sourceType==='weakness').length,4);
assert.equal(narrow.items.filter(x=>x.sourceType==='review').length,4);
assert.equal(narrow.items.filter(x=>x.sourceType==='wrong_review').length,2);
assert.equal(narrow.questionIds.length,10);
assert.ok(narrow.items.filter(x=>x.selectionReason==='unseen_knowledge_exposure').length<=1);
assert.ok(narrow.items.filter(x=>x.targetKnowledgePoint==='积的乘方').every(x=>x.selectionReason==='unseen_knowledge_exposure'),'零样本新知识点只能经unseen曝光');
console.log('C11 narrow-range zero-sample regression passed.');

const zeroStats=expectedNewPoints.map(knowledgePoint=>({knowledgePoint,attempts:0}));
const assertSafe=task=>{
  assert.equal(task.questionIds.length,10);assert.equal(new Set(task.questionIds).size,10);
  assert.ok(task.items.filter(x=>x.selectionReason==='unseen_knowledge_exposure').length<=1);
  for(const item of task.items.filter(x=>expectedNewPoints.includes(x.targetKnowledgePoint))){
    assert.equal(item.sourceType,'review');assert.equal(item.selectionReason,'unseen_knowledge_exposure');
  }
  assert.deepEqual(task.items.filter(x=>x.sourceType==='wrong_review').map(x=>x.questionId),['Q0001','Q0002']);
};
// Four legal weakness slots plus ten unseen topics, for absent AND explicit-zero stats.
for(const newStats of [[],zeroStats]){
  const four=build({enabled:['相反数',...expectedNewPoints],stats:[mature('相反数'),...newStats]});
  assertSafe(four);assert.equal(four.items.filter(x=>x.sourceType==='weakness').length,4);
  assert.equal(four.items.filter(x=>x.sourceType==='review').length,4);
}
// An already learned topic with fewer than five samples is available for safe
// reviews, but still cannot be classified as weak under the existing threshold.
const firstSample={knowledgePoint:'相反数',attempts:1,firstCorrect:1,last20Attempts:[true],recentAccuracy:100};
const zeroWeak=build({enabled:['相反数',...expectedNewPoints],stats:[firstSample,...zeroStats]});
assertSafe(zeroWeak);assert.equal(zeroWeak.items.filter(x=>x.sourceType==='weakness').length,0);
assert.equal(zeroWeak.items.filter(x=>x.sourceType==='review').length,8);
// Active power boost and the final fill cannot bypass zero-sample eligibility.
const zeroWithBoost=build({enabled:['相反数',...expectedNewPoints],stats:[firstSample,...zeroStats],powerBoost:true});
assertSafe(zeroWithBoost);assert.equal(zeroWithBoost.items.filter(x=>x.sourceType==='weakness').length,0);
// All-zero stable ranges cannot supply ten distinct legal questions under a
// one-exposure limit: explicitly preserve that limit rather than fabricate data.
const allZero=build({enabled:expectedNewPoints,stats:zeroStats,wrongQuestions:[]});
assert.equal(allZero.items.length,1);assert.equal(allZero.items[0].sourceType,'review');
assert.equal(allZero.items[0].selectionReason,'unseen_knowledge_exposure');
// Eligibility changes only on a real sample; weak classification still requires
// the unchanged five-sample threshold and real accuracy history.
const newlySampled=build({stats:[...originalPoints.map(mature),{knowledgePoint:exposure[0].targetKnowledgePoint,attempts:1,firstCorrect:0,last20Attempts:[false],recentAccuracy:0}]});
assert.ok(!newlySampled.items.some(x=>x.selectionReason==='unseen_knowledge_exposure'&&x.targetKnowledgePoint===exposure[0].targetKnowledgePoint));
assert.ok(!newlySampled.items.some(x=>x.sourceType==='weakness'&&x.targetKnowledgePoint===exposure[0].targetKnowledgePoint));
console.log('C11 four/zero-weakness boundaries, ten unseen topics, missing stats, boost exclusion and wrong-review preservation passed.');
