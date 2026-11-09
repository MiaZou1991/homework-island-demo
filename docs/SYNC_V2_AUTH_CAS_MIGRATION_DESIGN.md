# 开心岛｜同步协议 V2：身份、并发控制与无损迁移设计（待 staging 证实）

**状态：设计方案，不是已运行的生产迁移。** 修复 PR #12 不得因前端日志改好而直接合并；真实数据库 V2 合约及家庭身份机制验证通过前不对生产写入。

## 1. 核实的现状（生产只读）

生产 `family_save(p_family_code,p_payload)` 使用 `insert...on conflict do update set payload = excluded.payload, revision = revision+1`，**没有 expected_revision**。已存在的 `kaixin_sync_signal_changed` 触发器在 `family_cloud_data` INSERT/UPDATE 时调用 `kaixin_emit_sync_signal()`，无需重新创造同名触发器。现有 `family_load`/`family_save` 是公开可执行的 `SECURITY DEFINER` 函数，并未对当前调用者的 `auth.uid()` 授权。RLS 开启不等于这些 Definer RPC 受 RLS 限制。

## 2. 必须具备的新契约

### 家庭成员访问

- 采用 Supabase Auth 会话，让用户身份在服务器可验证。由家长受保护地建立/认领现有家庭；孩子端可通过一次性、有效期有限、用后即失效的邀请凭据加入，不在浏览器硬编码共享家庭秘密。
- 在数据库维护 `family_members`：家庭 ID、Auth 用户 ID、角色（parent/child）、加入/撤销时间；对客户端不可任意写。服务器执行 RPC 时验证 `auth.uid()` 属于该家庭且有适当权限，拒绝不存在、已撤销或无权身份。
- 既有家庭仅可由**事先验证的管理员**做一次性归属绑定；不能让任意用户输入公共家庭码就认领整份孩子数据。
- 家长的写入权限、孩子提交完成与修改个人日程权限应分开；单孩子并不等于所有设备均可改家庭全部设置。
- 将历史 `family_load/family_save` 匿名执行权限在所有设备迁移完成后撤销。先撤销会让当前客户端全部同步失败，不允许在新客户端未完成时贸然执行。
- 将高权限内部操作放在不暴露的 schema，并采用受控 definer/明确 search_path、身份检查和最小权限，公开 RPC 不允许 `PUBLIC EXECUTE`。

### 并发更新

推荐新 RPC：
- `family_load_v2(family_id)` → `{ok, payload, revision, updated_at}`，必须鉴权。
- `family_save_v2(family_id, payload, expected_revision, operation_id)`：
  1. 校验认证与家庭成员权限，拒绝匿名调用。
  2. 使用数据库行锁锁住这一家庭的现有记录。
  3. 对 `(family_id,operation_id)` 做已完成写入检查，重复提交直接返回原结果，不重新加版本号。
  4. 校验 `expected_revision = 当前 revision`；不一致返回 **conflict**，包含最新版本号，**不修改 payload**。
  5. 校验 payload JSON 结构、大小上限和必要字段，并执行授权允许的业务动作。
  6. 原子地写入新 payload 与 `revision+1`、操作结果去重记录；现有触发器更新通知版本。
- 已知空家庭创建时，使用独立、安全的初始化事务，不能让未授权用户按家庭码创建/覆盖。
- 服务器应给应用层返回明确的 `conflict / unauthorized / temporarily_unavailable` 分类，并在可行时用合适 HTTP 状态；不得把业务错误 JSON 的 HTTP 200 当作成功。
- 记录 operation_id、revision、执行耗时、拒绝原因分类、脱敏的调用方会话 ID；日志中无孩子作业正文/附件/密钥。

### 客户端改动缓冲区

