import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {score,scoreForFrozenPolicy} from '../js/scoring.js';
import {freezeTaskScoringPolicy,freezeAttemptScoringPolicy} from '../js/scoringPolicy.js';
import {mergeQuestionRecord,DB_VERSION,KEY_PATHS} from '../js/db.js';
import {QUESTION_BANK_FIX_VERSION,FIXED_QUESTION_IDS} from '../js/questionBankFix.js';
import {currentFirstCorrect} from '../js/attemptPolicy.js';
import {buildAdaptiveTask} from '../js/questionEngine.js';
import {afterWrong} from '../js/wrongQuestions.js';
import {beforePhaseBConstraint} from './helpers/phase-b-baseline.js';
import {beforePromotionLifecycle} from './helpers/promotion-baseline.js';
import {verifyIsolatedBuild} from './helpers/isolate-bank-build.js';
import {factorizationVariants} from './helpers/factorization-variants.js';
import {FACTORIZATION_CONSTRAINT_APPROVALS,applyApprovedFactorizationConstraint} from '../tools/factorizationConstraintApprovals.js';
import './c12-pending-audit.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const formal=read('data/questions.json'),pending=read('data/questions_pending.json');
const audit=read('reports/fully_factored_phase_b/audit.json');
const formalIds=Array.from({length:17},(_,i)=>`Q${String(163+i).padStart(4,'0')}`);
const pendingIds=['CAND-DOCX-2026-10-C11-019',...Array.from({length:49},(_,i)=>`CAND-DOCX-2026-10-C12-${String(i+1).padStart(3,'0')}`)];
assert.equal(formal.length,287);assert.equal(pending.length,280);
assert.deepEqual(formal.map(q=>q.id),Array.from({length:287},(_,i)=>`Q${String(i+1).padStart(4,'0')}`));
assert.equal(digest(formal.slice(0,199).map(beforePhaseBConstraint)),'70b6b1c95ae2cf4aebac88eb3b4e38b166ea25ef6a0651bca80688923570663f','所有既有字段保持阶段B前状态');
assert.equal(digest(pending.map(beforePromotionLifecycle).map(beforePhaseBConstraint)),'9a4d8553b4be435f7239ca229cfb2d49c501df8f7fd83b797c0369cd2e34f94d');
assert.deepEqual(formal.slice(0,199).filter(q=>q.answerConstraint!=null).map(q=>q.id),formalIds);
assert.equal(formal.filter(q=>q.answerConstraint==='fully_factored').length,67);
assert.deepEqual(pending.filter(q=>q.answerConstraint!=null).map(q=>q.candidateId),pendingIds);
assert.deepEqual(Object.keys(FACTORIZATION_CONSTRAINT_APPROVALS),formalIds);
assert.equal(audit.length,67);
let variantCount=0;
for(const row of audit){
  const q=row.group==='formal'?formal.find(q=>q.id===row.id):pending.find(q=>q.candidateId===row.id);
  assert.ok(q,row.id);assert.equal(q.question,row.question);assert.equal(q.answer,row.answer);
  assert.equal(q.knowledgePoint,row.knowledgePoint);assert.equal(q.answerType,'expression');
  assert.equal(q.fullyFactored,true);assert.equal(q.answerConstraint,'fully_factored');
  assert.equal(row.explicitFactorizationRequirement,true);assert.equal(row.constraintApproval,'approved');
  assert.ok(Object.keys(row.factorCertificates).length>0);
  if(row.group==='pending'){assert.equal(q.auditStatus,'verified');assert.equal(q.scoringSupport,'auto');}
  const good=score(q,[q.answer]),bad=score(q,[row.counterexample]);
  assert.equal(good.correct,true,row.id);assert.ok(!good.manualCheck);
  assert.equal(score(q,[row.counterexample],{scoringPolicyVersion:1}).correct,true,row.id);
  assert.equal(bad.correct,false,row.id);assert.ok(!bad.manualCheck);
  for(const {input} of factorizationVariants(q.answer)){
    const result=score(q,[input]);assert.equal(result.correct,true,row.id+': '+input);assert.ok(!result.manualCheck);variantCount++;
  }
  // Both unversioned tasks and pre-enablement v2 null snapshots stay legacy.
  const old={date:'2026-10-13',questionIds:[row.id]},oldCopy=structuredClone(old);
  assert.equal(scoreForFrozenPolicy(q,[row.counterexample],old).correct,true);
  const plain={...q,id:row.id,answerConstraint:null};
  const oldV2=freezeTaskScoringPolicy(old,[plain]);
  assert.equal(scoreForFrozenPolicy({...q,id:row.id},[row.counterexample],oldV2).correct,true);
  const fresh=freezeTaskScoringPolicy(old,[{...q,id:row.id}]);
  assert.equal(fresh.scoringPolicyVersion,2);
  assert.equal(fresh.scoringQuestionPolicies[row.id].answerConstraint,'fully_factored');
  assert.equal(scoreForFrozenPolicy({...q,id:row.id},[row.counterexample],fresh).correct,false);
  const attemptPolicy=freezeAttemptScoringPolicy(fresh,row.id);
  assert.equal(attemptPolicy.scoringQuestionPolicy.answerConstraint,'fully_factored');
  for(const state of [true,false,null]){
    const attempt={questionId:row.id,firstAnswer:[row.counterexample],firstAttemptCorrect:state};
    const snapshot=structuredClone(attempt);
    assert.equal(currentFirstCorrect(q,attempt,()=>{throw Error('已有attempt禁止重判')}),state);
    assert.deepEqual(attempt,snapshot);
  }
  assert.deepEqual(old,oldCopy);
  if(row.group==='formal'){
    assert.ok(!FIXED_QUESTION_IDS.has(q.id));
    const merged=mergeQuestionRecord(beforePhaseBConstraint(q),q,()=>{throw Error('元数据更新不应触发核心题库保护')});
    assert.ok(!merged.forced);assert.deepEqual(merged.record,q);
    assert.deepEqual(applyApprovedFactorizationConstraint(beforePhaseBConstraint(q)),q);
    assert.throws(()=>applyApprovedFactorizationConstraint({...q,answer:q.answer+'+1'}),/stale/);
  }
}
assert.equal(variantCount,264);
assert.equal(QUESTION_BANK_FIX_VERSION,2);assert.equal(DB_VERSION,3);
assert.deepEqual(KEY_PATHS,{questions:'id',dailyTasks:'date',answers:'key',wrongQuestions:'questionId',knowledgeStats:'questionId',questionHistory:'questionId',checkins:'date',settings:'key'});

