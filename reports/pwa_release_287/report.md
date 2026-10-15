# 287题版本发布准备与自动验收

## 版本与冻结基线

实际旧版本：App0.4.7、题库2026.09.3、缓存grade7-math-v29。新版本：App0.4.8、题库2026.10.287、缓存grade7-math-v30。严格只递增一版，js/version.js为单一版本源。

正式287题，Q0001～Q0287连续唯一，fully_factored67题；pending280条；questionBankFixVersion2；DB schema3。本轮未改题目、答案、知识点、选题或判分业务。

questions.json SHA256：db05ba0abe078dda83dc0c7e677d61a1a0580b50151aa6c1ec1e31be6e9c3520。发布前后完全一致。pending及所有关键生产业务文件的冻结hash见tests/fixtures/pwa-release-287-baseline.json，静态验收逐文件核对通过。service-worker.js和js/version.js属于授权发布变更，不计入冻结业务文件。

## 预缓存与更新生命周期

此前预缓存缺少scoring.js、attemptPolicy.js、factorizedForm.js、scoringPolicy.js，以及预览页所需questionPreview.js。本次仅补齐这5项运行依赖，未把测试、报告、pending或备份加入缓存。

共25个静态入口；从首页、家长页、题库预览页递归审计20个HTML/模块依赖节点，路径、大小写及预缓存覆盖全部通过。新缓存逐资源与工作区当前文件比较相同，避免旧scoring引用未缓存新模块。manifest、CSS、图标、题库均覆盖。

保留原cache-first策略、skipWaiting/clients.claim行为。注册仍使用updateViaCache=none；控制器变化后页面重载。activate只删本应用grade7-math-v前缀旧缓存；真实浏览器验证v29/v1被删、v30保留、another-project-static-v1保留。未增加IndexedDB或localStorage清理代码。

## 真实浏览器升级模拟

tests/pwa-release-browser.mjs使用本机无头Chromium、全新临时浏览器上下文、随机127.0.0.1端口。旧资源来自当前HEAD的真实v29版本（旧题库199），不是仅伪造版本名。先通过生产importQuestions写入隔离IndexedDB，再种入旧任务、历史attempt、错题、知识点统计、checkin、设置及localStorage哨兵；安装旧SW后切换服务器到新版。

升级后通过实际app启动、importQuestions和merge路径读取287题/67约束，新Q0200～Q0287可见。answers、wrongQuestions、knowledgeStats、checkins、questionHistory、当天任务逐字段与升级前一致；设置除正常questionBankVersion更新外不变，localStorage保留，数据库schema仍3、题库修复版本仍2。没有连接真实学生数据库。

当天旧10题及无版本任务保持不变，不补写约束。关闭在线页面、断网、新开页面后仍可加载并继续同一任务；实际UI填写、确认暂存、进入下一题并在真实IndexedDB读回草稿通过。旧任务新写草稿仍遵守legacy策略。随后在隔离环境推进一天，通过真实getOrCreateToday生成10题policy-v2任务并验证逐题constraint快照；同日重复调用稳定，旧attempt不重判。

## 判分与零样本运行验证

离线浏览器内导入实际生产模块，选Q0163/Q0164/Q0165/Q0167覆盖提公因式、平方差、完全平方、综合方法。标准答案、因子换序/常数位置/负号/幂与重复因子变体通过；原式、整体伪乘积及Q0167的xy(y²-4)中间未分解形式拒绝；x^m保守manualCheck。相同展开式在legacy策略仍正确。普通无约束expression保留原判分。

通过生产db.all取得287题后模拟新增10个知识点0样本：weaknessScore=0、不进入weakness、每日仅1个review+unseen曝光；已学习review安全补位；获得首样本退出unseen；wrong_review2题保留。D+1/D+4/D+7及mastered规则由原完整测试继续覆盖，未修改相关代码。

## 自动测试

npm test：18/18 PASS；新增PWA静态审计及真实浏览器升级/离线测试。npm run test:pwa单独执行也全部PASS，覆盖pwa-safe-update、pwa-release-audit、pwa-release-browser。详细浏览器结果见browser-results.json（pageErrors为空）。git diff --check：PASS。

## iOS Safari范围与限制

非阻断遗留文案：question-preview.html静态标题仍写“162题显示预览”，其动态“已加载”摘要按真实JSON显示287题。本轮仅做发布配置，未擅自修改该UI；人工核对题数时以动态加载摘要和运行态为准。

新增模块使用BigInt、Object.hasOwn等标准语法/API。BigInt在Safari14支持；Object.hasOwn和structuredClone等在Safari15.4支持，按Safari/iPadOS15.4+作最低API基线；未引入新依赖或运行时转译。

依据：[WebKit Safari14](https://webkit.org/blog/11340/new-webkit-features-in-safari-14/)、[WebKit Safari15.4](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)。这是API兼容性核查，不是Safari实机执行证明。Chromium自动通过不能替代iPad Safari、Apple Pencil Scribble、屏幕键盘或系统离线回收行为验收。

## 本轮修改范围

- service-worker.js：只补齐预缓存生产资源。
- js/version.js：v29→v30、App及题库发布标识；dbVersion仍3。
- package.json：加入PWA自动验收命令（不新增依赖）。
- tests/pwa-safe-update.js：版本断言及关键模块缓存检查。
- tests/pwa-release-audit.js：冻结hash、路径大小写、全依赖图/预缓存审计。
- tests/pwa-release-browser.mjs：隔离真实SW/IndexedDB/离线UI测试。
- tests/fixtures/pwa-release-287-baseline.json：发布前冻结基线。
- reports/pwa_release_287/：报告、浏览器结果、约10项iPad人工清单。

测试自动生成的旧scoring_coverage_report.md已恢复验收前状态，287题实际覆盖结果为number74、expression180、fill_blank16、multiple_blank6、conditional_expression10、ordered_terms1，全部自动通过；不混入无关报告基线变化。此前阶段的未提交修改完整保留。

自动验收层面具备commit/push条件。未发布、未commit、未push。iPad真机验收尚未执行，见ipad_acceptance_checklist.md。
