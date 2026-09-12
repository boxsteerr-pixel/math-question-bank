# IndexedDB 一致性检查

- 首次错误：答题记录以 `date:questionId` 保存；首次错误只在 `firstWrongRecorded` 为 false 时写入错题库。
- 订正正确：`firstAttemptCorrect` 不会被覆盖；知识点统计使用该字段，不会把订正改记为首次正确。
- 不会：设置 `gaveUp=true`、`firstAttemptCorrect=false` 并写入错题库。
- 退出恢复：已验证刷新后恢复同一日任务和未完成题位置；已提交记录保留。
- 完成 10 题：`checkins` 的主键为 date，重复写入会覆盖当天记录，不会新增第二条打卡。
- 重复订正：只有 `resolved` 时才更新知识点统计；已完成题不会再次进入答题流程。
- 清除测试数据：开发/家长预览页执行双重确认后仅清除 dailyTasks、answers、wrongQuestions、knowledgeStats、checkins；questions 正式题库不在清除范围。

真实 iPad 上的长期退出恢复、断网重启与跨日任务生成仍需依照 iPad 验收清单人工确认。
