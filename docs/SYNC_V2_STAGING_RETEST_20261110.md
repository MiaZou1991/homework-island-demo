# 开心岛 V2 同步｜2026-11-10 自动化与隔离 staging 验收记录

## 范围
- 生产 `zuoyedao` 未写入、未迁移。
- 只在独立 Supabase 项目 `kaixin-island-staging` 以预置 QA 家庭及测试身份运行；SQL 模拟 `request.jwt.claim.sub`，**这不是浏览器真实 JWT 端到端测试**。
- 每项模拟 SQL 用 `BEGIN ... ROLLBACK`；确认测试操作的 receipt 未持久化。

## 已验证事实
| 项目 | 结果 |
| --- | --- |
| 家长身份调用 `family_load_v2` | `ok:true` |
| 孩子身份调用家长专用 `family_save_v2` | `unauthorized`，拒绝 |
| 非所属家庭身份调用 `family_load_v2` | `unauthorized`，拒绝 |
| 家长用旧 expected_revision 保存 | `conflict`，拒绝旧版本覆盖 |
| 家长用最新 revision 保存已有 QA payload | `ok:true`、revision +1，在事务中可见 |
| 上述写入事务回滚后检查 receipt | count = 0 |
| PR #23 冲突裁决与合并内核 GitHub CI | Actions run `42821708325` 成功，包括 `checks/v2-operation-engine.cjs` 引入的 `checks/v2-conflict-review.cjs` |

## 尚未验证，仍阻断上线
1. 家长受保护、可恢复的真实 Auth JWT；孩子设备专用权限及有限操作 RPC。
2. **V2 客户端只覆盖新增作业**；还没有接入正式页面的作业修改/完成/删除、日程、课程、周期模板及顶层成长记录。不能将未覆盖变更按“成功”清掉。
3. `family_save_v2` 当前对孩子整包写入拒绝是正确行为，但需要设计专用受限动作 RPC；不能为了测试通过而放开完整写权限。
4. iOS Safari IndexedDB 重启与断网恢复、后台刷新、双实体 iPhone 真实账号端到端。
5. 每台设备旧 `local-v1` pending 本地数据与云端校验、全量备份、可恢复点、上线后监控与回滚。
6. 部署到 `main` 会触发线上发布；在上述条件达成前保持 Draft，不能直接合并。

## 已确认业务边界
同记录冲突保留双方版本供家长选择；历史积分、成长、奖励保留，不新增积分。任何 CAS 冲突或读取失败都不应导致待同步队列删除。
