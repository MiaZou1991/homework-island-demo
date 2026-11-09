# KAIXIN 单家庭 V2｜家长登录与孩子设备绑定测试页

> 开发日期 2026-11-10。**这是未上线的独立测试页面**，只连接 `kaixin-island-staging`；不得混入当前生产儿童端、家长端，也不得当成真实家庭迁移入口。

## 已开发

- `dist/kaixin-staging-onboarding.html`：单 KAIXIN 家庭独立测试页，没有家庭注册/切换、多孩子选择。
- `dist/kaixin-staging-onboarding-flow.js`：基于 Supabase Auth SDK 的家长邮箱注册及登录、未授权账号等待核实、孩子匿名临时身份、一次性设备配对、查看/撤销孩子设备；**实际授权角色只能来自服务端 `kaixin_identity` RPC，不读用户可编辑的 metadata 来授权**。
- `dist/kaixin-staging-onboarding-ui.js`：仅连接 `tgnznizqhheiwgdhvwdc` staging 项目；单独使用 `kaixin_staging_auth_preview_v1` Auth session key；**不读取或迁移** `homework_island_*` 生产数据、不调用旧版 `family_save`。
- `checks/fixtures/kaixin-staging-child-device-list.sql`：只在 staging 部署的家长设备列表 RPC `kaixin_list_child_devices`，不接受 `family_id`，只返回被授权家长所属 KAIXIN 家庭的孩子设备 UUID。暴露层为 SECURITY INVOKER，匿名不可执行，跨家庭只能得到 `unauthorized`。
- 新增核心操作测试和 Chrome 390px 界面交互测试；无生产请求、无真实 JWT 的 UI 测试不能替代实际接口验收。

## 家长需要做什么

**目前只需准备，无需立刻提供密码或操作正式数据库。** 家长邮箱需要长期能接收 Supabase 验证邮件，建议使用你自己控制的常用邮箱或专用家长邮箱。

**独立测试页尚未公开部署，当前仍是 PR 内的开发产物。** 出于账号安全考虑，只有把页面部署到已获准的 HTTPS 测试地址、在 Supabase **staging** 的 Authentication → URL Configuration 中将同一地址加入 Redirect URLs 后，才能使用邮箱注册。普通 HTTP/本地文件预览明确禁止发起注册，避免邮件点击后跳到无法访问的 localhost。

待独立测试页安全可访问后：

1. 在**独立测试页**输入自己的邮箱和自行设置的强密码，创建测试家长账号。密码只填写在 HTTPS 网页中，**绝对不要通过聊天发送**。
2. 查收邮箱验证邮件，完成验证。若邮件未收到，需要检查 staging 的 Auth 发信设置和限额；**不要因此关闭正式环境的邮箱验证**。
3. 回到测试页登录。登录后如果显示“等待管理员授权”，把页面显示的**测试账号用户 ID（UUID）**发给我即可；不需要发送邮箱、密码、验证码、JWT、配对码。只有在核实测试账号已经完成邮箱验证并明确确认属于 KAIXIN 家长后，才在独立测试库授予其家长权限。
4. 家长登录后点击“生成配对码”。在另一台手机上用独立测试页创建孩子临时身份，输入 10 分钟有效的一次性配对码。**同一台手机不要把已登录的家长会话切成孩子会话**。
5. 测试家长能查看孩子已绑定设备、撤销设备；孩子端被撤销后无法继续读取测试家庭数据。

> 当前配对码是 64 字符的测试机制，**不是最终儿童界面**。正式 UI 需延续批准的开心岛弹窗、字体与图标，并优化为无需孩子手动输入长字符串的安全扫码/配对方式。不得将配对码放入 URL 或分析日志。

## 生产数据及双手机安全约束

- 只有一个 KAIXIN 家庭、一个孩子，不建设跨家庭可用的通用注册系统。
- 正式网站仍使用旧同步逻辑，**没有上线新登录、设备绑定、V2 同步或迁移**。
- 两台 iPhone 目前**不要**删除 Safari 网站数据、清缓存、退出旧开心岛，也不要删除本地作业数据。
- 等整套 V2、附件和历史数据迁移脚本完成后，再分别导出两台手机的本地备份，记录同步 pending/云端 revision，用户明确批准生产迁移后才切换。
- 双手机最终验收要覆盖 10 轮：新增、编辑、完成/撤销、删除、日程、课程物品提示、断网、前后台、网络切换、重启，以及错误日志。
- 测试时不应输入孩子真实作业、姓名、图片或附件。
- 用户未确认发布前，不得合并本 PR 或更改生产 Supabase。

## 本次实际验证

- staging migration `kaixin_staging_child_device_list_v1`：**执行成功**。
- 隔离 SQL 角色测试：QA 家长读取当前已授权孩子设备列表，其他家庭身份获得 `unauthorized`；公开函数 `prosecdef=false`，`anon EXECUTE=false`，`authenticated EXECUTE=true`。
- 核心登录/绑定状态测试：由 GitHub CI 执行；以 Actions 最终结果为准。
- 独立 Chrome 390px 页面交互测试：由 GitHub CI 执行；测试页面模拟服务器应答，**不等于实际邮箱收信或真实 JWT HTTP 验收**。

## 未完成的上线阻断

- 可访问的独立 HTTPS 测试部署与邮箱验证全流程真机；
- 真实邮箱 Auth 验证后由管理员绑定 KAIXIN 已存在的生产家庭（必须核实家长归属，不能自认领）；
- 孩子设备真正可长期保持身份，Safari 清理后的重新绑定体验；
- 操作级业务合并 [PR #23](https://github.com/MiaZou1991/homework-island-demo/pull/23) 与 V2 同步 [PR #12](https://github.com/MiaZou1991/homework-island-demo/pull/12) 安全整合；
- 家长、孩子可允许的业务操作区分，重连补拉、实时就绪、真正离线 iPhone 实测；
- 正式生产备份、真实家庭数据无损迁移、冲突仲裁与正式发布。

> 禁止合并 main 直发生产；此页面只属于独立 Draft PR。
