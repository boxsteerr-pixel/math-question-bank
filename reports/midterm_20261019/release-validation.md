# 期中计算题扩充验收

- 来源：4份用户指定DOCX，文件SHA256及原题/段落见manifest和候选审核。
- 原题：287；候选计算单位：68；通过数学复核：68；重复剔除：5；正式追加：63。
- 全部审核单位：131（含拆分后独立小问、概念/几何/不适合当前schema的排除项），决策互斥且总数一致。
- 正式题库：350；Q0001～Q0350连续唯一；新增Q0288～Q0350。
- 旧287题按JSON原字段/顺序还原后SHA256：db05ba0abe078dda83dc0c7e677d61a1a0580b50151aa6c1ec1e31be6e9c3520。
- 当前questions.json SHA256：38fe81e4c889ea2d8db8046f6451ef5bec8194db7b1807d970841ed1d31c0532。
- 新增17道fully_factored，正式总数84；另2道因式分解方法的求值题只判最终数值，不错误启用形式约束。
- 17个标准答案、17个未分解反例、65个合法等价变体均通过。
- 独立审计使用Python标准库AST和Fraction精确有理数/稀疏多项式，不依赖生产JS判题器；包含所有候选及字母双射/交换结构去重。因式不可约性用线性因子或二次负判别式证书确认。
- 可复现只读命令：python -X utf8 tools/audit-midterm-bank.py。
- npm test：19/19 PASS（原18套保留，新增midterm-bank）；旧287/199/162回归继续保留，没有删测/跳测。
- npm run test:pwa：3/3 PASS。
- 独立构建副本两次重建均与350题正式文件完全一致；pending280未改动。
- 新题可进入诊断新题池、正常复习/弱项/两道错题回炉；5+3+2与安全退化不改，D+1/D+4/D+7及3次正确mastered不改。
- 14个完成打卡日幂强化不改，固定Q0180～Q0199强化池不扩大。
- 实际引擎只有knowledgePoint范围筛选；difficulty和subKnowledgePoint是已有元数据，没有独立筛选接口。本次不虚构或新增筛选功能。
- IndexedDB schema=3、questionBankFixVersion=2、scoringPolicyVersion=2不变。
- App=0.4.9；题库=2026.10.350；Cache=grade7-math-v31。版本号由js/version.js统一管理，Service Worker原逻辑/资源表不改。
- 隔离Chromium真实v30→v31更新：350题、84约束、所有25项预缓存文件一致；旧任务、answers、wrongQuestions、knowledgeStats、checkins、questionHistory、settings、localStorage保留。
- 离线重开可加载350题、查看预览、确认暂存并继续旧任务；次日新任务10题/policy2且同日重开稳定。
- 浏览器测试使用随机127.0.0.1来源、临时上下文/测试数据库，未访问真实学生学习数据。
- iPad真机：PENDING，不能用Chromium结果替代。
- git diff --check：PASS；本地题库备份和浏览器运行输出不纳入提交。

## 测试套件

test-core、midterm-bank、question-bank-audit、factorization-integration、question-bank-fix-migration、scoring-coverage、adaptive-engine、power-boost、pwa-safe-update、manual-check、first-attempt-state、backup-restore、fully-factored、scoring-legacy-regression、scoring-policy、fully-factored-enablement、docx-promotion、pwa-release-audit、pwa-release-browser。

## 人工iPad验收

打开现有PWA等待更新，完全退出再打开；确认350题和旧学习记录；当天已有10题不重抽；自然遇到新题时正常保存；断网退出重开后继续。不要删除PWA、清库或伪造打卡。
