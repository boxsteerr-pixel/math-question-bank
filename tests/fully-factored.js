import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {score} from '../js/scoring.js';
import {parseFactorizedForm,normalizeFactorMultiset,FACTORIZED_FORM_LIMITS} from '../js/factorizedForm.js';
import {initialAttemptPolicy} from '../js/attemptPolicy.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url));
const files=['data/questions.json','data/questions_pending.json'];
const hashes=files.map(p=>crypto.createHash('sha256').update(read(p)).digest('hex'));
const constrained=answer=>({answer,answerType:'expression',answerConstraint:'fully_factored',fullyFactored:true});
const q=constrained('(x-2)(x+2)');let correct=0,incorrect=0,manual=0;
const check=(answer,input,expected)=>{const r=score(constrained(answer),[input]);assert.equal(r.correct,expected,input);assert.ok(!r.manualCheck,input);if(expected)correct++;else incorrect++};
for(const input of ['(x-2)(x+2)','(x+2)(x-2)','-(2-x)(x+2)','((x-2)*(x+2))','(x-2)*1*(x+2)','(x+2)(x-2)^1'])check(q.answer,input,true);
for(const input of ['x^2-4','x^2+0*x-4','(x^2-4)','1*(x^2-4)','-1*(4-x^2)','(x-2)*x+2*(x-2)','(x^2-4)*1'])check(q.answer,input,false);
for(const [answer,input,expected] of [
  ['(x-2)(x+2)(x+1)','(x^2-4)(x+1)',false],
  ['(x-2)(x+2)(x+1)','(x+1)(x-2)(x+2)',true],
  ['2(x-1)(x+1)','(x+1)*2*(x-1)',true],
  ['2(x-1)(x+1)','-2(1-x)(x+1)',true],
  ['2(x-1)(x+1)','(x-1)/2*4*(x+1)',true],
  ['2(x-1)(x+1)','2(x^2-1)',false],
  ['(x-1)^2','(1-x)^2',true],
  ['(x-1)^2','(x-1)(x-1)',true],
  ['(x-1)^2','x^2-2x+1',false],
  ['(x-1)^2','(x-1)^2+0',false],
  ['3x(x-1)(x+1)','(x^2-1)*3x',false],
  [q.answer,'1.00000000001*(x-2)(x+2)',false],
  [q.answer,'(x-3)(x+2)',false]
])check(answer,input,expected);
function balanced(n){return n===1?'x':`(${balanced(Math.floor(n/2))}+${balanced(Math.ceil(n/2))})`}
for(const input of ['x^m','x^(m+1)','x^1.5','x^-1','1/(x-1)','(x-2)(x+2)/(x-x+1)','0^0*(x-2)(x+2)','√(x)','sqrt(x)','(x-1','x^1000000','x'.repeat(2049),'('.repeat(50)+'x'+')'.repeat(50),balanced(260),'(a+b+c+d+e)^32','((x+1)^32)^32','9'.repeat(65)]){
  const r=score(q,[input]);assert.equal(r.manualCheck,true,input.slice(0,80));assert.equal(r.correct,false);assert.equal(initialAttemptPolicy(r).firstAttemptCorrect,null);manual++;
}
for(const question of [constrained('3(x^2+1)'),constrained('0*(x-1)^2'),{...q,fullyFactored:false},{...q,answerConstraint:'unknown'},{...q,answerType:'multiple_blank'}]){assert.equal(score(question,[question.answer]).manualCheck,true);manual++}
const ast=parseFactorizedForm('(x-1)^2');assert.equal(normalizeFactorMultiset(ast).length,2);
assert.ok(FACTORIZED_FORM_LIMITS.depth<=64&&FACTORIZED_FORM_LIMITS.exponent<=64);
const bank=JSON.parse(read(files[0])),pending=JSON.parse(read(files[1]));
const samples=[...bank.slice(162,179),...pending.filter(q=>q.answerConstraint==='fully_factored')];
assert.equal(samples.length,67);const audited=JSON.parse(read('reports/docx_2026_10_c12/math-audit.json'));
let equivalents=0;
function serialize(a){switch(a.op){case 'number':return a.value[1]===1n?String(a.value[0]):`(${a.value[0]}/${a.value[1]})`;case 'variable':return a.name;case 'negative':return `-(${serialize(a.base)})`;case 'power':return `(${serialize(a.base)})^${a.exponent}`;default:return `(${serialize(a.left)}${a.op}${serialize(a.right)})`}}
function productTerms(a){return a.op==='*'?[...productTerms(a.left),...productTerms(a.right)]:[serialize(a)]}
for(const item of samples){
  const frozen=JSON.stringify(item),test=item;
  assert.equal(item.answerConstraint,'fully_factored');assert.equal(item.fullyFactored,true);
  assert.equal(score(test,[item.answer]).correct,true,item.id||item.candidateId);
  const terms=productTerms(parseFactorizedForm(item.answer));
  const alternatives=[terms.slice().reverse().map(x=>`(${x})`).join('*')];
  if(terms.length>=2)alternatives.push([`-(${terms[0]})`,`-(${terms[1]})`,...terms.slice(2)].map(x=>`(${x})`).join('*'));
  if(item.candidateId)alternatives.push(...(audited.find(r=>r.candidateId===item.candidateId)?.equivalentInputs||[]));
  for(const input of alternatives){const r=score(test,[input]);assert.equal(r.correct,true,(item.id||item.candidateId)+':'+input);assert.ok(!r.manualCheck);equivalents++}
  assert.equal(JSON.stringify(item),frozen);
}
for(let i=0;i<files.length;i++)assert.equal(crypto.createHash('sha256').update(read(files[i])).digest('hex'),hashes[i]);
assert.equal(bank.filter(q=>q.answerConstraint==='fully_factored').length,67,'旧正式17题及本次新增50题获准启用');
assert.equal(pending.filter(q=>q.answerConstraint==='fully_factored').length,50,'仅C11/C12安全50题获准启用');
console.log(`Fully-factored tests PASS: correct=${correct}, incorrect=${incorrect}, manualCheck=${manual}, certified standards=67/67, equivalent variants=${equivalents}.`);
