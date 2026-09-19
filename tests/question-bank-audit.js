import fs from 'node:fs';
import assert from 'node:assert/strict';
import {score} from '../js/scoring.js';

const bank=JSON.parse(fs.readFileSync(new URL('../data/questions.json',import.meta.url),'utf8'));
const byId=new Map(bank.map(question=>[question.id,question]));
const get=id=>{const question=byId.get(id);assert.ok(question,`缺少 ${id}`);return question};

// The stored bank keeps ASCII math syntax; the display formatter renders it as standard math glyphs.
assert.equal(get('Q0024').answer,'6.8');
assert.equal(get('Q0028').question,'-{-[-(-13/18)]}');
assert.equal(get('Q0028').displayQuestion,'-{-[-(-13/18)]}');
assert.equal(get('Q0028').answer,'13/18');
assert.equal(get('Q0068').question,'化简：-[-(-a+b)-c]');
assert.equal(get('Q0068').displayQuestion,'化简：-[-(-a+b)-c]');
assert.equal(get('Q0068').answer,'-a+b+c');
assert.equal(get('Q0125').answer,'2x-5y');
assert.equal(get('Q0137').answer,'-2a-2b');

const number=id=>Number(id.slice(1));
const auditable=bank.filter(question=>{
  const n=number(question.id);
  return n<=30||(n>=61&&n<=68)||(n>=71&&n<=90)||(n>=113&&n<=140)||(n>=143&&n<=154)||(n>=157&&n<=162);
});
assert.equal(auditable.length,104,'可直接进行符号复核的题目数必须保持为 104');

function normalizeMixedFraction(value){
  return String(value)
    .replace(/-\s*(\d+)\s+(\d+)\/(\d+)/g,'-($1+$2/$3)')
    .replace(/(\d+)\s+(\d+)\/(\d+)/g,'($1+$2/$3)');
}
function expressionFromQuestion(question){
  const text=question.question;
  return text.includes('：')?text.slice(text.lastIndexOf('：')+1):text;
}
for(const question of auditable){
  const input=normalizeMixedFraction(expressionFromQuestion(question));
  const answer=normalizeMixedFraction(question.answer);
  const result=score({answerType:'expression',answer},[input]);
  assert.equal(result.correct,true,`${question.id}：题面独立计算结果必须与标准答案一致`);
}

const factorization=bank.filter(question=>number(question.id)>=163);
assert.equal(factorization.length,17,'因式分解正式新增题必须为 17 道');
assert.equal(new Set(factorization.map(question=>question.question.normalize('NFKC').replace(/[\s·×*（）\[\]{}]/g,'').replace(/[−—]/g,'-'))).size,17,'新增题不得重复');
const expectedKnowledgePoints={Q0163:'因式分解·提公因式法',Q0164:'因式分解·平方差公式',Q0165:'因式分解·完全平方公式',Q0166:'因式分解·综合方法',Q0167:'因式分解·综合方法',Q0168:'因式分解·综合方法',Q0169:'因式分解·综合方法',Q0170:'因式分解·综合方法',Q0171:'因式分解·综合方法',Q0172:'因式分解·综合方法',Q0173:'因式分解·综合方法',Q0174:'因式分解·综合方法',Q0175:'因式分解·综合方法',Q0176:'因式分解·综合方法',Q0177:'因式分解·综合方法',Q0178:'因式分解·综合方法',Q0179:'因式分解·综合方法'};
for(const question of factorization){
  assert.equal(question.answerType,'expression',`${question.id} 必须使用输入型 expression 判分`);
  assert.equal(question.knowledgePoint,expectedKnowledgePoints[question.id],`${question.id} 的知识点分类错误`);
  assert.equal(score(question,[expressionFromQuestion(question)]).correct,true,`${question.id} 的题面与已分解到底的答案必须数学等价`);
  assert.equal(score(question,[question.answer]).correct,true,`${question.id} 的标准答案必须可自动判定`);
}

console.log(`Question bank audit passed: ${auditable.length} existing auditable questions + ${factorization.length} factorization questions, 0 mismatches.`);
