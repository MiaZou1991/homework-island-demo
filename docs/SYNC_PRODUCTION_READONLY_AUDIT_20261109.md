# 开心岛｜2026-11-09 真实 Supabase 只读审计记录

> 状态：生产只读核查已完成；未读出孩子作业内容、未执行任何 `INSERT/UPDATE/DELETE` 或生产 RPC 写入。用户截图时段和日志排查仅能确定症状与缺陷，**仍需手机端诊断日志才能确认直接触发原因**。

## 生产项目

- Supabase 项目：`zuoyedao`；ref：`syqcpfjudjniripzcjdq`；区域：`ap-southeast-1`，健康状态 `ACTIVE_HEALTHY`。
- `public.family_cloud_data` 和 `public.kaixin_sync_signal` 均启用 RLS；`family_cloud_data` **没有任何 RLS policy**，却存在可被匿名角色执行的 `SECURITY DEFINER` RPC。
- `family_load(p_family_code text)` 与 `family_save(p_family_code text,p_payload jsonb)`：`SECURITY DEFINER = true`；`anon`、`authenticated` 和 `PUBLIC` 均有 EXECUTE。
- 两个 RPC 当前使用固定家庭码对应的 MD5 值查找家庭记录，不校验 `auth.uid()` 是否为该家庭成员；任何持有公开前端 publishable key 和已暴露家庭码的调用者**可能读取及覆盖整份家庭数据**。
- `family_save` 的实际 SQL 是 UPSERT 直接将 `payload = excluded.payload`，仅在冲突时使 revision +1，**没有要求调用方传入 expected_revision，也没有冲突拒绝或幂等操作 ID**。因此双机并发旧快照覆盖是已经由数据库代码确认的缺陷，不只是理论风险。
- `kaixin_sync_signal` 有允许 anon/authenticated SELECT 的 RLS policy，Realtime publication `supabase_realtime` 包含该表。

## 家庭记录只读核查

| 项目 | 结果 |
| --- | --- |
| 生产家庭记录数 | 1 |
| 固定家庭空间记录数 | 1 |
| 作业数量 | 111 |
| 家庭数据 revision | 250 |
| 通知表 revision | 250 |
| 最后云端更新 | 2026-11-09 12:28:40 UTC（北京时间 20:28:40） |
| 数据库 JSON 文本大小 | 724,207 bytes（约 707 KiB） |
| pg_column_size(payload) | 732,214 bytes |

以上只统计记录、大小和版本号，未导出作业正文或照片。

## 网关请求日志（只聚合路径/HTTP 状态）

- 查询范围：2026-11-08 14:00Z 至 2026-11-09 14:00Z（24 小时）。
- `/rest/v1/rpc/family_load`：565 次，日志状态 200。
- `/rest/v1/rpc/family_save`：30 次，日志状态 200。
- `/rest/v1/kaixin_sync_signal`：155 次，日志状态 200。
- 聚焦 2026-11-09 12:30–13:30Z（北京时间 20:30–21:30）：`family_load` 4 次、`kaixin_sync_signal` 5 次、`family_save` **0 次匹配**；此时 4 次 load 的平均网关后端耗时 86.2ms，最高 180ms，版本查询平均 356.2ms，最高 1189ms。
- 注意：HTTP 200 不保证业务 JSON `ok:true`，也不证明 Safari 成功解析。云端日志也无法解释浏览器为什么没有发出 POST（JS 初始化失败、网络中断、定时器暂停、待上传逻辑阻塞、前端缓存等都可能）；不能将任一假设写成已确认根因。

## 认证与权限：发布阻断

官方 Supabase Security Advisor 同时报告：
- `anon_security_definer_function_executable`：2 个 WARN，分别指向 `family_load`、`family_save`；
- `authenticated_security_definer_function_executable`：2 个 WARN；
- `rls_enabled_no_policy`：1 个 INFO，指向 `family_cloud_data`。

文档：[Supabase 0028 匿名可执行 Security Definer](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)。

**不能直接对生产 revoke EXECUTE**：现有客户端还依赖无鉴权 RPC，直接撤权将使全家设备停止同步。必须先设计新 Auth、逐设备安全迁移、独立 staging 测试；用户批准切换后再移除旧匿名入口。

## 数据库修复顺序

1. 在隔离 Supabase staging 中复刻**去除实际家庭数据后的**数据库结构、RPC 与策略；只使用虚拟测试作业。
2. 设计实名/匿名设备身份与家长控制的设备授权（服务器校验会员资格），不再靠公开前端固定家庭码作为授权；登录或设备迁移不得让孩子数据丢失。
3. 增加服务端 CAS：写入必须带 `expected_revision`，数据库原子判断当前 revision；不一致返回 409/明确冲突，绝不覆盖已有远端修改。记录幂等操作 ID，避免超时重试重复创建。
4. 数据模型短期可保留家庭快照，但冲突时客户端必须列出未上传修改、读取远端并进行有规则的合并；长期建议把作业、事件、完成状态拆成增量更新。
5. 在 staging 证明 RPC 权限、服务端 CAS、断网恢复、两端读写和日志追溯；DB-07/DB-10/DB-12 均须 PASS。
6. 建立 API 错误率和上传超时监控。前端**本地日志**无法自动发现其他设备的故障；服务端仅采集状态码、次数、请求 ID、耗时、revision 与脱敏会话 ID。
7. 生产上线前做真正的数据库备份与恢复演练，核对所有设备待上传队列，明确迁移回滚机制。

## 当前实施状态

- [x] 生产结构、函数、执行权限、RLS、Realtime 发布只读审计
- [x] 聚合 API 日志与已存储家庭数据体积检查
- [x] GitHub PR #12 的模拟回归测试
- [ ] 生产历史请求原始故障关联（需前端设备日志；当前上线版不记录足够元数据）
- [ ] 独立 staging 数据库和真实 RPC 自动化测试
- [ ] 服务端 CAS、防重复写和家庭身份认证
- [ ] 跨设备冲突修复及真实双 iPhone 验收
- [ ] 生产监控报警部署
- [ ] 用户确认正式上线

**未通过全部阻断验收前，PR #12 必须保留 Draft，不得合并 main。**
