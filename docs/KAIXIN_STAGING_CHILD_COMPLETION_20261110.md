# KAIXIN V2｜儿童端作业完成 / 撤销完成（仅隔离 staging）

## 业务边界
- 家长新增作业 → 孩子看到已由两台真实 iPhone 完成一次验收。
- 下一阶段孩子点击完成／撤销完成，只同步该条作业的 `done`、`completedAt`，**不加分**、不产生新奖励、不改变原有积分、成长、材料或历史 `demoGrowth` 记录。
- 需要家长审核的作业尚不开放此直接完成接口。课程和小书包仍仅提醒。
- 相同作业状态发生冲突：双方版本留在设备和 outbox，不自动覆盖，待家长核对。

## 实现
1. `checks/fixtures/kaixin-staging-child-homework-toggle.sql`：已仅应用于测试库 `tgnznizqhheiwgdhvwdc`；固定测试家庭，验证 Supabase Auth `auth.uid()` 为已绑定且未撤销的孩子角色。匿名或其他家庭账号拒绝。
2. 操作含 `operationId` 和预计旧 `done`，数据库行锁避免同记录并发丢失；已有操作记录支持丢响应后幂等重试。只改一项作业两个字段，其余 JSON 不变。
3. `dist/kaixin-stage-sync.js` 孩子端 IndexedDB 持久化队列 → 受限 RPC → 云端读回；读取失败或冲突时保留本机数据和待同步操作；绝不调用父级 `family_save_v2`。
4. `dist/kaixin-stage-child-actions.js` 在独立测试 `child.html` 加载，取代儿童端旧的 `DemoCore.finish/undo` 副作用。提示本机待确认，云端返回才标记同步。
5. 自动化 `checks/kaixin-stage-full-ui.cjs`：模拟孩子完成、撤销、非法新建仍阻止，验证无积分和家长全量写入。

## 已运行的测试库事务回滚测试
- child: 设置 done=true，重复提交返回 duplicate=true；预计旧状态不符时 conflict；非作业顶层数据不变。
- parent / outsider：调用孩子专用接口都返回 unauthorized。
- 公共端 `anon EXECUTE=false`，`authenticated EXECUTE=true`；公用包装函数不是 SECURITY DEFINER。
- 所有破坏性模拟写入在事务内 rollback，未触生产数据。

## 上线限制与验收
- 以上仅 staging。**不要部署生产、不要迁移旧 Safari 本地存储**。
- CI 通过、独立 HTTPS 发布成功后，用两台真实 iPhone 测试：家长建模拟作业、孩子完成、家长刷新看到完成、孩子撤销、家长刷新看到撤销；同时查看孩子端同步状态必须为「已核对」，否则不能认定成功。
- 再测断网、Safari 重开、丢 ACK、同记录冲突、历史积分/奖励无变化。
- 原已绑定账号仍有效；不要再次注册孩子或清 Safari 记录。
