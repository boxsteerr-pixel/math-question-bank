# Promotion最终自动验收

npm test：16/16 PASS（退出码0）。

git diff --check：PASS（退出码0）。仅有Git换行风格提示，无空白错误。

| 套件 | 结果 |
| --- | --- |
| test-core | PASS |
| question-bank-audit | PASS |
| factorization-integration（含C11） | PASS |
| question-bank-fix-migration | PASS |
| scoring-coverage | PASS |
| adaptive-engine | PASS |
| power-boost | PASS |
| pwa-safe-update | PASS |
| manual-check | PASS |
| first-attempt-state | PASS |
| backup-restore | PASS |
| fully-factored | PASS |
| scoring-legacy-regression | PASS |
| scoring-policy | PASS |
| fully-factored-enablement（含C12及连续两次隔离重建） | PASS |
| docx-promotion | PASS |

标准答案自检：number74、expression180、fill_blank16、multiple_blank6、conditional_expression10、ordered_terms1；全部自动通过，合计287。

形式约束：67个审核标准、67个未分解等价反例、264个合理等价变体全部通过；另保留基础形式判定/225个参考变体回归。legacy冻结比较5678项通过。

旧阶段B的4+4+2断言固定在原199题基线上继续保留；新增287题真实回归另覆盖5+3+2、4+4+2、0+8+2。没有为了通过测试修改选题器。

旧199题完整记录指纹：08651b2f9d6dfcdfecf3524c954685d088fabd470976eff87ae4abd7d0c1f245。其余192条pending完整指纹由manifest保存及核对。新88题按显式allowlist审核88/88。

测试自动生成的reports/scoring_coverage_report.md已恢复验收前状态，避免混入旧报告基线变更；本次287题覆盖率的实际结果记录于本文。

## 本轮修改/新增文件

- data/questions.json
- data/questions_pending.json
- data/docx-promotion-2026-10.json
- review/initial-data.js（既有构建生成物）
- tools/build-final-bank.js
- tools/docxPromotion.js
- tools/prepare-docx-promotion.mjs
- tools/verify-docx-promotion-prebuild.mjs
- tools/report-docx-promotion.mjs
- package.json
- tests/test-core.js
- tests/c11-classification.js
- tests/c12-pending-audit.js
- tests/fully-factored-enablement.js
- tests/fully-factored.js
- tests/scoring-legacy-regression.js
- tests/docx-promotion.js
- tests/helpers/promotion-baseline.js
- tests/helpers/isolate-bank-build.js
- reports/docx_promotion_2026_10/report.md
- reports/docx_promotion_2026_10/summary.json
- reports/docx_promotion_2026_10/candidate-formal-mapping.json
- reports/docx_promotion_2026_10/verification.md

此前C11/C12、阶段A/B遗留的其他未提交修改均保留。本轮没有改生产选题/判题逻辑、PWA缓存版本或数据库schema。

## 发现的问题

没有发现题目数据、来源或判分阻断问题。

原测试使用199题及晋升前pending状态作为全局断言，需要适配新增88题。已保留旧199题逐字段哈希及旧阶段审核覆盖，并为新287题添加独立验收。既有pending192条中含17条早已promoted候选，因此192不等于192条从未晋升候选；保留原记录，不机械删除。

未连接真实学生IndexedDB；无用户学习数据修改；questionBankFixVersion仍2、DB schema仍3；未处理第13章、未升级缓存、未commit、未push。
