# 开心岛 P0｜真实 Supabase Auth JWT + HTTP 数据库验收记录

日期：2026-11-09；仅限 `kaixin-island-staging`（项目 ref `tgnznizqhheiwgdhvwdc`）；生产 `zuoyedao` 未进行写入或权限修改。

**结果：PASS（真实匿名 Auth JWT + HTTP RPC + CAS + RLS / 成员隔离，23 个实际 HTTP 检查）。**

## 证据

- GitHub Actions 实际执行：[Staging REAL Anonymous Auth JWT Integration #42646427861](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42646427861)
- Git commit：`04e9aad4c49c45472351f36100955be14837d44b`
- QA 执行 runId：`f3bba974-022a-47a7-9bbe-5a59c06f774e`；runner 输出结论 `PASS REAL SUPABASE JWT+RPC+CAS+RLS INTEGRATION - STAGING ONLY`。
- 实际账号：4 个仅用于 staging 的 **Supabase Auth 匿名测试身份**，分别设为家长 A、家长 B、孩子、外部家庭。令牌只存在 CI 运行内存、没有写入仓库或测试日志。测试用 `auth.users` 记录是真实 Auth 账号，不是通过 SQL 伪造 `request.jwt.claim.sub`。
- 前一轮 HTTP 422 的根因已解除：匿名登录真实注册成功，`GET /auth/v1/user` 使用实际 JWT 对四个测试身份各返回 HTTP 200。

## 本轮 23 项真实 HTTP 检查

| 类别 | 实际 HTTP 请求与断言 | 结果 |
|---|---|---|
| 真实 Auth | 4 个真实 JWT 分别调用 `/auth/v1/user`，返回正确身份 | 4 PASS |
| 未登录 | 不带 JWT 调用 `family_load_v2`：HTTP 401 | PASS |
| 外部家庭 | 使用真实外部用户 JWT 读取本家庭：业务 `unauthorized`，没有返回 payload | PASS |
| 家庭读取 | 家长 A 与孩子各能读取本家庭数据；版本号一致 | 2 PASS |
| 家长写入 | 家长 A 带 base revision 发布一条合成作业，数据库确认版本 +1 | PASS |
| 跨设备读取 | 家长 B 的独立 JWT 读回同一合成作业与版本 | PASS |
| 幂等重试 | 同 `operation_id` 重放：`duplicate=true` 且不重复增加版本 | PASS |
| 误复用 ID | 用同 `operation_id` 提交不同 payload：`idempotency_key_reused` | PASS |
| 版本冲突 | 家长 B 以旧 `expected_revision` 保存：`conflict`，旧快照不覆盖 | PASS |
| 孩子权限 | 孩子 JWT 试图覆盖完整家庭快照：被业务拒绝 | PASS |
| 越权写入 | 外部家庭成员 JWT 试图写入本家庭：被业务拒绝 | PASS |
| 通知一致 | 家长 B 读取通知 revision，与家庭数据 revision 一致 | 2 PASS（含读取基线） |
| 通知 RLS | 外部成员读取本家庭的通知表，得到空结果 | PASS |
| 同时写入 | 家长 A / B 各以相同旧版本并发写入，一方成功、另一方 conflict | 2 PASS |
| 冲突读回 | 读取冲突后的最新家庭记录 | PASS |
| 冲突合并 | 明确读取最新版本后，把失败方的合成作业合并写入 | PASS |
| 合并核对 | 另一身份重新读取，双方两个并发作业 ID 都存在 | PASS |

**注意：** 上述 RLS 业务拒绝有些返回 HTTP 200 搭配 `ok:false`。客户端必须同时检查 HTTP 及 RPC 业务结果，不得把 200 当保存成功。

## 测试库最终只读核验

- 合成家庭 A 的 `family_cloud_data_v2.revision=7`，`kaixin_sync_signal_v2.revision=7`。
- 合成家庭 A 共 7 条虚拟作业记录、6 条成功操作回执；家庭 B 仍是 revision 1、0 作业。
- 测试只产生虚拟 QA 数据，没有任何真实作业正文或孩子信息。

## 本次真正解除的阻断

- [x] 匿名注册功能从服务端实际可用
- [x] 真实 Auth 生成 JWT 而不是 SQL 模拟 claims
- [x] 真实登录身份的 HTTP 读取/写入、跨家庭拒绝
- [x] 真实 HTTP 并发冲突、幂等防重复、读取合并与核对
- [x] 通知表 HTTP 读取、版本一致与成员权限

## 尚未解除的发布阻断

- [ ] **真实 Realtime WebSocket** `postgres_changes` 收到并过滤实际版本事件；HTTP 读取通知表不等于 WebSocket 已验收。
- [ ] 真实网络中断、503/timeout、Safari 后台恢复，客户端 persistent outbox 的完整端到端恢复。
- [ ] 家长账号安全绑定/认领与孩子的持久身份机制；测试用匿名用户不可直接当作正式家庭身份方案。
- [ ] V2 客户端全量接入：当前 `dist/v2-sync-client.js` 仅覆盖新增作业，未完成编辑/完成/日程/附件变更的可靠合并。
- [ ] 真实 iPhone 双设备 10 轮验收、生产数据备份/迁移/回滚。
- [ ] `main` 与 P0 Draft PR 的合并冲突仍待解决，并需重新通过 CI。
- [ ] 服务端集中日志/主动告警尚未完成。

**本报告记录测试成功，不代表正式开心岛已升级同步协议。生产数据库和正式页面未修改；禁止提前合并 PR 或上线。**
