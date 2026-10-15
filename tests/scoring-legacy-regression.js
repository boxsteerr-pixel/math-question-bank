import assert from 'node:assert/strict';
import fs from 'node:fs';
import {score} from '../js/scoring.js';
import {score as legacy} from './fixtures/scoring-legacy-v1.js';
const bank=JSON.parse(fs.readFileSync(new URL('../data/questions.json',import.meta.url),'utf8'));
const pending=JSON.parse(fs.readFileSync(new URL('../data/questions_pending.json',import.meta.url),'utf8'));
let checks=0;
for(const q of [...bank,...pending]){
  const values=Array.isArray(q.answer)?q.answer:[q.answer];
  for(const inputs of [values,values.map(v=>' '+String(v??'')+' '),values.map(()=>'?'),values.map(()=>''),values.map(()=>'(1')]){
    assert.deepEqual(score(q,inputs,{scoringPolicyVersion:1}),legacy(q,inputs),q.id||q.candidateId);checks++;
    // Neither knowledge-point text nor fullyFactored metadata enables a rule.
    assert.deepEqual(score({...q,answerConstraint:null,fullyFactored:true,knowledgePoint:'因式分解·综合方法'},inputs),legacy(q,inputs));checks++;
  }
}
for(const input of ['x^2-4','x^2+0*x-4','(x-2)*x+2*(x-2)','-(2-x)(x+2)']){
  const q={answerType:'expression',answer:'(x-2)(x+2)'};
  assert.deepEqual(score(q,[input]),legacy(q,[input]));checks++;
  assert.deepEqual(score({...q,answerConstraint:'fully_factored',fullyFactored:true},[input],{scoringPolicyVersion:1}),legacy(q,[input]));checks++;
}
console.log(`Legacy regression PASS: ${checks} comparisons against frozen version-1 scorer; ${bank.length} formal + ${pending.length} pending policies compatible.`);