- 只保留一个 `local-v1` 标记不足以安全解决双设备并发，至少应保存本地修改的**操作记录**、基础服务端版本和操作 ID（可使用 IndexedDB，保留本机加密/敏感数据保护）。
- 初次从服务器读取成功时更新 `base_revision`。本机修改先进入 durable outbox，再调用 `family_save_v2`。
- 成功返回 revision 后按 operation_id 标记提交；断网/超时保持原操作等待重试；重复 HTTP 请求不能导致重复作业。
- 遇到 `conflict`：先读取新版本，按稳定作业 ID 合并非冲突修改；同一条作业字段冲突时保留双方版本供家长处理，绝不自动删除其中一边。
- 手机从后台恢复时至少做一次 revision 检查，断线重连优先确认自身待提交操作；不要因为 WebSocket 看起来在线就永远跳过校对。
- 未知本机基础版本的历史待上传快照：**禁止盲覆盖远端**。先导出备份并用只读对比/用户确认的安全合并路径恢复；要专门覆盖旧设备迁移测试。

## 3. 安全数据库 staging 验收（禁止生产写入测试）

严格复制结构/函数/触发器到单独 Supabase staging，**不复制实际家庭 payload**；使用人工合成的课程、作业、物件。每个测试由两个独立 Auth 客户端调用。

| 编号 | 测试 | 服务器断言 |
| --- | --- | --- |
| AUTH-01 | 未登录调用 `family_load_v2`/`family_save_v2` | 拒绝 |
| AUTH-02 | 家庭 B 用户访问家庭 A | 拒绝且无数据泄露 |
| AUTH-03 | 成员权限被撤销后使用旧会话 | 拒绝 |
| AUTH-04 | 孩子尝试修改家长管理字段 | 拒绝 |
| CAS-01 | A 在 revision 10 写入，expected=10 | 成功，返回 revision 11 |
| CAS-02 | B 用过时 expected=10 写入 | 冲突拒绝，revision 和 payload 保持 11 |
| CAS-03 | A 重放同一 operation_id | 返回原结果，revision 保持 11 |
| CAS-04 | A、B 同时更新不同作业 | 不丢任一修改，或 B 得到明确冲突 |
| REC-01 | 写入后网络响应丢失再重试 | 去重成功，不产生重复作业 |
| REC-02 | 离线 10 分钟、Safari 杀进程后打开 | 待提交操作恢复且最终一致 |
| SIG-01 | revision 变化 | 数据库触发器令实时通知版本跟随 |
| SEC-01 | 旧匿名 RPC 在迁移完成后 | 不可执行 |
| PRIV-01 | 抓取诊断日志和数据库监控 | 不含作业正文、图片、家庭口令 |

**认证/授权、CAS、幂等、断网恢复四类必过，不得以 UI 能展示替代。**

## 4. 生产切换顺序与回退

1. 在 staging 执行 DDL 和真实 RPC 合约测试，审阅 SQL、索引、函数 search_path、RLS，跑 Supabase Security Advisor；全部报告归档。
2. 导出**数据库可恢复备份**并验证恢复操作；两台现有手机分别导出本地数据备份；记录当前 revision 与未上传操作。
3. 在不影响旧客户端的前提下增加 V2 内部结构和函数（向后兼容阶段）；设备完成身份绑定。
4. 新客户端只读拉取验证后，安全迁移待上传修改。旧版数据只能通过可审计的合并流程进入新版本。
5. 两台 iPhone 完成 10 轮任务发布、完成、修改、锁屏恢复与并发测试，且能找到数据库 revision 与操作 ID 的对应日志。
6. 家庭所有设备使用 V2 且无遗留 pending 后，停止旧客户端写入，再撤销旧匿名函数入口；重新运行安全顾问，必须没有公开家庭读取/修改能力。
7. 回退只回滚应用版本或按批准的迁移预案执行，**不能回滚数据库到更旧的数据快照**以免丢失后续真实作业。

## 5. 明确的未完成事项

- 本文不是已测试 SQL，也不是生产 DDL；当前没有独立 staging 环境。
- 当前 PR #12 只包含客户端日志/恢复及模拟测试；**没有后端 V2 鉴权、CAS、幂等的实现**。
- Supabase staging 分支/新项目可能产生额外费用；必须在确认成本和用户同意后才能创建。
- 还没有来自两台真实 iPhone 的验收证据，正式上线继续阻断。
