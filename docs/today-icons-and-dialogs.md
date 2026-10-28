# 今日任务图标与统一弹窗

2026-10-27。用户确认 A 寒蝉圆黑体，应用于全部儿童端 DOM 文本。原有图形 Logo 保留。

使用内置 imagegen 生成独立透明 PNG，参考现有 utilities.webp 与 tabs-clean.webp。最终文件在 dist/assets/hd/today-icons/：mood-v1.png、companions-v1.png、homework-v1.png、course-v1.png、dialog-title-v1.png。所有课程共用通用课程表与钟图标；小书包仅位于携带提醒侧。泳镜方案未接入。

木牌为装饰图层，标题为 DOM 文本。新的儿童端 modal() 自动复用木牌标题。记心情保留既有心情 ID、500 字限制和保存规则；伙伴选择使用既有解锁条件与积分，不增加奖励。

## 提示词（内置 imagegen）

### mood

Use case: stylized-concept. Create ONE independent mobile game UI icon. Input images are STYLE REFERENCES ONLY; do not reproduce the sheets. Match their rounded toy-like 3D cartoon rendering, plump clean silhouette, glossy soft highlights, warm ambient shading, saturated cyan/yellow/orange palette, consistent top-left light. Centered square canvas, icon fills 85% with small safe margin. High resolution, genuinely transparent background. No text, letters, labels, rectangular tile, scenery, flowers, leaves, extra decorative objects, or large cast shadow. Clear at 40px display size. Subject: a happy golden-yellow sun face for recording mood, friendly dark brown oval eyes and smiling mouth, small warm orange cheeks, eight short chunky rounded sun rays, soft sculpted volume. Not a flat emoji or line icon.

### companions

Use case: stylized-concept. Create ONE independent mobile game UI icon. Input images are STYLE REFERENCES ONLY; do not reproduce the sheets. Match their rounded toy-like 3D cartoon rendering, plump clean silhouette, glossy soft highlights, warm ambient shading, saturated cyan/yellow/orange palette, consistent top-left light. Centered square canvas, icon fills 85% with small safe margin. High resolution, genuinely transparent background. No text, letters, labels, rectangular tile, scenery, flowers, leaves, extra decorative objects, or large cast shadow. Clear at 40px display size. Subject: two friendly rounded little companion creatures nestled shoulder to shoulder, one golden yellow on left and one sky blue on right, each with dark brown small oval eyes and simple happy smile, one small coral-red plump heart above between them. Cute 3D toy figures, no limbs needed. Read as friendship and companionship.

### homework

Use case: stylized-concept. Create ONE independent mobile game UI icon. Input images are STYLE REFERENCES ONLY; do not reproduce the sheets. Match their rounded toy-like 3D cartoon rendering, plump clean silhouette, glossy soft highlights, warm ambient shading, saturated cyan/yellow/orange palette, consistent top-left light. Centered square canvas, icon fills 85% with small safe margin. High resolution, genuinely transparent background. No text, letters, labels, rectangular tile, scenery, flowers, leaves, extra decorative objects, or large cast shadow. Clear at 40px display size. Subject: a charming homework exercise notebook, warm ivory paper with sky-blue rounded cover and golden orange spine, three short blue writing strokes on page (no readable letters), one chunky yellow pencil leaning diagonally alongside. Clearly a school homework notebook, no clipboard and no checkmark badges. Slight three-quarter view.

### course

Use case: stylized-concept. Create ONE universal COURSE icon for all school and extracurricular classes, not a particular subject. Subject: a small rounded orange-gold timetable/calendar board with cream face, four simple sky-blue rounded timetable cells, and a small cyan-rimmed clock in front at lower right with clear hands and no numbers. Match the STYLE ONLY of supplied glossy plump 3D toy children's island game icons: warm soft shading, top-left specular highlights, orange/cyan/cream palette, chunky readable silhouette. Square centered canvas fills 85%, high resolution, genuinely transparent background, minimal margins. No letters, numbers, text, labels, flowers, leaves, scene, tile, sports equipment, schoolbag, pencil, floating sparkles, large drop shadow. Immediately reads as scheduled class/course, reusable for swimming, music, reading, etc.

### dialog-title

Use case: stylized-concept. Create a reusable blank title plaque asset for children's island game dialog headers, based on the highlighted wooden title plaque in the supplied screenshot, NOT the whole interface. Screenshot is style reference only. One horizontal light honey cream wooden sign, softly irregular rounded edges, subtle fine horizontal wood grain, orange-brown edge, soft glossy cartoon 3D shading. Small plump green leaves and 2-3 pastel pink/yellow flowers clustered at LEFT end and small leaves/right flower cluster at RIGHT end. Wide clear blank center occupying 70% width for future DOM text. Aspect ratio 3:1, fully isolated on true transparent background, generous safe margins, high resolution. Match cheerful rounded toy-game icons. Absolutely NO text, NO writing, NO red rectangle, NO border/frame, NO UI, NO background, NO character. Just the wooden title and its small side botanical accents.


## 验证

- 39 项 domain/isolation 检查通过；upgrade.js 语法检查通过。
- 390×844 浏览器检查今日任务、记心情、伙伴列表；新图标和木牌均为透明独立资源。
- 独立 localhost 预览验证空记录提示、切换心情保留文字、保存后回读一致。
- 验证伙伴图鉴、解锁小兔（原价 30 分）、选择陪伴与再次打开回读。积分由 128 变 98，无额外积分。原 127.0.0.1 用户预览数据未用于测试写入。

## 手绘面板与素材库

弹窗使用独立 dialog-panel-v1.svg 微不规则轮廓，上边缘圆弧，花叶木牌跨在圆弧上方；320px 与 390px 手机宽度已截图检查。长伙伴列表在面板内部滚动，标题与关闭入口固定。素材库入口 `dist/asset-library.html`，目录 `dist/assets/hd/catalog.json`，支持本次更新、全部素材、搜索与逐项下载。

发布范围仅 GitHub feat/child-ui-hd-assets；Pages workflow 只监听 main，本次不合并或上线。

## 2026-10-28 微调

木牌标题按实际可见木纹区域垂直居中。保存按钮增加轻微不对称圆弧、手绘式弧线高光与一点星光，仍为可操作的 DOM 按钮。
