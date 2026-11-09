# 开心岛｜KAIXIN 单家庭身份与孩子设备绑定验收

状态：**隔离 staging 的 SQL / 真实 JWT / HTTP 19 项测试通过；尚未接入正式页面和生产数据库。**

## 1. 唯一家庭约束（用户确认）

开心岛只服务 **KAIXIN** 这一个家庭和一个孩子。后续所有产品与开发：

- 不做家庭注册、家庭切换、多个家庭空间或多孩子档案。
- 家长通过受保护入口管理作业、课表和小岛日程；可以有多位经过明确验证的家长，但都管理同一个 KAIXIN 家庭。
- 孩子进入儿童端后无需选择家庭或孩子档案；新设备第一次使用时，通过家长发起的临时配对绑定。每个孩子设备有单独可撤销的登录会话，但它们指向**同一个孩子的数据**，不会形成多孩子账户。
- `KAIXIN` 是可公开的家庭名称，不是登录口令，也不能仅凭输入它就读取或覆盖云端数据。
- 不增课程/携带物品打卡、不加积分，保留已确认 Logo、Tab、弹窗与素材。

## 2. 本轮实际完成

开发分支：`feat/kaixin-fixed-household-binding-20261110`；初始正式主线 `main@93709da676905d52d98a0697e830556d30c5d9aa`。

- `checks/fixtures/kaixin-fixed-household-pairing-staging.sql`：**只面向现有隔离 staging** 的单 KAIXIN 家庭身份绑定数据库函数。服务端固定测试家庭 UUID；面向浏览器的 RPC 不接受任何家庭 ID/家庭码参数，不能切换家庭。
- 内部逻辑处于不暴露的 `kaixin_private` schema，以 SECURITY DEFINER 执行严格成员校验；公开 RPC 使用 SECURITY INVOKER 包装，只赋予已登录角色执行权限。
- 家长创建孩子设备配对码时：两次随机 UUID 拼接成 64 位十六进制临时码；数据库仅保存其 SHA-256 哈希；有效期十分钟；生成新码时撤销旧码；兑换后不能再次使用。
- 孩子设备持有自己的 Supabase Auth 登录会话，兑换临时码后仅获得 `child` 角色；无法成为家长、生成配对码或撤销家长。家长可以撤销具体孩子设备，撤销后即便旧会话仍在，也无法再读取 KAIXIN 数据。
- `dist/kaixin-family-binding.js`：未被生产页面加载的绑定接口模块。只提供 `whoAmI`、`createChildInvite`、`redeemChildInvite`、`revokeChildDevice`；没有创建家庭、切换家庭等能力；调用方的 Supabase Auth 会话由正式 SDK 管理，不自行存储 access token。
- `checks/kaixin-fixed-household-client.cjs`：验证客户端角色保护、单家庭 API、无 token 日志、服务器失败响应和设备撤销。

## 3. 测试记录与发现的问题

真实 Supabase 测试库：`kaixin-island-staging`（`tgnznizqhheiwgdhvwdc`）。测试家庭 UUID 和用户均为虚构，不复制任何真实孩子的数据。

- [真实 JWT / HTTP 19 项通过的 GitHub Actions #42655760321](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42655760321)。四个**真实**测试身份通过 Supabase Auth 注册并分别取得 JWT：虚拟家长、孩子、外部家庭成员、第二孩子设备。测试使用实际 HTTPS RPC。
- 验证包括匿名 401、外部家庭拒绝、未绑定孩子拒绝、孩子禁止创建配对码、家长发码、重复发码撤销旧码、旧码不可用、猜测码无效、外部身份不可跨家庭加入、孩子成功绑定、旧码无法绑定第二设备、孩子不可撤销家长、家长撤销孩子设备后会话失效、被撤销孩子无法读取家庭数据。
- **实际发现并修复一个漏洞**：初始版本在创建新码时写入了撤销标记，但兑换函数没有检查 `revoked_at IS NULL`，导致旧码仍可能兑换。修复脚本为 `checks/fixtures/kaixin-fixed-household-invite-revoke-fix.sql`，测试库已执行；修复后全部 19 项真实 HTTP 验收通过。
- [单家庭 SQL 回滚测试](../checks/fixtures/kaixin-fixed-household-contract.sql) 也在 staging 实际运行成功，使用 `BEGIN ... ROLLBACK`，验证函数权限、同家庭绑定、旧码撤销、重用、外部家庭隔离和父母撤销设备；该 SQL 角色会话模拟与实际 JWT 测试严格区分。
- 测试数据库权限检查：四个公开 RPC 均为 SECURITY INVOKER，匿名角色无 EXECUTE；真正的 SECURITY DEFINER 函数保存在不可直接通过 API 调用的私有 schema。配对码表不向普通登录角色开放 SELECT。

## 4. 仍然必须完成的生产交付前提

1. **可恢复的家长身份**：真正的家长应通过验证邮箱等长期可恢复的 Supabase Auth 方法登录，由管理员核实既有家庭归属后绑定。当前 QA 家长为仅测试库授权的匿名 Auth 身份，不能照搬到生产或开放“任意自认家长”。
2. **孩子入口 UI**：只有首次绑定新设备时显示输入配对码，成功后自动进入已确认的儿童端；家长配对/撤销界面使用已批准的木牌弹窗，不额外增加家庭切换、孩子管理平台。
3. **完整 V2 操作队列**：与 [PR #23](https://github.com/MiaZou1991/homework-island-demo/pull/23) 的作业/日程/课程操作级合并内核及 [PR #12](https://github.com/MiaZou1991/homework-island-demo/pull/12) 的 V2 Auth/CAS/Realtime/恢复能力安全整合。特别需要处理既有积分、成长与归档历史字段，不能只同步业务记录而破坏它们。
4. **生产历史数据保护**：必须先导出生产数据库与每台手机本地备份，核对旧 `KAIXIN` 记录的 revision 和所有 pending 数据。将生产记录绑定到已核实的单家庭后才能迁移；不能复用 staging 虚拟 UUID，也不能依赖公开的家庭码认领生产数据。
5. **全量验收**：真实父母稳定登录、孩子设备绑定和撤销、作业增删改与完成、日程、课程/物件提醒、断网/前后台、双 iPhone 10 轮，以及服务器日志和告警。主线存在其他 UI 更新时必须基于最新 main 重新集成。
6. **Security Advisor 提示**：staging 为进行测试开启匿名注册，对允许已登录的匿名 Auth 用户读取“自己的成员资格”的 RLS 策略存在警告，需要结合孩子设备匿名会话安全模型审查；仅作为测试设计，不代表已完成生产安全审查。

## 5. 不变项与回退

本次没有任何 production Supabase 写入、身份结构变更、历史作业修改或正式页面替换。撤销测试功能可只回滚 staging 专用 SQL；真实家庭数据不涉及。PR 保持 Draft，必须用户明确批准并完成全部迁移验收后才可并入 main 自动发布。
