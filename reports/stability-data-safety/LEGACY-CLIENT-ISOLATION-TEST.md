# 旧版与并发隔离测试

使用随机回环地址、隔离 Edge Chromium 和模拟数据。tests/database-fencing-browser.mjs 从 Git 基线 918f5d2 读取真实旧版 db.js 及其依赖。

验证 v3 学习表全部内容升级前后相同，升级并恢复后旧代码写入被 VersionError 拒绝。持有不响应 versionchange 的连接时，v4 升级被阻塞，放弃的请求在旧连接关闭后不迟到升级。禁用 Web Locks 的双页面测试验证恢复后旧草稿、任务、统计、设置写入被拒绝，延迟异步写入也被拒绝。并发恢复仅一方成功，连续恢复及快照回退代际按 2 → 3 → 4 递增。模拟事务写入异常后数据与代际保持原值。独立快照读取与回退通过。

WebKit 未安装，未运行。iPad Safari 实机未验证。
