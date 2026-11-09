# 开心岛 · 历史分支核查（2026-11-09）

检查依据：以 `main`=`2fb8cc6467db4f431440a0cb5545738753eea01c` 为基线，使用 GitHub compare + PR 状态。

| 分支 | Github compare（与 main） | 判定 | 处理建议 |
| --- | --- | --- | --- |
| `feat/child-ui-hd-assets` | ahead 0 / behind 46 | PR #2 已合并 2026-11-08；无独有提交 | 可删除旧分支 |
| `fix/companion-webp-paths-20261109` | ahead 0 / behind 20 | 已包含在 main；无独有提交 | 可删除旧分支 |
| `feat/iphone-sky-continuity` | ahead 0 / behind 0 | 与 main 完全相同 | 可删除旧分支 |
| `finish-home-review-rewards` | ahead 6 / behind 60，diverged | PR #1 已合并 2026-10-19；独有提交是旧合并历史，并不代表 6 个新功能 | 先存 SHA 与 PR，再人工确认删除 |
| `chore/development-release-rules-20261109` | 规则草案分支 | PR #3，待合并 | 保留直至 PR 合并与 QA |

不删除无关分支，也不将旧分支整体重新合并到 main。删除分支前务必复查最新 SHA 和是否有未合并的工作；若当前连接不支持删除 Git ref，则明确记为**待手工删除**，不得声称已清理。

参照：
- PR #1 https://github.com/MiaZou1991/homework-island-demo/pull/1
- PR #2 https://github.com/MiaZou1991/homework-island-demo/pull/2
- PR #3 https://github.com/MiaZou1991/homework-island-demo/pull/3
