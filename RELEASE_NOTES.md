# 开心岛 · GitHub 发布说明

## 2026-11-09｜16位陪伴伙伴偏瘦版 v7（已确认视觉）

- **需求**：用户在已上线 v6 的基础上反馈伙伴稍胖，确认更轻盈的16位新造型，要求直接替换。
- **素材**：从确认的新稿 `a_clean_png_style_illustration_sheet_16_cute_ani.png` 提取16张透明立绘 `dist/assets/characters/companion-{id}-v7.png`。每张 512×512 RGBA；原图中单只角色高度约200–270px，生成的512是高质量重采样并非原生512/4K，适合网页小尺寸展示。角色面部、身材更纤细，保留物种、颜色、服饰和关键配饰。
- **行为保持**：`DemoCore.companions` 图片路径换成 v7，孩子/家长端的 `demo-core.js` 更新缓存号；全部16位 ID/emoji、已拥有、当天选择、家庭资料和云端状态不变。未修改任务、日程、钓鱼、积分、Logo和底部3个Tab。
- **透明底复验**：海蓝、草绿、深色和米色背景对照没有矩形沙色光晕；新增v7清单与源图使用说明。手机端自动测试16/16图片真实alpha、320/375/390/430 CSSpx、DPR2/3、选择/刷新回显、历史数据不变。
- **代码与测试**：[PR #24](https://github.com/MiaZou1991/homework-island-demo/pull/24)；主分支合并 SHA `fc368f740f12c2624d3203c4852236ac3cd316bc`；[PR CI](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42652285253) 全部成功；[Pages部署](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42652796701)（以该工作流的最终结果为准）。
- **页面**：https://miazou1991.github.io/homework-island-demo/child.html?v=slim-v7 。发布前自动化浏览器检查通过，但家庭实际iPhone Safari的最终主视觉仍需使用者复核。
- **回退**：原v6与更早版图片全部保留。若细节不符，使用新PR将 `DemoCore.companions` 切回v6并同步更新缓存版本。上版健康main SHA `979810f69911ddf6113fea02370ba3125355b67a`；不能重置或清理家庭数据。

## 2026-11-09｜16位陪伴伙伴透明底统一修复 v6

- **问题来源**：实际 iPhone 截图发现小猫及小兔等伙伴在海水码头场景中有大块米色/沙色雾状底，旧 v4 只是羽化合成卡边缘，PNG RGBA 并不意味着已真正去背。单独修复小兔v5无法覆盖另外15位。
- **本轮修复**：根据16位已确认的物种、服装与颜色重新绘制、切图，全部输出 512×512 真透明 RGBA PNG（`dist/assets/characters/companion-{id}-v6.png`），建立 `companions-v6.json` 与说明；不是旧像素一比一抠出，因此个别表情/配饰可能略有差异。
- **页面接入**：`DemoCore.companions` 将全部16位改用v6，儿童/家长端 `demo-core.js` 添加独立版本参数以清除旧 Safari 缓存；旧v4和小兔v5仍保留。原有10位Emoji/ID、选中/拥有记录、作业积分及全部家庭数据未改动。没有更改课程/物品只提醒不打卡的规则，也没有改动小岛日程或钓鱼场景。
- **防回归与验证**：蓝色海水、绿色草地、深色和奶油色背景对照无大面积背景残留；[PR自动检查](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42641572310) 成功，16/16 张图片路径与RGBA尺寸、浏览器canvas透明像素/中部不透明度、320/375/390/430px、DPR2/3和旧数据兼容均通过。
- **提交与部署**：[PR #20](https://github.com/MiaZou1991/homework-island-demo/pull/20)，主线合并 SHA `e96be334610eee8cc0eb1ce73ebeb76efc02c719`。[Pages 自动发布工作流](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42641951765)（最终成功/失败以该运行记录为准）。正式地址：https://miazou1991.github.io/homework-island-demo/child.html?v=all-companions-v6 。
- **回退方式**：仅回退 `DemoCore` 资源路径和对应缓存版本；保留全部v4/v5资产，不重置云端家庭数据、存储、历史积分与伙伴记录。变更前健康主线 SHA `b82a80aa8d936b741691c00886c476b66cdaa427`。
- **验收边界**：自动化在隔离的预览数据中进行；尚未宣称真实家庭 iPhone Safari 手工复核已完成。

## 2026-11-09｜小兔角色透明底修复（今日任务白色光晕）

- **现场问题**：用户 iPhone 截图中，首页码头上的小兔背后显示大块白色/奶油色的矩形雾状背景，并非 iPhone 渲染错误。先前 v4 图片只将矩形外缘柔化半透明，卡片内部多数像素仍是高不透明度，原来的素材验收仅验证 PNG 文件、RGBA 和图片加载，未验证实际抠图质量，故未拦住该缺陷。
- **修复**：新增保留原造型的 `dist/assets/characters/companion-rabbit-v5.png`，去掉奶油色背景；保留 v4 旧图；更新 `DemoCore.companions`、角色索引、小兔图片路径及儿童端/家长端缓存版本，不影响其他 15 位角色、原选中数据、积分及家庭日程。
- **防复发**：手机自动化新增像素级 alpha 断言：小兔两耳之间 (210,58) 透明，面部 (250,190) 不透明，覆盖 320/375/390/430 CSS 像素宽度及 DPR 2/3。其余 15 位伙伴来自相同裁图流程，已建立 [Issue #18](https://github.com/MiaZou1991/homework-island-demo/issues/18) 审计残留背景，不声称已全部修复。
- **代码**：[PR #17](https://github.com/MiaZou1991/homework-island-demo/pull/17) · 主线合并 SHA `ce6844845081738fe5612ec9a843a43128892ea2`。
- **发布**：[GitHub Pages 部署工作流](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42631491222)。本条记录撰写时部署仍在执行，应以工作流最终状态为准。正式站点：https://miazou1991.github.io/homework-island-demo/child.html 。自动化不能代替真实 iPhone Safari 的手工视觉复查。
- **回退**：只需回退小兔 `DemoCore` 资源路径为 v4 并同步更新缓存号，保留全部家庭数据与历史伙伴记录。修复前主线 SHA `96ffb8d91111ebf4628685e22ee2c1010a10c18d`。

## 2026-11-09｜陪伴伙伴图鉴 v4：16 位高清角色与免费邀请

- **范围**：本次只完成阶段一（16 位伙伴独立 PNG 素材）和阶段二（图鉴、角色配置、选择逻辑），**不包含阶段三「今日任务／我的小岛」全量展示重设计，以及阶段四钓鱼场景／动作制作**。既有共用角色显示会自动使用新素材。
- **功能**：伙伴图鉴包含 16 位角色，保留原 10 位 ID／Emoji 及已拥有数据，新增小鹿、小企鹅、小考拉、小浣熊、小刺猬、小象；旧猫和松鼠替换立体 PNG。新伙伴可免费认识并邀请，保留已有奖励记录、选择状态，刷新能回显；没有新增积分、建设力与兑换操作。
- **样式**：保留最终 Logo、原三 Tab 与已确认木牌／奶油纸弹窗；图鉴常规手机四列、320px 窄屏三列，角色保持完整比例；更新 JS／CSS 查询版本避免 Safari 继续加载旧图鉴。
- **变更记录**：[素材 PR #10](https://github.com/MiaZou1991/homework-island-demo/pull/10)（16 PNG／索引／规范，主干合并 SHA `375695ae53dee0cca808622b20aa4eb54ad45639`）；[功能 PR #14](https://github.com/MiaZou1991/homework-island-demo/pull/14)（主干合并 SHA `f52408eb4a83662ab69901bbeb00e047cf2e5734`）。
- **上线验证**：[功能 PR 自动检查](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42625412267) 全部成功：角色图片加载 16/16、旧数据与积分不变、首次免费邀请、选中／刷新回显；手机 320、375、390、430 CSS px，覆盖 DPR2/3；日程和同步隔离回归检查通过。[正式 Pages 部署](https://github.com/MiaZou1991/homework-island-demo/actions/runs/42625819592) 全部步骤成功，部署 SHA `f52408eb4a83662ab69901bbeb00e047cf2e5734`。
- **线上地址**：[开心岛儿童端](https://miazou1991.github.io/homework-island-demo/child.html?v=companiongallery-v4)。GitHub Pages 成功与自动化浏览器验证已确认；**尚未完成真实家庭 iPhone Safari 手工验收，当前网页读取工具也无法独立打开线上页面**，不声称已实机验证。
- **数据与回退**：不删除任何历史记录、积分流水或家庭数据。若新图鉴出现问题，以素材合并后健康代码 SHA `375695ae53dee0cca808622b20aa4eb54ad45639` 经新 PR 回退代码（不能重置孩子数据）。课程与携带物品仍只提示、不打卡。
- **待后续**：阶段三的全站视觉统一、阶段四的钓鱼场景均暂缓，跟踪 [Issue #11](https://github.com/MiaZou1991/homework-island-demo/issues/11)。


## 2026-11-09｜家长端作业发布：保存成功却未关闭弹窗

- **问题**：手动发布作业先保存到浏览器，再把整份家庭资料复制写入待同步缓存。iPhone Safari 在家庭数据和作业照片较多时可能触发缓存容量异常，造成作业已保存、但弹窗没有关闭或显示成功提示。当前缺少故障设备运行日志，因此这是代码确认的故障路径，不把它表述为手机端唯一原因。
- **修复**：待同步缓存改为轻量标记（兼容旧完整快照）；作业本机落盘成功后无论云端排队结果都提供准确反馈、关闭弹窗；按钮发布中禁用，避免重复点击。
- **体验变化**：依次显示「正在发布…」「作业已保存，正在同步到孩子端」或明确的失败／待同步提示。原先“发布后孩子端会立刻收到”的文案改为准确描述。
- **保持不变**：Logo、弹窗视觉、三 Tab、课程与小书包只提醒不打卡、历史作业和积分、家庭数据结构、远端 Supabase 数据均未修改。
- **验证**：`checks/publish-flow.cjs` 检查防连点、云端写入异常、本机保存失败、手机本地容量与刷新恢复；同一 PR 的检查流程继续运行领域、同步、日程与移动端尺寸回归。iPhone Safari 实机核验需上线后由家庭操作确认。
- **发布记录**：[修复 PR #7](https://github.com/MiaZou1991/homework-island-demo/pull/7) · [自动部署工作流](https://github.com/MiaZou1991/homework-island-demo/actions/workflows/pages.yml) · [开心岛线上地址](https://miazou1991.github.io/homework-island-demo/) · 合并前健康主线 `29653d30124096e30bdb3939eab33220d2f44d02`。**最终部署 SHA、Actions 运行及结果以 PR #7 的发布记录为准**，需在部署成功后填入；合并不等于已上线。
- **回退**：如本次版本验收失败，应通过新的回退 PR 恢复上述健康主线对应的代码，而不是清空或覆盖家庭数据；同步标记改变需独立核查未上传的本地改动。


## 2026-11-09｜补丁：修复手机端发布后仍显示旧书包卡片（缓存）

- **问题**：上一轮仅提交了 `family-schedule.js`、`upgrade.js` 与 `today-fidelity.css` 的新内容，但 `child.html` 仍沿用旧的资源查询版本号；在 Safari/iPhone 上可继续命中缓存，导致卡片看似未更新。GitHub Pages 构建成功并不代表手机已经加载最新 JS。
- **修复**：更新 `child.html` 中上述三项资源的 URL 版本标识为 `20261109-empty-packing-20261109b`，强制获取新代码；保留真实家庭数据和所有原有交互。
- **防复发**：将资源版本断言纳入 `checks/family-schedule.cjs`，与空清单隐藏、家庭成员切换恢复、320/375/390/430px 手机端回归一起执行。
- **确认方式**：在「小岛日程」选择无携带物品的日期或成员，整个「出门记得带」区块消失；有物品时恢复。若手机仍保留旧 HTML，可通过带页面版本参数的地址强制刷新：`child.html?view=calendar&refresh=20261109b`。

## 2026-11-09｜小岛日程：无携带物品时自动隐藏提醒

### 用户可见变化
- **小岛日程**：按当前选定日期、家庭成员及实际课程／日程的准备物品重新计算携带清单。若清单为空，整个「出门记得带」卡片不渲染，不显示「0件」或「今天轻装出门」占位提示；下方伙伴横幅自然上移。
- 有携带物品时保留已确认的蓝色小书包、高清物品图标和奶油色卡片样式。同一天来自不同课程／安排的同名物品按名称去重；空白名称忽略。
- 切换日期或「全家／开心／爸爸／妈妈」筛选后即时刷新提醒；只显示当前筛选范围对应的准备物品。
- **今日任务**：当天有课程、但课程没有携带物品时，课程提醒仍显示时间、名称和进入详情的入口，不再显示空书包栏、分隔线和无物品文案。当天有物品时沿用原有课程＋小书包合并卡；没有课程时沿用既有课程提示行为。

### 保持不变
- 课程与携带物品仍只作提示，不增加确认、打卡或积分；作业完成逻辑不变。
- 实际数据、家庭成员筛选、一句话记事、周／月视图、原底部 Tab、最终 Logo、伙伴和现有同步流程不变。
- 沿用已确认的「寒蝉圆黑体 Medium」与当前手机端字号规范。

### 技术与验证
- 统一由 `FamilySchedule.packingItems` 从可见日程提取、去空和去重，不更改原始课程及日程数据。
- 为「无物品」「跨课程／日程重复」「成员切换」加入规则断言；移动端在 320、375、390、430 CSS px 下检查空卡片隐藏、恢复、伙伴区域及既有日程操作。
- GitHub Pages 通过 `.github/workflows/pages.yml` 在推送 `main` 后执行测试并自动发布。

### 访问
- [开心岛 · 小岛日程](https://miazou1991.github.io/homework-island-demo/child.html?view=calendar)
- [部署工作流](https://github.com/MiaZou1991/homework-island-demo/actions/workflows/pages.yml)
