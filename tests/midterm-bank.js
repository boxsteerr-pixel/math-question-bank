import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {score,scoreForFrozenPolicy} from '../js/scoring.js';
import {formatMath} from '../js/formatMath.js';
import {KNOWLEDGE_POINTS} from '../js/knowledgePoints.js';
import {buildAdaptiveTask} from '../js/questionEngine.js';
import {afterWrong,afterReviewCorrect} from '../js/wrongQuestions.js';
import {DB_VERSION,mergeQuestionRecord} from '../js/db.js';
import {QUESTION_BANK_FIX_VERSION,FIXED_QUESTION_IDS} from '../js/questionBankFix.js';
import {applyMidtermPromotion,fingerprint} from '../tools/midtermPromotion.js';
import {factorizationVariants} from './helpers/factorization-variants.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const manifest=read('data/midterm-promotion-2026-10.json'),bank=read('data/questions.json');
const rows=read('reports/midterm_20261019/candidates.json'),accepted=rows.filter(r=>r.decision==='ACCEPT');
const old=bank.slice(0,287),additions=bank.slice(287),allowedFields=new Set(old.flatMap(q=>Object.keys(q))),skills=new Set(old.map(q=>q.subKnowledgePoint));
assert.equal(bank.length,350);assert.equal(additions.length,63);assert.equal(accepted.length,63);
assert.equal(crypto.createHash('sha256').update(JSON.stringify(old,null,2)+'\n').digest('hex'),'db05ba0abe078dda83dc0c7e677d61a1a0580b50151aa6c1ec1e31be6e9c3520','旧287题所有字段和顺序不变');
assert.deepEqual(bank.map(q=>q.id),Array.from({length:350},(_,i)=>`Q${String(i+1).padStart(4,'0')}`));
assert.equal(new Set(bank.map(q=>q.id)).size,350);
assert.deepEqual(applyMidtermPromotion(old,manifest),bank);assert.deepEqual(applyMidtermPromotion(bank,manifest),bank);
assert.throws(()=>applyMidtermPromotion([{...old[0],answer:'tampered'},...old.slice(1)],manifest));
assert.equal(new Set(manifest.entries.map(e=>e.candidateId)).size,63);
let variants=0;
for(let i=0;i<additions.length;i++){
  const q=additions[i],row=accepted[i];assert.deepEqual(manifest.entries[i].question,q);assert.equal(row.finalId,q.id);
  for(const key of Object.keys(q))assert.ok(allowedFields.has(key),'不新增正式schema字段 '+key);
  for(const k of ['question','displayQuestion','answer','displayAnswer','knowledgePoint','source','sourceIndex'])assert.ok(q[k]!=null&&String(q[k]).trim(),q.id+' '+k);
  assert.equal(q.question,row.question);assert.deepEqual(q.answer,row.independentResult);assert.deepEqual(q.answer,row.answer);
  assert.equal(q.source,row.source);assert.equal(q.sourceParagraphIndex,row.sourceParagraphIndex);assert.equal(q.answerParagraphIndex,row.answerParagraphIndex);
  assert.ok(KNOWLEDGE_POINTS.includes(q.knowledgePoint));assert.ok(skills.has(q.subKnowledgePoint));assert.ok([1,2,3].includes(q.difficulty));
  assert.ok(['number','expression','multiple_blank'].includes(q.answerType));
  assert.equal(q.questionPage,null);assert.equal(q.answerPage,null);assert.equal(q.pageStatus,'unstable_docx_pagination');
  assert.equal(row.independentVerification,'PASS');assert.deepEqual(row.duplicates,[]);
  assert.equal(score(q,Array.isArray(q.answer)?q.answer:[q.answer]).correct,true,q.id);
  for(const text of [q.question,q.displayQuestion,q.displayAnswer])assert.doesNotMatch(formatMath(text),/\^|\[IMG:|MISSING|undefined|NaN/,q.id);
  if(q.answerConstraint){
    assert.equal(q.fullyFactored,true);assert.equal(q.answerType,'expression');assert.ok(row.factorCertificate);
    assert.equal(score(q,[row.expression],{scoringPolicyVersion:1}).correct,true,q.id);
    const wrong=score(q,[row.expression]);assert.equal(wrong.correct,false,q.id);assert.ok(!wrong.manualCheck);
    for(const v of factorizationVariants(q.answer)){assert.equal(score(q,[v.input]).correct,true,q.id+' '+v.input);variants++;}
    assert.equal(scoreForFrozenPolicy(q,[row.expression],{questionIds:[q.id]}).correct,true,'legacy策略不变');
  }
  assert.ok(!FIXED_QUESTION_IDS.has(q.id));const merged=mergeQuestionRecord(undefined,q);assert.deepEqual(merged.record,q);assert.equal(merged.changed,true);
}
assert.equal(additions.filter(q=>q.answerConstraint==='fully_factored').length,17);assert.equal(bank.filter(q=>q.answerConstraint==='fully_factored').length,84);
const norm=s=>s.normalize('NFKC').replace(/[\s：:。，,；;×·*]/g,'').replace(/[−﹣]/g,'-');
for(let i=0;i<additions.length;i++)for(const q of [...old,...additions.slice(0,i)])assert.notEqual(norm(additions[i].question),norm(q.question));
// Independent, read-only, exact rational verification and alpha-renamed AST
// duplicate audit. This is not a comparison of the answer against itself.
const bundled=path.join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python=process.env.MATH_AUDIT_PYTHON||(fs.existsSync(bundled)?bundled:process.platform==='win32'?'python':'python3');
const output=execFileSync(python,['-X','utf8','tools/audit-midterm-bank.py'],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024});
assert.deepEqual(JSON.parse(output.split(/\r?\n/)[0]),{candidates:68,independentPass:68,accepted:63,duplicate:5});
const stats=KNOWLEDGE_POINTS.map(knowledgePoint=>({knowledgePoint,attempts:10,firstCorrect:6,recentAccuracy:60,consecutiveWrong:1,historicalWrong:4,last20Attempts:[true,false,true,false,true]}));
const due=additions.slice(0,2).map(q=>afterWrong({questionId:q.id},'2026-10-18'));
const task=buildAdaptiveTask({date:'2026-10-19',questions:bank,enabled:KNOWLEDGE_POINTS,stats,checkins:Array.from({length:5},(_,i)=>({date:`2026-10-0${i+1}`})),wrongQuestions:due});
assert.equal(task.questionIds.length,10);assert.deepEqual(['weakness','review','wrong_review'].map(type=>task.items.filter(i=>i.sourceType===type).length),[5,3,2]);
assert.deepEqual(task.items.filter(i=>i.sourceType==='wrong_review').map(i=>i.questionId),due.map(r=>r.questionId));
for(const q of additions){
  let w=afterWrong({questionId:q.id},'2026-10-18');assert.equal(w.nextReviewDate,'2026-10-19');
  for(const expected of ['2026-10-22','2026-10-25',null]){w=afterReviewCorrect(w);assert.equal(w.nextReviewDate,expected);}
  assert.equal(w.mastered,true,q.id);
}
const newOnly=buildAdaptiveTask({date:'2026-10-19',questions:additions,enabled:KNOWLEDGE_POINTS,stats:[],checkins:[],wrongQuestions:[]});
assert.equal(newOnly.questionIds.length,10);assert.ok(newOnly.questionIds.every(id=>additions.some(q=>q.id===id)));
assert.equal(DB_VERSION,3);assert.equal(QUESTION_BANK_FIX_VERSION,2);
console.log(`Midterm bank PASS: original287 byte-for-field frozen; 63 additions; independent68/68; alpha/AST dedupe; 17 fully-factored references + ${variants} variants; 5+3+2, new-task pool, D+1/D+4/D+7 and mastered3 unchanged.`);