const factorPoints=[...new Set(formal.slice(162,179).map(q=>q.knowledgePoint))];
const task=buildAdaptiveTask({date:'2026-10-14',questions:formal.slice(0,199),enabled:factorPoints,checkins:Array.from({length:5},(_,i)=>({date:`2026-10-0${i+1}`})),stats:factorPoints.map(knowledgePoint=>({knowledgePoint,attempts:10,firstCorrect:6,last20Attempts:[false,false,false,false,true,true,true,true,true,true],recentAccuracy:60,consecutiveWrong:0,historicalWrong:4})),wrongQuestions:formal.slice(162,164).map(q=>afterWrong({questionId:q.id},'2026-10-13'))});
assert.equal(task.questionIds.length,10);assert.equal(task.scoringPolicyVersion,2);
// This four-topic restricted range safely degrades to 4+4+2 (no fabricated weakness).
assert.deepEqual(['weakness','review','wrong_review'].map(type=>task.items.filter(i=>i.sourceType===type).length),[4,4,2]);
assert.ok(Object.values(task.scoringQuestionPolicies).every(p=>p.answerConstraint==='fully_factored'));

// Rebuild ONLY an isolated copy. The live bank/pending/history are never written.
verifyIsolatedBuild(root,formal,pending);
console.log(`Stage B PASS: formal17 + pending50, 67 references, 67 unfinished counterexamples, ${variantCount} equivalent variants; frozen legacy policies; schema/migration unchanged; isolated rebuild twice.`);
