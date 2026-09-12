# 七年级数学 PDF 题库结构化与审核工具

本项目包含已完成的 PDF 题库结构化、人工审核工具，以及基于正式题库的本地每日计算打卡 PWA。

## 每日计算打卡 PWA

项目根目录现已提供离线 PWA：`index.html`。它只读取 `data/questions.json` 中已确认的 162 道正式题，不读取 PDF，也不会改写题目或标准答案。首次启动会导入题库至 IndexedDB，并生成当天固定的 10 题；同日刷新或退出后可继续原任务。

本地预览请在项目根目录运行：`python -m http.server 4173`，然后打开 `http://localhost:4173/`。不要直接双击 `index.html`，因为浏览器会限制题库读取和 Service Worker。GitHub Pages 部署可直接使用相对路径，无需修改根路径。

## 当前题库

当前权威来源为 `source/七年级上学期_日常计算精选题库_含标准答案.pdf`。该文件前 7 个物理页为练习题、后 6 页为对应答案。正式题库 `data/questions.json` 已含 162 道 `approved` 题目；每条均记录题目页、答案页、原题号、PDF 标准答案和答案类型。`data/questions_pending.json` 保留最初的转换记录。

## 打开审核页面

双击打开 `review/review.html`。该页面不需要服务器，也不依赖联网。初始题库数据已嵌入 `review/initial-data.js`，因此通过 `file://` 直接打开也可以运行。页面默认筛选 `needsReview`；如需查看正式题库，请将状态切换为 `approved` 或“全部”。

## 继续审核和修改题目

每一次编辑或状态变更都会自动保存到当前浏览器的 localStorage。刷新、关闭再打开同一浏览器后，进度会保留。单题页面可修改题目、标准答案、知识点、细分知识点、难度、标签与审核备注。

使用“确认正确”将题目改为 `approved`；使用“需要复核”改为 `needsReview`；使用“不使用”改为 `rejected`。顶部可按状态、知识点、题目 PDF 页码、题库 ID 或原题号筛选。单题会同时显示题目页、标准答案页、答案类型与验算结果。多空答案以 `|` 分隔，保存时会还原为答案数组。

## 导出

点击“导出审核进度”会下载 `questions_review_backup.json`，用于跨浏览器或意外清除浏览器数据后的恢复。

点击“导出正式题库”会分别下载：

- `questions.json`：仅 `approved` 题目。
- `questions_rejected.json`：所有 `rejected` 题目。
- `questions_needs_review.json`：所有 `needsReview` 题目。

浏览器出于安全限制无法直接改写本地目录。下载后请用同名文件替换 `data/` 目录中的对应文件；初始的 `data/questions.json` 是空数组，避免未审核题目被使用。

点击“导出审核报告”可得到当前审核状态下的 `review_report.md`。

## 增加新的 PDF

1. 将 PDF 放入 `source/`。
2. 先为该 PDF 创建页面结构分析，并确认练习题页与标准答案页的对应关系。
3. 按“一道独立小题一条记录”建立模块、原题号、左右栏/空格顺序与答案页的映射。
4. 对答案不明或任何符号识别存在风险的题目设置 `needsReview`，不要推断或补全。
5. 运行 `node scripts/validate_questions.js`，通过后再更新 `review/initial-data.js`；已经审核的浏览器进度应先导出备份。

## 目录

- `source/`：原始 PDF
- `data/`：待审核、正式、拒绝、需复核 JSON
- `review/`：离线审核页面
- `reports/`：PDF 结构分析与审核报告
- `tools/build-bank.js`：本批题库的可重复生成脚本
