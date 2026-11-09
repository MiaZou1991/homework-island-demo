# 开心岛 P0｜跨设备同步修复与数据库验收方案（2026-11-09）

> 状态：**修复分支开发中，生产尚未上线；数据库实证验收未完成。**
> 主线基线：`bfa718f6cce96273afe9f5404568b8ea97c0a0ab`
> 修复分支：`fix/p0-sync-diagnostics-recovery-20261109`
> 场景：手机 1 发布作业，本机可见；手机 2 不可见；手机 1 显示「云端版本尚未确认／本机改动待上传」。
> 数据安全底线：不删除、不清空生产家庭数据；不把线上家庭记录作为自动化测试数据；未经验收不合并 main。

## 0. 必须先说清的证据边界

已通过代码确认：本地保存与云端写入分离；失败时待上传标记保留；首次连接失败后的恢复链条薄弱；原「重新检查同步」在 pending 时会跳过；每次写入完整家庭 JSON；前端固定家庭空间 `KAIXIN`。最新 GitHub Actions 通过只证明模拟检查和构建通过，不证明真实 Supabase 数据库当前健康。

用户截图证明：手机 1 本机有作业、云端状态「尚未确认」、本机改动待上传。**它不能证明数据库返回的 HTTP 状态码，也不能证明手机 2 的真实拉取请求是否失败。** 禁止把推断写成真实事故原因。

## 1. 第一阶段 P0 变更与边界

已提交到修复分支：

- `dist/cloud-sync.js`：结构化本机诊断日志；HTTP 状态、请求类别、耗时、重试等待、初始化、版本查询、待上传队列、云端确认、页面异常；首次云端读取失败后待上传记录可在下一次上传动作中重新完成云端核对；手动重试不再只是静默跳过。
- `dist/upgrade.js`：状态、最近 15 条事件、立即重试、导出诊断日志。
- `dist/app.js`：本地保存成功或失败记录到同步日志。
- `dist/child.html`/`dist/parent.html`：变更脚本版本参数，避免 Safari 用旧缓存。
- `checks/sync-diagnostics.cjs`：模拟连接失败恢复、上传 503、手机 2 拉取、日志脱敏、环形上限。
- `checks/staging-db-sync.cjs`：独立 Supabase **测试项目**的真实 API 契约测试工具。严禁传入生产项目 URL。
- `.github/workflows`：同步回归测试进入 CI。

**当前 P0 尚未改变生产 Supabase SQL 函数、表结构、RLS 或实时订阅发布设置。** 当前整份快照更新仍有并发覆盖风险，必须作为数据库验收 blocker；不能把日志完善视为数据一致性完成。

## 2. 日志口径与安全约束

| 事件 | 需记录的字段 | 如何判断 |
| --- | --- | --- |
| 本机保存 | 时间、临时会话标识、local_saved/local_save_failed | 本机存储成功不等于云端成功 |
| 加入上传队列 | pending_queued / pending_restored | 可追踪刷新后是否恢复待传记录 |
| 云端请求 | rpc_started、rpc_succeeded 或 rpc_failed、操作类型 load/save/revision、HTTP 状态、耗时 | 分辨请求失败、超时和业务失败 |
| 云端版本 | revision_checked/revision_check_failed、版本号 | 分辨通知故障和真实数据读取故障 |
| 上传确认 | push_confirmed、pending_cleared、服务端版本号 | 只有服务端确认才清除待上传 |
| 数据接收 | cloud_loaded、remote_applied、版本号 | 手机 2 是否真的更新本地 |
| 恢复与异常 | sync_initialization_failed、connection_resume、upload_retry_scheduled、page_error | 断网恢复和意外错误 |

- 设备本机记录最近 **120 条**事件，家长可导出诊断 JSON。页面仅展示最近 15 条。属于本机故障排查日志，不等于云端集中监控。
- **禁止记录**：家庭真实码、作业正文、心情文字、孩子姓名、附件图片、access token、Supabase key、整个请求/响应 payload、完整 URL、任意原始服务器错误文本/栈。
- 真实上线前，用包含假私密字段的测试负载检查 JSON 和日志是否泄露内容；把日志文件作为隐私数据管理。
- 生产**及时预警**仍需 Supabase 端访问日志/错误指标、失败率阈值和告警渠道，待 Supabase 权限连接后实施；目前不能声称已具备自动告警。

## 3. 数据库验收：先只读审计生产，再在隔离数据库写入

**生产数据库阶段（只读）**：
1. 确认当前项目确实是站点配置指向的 Supabase 项目；记录 URL 对应项目标识和执行时间，不导出密钥。
2. 在 Supabase Logs Explorer 查看事故时段的 `/rest/v1/rpc/family_load`、`family_save` 和 `kaixin_sync_signal` 请求，按 UTC 和中国时区对照，汇总 HTTP 4xx/5xx、超时、来源和请求数量；仅输出聚合结果，不保存负载。
3. 使用 SQL 只读检查表、函数签名、SECURITY DEFINER、RLS、函数执行权限、Realtime publication 是否包含通知表，避免基于猜测修改 SQL。
4. 只读核对 `KAIXIN` 当前版本号与记录存在性；**不得直接修改、删除或覆盖**家庭作业。先取得生产备份与回滚点。

推荐只读核查 SQL（在有权限的 Supabase SQL Editor 或连接中执行）：

```sql
SELECT routine_schema, routine_name, data_type
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name IN ('family_load', 'family_save')
ORDER BY routine_name;

SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('family_load', 'family_save');

SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('family_cloud_data', 'kaixin_sync_signal');

SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('family_cloud_data', 'kaixin_sync_signal');

SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE schemaname = 'public' AND tablename = 'kaixin_sync_signal';
```

