# 开心岛 P0｜Realtime WebSocket 与 V2 故障恢复实际验收

测试日期：2026-11-09。环境仅限独立 Supabase 测试库 `kaixin-island-staging`（ref `tgnznizqhheiwgdhvwdc`）。所有作业为虚拟 QA 数据；未写入生产库 `zuoyedao`。

## 一、WebSocket 实时通知（真实网络、真实 JWT）

| 运行 | 结果 | 观察 |
| --- | --- | --- |
| [第一次 #42647733797](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42647733797) | **FAIL** | 家长 B / 孩子 WebSocket phx_join 成功，测试作业落库并使数据库 revision=11，但没有收到实时通知。测试程序原先误在断言之前打印 PASS，目前已修正。 |
| [第二次 #42648369562](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42648369562) | **PASS** | 延迟等待后家长 B、孩子均收到 revision 15 的 `postgres_changes` 事件；外部家庭没有收到。单靠固定等待不是健壮的上线策略。 |
| [第三次 #42648972841](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42648972841) | **PASS** | 改为等待 Supabase `system` 事件明确确认 `postgres_changes` 可用，不再采用固定延时；成员 B、孩子均收到 revision 19，外部家庭无泄露；完整耗时约 4.6 秒。 |

实际订阅对象：`public.kaixin_sync_signal_v2`，过滤测试家庭 UUID；真实四个 Supabase Auth 测试身份；测试只记录 join 状态、收到的版本号、事件类别/次数和耗时，不记录 JWT 与作业数据。

第三次真实输出（数据仅为元信息）：

- `cdcSystemReady:true`；
- 家长 B 的事件计数：`phx_reply=1, system=1, postgres_changes=1`；
- 孩子的事件计数同上；
- 外部家庭：`phx_reply=1, system=1, postgres_changes=0`；
- `expectedRevision=19`，`gotMember=true`，`gotChild=true`，`outsiderLeak=false`。

Supabase 官方文档指出，WebSocket 已订阅和数据库变更监听真正就绪之间可能有时间间隔，建议使用 `system` 消息的 `extension=postgres_changes`、`status=ok` 确认。参考：[官方排查文档](https://supabase.com/kb/troubleshooting/realtime-postgres-changes-troubleshooting)、[Realtime 协议](https://supabase.com/docs/guides/realtime/protocol)。

## 二、真实 Supabase 数据库 + 受控网络错误恢复

执行证据：[Staging Auth/JWT/WebSocket/V2 Recovery CI #42648972841](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42648972841)。

测试代码：[checks/staging-v2-recovery.cjs](../checks/staging-v2-recovery.cjs)、[dist/v2-sync-client.js](../dist/v2-sync-client.js)。

| 场景 | 如何测试 | 失败后 | 恢复后 |
| --- | --- | --- | --- |
| HTTP 503 | 测试代理仅对第一次 `family_save_v2` 人为返回 HTTP 503，不改动服务端真实状态 | IndexedDB 接口的替代持久队列仍保留待上传操作 | 再次用真实 JWT / RPC 提交，真实 DB revision=20，作业仅出现一次 |
| 超时 | 第一次保存时模拟 `AbortError`，不发起实际保存请求 | 待上传操作仍在队列 | 重建 V2 客户端、恢复真实 HTTP 后作业仅出现一次，revision=21 |
| 写入成功但回执丢失 | 实际调用 `family_save_v2` 并确认服务端成功后，故意让测试代理丢失响应 | 客户端无法确定保存结果，操作仍待提交 | 重建客户端、读取服务端发现相同作业 ID 后清除队列，**没有重复提交**，revision=22 |

最后通过真实数据库只读 SQL 检查：`family_cloud_data_v2.revision=22`，`kaixin_sync_signal_v2.revision=22`，实际测试作业记录数 22。测试工具同时断言待上传日志中不包含作业文本和 JWT。

**范围说明**：故障是受控模拟，服务端读写和最终记录校对是真实 Supabase API；并不是实际把 Supabase 服务器打到 503，也不是 iPhone 断网重启试验。测试队列使用可重建客户端共享的存储接口，与真实浏览器 IndexedDB 的持久性验收分开。

## 三、仍需继续的发布门槛

- [x] 真实数据库写入、CAS 并发冲突、重复提交去重、真实 Auth JWT/RLS 权限。
- [x] 真实 WebSocket Realtime `postgres_changes` 成员收取与外部家庭隔离，且等待 `system` 就绪后再发布测试修改。
- [x] 真实数据库下的 503、超时、丢失回执恢复（控制传输故障）。
- [x] **WebKit 移动仿真**：在独立 GitHub Actions Ubuntu WebKit 中实际验证 V2 IndexedDB 待上传操作在页面 reload 后保留、确认后清除；[CI #42649768943](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42649768943) 的 WebKit Job 返回 PASS。浏览器引擎仿真不等于 iOS 真机。
- [ ] 两台**实体 iPhone**的 Safari 后台、锁屏、蜂窝/Wi-Fi 切换、失败重试，仍需实机验收。
- [ ] 正式产品 V2 身份/家长认领与数据迁移；当前实验客户端只支持新增作业，尚未覆盖编辑、完成、课程、日程及附件。
- [ ] 真正的客户端联动刷新、服务器集中日志和自动故障报警；尤其需要记录来自手机的分阶段上传、版本、失败次数和耗时，但不记孩子内容。
- [ ] 当前 PR #12 与 main 仍存在冲突；需安全处理、重新测试，并在用户批准后才可上线。

**结论：第三轮 Realtime WebSocket 与 V2 恢复验收在隔离测试项目中通过，但正式开心岛仍使用旧同步协议，生产数据没有改变。**
