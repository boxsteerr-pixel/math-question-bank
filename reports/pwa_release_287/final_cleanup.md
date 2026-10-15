# 最终发布前收尾（未commit/push）

## 旧数量文案

当前PWA用户界面仅发现question-preview.html的H1硬编码“162题显示预览”。已改为无数字的加载占位标题，并在js/questionPreview.js读取正式questions.json成功后通过bank.length设置实际数量。没有硬编码287。

自动验证：实际题库在线/离线均显示“287题显示预览”，摘要显示已加载287题；另一个独立3题显示fixture的标题和摘要均为3，证明标题动态。该fixture不改正式JSON，不写真实数据库。

搜索范围包括项目全部HTML、JS/CSS、README、scripts/review以及历史报告/测试数据。没有发现其他当前PWA界面的162/179/199旧题库数量。README第7、13行仍有初始162题的旧文档说明；它们不在PWA运行界面，本轮仅修显示，不顺带改文档。其余命中属于旧题ID/索引、构建基线、历史审核报告、历史版本fixture或回归测试，按要求保留，不做全局替换。

## 缓存版本判断依据

保持grade7-math-v30；App0.4.8；题库2026.10.287。

只读核查结果：

- GitHub Pages来源是origin/main根目录，无自定义域名，采用既有Pages发布方式。
- 远程main与最新Pages部署均指向c15841705153c149fa8f57fd1e9748f1dd50dbe5；该部署创建于2026-09-27T05:44:13Z。
- 直接HTTP读取正式线上js/version.js仍为grade7-math-v29 / App0.4.7 / 题库2026.09.3。
- API返回的已有GitHub Pages部署记录未出现v30；本地全部引用的Git提交历史搜索grade7-math-v30为空；v30目前仅存在于未提交工作区。
- 仓库没有发现另一个发布托管配置。因此依据已配置的外部发布渠道，v30尚未部署，可以将本次显示修正纳入同一未发布release，不升v31。

question-preview.html与js/questionPreview.js都已在v30预缓存中；隔离旧v29升级测试逐文件检查v30缓存与当前文件相同，在线/离线预览均验证修正文案。未改Service Worker策略或题库业务。

## 冻结与自动验收

正式287题，Q0001～Q0287连续唯一；fully_factored67题；pending280条；IndexedDB schema3；questionBankFixVersion2。

questions.json SHA256仍为db05ba0abe078dda83dc0c7e677d61a1a0580b50151aa6c1ec1e31be6e9c3520。所有题库、知识点、选题/判题、scoringPolicy、questionBankFix及DB文件保持冻结。

原发布冻结hash记录保留不覆盖。本次两个显示文件的明确审批前后hash保存于tests/fixtures/pwa-preview-title-287.json，测试只对这两个获准显示文件接受新hash，其他生产文件仍按原冻结hash校验。

npm test：18/18 PASS。npm run test:pwa：3/3 PASS。git diff --check：PASS。Chromium自动通过不等于iPad通过；iPad真机状态始终PENDING。

## 本轮文件范围

- question-preview.html：动态标题节点/加载占位文案。
- js/questionPreview.js：以bank.length写入标题，其余行为不变。
- tests/pwa-release-audit.js：只允许已批准UI hash变化，保留其他冻结校验。
- tests/pwa-release-browser.mjs：在线/离线287题及隔离3题动态标题验证。
- tests/fixtures/pwa-preview-title-287.json：两个显示文件的前后hash。
- reports/pwa_release_287/：本说明、更新的隔离浏览器结果、最终hash及iPad人工清单。

测试自动写出的scoring_coverage_report.md恢复验收前状态，不混入无关旧报告基线调整。历史审核材料及历史fixture未改动。

## 真机状态与执行边界

iPad：PENDING。

目前线上仍v29，本轮未部署；因此现在不能在已安装的线上PWA中验收未发布v30。最终10项操作清单见ipad_acceptance_checklist.md，待后续授权的新版本可用后由人工执行。没有合适因式分解题时等待自然遇题；预览只能对照内容，不能替代实际判分；不通过修改真实数据或点击清除测试数据制造测试场景。

commit/push：NOT EXECUTED。本轮未清空IndexedDB、未修改学习记录、未发布；完成后停止。