**测试数据库阶段（可读写）**：
- 使用独立 Supabase staging 项目；部署**与生产一致的 RPC 版本、表结构、策略和 Realtime 配置**。禁止使用生产 URL、家庭码 `KAIXIN` 或复制儿童真实数据到测试项目。
- 运行：`KAIXIN_STAGE_URL=https://<staging-project>.supabase.co KAIXIN_STAGE_KEY=<staging-publishable-key> node checks/staging-db-sync.cjs --stage`。
- 工具强制拒绝生产项目 URL，生成独立 8 位测试家庭码，只写入 `STAGING_SYNTHETIC_ONLY` 假作业。
- 在**单独隔离测试项目**追加 `--conflicts` 验证两台设备的旧快照是否会覆盖对方的新作业。若没有版本 CAS 或合并机制，测试应失败并作为**阻断上线**项，而非忽略它。
- 需测试无授权请求、低权限凭证调用 `family_load`/`family_save`、家庭数据越权读取和更改。当前前端固定 `KAIXIN` 且公开使用 publishable key，不能视为认证通过。真正的家庭成员权限必须由服务器校验。

## 4. 数据库/网络测试用例（必须逐项留证）

| ID | 测试动作 | 服务器/数据库证据 | 判定 |
| --- | --- | --- | --- |
| DB-01 | 新测试家庭读取 | family_load 返回不存在 | PASS/FAIL |
| DB-02 | 手机 1 发布一条测试作业 | family_save 成功；数据库对应记录含该 ID | PASS/FAIL |
| DB-03 | 独立第二客户端读取 | family_load 返回同 ID，内容哈希一致 | PASS/FAIL |
| DB-04 | 客户端更新另一条作业 | 新 revision 严格大于旧版；读取为最新两条 | PASS/FAIL |
| DB-05 | 断网/HTTP 503 后保存 | 不错误清空本机 pending；恢复后仅保存一次 | PASS/FAIL |
| DB-06 | 8 秒请求超时后恢复 | 日志有 timeout/重试；远端最终一致 | PASS/FAIL |
| DB-07 | 两设备从同版本分别修改 | 两条修改均保留，或旧写入明确被拒绝 | **上线阻断** |
| DB-08 | 重复提交与刷新后重试 | 不产生重复作业 ID，不丢旧记录 | PASS/FAIL |
| DB-09 | Realtime 通知 + 重新前台 | 服务端 revision 更新；手机 2 确实触发 load | PASS/FAIL |
| DB-10 | 未授权读取/写入 | 匿名/非家庭成员不能读取或覆盖家庭记录 | **上线阻断** |
| DB-11 | 前端故障日志导出 | 可定位 HTTP 状态，日志中无正文/密钥/照片 | PASS/FAIL |
| DB-12 | 临时网络/数据库故障恢复 | 回到一致状态；不把旧本机快照覆盖远端新数据 | **上线阻断** |

`DB-07`、`DB-10`、`DB-12` 如果无法通过现有 `family_save` 协议实现，先补服务器端版本条件写入、登录/授权和冲突规则，在 staging 验收；**不能用纯前端打补丁假装已解决**。

## 5. 两台 iPhone 实机验收

- A、B 都打开 GitHub Pages 正式路径，不使用 `preview=1`、本机 `127.0.0.1` 或历史 Netlify；先导出各自家庭备份，不清除 Safari 网站数据。
- 用专门的**隔离测试环境**而不是家庭生产记录测试 10 轮新增、完成、编辑、删除；每轮记录设备本地时间、日志事件、数据库 revision、另一设备可见时间、结果截图。
- 测试 Wi-Fi↔蜂窝网络、手机锁屏/后台 10 分钟后打开、Safari 标签重新打开、PWA 模式、短暂离线发布、故意触发 HTTP 503/timeout；分别验证自动恢复与手动重试。
- 目标：联网稳定时手机 1 服务端确认后手机 2 在 30 秒内可见；后台恢复或网络重连后 30 秒内主动核对；10 轮中数据丢失 0、重复新增 0、错误覆盖 0。指标以实际记录为准，未达到不得宣称通过。
- 真实家庭数据恢复验证只进行只读核对；如要迁移/修复先备份、确认版本、提交单独审批步骤。

## 6. 证据表及上线决策

每个测试生成一条表记录：`测试ID、环境、Git SHA、数据库项目（仅短 ID）、RPC 版本、执行时间、结果、HTTP 状态、写入前后 revision、客户端操作时间、数据库响应耗时、B 端可见时间、复测者、证据链接、失败原因`。

上线必备：CI 全绿 + staging DB-01~12 + 权限审计 + 实际手机 A/B 验收 + 可回滚备份点 + 用户批准合并 PR。仅 CI 通过时最多标注「前端模拟验证通过」；**禁止写成数据库已验证/跨设备已修复上线**。

## 7. 事故排查与回退

生产设备待上传时先导出本机 JSON，截图同步状态并导出脱敏日志。禁止清缓存、重置、使用旧数据覆盖云端。若正式上线回归不通过，通过新 PR 回退到稳定 Git SHA，保留 Supabase 与本机数据，审查失败后再迁移。

## 8. 当前阻断项

- 未连接可直接审计生产 Supabase 的数据库权限和日志通道，**真实数据库检查尚未执行**。
- 不能据前端代码推断 `family_load`/`family_save` 的实际 SQL 权限、版本合并行为。
- 尚缺两台真实 iPhone 的端到端证据。
- 固定家庭空间的认证授权风险需在生产只读审计中优先确认。
