# 开心岛 · 首次发布管控基线（2026-11-09）

- **正式站点：** https://miazou1991.github.io/homework-island-demo/
- **核验时 main SHA：** `2fb8cc6467db4f431440a0cb5545738753eea01c`
- **GitHub Actions 部署：** https://github.com/MiaZou1991/homework-island-demo/actions/runs/42549689792
- **部署结果：** 2026-11-09 10:15（新加坡）左右，`Publish Homework Island` 全部步骤成功。
- **核验范围：** 仓库提交 SHA、运行结果、检查步骤；**没有完成真实用户手机端手工验证**。
- **历史还原：** 上述不可变 SHA 可作为比对与 `git revert` 的参考点；未建立正式 Git Tag/GitHub Release，不得宣称已有 Tag。
- **数据注意：** 任何回退都不得直接覆盖云端家庭数据；需要先评估存储结构及同步兼容性。
- **新的发布流程上线前：** main 推送仍会自动触发旧 Pages workflow，严禁其他开发对话直接推 main。
- **新的发布流程上线后：** CI 负责提交和 PR 校验；`pages.yml` 仅接受 `workflow_dispatch`，需输入当前 main 的完整 40 位 SHA。部署成功后再记录本次发布 SHA 及手机 Safari 实测结果。
