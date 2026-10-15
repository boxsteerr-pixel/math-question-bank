# 第10～12章安全候选统一promotion审核

## promotion前审计

88/88通过。显式allowlist仅C10-001～010、C11-001～029、C12-001～049。候选ID唯一；verified、auto、标准答案PASS、知识点及answerType有效。题目和答案完整，来源、原题/段落索引完整；不稳定DOCX分页保留null，不猜页码（C10通过原审核说明确认）。

与旧199题重复0；88题内部重复0；与其余192条pending重复0。检查包括NFKC/空白/负号/括号/乘除符号归一、交换律结构对照；因式分解同类任务另检查多项式等价。条件题保留完整条件，不能只按最终答案去重。

## 正式题库

第10章10题＋第11章29题＋第12章49题＝88题；正式287题，Q0001～Q0287连续唯一。新增Q0200～Q0287。旧199题完整记录SHA256与promotion前一致：08651b2f9d6dfcdfecf3524c954685d088fabd470976eff87ae4abd7d0c1f245。不仅保护六个核心字段，也保护全部既有字段及顺序。

fully_factored：旧正式17＋新增50＝67。第10章10题及第11章其余28题不增加约束。新增50题保留fullyFactored审核元数据。标准答案判分通过；未分解反例、合法变体沿用阶段B逐题证据并在新正式ID下回归。

## 新88题知识点分布

| knowledgePoint | 数量 |
| --- | ---: |
| 合并同类项 | 3 |
| 整式加减综合 | 7 |
| 同底数幂乘法 | 1 |
| 幂的乘方 | 1 |
| 幂的运算综合 | 4 |
| 积的乘方 | 4 |
| 同底数幂除法 | 1 |
| 单项式乘法 | 1 |
| 乘法公式 | 9 |
| 多项式乘多项式 | 5 |
| 因式分解·完全平方公式 | 3 |
| 整式化简求值 | 1 |
| 整式乘法综合 | 1 |
| 因式分解·提公因式法 | 15 |
| 因式分解·综合方法 | 27 |
| 因式分解·平方差公式 | 5 |

## 正式287题知识点总分布

| knowledgePoint | 数量 |
| --- | ---: |
| 相反数 | 30 |
| 绝对值 | 30 |
| 去括号 | 30 |
| 添括号 | 22 |
| 合并同类项 | 23 |
| 整式加减综合 | 57 |
| 因式分解·提公因式法 | 16 |
| 因式分解·平方差公式 | 6 |
| 因式分解·完全平方公式 | 4 |
| 因式分解·综合方法 | 41 |
| 同底数幂乘法 | 1 |
| 幂的乘方 | 1 |
| 幂的运算综合 | 4 |
| 积的乘方 | 4 |
| 同底数幂除法 | 1 |
| 单项式乘法 | 1 |
| 乘法公式 | 9 |
| 多项式乘多项式 | 5 |
| 整式化简求值 | 1 |
| 整式乘法综合 | 1 |

## candidateId → formalId

| candidateId | formalId | batch | constraint |
| --- | --- | --- | --- |
| CAND-DOCX-2026-10-C10-001 | Q0200 | docx-computation-supplement-2026-10-batch-a | 无 |
| CAND-DOCX-2026-10-C10-002 | Q0201 | docx-computation-supplement-2026-10-batch-a | 无 |
| CAND-DOCX-2026-10-C10-003 | Q0202 | docx-computation-supplement-2026-10-batch-a | 无 |
| CAND-DOCX-2026-10-C10-004 | Q0203 | docx-computation-supplement-2026-10-batch-a | 无 |
| CAND-DOCX-2026-10-C10-005 | Q0204 | docx-computation-supplement-2026-10-batch-a | 无 |
| CAND-DOCX-2026-10-C10-006 | Q0205 | docx-computation-supplement-2026-10-batch-a | 无 |
| CAND-DOCX-2026-10-C10-007 | Q0206 | docx-computation-supplement-2026-10-batch-a | 无 |
| CAND-DOCX-2026-10-C10-008 | Q0207 | docx-computation-supplement-2026-10-batch-a | 无 |
| CAND-DOCX-2026-10-C10-009 | Q0208 | docx-computation-supplement-2026-10-batch-a | 无 |
| CAND-DOCX-2026-10-C10-010 | Q0209 | docx-computation-supplement-2026-10-batch-a | 无 |
| CAND-DOCX-2026-10-C11-001 | Q0210 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-002 | Q0211 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-003 | Q0212 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-004 | Q0213 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-005 | Q0214 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-006 | Q0215 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-007 | Q0216 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-008 | Q0217 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-009 | Q0218 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-010 | Q0219 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-011 | Q0220 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-012 | Q0221 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-013 | Q0222 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-014 | Q0223 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-015 | Q0224 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-016 | Q0225 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-017 | Q0226 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-018 | Q0227 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-019 | Q0228 | docx-2026-10-c11 | fully_factored |
| CAND-DOCX-2026-10-C11-020 | Q0229 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-021 | Q0230 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-022 | Q0231 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-023 | Q0232 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-024 | Q0233 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-025 | Q0234 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-026 | Q0235 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-027 | Q0236 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-028 | Q0237 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C11-029 | Q0238 | docx-2026-10-c11 | 无 |
| CAND-DOCX-2026-10-C12-001 | Q0239 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-002 | Q0240 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-003 | Q0241 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-004 | Q0242 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-005 | Q0243 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-006 | Q0244 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-007 | Q0245 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-008 | Q0246 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-009 | Q0247 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-010 | Q0248 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-011 | Q0249 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-012 | Q0250 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-013 | Q0251 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-014 | Q0252 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-015 | Q0253 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-016 | Q0254 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-017 | Q0255 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-018 | Q0256 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-019 | Q0257 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-020 | Q0258 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-021 | Q0259 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-022 | Q0260 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-023 | Q0261 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-024 | Q0262 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-025 | Q0263 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-026 | Q0264 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-027 | Q0265 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-028 | Q0266 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-029 | Q0267 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-030 | Q0268 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-031 | Q0269 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-032 | Q0270 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-033 | Q0271 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-034 | Q0272 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-035 | Q0273 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-036 | Q0274 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-037 | Q0275 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-038 | Q0276 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-039 | Q0277 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-040 | Q0278 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-041 | Q0279 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-042 | Q0280 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-043 | Q0281 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-044 | Q0282 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-045 | Q0283 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-046 | Q0284 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-047 | Q0285 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-048 | Q0286 | docx-2026-10-c12 | fully_factored |
| CAND-DOCX-2026-10-C12-049 | Q0287 | docx-2026-10-c12 | fully_factored |

映射及逐题题面/答案指纹亦保存于candidate-formal-mapping.json；真正构建身份源为data/docx-promotion-2026-10.json。

## pending生命周期

沿用现有status=promoted、finalId机制，不删除候选。保留280条，本次88条更新生命周期字段；其余192条完整冻结，其状态含既有17条promoted，不应称为192条“从未晋升”。当前状态分布：{"needsReview":162,"deferred":13,"promoted":105}；其余192条分布：{"needsReview":162,"deferred":13,"promoted":17}。

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
