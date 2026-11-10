# 成长日历 · 日期详情弹窗 · 第一批 PNG 接入记录

日期：2026-11-10。实现分支：`feat/growth-calendar-week-month`，Draft PR #29。

## 本轮已接入
五张真实 RGBA PNG 已在 `dist/assets/hd/growth-calendar/popup-png/`，与业务内容分层：`popup_bg.png` (825×1251)、`popup_title_bar.png` (707×269)、`card_mood_bg.png` (512×426)、`card_task_bg.png` (502×426)、`card_habit_bg.png` (509×426)。

`dist/child.html` 已载入 `growth-popup-png.css` 和 `growth-popup-png.js`。页面的日期、当前伙伴、心情名称、任务状态和习惯数量继续使用原有动态 DOM；不会把文字和业务数据画死在 PNG 中。

弹窗面板使用 CSS `border-image` 九宫格（slice 207 70 131 70），保护圆角、顶部花草、底部花朵；三色摘要卡采用固定图片背景；标题用空白立体 PNG。

所有五张 PNG 完整加载后，才给 `html` 加入 `gc-png-ready`；任意缺失则继续显示上一版 CSS 样式。检查脚本为 `checks/growth-popup-png.cjs`，纳入 PR 自动检查。

## 不变的业务规则
- 在「今日任务」记录一次心情和短句，成长日历同步展示。
- 作业完成状态从真实任务记录计算；课程、携带物品仍然只提醒、不打卡。
- 21天习惯、特别时刻、伙伴切换沿用原来的数据和入口。
- 不加入积分或额外加分逻辑。

## 本轮验收
- 已确认五张 PNG 上传仓库，尺寸与 RGBA 格式正确。
- 已有独立样板在 320/390/430px 生成的截图供人工比较；390px 的内容较长时，页面支持内部滚动。
- 本次最新提交的完整 App 尚未获得 GitHub Actions 成功记录，Safari 真机与静态参考设计逐像素对照仍待完成。样板截图不能代替整站真机验收。
- 这仍是第一批素材：剩余模块标题、列表背景、书包/音乐/勾选等高清 PNG 需按用户确认逐项补齐。

## 如何审核
PR #29 的固定 SHA 静态预览可以通过 `dist/child.html?preview=1&view=calendar&calendarView=month` 访问，并点击真实有日期的月历格打开弹窗。第三方文件预览属于非正式部署，勿填写孩子真实信息；正式版暂不受影响。

比较同样大小的日期弹窗，应优先检查九宫格有无拉伸、标题条字体遮挡、三张卡的比例、动态文字、伙伴探头是否在正确层级、关闭按钮和长内容滚动。
