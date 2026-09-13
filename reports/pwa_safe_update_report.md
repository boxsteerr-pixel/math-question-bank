# PWA 安全更新与学习数据保护

- 应用版本：`0.4.0`
- IndexedDB 版本：`3`
- 题库版本：`2026.09.1`
- 静态缓存：`grade7-math-v14`

## 不可删除的学习数据

`dailyTasks`、`answers`、`wrongQuestions`、`knowledgeStats`、`questionHistory`、`checkins`、`settings` 是学习记录。正常升级、Service Worker 更新和题库同步均不会清空、删除或重建这些 store。

数据库 v1 建立原始 store，v2 新增 `questionHistory`，v3 只增加非破坏性升级前后计数核验。以后仅可在 `onupgradeneeded` 新增 store、index 或补默认字段；不得删除 store 或清空数据。

## 更新流程

Service Worker 只缓存静态程序资源；学习数据始终在 IndexedDB。检测到等待激活的新 Service Worker 时，页面显示“发现新版本”。用户点“立即更新”后才激活并重载，因而不会中断正在进行的答题。`dailyTasks` 以日期保存，已生成的当天 10 题不会重新抽取。

缓存安装失败时，新 Worker 不激活，旧缓存和旧程序继续可用。更新前后的关键 store 计数会被比对；若原先非零的 store 变成零，会记录迁移异常并停止启动。

## 题库与备份

题库以 `question.id` 增量合并：新 ID 插入；同 ID 且核心题面、答案或答案类型改变时发出开发警告并保留本机旧记录。不会清空 `questions` store。

家长页可导出完整学习备份，导入采用合并写入且不会清空本机数据。导出后会记录最近完整备份时间；超过 7 天显示提醒。

## 验证

`npm test` 包含安全更新策略测试：学习记录计数保持、异常清零检测、题库新旧 ID 合并与核心内容变更保护。实际 iPad 验收还应覆盖离线启动、更新提示、联网后更新及更新中继续当天任务。
