# 第11章29题分类更新验收（2026-10-14）

本次仅更新 pending 分类、来源定位、知识点配置及必要测试。未 promotion，未进入第12章，未执行 Git 暂存、提交或推送。

## 新增知识点

同底数幂乘法、同底数幂除法、幂的乘方、积的乘方、幂的运算综合、单项式乘法、多项式乘多项式、乘法公式、整式乘法综合、整式化简求值。

旧10项知识点名称及顺序保留。复用因式分解·完全平方公式，不新增公式法细项、待定系数或系数约束等主知识点。FACTORIZATION_POINTS 从数组末尾截取改为按因式分解前缀筛选，避免新增10项后错误选中最后4项。此修改仅保持原有4个因式分解知识点集合。

## 逐题最终分类

下表编号均为 CAND-DOCX-2026-10-C11-xxx。

|编号|knowledgePoint|subKnowledgePoint|
|---|---|---|
|001|同底数幂乘法|互为相反数的底数统一|
|002|幂的乘方|整体底数的嵌套乘方|
|003|幂的运算综合|乘方、乘除与整体代入|
|004|幂的运算综合|符号、乘方与同类幂合并|
|005|幂的运算综合|负底数与嵌套乘方|
|006|积的乘方|分数系数单项式的乘方|
|007|积的乘方|逆用积的乘方进行简便计算|
|008|积的乘方|倒数关系下的整体乘方|
|009|积的乘方|倒数底数与奇偶符号|
|010|幂的运算综合|指数拆分与整体代入|
|011|同底数幂除法|化为同底数后指数相减|
|012|单项式乘法|分数系数与多字母相乘|
|013|乘法公式|平方差公式直接应用|
|014|乘法公式|完全平方公式逆用与因子填空|
|015|多项式乘多项式|因式条件与待定系数|
|016|多项式乘多项式|指定次数项的存在与消失|
|017|多项式乘多项式|一次项系数为零|
|018|多项式乘多项式|一次项系数为零|
|019|因式分解·完全平方公式|还原系数后分解完全平方|
|020|乘法公式|将二项式看作整体的平方差|
|021|多项式乘多项式|多次数项系数约束|
|022|整式化简求值|乘法展开后代入|
|023|乘法公式|重组因子后使用平方差|
|024|乘法公式|平方差公式的数值应用|
|025|乘法公式|含带分数的平方差应用|
|026|乘法公式|完全平方与平方差组合|
|027|乘法公式|整体平方差与完全平方组合|
|028|乘法公式|积的乘方辅助公式组合|
|029|整式乘法综合|多项式乘法、公式与符号综合|

## 分类分布

|知识点|数量|
|---|---:|
|同底数幂乘法|1|
|同底数幂除法|1|
|幂的乘方|1|
|积的乘方|4|
|幂的运算综合|4|
|单项式乘法|1|
|多项式乘多项式|5|
|乘法公式|9|
|整式乘法综合|1|
|整式化简求值|1|
|因式分解·完全平方公式|1|
|合计|29|

## 来源定位与页码

- C11-011：sourceParagraphIndex 155 → 156；sourceIndex 同步精确到 OOXML段落156。
- C11-020：sourceParagraphIndex 295 → 296；sourceIndex 同步精确到 OOXML段落296。
- 29题均保持 questionPage=null、answerPage=null，增加 pageStatus=unstable_docx_pagination。
- DOCX没有稳定可验证分页信息。使用原题号、sourceIndex、sourceParagraphIndex、answerParagraphIndex 追溯；不猜测页码。

## 冻结验证

正式题库199题，Q0001～Q0199连续唯一，文件字节SHA256仍为：

`4c2728905c9f073f50682bf134cae5025fc9a34fa8a11f9efa693e84cdcb2fe5`

29题 question/displayQuestion/answer/displayAnswer/auditStatus/scoringSupport 未修改，仍为 verified + auto；真实 score() 标准答案29/29自动通过。pending中其余202条记录未修改。27项暂缓审核记录未修改。questionBankFixVersion仍为2，PWA及IndexedDB schema未修改，未操作学习数据。

## 测试结论与阻断问题

新增分类测试确认：知识点配置完整、旧配置保持、因式分解集合保持、零样本 state=insufficient_data、weaknessScore=0、一般稳定期5 weakness + 3 review + 2 wrong_review、unseen最多占1个review槽、首次有效样本后退出unseen优先、错题槽保持不变。

但窄学习范围回归失败：启用相反数和积的乘方，仅相反数有10次样本时，已采样知识点受单知识点4题上限限制，选题器兜底用包括零样本的全部states填第5个weakness槽，使积的乘方被标为weakness。问题位于既有 js/questionEngine.js；本轮不在授权修改范围，未修复。

因此完整 npm test=FAIL，在第3套件新增断言停止。后续8套件逐项补跑全部PASS；11个套件合计10 PASS、1 FAIL。原因式分解测试自身通过，失败来自新增的零样本边界回归，未删除或放宽断言。

|套件|结果|
|---|---|
|test-core|PASS|
|question-bank-audit|PASS|
|factorization-integration（含新增c11-classification）|FAIL：零样本兜底进入weakness|
|question-bank-fix-migration|PASS|
|scoring-coverage|PASS|
|adaptive-engine|PASS|
|power-boost|PASS|
|pwa-safe-update|PASS|
|manual-check|PASS|
|first-attempt-state|PASS|
|backup-restore|PASS|

覆盖率脚本自动生成的报告已恢复至本轮测试前状态，未带入无关变动。下一步需单独批准选题器的零样本兜底修复，之后重新完整测试。本阶段停止，不 promotion。
