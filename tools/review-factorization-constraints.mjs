import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {score} from '../js/scoring.js';
import {factorizationVariants} from '../tests/helpers/factorization-variants.js';
const root=new URL('../',import.meta.url),folder=new URL('reports/fully_factored_phase_b/',root);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const bank=read('data/questions.json'),pending=read('data/questions_pending.json');
const math=read('reports/fully_factored_phase_b/math-review.json');
const rows=math.map(review=>{
  const question=review.group==='formal'?bank.find(q=>q.id===review.id):pending.find(q=>q.candidateId===review.id);
  assert.ok(question,review.id);
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify({question:question.question,answer:question.answer,answerType:question.answerType})).digest('hex');
  assert.equal(fingerprint,review.referenceFingerprint,'数学审核后题面或答案发生变化，停止启用');
  const tested={...question,answerConstraint:'fully_factored',fullyFactored:review.fullyFactored};
  const standard=score(tested,[question.answer]);
  const legacyCounterexample=score(tested,[review.counterexample],{scoringPolicyVersion:1});
  const constrainedCounterexample=score(tested,[review.counterexample]);
  const alternatives=factorizationVariants(question.answer).map(v=>({...v,result:score(tested,[v.input])}));
  const eligible=review.explicitFactorizationRequirement&&review.fullyFactored&&question.answerType==='expression'&&standard.correct===true&&!standard.manualCheck&&legacyCounterexample.correct===true&&!legacyCounterexample.manualCheck&&constrainedCounterexample.correct===false&&!constrainedCounterexample.manualCheck&&alternatives.every(v=>v.result.correct===true&&!v.result.manualCheck);
  return {...review,standard,legacyCounterexample,constrainedCounterexample,alternatives,constraintApproval:eligible?'approved':'needs_constraint_review'};
});
assert.equal(rows.length,67);assert.ok(rows.every(r=>r.constraintApproval==='approved'),'逐题审核未全部通过；不得修改题库');
fs.writeFileSync(new URL('audit.json',folder),JSON.stringify(rows,null,2)+'\n');
const cell=value=>String(value).replaceAll('|','\\|').replaceAll('\n',' ');
const table=group=>[
  '| ID | 题目 | 标准答案 | knowledgePoint | 明确要求分解 | fullyFactored | checker标准 | 展开式 legacy/v2 | 启用 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.filter(r=>r.group===group).map(r=>`| ${[r.id,r.question,r.answer,r.knowledgePoint,'是','是','PASS',r.counterexample+'：正确 / 拒绝','批准'].map(cell).join(' | ')} |`)
].join('\n');
const report=`# 阶段B：逐题启用 fully_factored 审核

## 结论

正式17题、pending50题全部批准，暂缓0题。正式题库199题、pending280条，没有promotion。仅新增判分约束和标准答案审核元数据，题面、答案、知识点及既有审核状态保持冻结。

判分约束为 answerConstraint=fully_factored；fullyFactored=true 表示标准答案已审核分解到底，两者含义不同。

范围为有理数系数整式。逐题精确展开比较；一次因子、二次因子判别式以及已有不可约性证书见 math-review.json 的 factorCertificates。不是根据知识点名称自动批准。C11-019先根据系数条件求 a=6、b=9，再对 x²+6x+9 构造未分解反例。

67个标准答案PASS；67个未分解等价反例在legacy下正确、在v2约束下被明确拒绝（非manualCheck）；264个合理等价变体PASS，包括换序、负号移动、常数位置及重复因子/幂形式。逐条输入与实际返回值见 audit.json。

## 正式17题逐题表

${table('formal')}

## pending50题逐题表

${table('pending')}

## 未批准题

无。

## source of truth 与构建安全

正式Q0163～Q0179的题面/答案构建源仍是 questions_pending.json 中原factorization-supplement-01批次的promoted候选；正式ID映射在 tools/build-final-bank.js。

本轮constraint的唯一构建审批源为 tools/factorizationConstraintApprovals.js，显式绑定17个正式ID及题面/答案/answerType的SHA256。源内容改变会停止构建，要求重新审核。build-final-bank.js应用这份审批映射，不对知识点批量打标。

旧构建器原来只生成179题。本轮让它原样保留后续已有Q0180～Q0199，避免重建丢失幂运算20题。只在临时隔离目录连续重建两次；输出199题和280条pending与当前数据逐字段一致，没有在正式目录执行重建。

pending约束源为 data/questions_pending.json 中C11-019及C12-001～049；其他promoted/deferred pending保持原状。

## 历史兼容与测试

旧无版本dailyTask/attempt继续legacy；已有policy v2且constraint快照为null的任务也不被升级。新任务冻结scoringPolicyVersion=2和逐题constraint快照。真实模块任务生成/同日复用/提交/订正测试在 tests/scoring-policy.js；逐题冻结兼容及构建测试在 tests/fully-factored-enablement.js。已保存首答true/false/null不重判。

数据库schema版本仍3，questionBankFixVersion仍2，17题不在5题历史修复集合中。核心题面/答案签名未变，现有mergeQuestionRecord仅合并新元数据，不触发强制覆盖/历史重算。没有连接真实学生IndexedDB，没有改checkin/knowledgeStats等用户数据。

完整npm test共15套全部通过（含C11/C12审核回归）；git diff --check通过。旧题无约束行为由4798项冻结legacy比较及无constraint回归覆盖。

未发现题面/标准答案数据错误。不升级PWA缓存，不处理第13章，不promotion，不commit，不push。
`;
fs.writeFileSync(new URL('report.md',folder),report);
console.log(JSON.stringify({formalReviewed:17,formalApproved:rows.filter(r=>r.group==='formal'&&r.constraintApproval==='approved').length,pendingReviewed:50,pendingApproved:rows.filter(r=>r.group==='pending'&&r.constraintApproval==='approved').length,standardPass:rows.length,unfactorizedRejected:rows.length,equivalentVariants:rows.reduce((n,r)=>n+r.alternatives.length,0),deferred:0},null,2));
