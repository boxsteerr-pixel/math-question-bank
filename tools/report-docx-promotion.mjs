import fs from 'node:fs';
import assert from 'node:assert/strict';
import {hash,PROMOTION_IDS} from './docxPromotion.js';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
const bank=read('data/questions.json'),pending=read('data/questions_pending.json'),manifest=read('data/docx-promotion-2026-10.json');
assert.equal(bank.length,287);assert.equal(hash(bank.slice(0,199)),manifest.baselineFingerprint);
const count=(rows,key)=>rows.reduce((out,q)=>(out[q[key]??'(未标记)']=(out[q[key]??'(未标记)']||0)+1,out),{});
const summary={preflightPassed:88,promoted:{C10:10,C11:29,C12:49,total:88},formalCount:287,idRange:'Q0001～Q0287',newIdRange:'Q0200～Q0287',old199Fingerprint:hash(bank.slice(0,199)),addedKnowledgePoints:count(bank.slice(199),'knowledgePoint'),allKnowledgePoints:count(bank,'knowledgePoint'),constraints:{old:17,added:50,total:67},pending:{retained:pending.length,statusDistribution:count(pending,'status'),thisPromotion:pending.filter(q=>PROMOTION_IDS.includes(q.candidateId)&&q.status==='promoted').length,outsideAllowlist:pending.filter(q=>!PROMOTION_IDS.includes(q.candidateId)).length,outsideStatusDistribution:count(pending.filter(q=>!PROMOTION_IDS.includes(q.candidateId)),'status')},scoringPolicyVersion:2,questionBankFixVersion:2,dbSchemaVersion:3};
const folder=new URL('reports/docx_promotion_2026_10/',root);fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(new URL('summary.json',folder),JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(new URL('candidate-formal-mapping.json',folder),JSON.stringify(manifest.entries,null,2)+'\n');
const table=distribution=>['| knowledgePoint | 数量 |','| --- | ---: |',...Object.entries(distribution).map(([point,n])=>`| ${point} | ${n} |`)].join('\n');
const mapping=['| candidateId | formalId | batch | constraint |','| --- | --- | --- | --- |',...manifest.entries.map(e=>`| ${e.candidateId} | ${e.formalId} | ${e.batchId} | ${e.answerConstraint??'无'} |`)].join('\n');
const report=`# 第10～12章安全候选统一promotion审核

## promotion前审计

88/88通过。显式allowlist仅C10-001～010、C11-001～029、C12-001～049。候选ID唯一；verified、auto、标准答案PASS、知识点及answerType有效。题目和答案完整，来源、原题/段落索引完整；不稳定DOCX分页保留null，不猜页码（C10通过原审核说明确认）。

与旧199题重复0；88题内部重复0；与其余192条pending重复0。检查包括NFKC/空白/负号/括号/乘除符号归一、交换律结构对照；因式分解同类任务另检查多项式等价。条件题保留完整条件，不能只按最终答案去重。

## 正式题库

第10章10题＋第11章29题＋第12章49题＝88题；正式287题，Q0001～Q0287连续唯一。新增Q0200～Q0287。旧199题完整记录SHA256与promotion前一致：${summary.old199Fingerprint}。不仅保护六个核心字段，也保护全部既有字段及顺序。

fully_factored：旧正式17＋新增50＝67。第10章10题及第11章其余28题不增加约束。新增50题保留fullyFactored审核元数据。标准答案判分通过；未分解反例、合法变体沿用阶段B逐题证据并在新正式ID下回归。

## 新88题知识点分布

${table(summary.addedKnowledgePoints)}

## 正式287题知识点总分布

${table(summary.allKnowledgePoints)}

## candidateId → formalId

${mapping}

映射及逐题题面/答案指纹亦保存于candidate-formal-mapping.json；真正构建身份源为data/docx-promotion-2026-10.json。

## pending生命周期

沿用现有status=promoted、finalId机制，不删除候选。保留280条，本次88条更新生命周期字段；其余192条完整冻结，其状态含既有17条promoted，不应称为192条“从未晋升”。当前状态分布：${JSON.stringify(summary.pending.statusDistribution)}；其余192条分布：${JSON.stringify(summary.pending.outsideStatusDistribution)}。

## source of truth / 幂等性

data/docx-promotion-2026-10.json：冻结88条allowlist、批次、正式ID、题面/答案/候选记录指纹及旧199题整体指纹。questions_pending.json：经审核候选内容源。tools/docxPromotion.js：只应用manifest，拒绝缺项、身份变化、陈旧内容指纹；不使用proposedId分配正式ID。

tools/build-final-bank.js保留原构建源及阶段B17题审批，保留Q0180～Q0199幂题，再按manifest重建Q0200～Q0287。不能用“所有pending”批量晋升。晋升前两次临时隔离重建均一致；晋升后npm中的隔离重建再次执行两次并逐字段比较287题/280条pending。review/initial-data.js是原构建脚本同步生成的审核页数据，不是另一个题库身份源。

## 零样本真实题库回归

使用promotion后的287题，新10个知识点attempts=0：weaknessScore=0，不进入weakness；最多1个review+unseen_knowledge_exposure。足够候选条件下，正常5+3+2、弱项不足时4+4+2、没有合法弱项但有已学习复习题时0+8+2均通过。到期wrong_review保留2题。获取首样本后退出unseen优先；无零样本时恢复普通review。全部使用真实正式题，不造题，不改选题器。

## 判分策略及用户数据

新任务policy=2，逐题冻结constraint；普通expression快照为null；旧任务legacy不因题库升级而改变。原有任务/attempt/checkin/knowledgeStats不重判、不重算。IndexedDB schema仍3，questionBankFixVersion仍2，不需新migration。现有mergeQuestionRecord对旧199题保留同核心内容，对新88个ID正常新增；未连接真实用户IndexedDB。

## 测试与范围

完整npm test、git diff --check结果见最终交付记录。旧199题和旧阶段A/B测试继续保留，测试基线只针对新增88题及获准生命周期变化适配。新增tests/docx-promotion.js覆盖正式287题、88条manifest、67个约束、真实选题和兼容性。

未处理第13章；未改变PWA缓存、IndexedDB schema、选题规则或历史用户数据；未commit、push、发布。
`;
fs.writeFileSync(new URL('report.md',folder),report);console.log(JSON.stringify(summary,null,2));
