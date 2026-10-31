import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {currentBank as bank,release} from './helpers/current-bank.js';
import {applyPdfIntegerPromotion} from '../tools/pdfIntegerPromotion.js';
import {score} from '../js/scoring.js';
import {formatMath} from '../js/formatMath.js';
import {buildAdaptiveTask} from '../js/questionEngine.js';
import {KNOWLEDGE_POINTS} from '../js/knowledgePoints.js';
import {afterWrong,afterReviewCorrect} from '../js/wrongQuestions.js';
import {mergeQuestionRecord,DB_VERSION} from '../js/db.js';
import {QUESTION_BANK_FIX_VERSION,FIXED_QUESTION_IDS} from '../js/questionBankFix.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/pdf-integer-promotion-20261023.json'),'utf8'));
const old=bank.slice(0,manifest.baselineCount),added=bank.slice(manifest.baselineCount,360);
assert.equal(old.length,350);assert.equal(added.length,10);assert.equal(bank.length,release.expectedCount);
assert.equal(crypto.createHash('sha256').update(JSON.stringify(old,null,2)+'\n').digest('hex'),release.oldFormalFileSha256);
assert.deepEqual(applyPdfIntegerPromotion(old,manifest),bank.slice(0,360));
assert.deepEqual(applyPdfIntegerPromotion(bank.slice(0,360),manifest),bank.slice(0,360),'幂等重建');
assert.throws(()=>applyPdfIntegerPromotion([{...old[0],answer:'changed'},...old.slice(1)],manifest));
assert.throws(()=>applyPdfIntegerPromotion(bank,manifest));
const tampered=structuredClone(manifest);tampered.entries[0].question.answer='1';
assert.throws(()=>applyPdfIntegerPromotion(old,tampered));
const bundled=path.join(process.env.USERPROFILE||'','.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const python=process.env.MATH_AUDIT_PYTHON||(fs.existsSync(bundled)?bundled:process.platform==='win32'?'python':'python3');
const independent=JSON.parse(execFileSync(python,['-X','utf8','tools/audit-pdf-integer-bank.py'],{cwd:root,encoding:'utf8'}));
assert.equal(independent.independentPass,10);assert.equal(independent.sourceAnswersMatch,10);
assert.deepEqual(independent.formalIds,added.map(q=>q.id));
for(const q of added){
  assert.deepEqual(q,manifest.entries.find(e=>e.question.id===q.id).question);
  const inputs=Array.isArray(q.answer)?q.answer:[q.answer];
  for(const input of [inputs,inputs.map(s=>s.replace(/([+\-*/])/g,' $1 '))]){const r=score(q,input);assert.equal(r.correct,true,q.id);assert.ok(!r.manualCheck);}
  assert.equal(score(q,inputs.map(()=> '987654321')).correct,false,q.id+' wrong');
  for(const text of [q.question,q.displayQuestion,q.displayAnswer])assert.doesNotMatch(formatMath(text),/\^|undefined|NaN/,q.id);
  assert.deepEqual(mergeQuestionRecord(undefined,q),{record:q,changed:true});assert.ok(!FIXED_QUESTION_IDS.has(q.id));
  let w=afterWrong({questionId:q.id},'2026-10-23');assert.equal(w.nextReviewDate,'2026-10-24');
  for(const date of ['2026-10-27','2026-10-30',null]){w=afterReviewCorrect(w);assert.equal(w.nextReviewDate,date);}assert.equal(w.mastered,true);
}
const stats=KNOWLEDGE_POINTS.map(knowledgePoint=>({knowledgePoint,attempts:10,firstCorrect:6,recentAccuracy:60,consecutiveWrong:1,historicalWrong:4,last20Attempts:[true,false,true,false,true]}));
for(const powerBoost of [false,true]){
  const task=buildAdaptiveTask({date:'2026-10-24',questions:bank,enabled:KNOWLEDGE_POINTS,stats,checkins:Array.from({length:5},(_,i)=>({date:`2026-10-0${i+1}`})),wrongQuestions:added.slice(0,2).map(q=>afterWrong({questionId:q.id},'2026-10-23')),powerBoost});
  assert.equal(task.questionIds.length,10);assert.deepEqual(['weakness','review','wrong_review'].map(t=>task.items.filter(i=>i.sourceType===t).length),[5,3,2]);
  assert.deepEqual(task.items.filter(i=>i.sourceType==='wrong_review').map(i=>i.questionId),added.slice(0,2).map(q=>q.id));
}
assert.equal(buildAdaptiveTask({date:'2026-10-24',questions:added,enabled:KNOWLEDGE_POINTS}).questionIds.length,10);
assert.equal(DB_VERSION,3);assert.equal(QUESTION_BANK_FIX_VERSION,2);
console.log('PDF integer promotion PASS: old350 frozen; explicit10 append; independent10/10; score/render/5+3+2/review compatibility; idempotent guarded builder.');
