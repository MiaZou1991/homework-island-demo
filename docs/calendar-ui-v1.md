# 小岛日程 V1 · 2026-10-28

日视图：一周日期栏、前后一天、回今天、当天作业/课程/日程筛选及详情入口。
月视图：周一开始的完整月格、相邻月份灰色日期、前后月份、选中日期对应的安排。
日历日期、标题、切换、卡片、文字与按钮全部使用 DOM/CSS；课程与携带物品只提醒，沿用现有作业和奖励规则。

背景由内置 image_gen 生成，母版位于 `dist/assets/hd/calendar-coast-v1.png`，原始输出 852×1846 px。390 CSS px 宽时约2.18倍密度，满足该宽度DPR2；430px严格DPR2及各尺寸DPR3未通过，后续需要更高分辨率母版，不能用放大冒充。背景按比例显示，不作非等比拉伸。

生成提示词（最终使用）：
Create a high-resolution portrait background illustration for the Chinese children's learning app Homework Island's calendar screen. Stylized rounded children's 3D cartoon game illustration. No interface, lettering, numbers, calendars, frames or characters. Tall 9:19.5 portrait. Top 22% airy cyan-blue sky, puffy clouds, tiny white lighthouse with terracotta roof on a green island at upper right, distant island silhouettes at upper left. Serene turquoise lagoon through central 65%, narrow leafy green borders and small white/pink/yellow flowers only at outer edges. Keep central 85% width open for real cream calendar cards. Bottom 10% gently curved pale sandy beach, illustrated wave line and rounded foliage. Blue-green palette dominates. No photographic textures, stretched perspective or watermark.

原始生成文件：`/Users/miazou/.codex/generated_images/01a172da-613c-7fd3-be3e-1f2b73441bca/exec-56268c7c-de16-4e72-b287-cc9a147e5877.png`。

已验证：日/月视图切换、前后一天、跨至11月、回今天、课程筛选、空日程、添加入口和关闭；课程无打卡入口。底部导航在720px高预览中保持可见。39项领域检查通过。
