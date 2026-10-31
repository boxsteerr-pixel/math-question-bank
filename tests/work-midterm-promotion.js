import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {currentBank as bank} from './helpers/current-bank.js';
import {applyWorkMidtermPromotion} from '../tools/workMidtermPromotion.js';
import {score} from '../js/scoring.js';
import {formatMath} from '../js/formatMath.js';
import {KNOWLEDGE_POINTS} from '../js/knowledgePoints.js';
import {mergeQuestionRecord} from '../js/db.js';

const manifest=JSON.parse(fs.readFileSync('data/work-midterm-promotion-20261030.json','utf8'));
const old=bank.slice(0,360), added=bank.slice(360);
assert.equal(bank.length,368);assert.equal(added.length,8);
assert.deepEqual(applyWorkMidtermPromotion(old,manifest),bank);
assert.deepEqual(applyWorkMidtermPromotion(bank,manifest),bank);
assert.throws(()=>applyWorkMidtermPromotion([{...old[0],answer:'changed'},...old.slice(1)],manifest));
const bundled=(process.env.USERPROFILE||'')+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const python=process.env.MATH_AUDIT_PYTHON||(fs.existsSync(bundled)?bundled:process.platform==='win32'?'python':'python3');
const lines=execFileSync(python,['-X','utf8','tools/audit-work-midterm-bank.py'],{encoding:'utf8'}).trim().split(/\r?\n/).map(JSON.parse);
assert.equal(lines.length,8);
for(let i=0;i<8;i++){
 const q=added[i],a=lines[i];assert.equal(q.id,`Q${String(361+i).padStart(4,'0')}`);
 assert.equal(a.math,'PASS');assert.deepEqual(a.exact,[]);assert.deepEqual(a.equivalentPolynomialCandidates,[]);
 assert.equal(q.knowledgePoint,a.knowledge);assert.ok(KNOWLEDGE_POINTS.includes(q.knowledgePoint));
 assert.ok(q.question&&q.answer&&q.source&&q.sourceIndex&&q.questionPage&&q.answerPage);
 assert.equal(score(q,[q.answer]).correct,true,q.id);assert.equal(score(q,['987654321']).correct,false,q.id);
 assert.doesNotMatch(formatMath(q.displayQuestion),/\^|undefined|NaN/,q.id);
 assert.deepEqual(mergeQuestionRecord(undefined,q),{record:q,changed:true});
}
for(const [index,correct,wrong] of [[0,'(1+2a)(1-2a)','1-4a^2'],[4,'-2xy(y-x)(x-3y)','2x^2y(x-y)+6xy^2(y-x)']]){
 const q=added[index];assert.equal(q.answerConstraint,'fully_factored');assert.equal(score(q,[correct]).correct,true,q.id);assert.equal(score(q,[wrong]).correct,false,q.id);
}
for(const value of ['1-4/9*x^2*y^4+2/3*x*y^2','1+2xy^2/3-4x^2y^4/9'])assert.equal(score(added[6],[value]).correct,true,value);
console.log('Work 8 promotion PASS: frozen old360, independent exact arithmetic, duplicate checks, schema, scoring and rendering.');
