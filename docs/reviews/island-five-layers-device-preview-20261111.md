# 开心岛｜五图层背景接入 · 第三步待验收（2026-11-11）

## 开工卡
- 已确认：第一步五层素材 V1 + 第二步三设备静态组合 V1；用户同意代码接入与真实设备验收，指出 iPad 横屏的边缘融合尚不够自然
- 开工唯一 main 基线：`fdef92ff88829629adaccc25a4ab0d02847f5d93`
- 开发分支：`design/kaixin-five-layer-device-preview-20261111`
- 范围仅包括：`dist/child.html` 首页装饰 DOM、五图层 CSS、三张新 WebP、一条 SVG、移动端 QA 和本说明
- 不改：原始主图 `today-island-reference-v1.webp`、Logo、三 Tab 原图标和路由、已批准弹窗、17 个伙伴、家庭数据、云同步、作业/课程/小书包规则、积分和建设力
- 本轮不合并 main，不触发正式 Pages 部署

## 五层资源对应
01 天空：`assets/hd/five-layers/sky-extension-v1.webp`，原始素材 1800×600 RGBA
02 原始岛屿：`assets/hd/today-island-reference-v1.webp`，仓库原有 900×1748，保持比例不变，**仅中央使用一次**
03 左右海面／远山：`assets/hd/five-layers/side-world-extension-v1.webp`，原始素材 2400×1748
04 浅滩／花朵：`assets/hd/five-layers/beach-transition-v1.webp`，原始素材 900×480 RGBA，严格覆盖主图源像素 y=1268..1748 的同一位置，**不另起一片沙滩**
05 Tab 承托：`assets/hd/five-layers/tab-shoreline-v1.svg`，透明窄幅矢量，不是整块沙黄色遮罩

### 绘制与层级
- `.tf-world-extension` 底部背景（海面、远景），只承接主图外侧或渐隐边缘
- `.tf-sky-extension` 在最上方，使用透明天空纹理
- `.tf-world-main>.tf-world-paint` 中央原始主图，iPhone 顶部/底部透明渐隐，iPad 左右也做渐隐
- `.tf-beach-transition` 仅与原图像素重合位置绘制，禁止重复添加第二片沙滩
- `.stage`、Logo、积分、任务与提醒卡等位于透明图层之上，能正常点击
- `.up-nav` 独立 fixed 置底，仅 32px 透明手绘边线，不添加大块黄色底板

### 设备策略
- iPhone 320/375/390/430：中央图宽度与 CSS 视口相同；Safari 与 PWA 使用同一套图层，系统刘海 safe-area 只影响控件位置
- iPad 768/1024/1366 宽：中间交互列固定最大 500px；左右用远景延展；主图上下与两侧各自渐隐
- Safari 普通浏览器原生状态栏/底部工具栏是系统 UI，网页不能把插画绘入系统保留区域
- PWA Standalone 保留 `viewport-fit=cover`、`black-translucent`，顶部根据 `env(safe-area-inset-top)` 避让
- 注意横屏低高度安全区、Safari 动态地址栏、长作业与图鉴滚动

## 回归/验收门槛
- 自动：`node checks/companions-mobile.cjs`；320/375/390/430 & 768/1024/1366，验证五图层加载、原图比例、无重复岛屿、Tab 固定与无横向溢出；领域/同步/日程/冷启动沿用原有 CI
- 截图：PR GitHub Actions 产出 `companions-gallery-home-*.png`、`island-world-tablet-*.png`
- **必须实机验收**：iPhone Safari、添加到主屏幕的 PWA、iPad 竖/横屏；特别关注顶部蓝带、右侧重复房屋、海平线接缝、底部重复沙滩与导航遮挡
- Chromium 预览/CI 不是 iPhone Safari 真机；静态三机组合图也不是可用性交付证明

## 已知风险与回退
- iPad 左右延展与中央透视不完全一致；已用左右 19% 羽化和上下 42px/21% 渐隐减轻，需要用户现场确认
- iOS Safari 自绘状态栏不能通过网页 CSS 强制替换成云图
- 预览仅使用 `?preview=1&design=original` 演示数据
- 如果不符合验收，继续在此 PR 内修改，不合并 main；回退仅需关闭 PR，正式生产保持基线 SHA 不变，无数据迁移
