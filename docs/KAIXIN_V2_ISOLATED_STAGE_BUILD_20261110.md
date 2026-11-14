# KAIXIN V2｜完整生产页面隔离测试包（2026-11-10）

## 交付定位

**只服务 KAIXIN 一个家庭和一个孩子。** 本工作在独立分支中复用最新 `main@053f8f803ca0fd7abaf30e0eb05c3bb7d4a8e658` 的完整儿童端和家长端 HTML、CSS、高清素材、已批准的 Logo/Tab/木牌弹窗。不是用简化的模拟卡片替代现有页面。

**重点：构建出完整、隔离的测试网站文件，而不是直接在正式 GitHub Pages 上部署。** 目前主仓库 GitHub Pages 被 `main` 占用，直接用其他分支调用 Pages deploy 会**覆盖生产网站**，因此禁止这样做。可用 GitHub Actions artifact 下载整套测试 ZIP，再部署到**独立免费 HTTPS 静态托管**。外部 HTTPS 部署尚未完成，因而目前不能邀请真实家庭注册。

## 本次做了什么

1. `checks/build-kaixin-staging.cjs`：由原 `dist/` 完整复制图片、字体、CSS 和家长／孩子页面到 `build/kaixin-staging/`。保留页面主视觉和交互 DOM，只在测试包内替换同步/权限脚本和标题；
2. 禁止将原 `cloud-sync.js`、`realtime-signal.js`、`family-access.js` 复制进成品，避免仍靠公开 `KAIXIN` 家庭码/算术题做访问控制或连接生产数据库；
3. 拷入已在 Draft PR #31 完成的 staging 邮箱密码登录与孩子首次设备配对入口及脚本；首页提供完整家长/孩子页面链接；
4. `dist/kaixin-stage-auth.js`：同一 Supabase staging Auth 会话，服务器 `kaixin_identity` 验证身份。家长必须是 parent、儿童必须是 child；未授权时覆盖完整页面并拒绝读取云端数据；明确拒绝在正式 `miazou1991.github.io` 域名运行；
5. `dist/kaixin-stage-sync.js`：家长端的安全操作级 V2 读取/写入验证：从真实测试库读取一份全量 payload，家长保存时对 `homework/events/classes/recurringTasks` 生成带字段基值的操作；同步写入本机 IndexedDB outbox，远端先 CAS 版本校验再 `family_save_v2` 幂等提交、读取校验并自动清队列。遇到冲突、无法持久化、页面联动修改 `points/demoGrowth` 等其它顶层字段时，**禁止静默上传/覆盖**，保留本机数据待处理；
6. 孩子目前**只授权安全读取**，未实现完成作业的专用子账号服务器事务：儿童点击完成会在本机留下提示，但**不得冒称已同步到家长端**。这是上线阻断，不是最终可验收功能；
7. 构建包的本机存储键另带 `KAIXIN_STAGE_QA`，禁止原生产本地数据迁移；只有 staging Supabase 的 publishable key，会话存储也与生产隔离；
8. 原仓库 PR CI 增加建包、模拟 Auth/CAS/浏览器完整页面测试，并在成功后上传静态 ZIP 作为 Actions artifact，**绝不调用 GitHub Pages 部署**。

## 开发红线

- 不改生产 Supabase，不复制真实作业、手机号、家庭身份、密码等私人数据到 staging。
- 只有固定 KAIXIN 家庭/一个孩子，没有家庭注册、家庭切换或多孩子管理。
- 家长邮箱 + 密码，邮箱首验；孩子首次绑定后设备会话自动续期。
- 当前线上 `main`、正式 GitHub Pages、原 Safari 缓存、真实作业与伙伴历史保持原样；不允许擅自部署。
- 保留课程和携带物品的「只提醒，不打卡」产品规则；不额外增加积分或奖励。

## 真实验收与未完成

- [PR #27](https://github.com/MiaZou1991/homework-island-demo/pull/27)：staging 真实 Auth JWT + HTTP 19 项通过，涵盖跨家庭拒绝、一次性配对、设备撤销。
- [PR #23](https://github.com/MiaZou1991/homework-island-demo/pull/23)：操作引擎安全合并测试通过。本分支从该 PR 复制操作内核及测试，确保不从已过时的整包覆盖主线。
- **本分支 CI**：构建文件完整性、生产端点绝对排除、原始页面 390px 浏览器测试、家长模拟增加作业 CAS/回读、未授权拒绝、孩子写入禁止；以此 PR 最新 Actions 真实结论为准。
- 未完成：
  - 独立可访问 HTTPS 静态托管与 Supabase staging Redirect URLs 配置；
  - 家长真实邮箱收到验证邮件并安全确权；
  - **孩子完成／撤销作业**的 V2 专用授权 RPC（包括原历史计数/成长/伙伴字段无损处理）、心情/伙伴等非四类根字段操作；
  - 离线期间多种操作的自动重试、Realtime system-ready、两台真 iPhone 重启／恢复／断网；
  - 正式旧数据/手机 pending 全部备份和演练、生产家长身份归属校验；
  - 同步各 Draft 分支与最新 main、正式版 CI 和审批后发布。

## 本地开发验证

```bash
node checks/build-kaixin-staging.cjs
python3 -m http.server 8191 --bind 127.0.0.1 --directory build/kaixin-staging
```

打开 `http://127.0.0.1:8191/` 仅可验证静态加载与未授权页面防护；正式邮箱注册需要独立 HTTPS 站点及 staging Auth 回跳白名单，不能在本地 HTTP 使用。

## 回退

没有对生产的任何数据库和文件进行变更。删除独立 `build/kaixin-staging` ZIP／测试站点即可撤销页面，测试库的模拟数据与生产完全隔离。**本 Draft PR 不得未经批准合并。**
