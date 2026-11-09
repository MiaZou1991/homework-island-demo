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

## 第二阶段真实 HTTP、安全加固与客户端验证（追加）

### A. 真实 HTTP（不使用模拟 SQL 会话）

- CI [Staging Anonymous HTTP Security Smoke #42639279836](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42639279836) 在独立 staging **真实访问 Supabase HTTPS API**。
- 四个无登录身份的接口请求均得到 HTTP 401：`family_load_v2`、`family_save_v2`、直接读取家庭表、直接读取家庭通知表。**四项 PASS**。
- 真实 Auth 配置只读探测（[CI #42639763609](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42639763609)）：匿名用户登录功能当前关闭，邮箱自动确认未开启。无法在无凭证条件下生成真实的家长/孩子 JWT；有 Auth 身份的 REST/Realtime 测试仍为 **NOT RUN**。
- 不读取或上传真实孩子资料；无匿名请求写入。

### B. 真实 staging SQL 权限加固

- 已在隔离项目实际执行迁移 `kaixin_v2_privileged_function_wrappers`（[源文件](../checks/fixtures/supabase-v2-staging-privileged-wrapper.sql)）。
- 将真正的 `SECURITY DEFINER` 数据库逻辑移到未暴露的 `kaixin_private` schema；对外 `public.family_load_v2`/`family_save_v2` 改为 `SECURITY INVOKER` 受控包装层。
- 已只读确认：两个 public 函数 `prosecdef=false`，仅 authenticated 有执行权限，anon 没有；两个 private 函数 `prosecdef=true`，同样禁止匿名；认证角色在测试 SQL 会话中仍可正确读取自身家庭版本。
- 重新运行 Supabase Security Advisor：**此前两条“公开 Security Definer 函数” WARN 已消失**。剩余两条 INFO 是刻意禁止直接访问的内部家庭/幂等表启用了 RLS 但没有直接行策略。不可把 INFO 写成新安全漏洞，也不可简单授予 anon SELECT。
- 同一套包装层已纳入独立 PostgreSQL 17 CI fixture，防止回归为 public definer。

### C. 实验性客户端 V2（未接入生产）

- [dist/v2-sync-client.js](../dist/v2-sync-client.js)：新增作业以独立操作进入 IndexedDB，使用真实 `family_load_v2`/ `family_save_v2` 的 Bearer JWT 协议、CAS 版本保护、失败后保留操作、相同操作重复确认防重、冲突时重读最新家庭数据并重试。
- [checks/v2-sync-client.cjs](../checks/v2-sync-client.cjs)：两设备冲突、断网 HTTP 503、响应丢失、未授权、重复作业 ID 保护和脱敏事件日志的模拟回归。
- [checks/v2-browser-idb.cjs](../checks/v2-browser-idb.cjs)：在真实 Chrome 中测试 IndexedDB 的操作保存、页面刷新后恢复和删除。**没有验证 Safari WebKit**，不得把 Chrome 结果视为 iPhone 实机通过。
- 这些代码仅在独立修复 PR 内，正式应用仍运行旧版家庭码接口；当前 V2 客户端只支持「新增作业」增量操作，不包括完成、编辑、日程、附件更新和真实 Auth 绑定。

### D. 新阶段未通过／上线阻断

- [ ] staging 创建受控的真实 Supabase Auth 测试用户并进行 JWT HTTP 读写、跨家庭拒绝；需仅在 staging 启用适当 Auth 测试登录方式或建立专用测试账号。
- [ ] 真实 Realtime WebSocket、手机后台恢复与真实故障注入；日志以操作 ID、revision、HTTP 状态、耗时对应，不含作业内容。
- [ ] V2 身份与客户端接入家庭正式产品；全量作业/完成/日程均不丢数据，不能只验证新增。
- [ ] 客户端与服务端集中告警、真实数据备份恢复、两个 iPhone 实机测试。
- [ ] 当前修复 PR 与最新主线仍有冲突，尚未完成整合与最终验收；**禁止上线**。

## 真实匿名 JWT 验证的新增阻断记录（2026-11-09）

- 用户在测试项目 `kaixin-island-staging` 控制台打开了 **Allow anonymous sign-ins**，但真实 GoTrue Auth 服务的 `GET /auth/v1/settings` 返回 `external.anonymous_users=false`、`disable_signup=false`。该字段已按 Supabase 实际 Auth 运行时 API 正确读取。
- 连续两次使用官方 `signInAnonymously()` 所对应的 `POST /auth/v1/signup` 请求格式均返回 **HTTP 422**，没有创建测试身份。第二次请求已包含 `gotrue_meta_security.captcha_token`。四个测试用户的真实 JWT **没有生成**，不得将此前的模拟用户 UUID 当作真实登录结果。
- 真实运行依据：[第一次 Auth CI #42644840922](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42644840922)、[第二次 Auth CI #42645104318](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42645104318)；[正确运行时设置查询 #42645297253](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42645297253)。
- 在用户确认控制台设置保存并刷新后仍保持开启之前，不再反复执行 Auth signup；必要时可以检查测试项目配置变更是否真正传播到 GoTrue 服务。**不会重启/暂停正式 Supabase 项目**。
- 已建只读测试库诊断 Notebook：[开心岛 P0｜测试库同步诊断与安全验收](https://supabase.com/dashboard/project/tgnznizqhheiwgdhvwdc/explorer/notebook/cf231dc5-4f01-47dd-af46-a0bcdcce4407)。记录 QA 数据版本、公开 RPC 权限、API HTTP 状态聚合，不读取真实孩子的作业正文；Notebook 不是自动报警。
- 此阻断不影响已完成的 PostgreSQL 和 staging SQL/CAS/RLS 测试，但 **JWT HTTP + Realtime WebSocket + 真机** 仍为 NOT RUN。
