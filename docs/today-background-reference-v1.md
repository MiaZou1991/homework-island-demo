# 今日任务海岛底图重制（2026-11-04）

参考用户提供的今日任务截图，重新生成独立竖版场景，不把截图中的文字、按钮、任务卡、标牌、状态栏或角色画进底图。生成文件为 `dist/assets/hd/today-island-reference-v1.png`，900×1748 px。页面仍由 DOM 绘制任务、导航和提示；角色继续使用独立透明素材。

构图：上半屏以花园、红顶灯塔、蓝顶书屋、小屋和木码头组成连续小岛，并用石路、小桥连接；中间预留草地供角色叠放。下半屏保留较安静的碧蓝水面，底部以沙岸和少量花叶收尾，避免干扰真实卡片文字。风格为明亮、饱和的立体绘本玩具插画。

生成提示词：Create a new standalone portrait background illustration for a children's mobile app Today Tasks page, using the attached screenshot only as visual style and scene-composition reference. Portrait 9:19.5. Top half: bright blue sky, turquoise sea, rounded green islands, colorful fenced flower garden at left, red-roof lighthouse near upper center, cozy blue-roof forest library and cottage at right, wooden dock at left, curved stone paths and small bridges. Leave a grassy landing for a separate overlaid raccoon character. Keep top 7% clear for UI. Bottom half: mostly clean luminous turquoise water with gentle ripples and a sandy shore at the bottom, quiet behind real task cards. Sunny polished 3D storybook style. Strictly no text, letters, numbers, logos, signs, characters, animals, people, buttons, cards, calendar, task list, phone frame, status bar, icons, UI or watermark.

验收：390×844 CSS px、DPR2 浏览器截图检查，三条作业和课程提醒完整显示，新底图与卡片未重叠。当前底图横向像素约为 390px 页面宽的 2.3 倍，严格 DPR3 清晰度仍待后续补齐。该图仅用于开发分支预览，尚未合并或上线。
