# 开心岛 P0｜独立 Supabase 测试库真实数据库验收（2026-11-09）

> 测试项目：`kaixin-island-staging`（project ref：`tgnznizqhheiwgdhvwdc`；ap-southeast-1）
> 创建前实时费用报价：**$0/月**；根据用户授权创建独立项目。正式项目 `syqcpfjudjniripzcjdq` 没有执行生产写入。
> 状态：**数据库 SQL/RLS/CAS 集成测试通过；实际 Auth HTTP JWT、Realtime WebSocket、网络故障、双实体 iPhone 仍未验收；禁止把本报告当作上线批准。**

## 本次实际部署到 staging（仅 staging）

1. Migration `kaixin_v2_staging_contract_initial`：建立 V2 家庭数据、成员、幂等回执、通知表及两个 RPC（`family_load_v2`、`family_save_v2`），使用真实 Supabase `auth.uid()`。源脚本 [supabase-v2-staging-schema.sql](../checks/fixtures/supabase-v2-staging-schema.sql)。
2. Migration `kaixin_v2_member_scoped_realtime`：成员自读策略、仅成员可看本家庭通知的 RLS 策略、将 `kaixin_sync_signal_v2` 加入 `supabase_realtime`。源脚本 [supabase-v2-staging-realtime.sql](../checks/fixtures/supabase-v2-staging-realtime.sql)。
3. 数据全部为人工合成的两个测试家庭（固定测试 UUID）、4 名模拟成员及测试作业，不从生产复制任何内容。

## 真实 Supabase SQL 执行结果

| 编号 | 验证内容 | 实际结果 | 状态 |
| --- | --- | --- | --- |
| SDB-01 | 新数据库及 schema | 项目 ACTIVE_HEALTHY；两次 staging migration 均返回 success | PASS |
| SDB-02 | RPC 授权 GRANT | `anon_exec=false`、`authenticated_exec=true`、`public_exec=false` | PASS |
| SDB-03 | 匿名实际执行两个 RPC | `family_load_v2` 和 `family_save_v2` 均抛出 SQLSTATE 42501：permission denied | PASS |
| SDB-04 | 家长 A 读取自身家庭 | 读取到合成测试作业及 revision 1 | PASS |
| SDB-05 | 家长 A 读取另一家庭 | `{ok:false,error:"unauthorized"}`，未返回家庭 payload | PASS |
| SDB-06 | 未授权家庭 B 成员读取 A 家庭 | `unauthorized`，未返回 payload | PASS |
| SDB-07 | 家长 A 首次保存（expected_revision=1） | `{ok:true,revision:2,duplicate:false}` | PASS |
| SDB-08 | 重放相同 operation_id 和 payload | `{ok:true,revision:2,duplicate:true}`，没有重复增加版本号 | PASS |
| SDB-09 | 家长 B 基于过期 revision=1 保存 | `{ok:false,error:"conflict",revision:2}`，原作业保留 | PASS |
| SDB-10 | 孩子试图覆盖全量家庭数据 | `unauthorized` | PASS |
| SDB-11 | 两台独立 SQL 会话同时以 revision=2 写入 | A 成功写入 revision 3；B 得到 conflict revision 3，库中未发生盲覆盖 | PASS |
| SDB-12 | 失败方获取最新版本后合并 | revision 4；两次并发修改的测试作业 ID 均保留 | PASS（手动合并；**客户端自动合并尚未开发**） |
| SDB-13 | 写入触发通知 | `family_cloud_data_v2.revision=4`，`kaixin_sync_signal_v2.revision=4`，匹配 | PASS |
| SDB-14 | 家庭通知 RLS | 家长、孩子各能看到所属家庭 1 行通知；外部家庭成员看到 0 行 | PASS |
| SDB-15 | Realtime publication 注册 | `supabase_realtime` 包含 `kaixin_sync_signal_v2` | PASS（**不等于 WebSocket 已测试**） |

**测试手法说明：**通过 Supabase 的真实 Postgres 执行 SQL；使用 `SET LOCAL ROLE authenticated` 与 `set_config('request.jwt.claim.sub', synthetic-user-uuid, true)` 在独立 SQL 会话模拟 JWT 中的用户身份；匿名测试使用 `SET LOCAL ROLE anon`。这验证了数据库逻辑、权限和 RLS，但**不是**浏览器向 `/auth/v1` 实际登录获取 JWT、以该 JWT 发起 REST/Realtime 请求的端到端测试。所有设备身份及测试 payload 仅为合成数据。

## 安全顾问剩余提示及解释

- 仍有 `authenticated_security_definer_function_executable` 两条 WARN（`family_load_v2` 和 `family_save_v2`）。两函数已检查 membership 和 `auth.uid()`，匿名执行已实际拒绝；但高权限函数仍需专门审查 SQL search_path、角色约束与恶意输入，不能将 WARN 忽略。
- 仍有 `rls_enabled_no_policy` 两条 INFO：`family_cloud_data_v2`、`family_operation_receipts_v2`。这两个表目前刻意不向浏览器开放，只能通过受控 RPC；所以没有直接客户端 SELECT policy。需继续验证真实 Auth 访问模型。
- Supabase 参考：[Authenticated SECURITY DEFINER 提示](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)，[无 RLS policy 的提示](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)。

## 上线阻断事项（必须继续）

- [ ] STG-HTTP：创建真实 Supabase Auth 测试用户，使用真实 JWT 对 REST RPC 验证 200/401/403、业务 error 响应映射、跨家庭读取和写入。
- [ ] STG-WS：用两个已登录客户端订阅 `postgres_changes`，验证通知只到本家庭，前后台恢复能主动检查 revision。
- [ ] STG-NET：通过 503、超时、断网、进程终止等故障注入，验证持久待提交操作、幂等重试和最终一致性；必须有日志与请求 ID 证据。
- [ ] APP-V2：当前前端仍调用旧匿名 `family_load`/`family_save`，尚未调用已验证的 V2 RPC。需要实现家长安全认领、孩子设备加入及离线 outbox、冲突合并。
- [ ] LOGS：客户端脱敏日志已经在 PR #12；服务端主动报警、HTTP 错误比例、上传重试告警仍未部署。
- [ ] SECURITY：完成 V2 函数越权专项检查，确认最终权限策略后安全迁移。生产旧匿名 RPC 不得在旧设备迁移前直接 revoke。
- [ ] PROD：生产库备份恢复演练、两个实体 iPhone 10 轮可见性/断网恢复、PR 解决合并冲突、用户批准合并。

## 结论

真实 Supabase 测试库**已经证明新的服务端数据库设计具备防盲覆盖、权限限制及版本一致性**。但生产端沿用旧接口，客户端 V2 尚未接入；不能宣称两台手机的历史同步故障已经修复。当前 PR #12 必须保留 Draft，正式生产数据不能更改。
