# 今日任务蓝绿竖版背景

使用内置 imagegen 生成及定向编辑。最终文件：`dist/assets/hd/today-bluegreen-portrait-v2.png`。

背景为853×1844原生竖版，CSS使用`background-size: cover`等比缩放，覆盖整个手机容器，顶部场景与底部导航共享同一背景。没有拉伸横图，也没有把页面截图当背景；所有卡片、文字、导航、小熊仍为独立元素。

390×844预览已人工检查。原图在此尺寸约2.18倍像素密度，满足DPR2；严格DPR3仍需更高分辨率母版。

## 首轮提示词

Create a brand new high resolution mobile game scenic background asset, stylized-concept, premium cute rounded 3D children's island illustration. Portrait 9:19.5 aspect ratio, ideally 1440x3120 or similar high resolution. This is ONLY a background illustration, absolutely NO interface, NO text, NO cards, NO icons, NO characters, NO border. Composition precisely for a mobile screen: top 0-12% airy bright cyan blue sky with fluffy white clouds and quiet space for a logo overlay. At 14-25% height place two lush emerald green rocky islands on left and right with charming small white red-roof lighthouses, correctly proportioned, not elongated, natural perspective. Turquoise water between them. At 35-40% height a small mossy grassy green landing with a low wooden rope railing, a subtle place to stand a separately overlaid mascot, NO yellow sand at this landing. From 40% through 89% height use calm turquoise blue-green water, soft emerald shoreline plants at extreme left and right edges only, center mostly uncluttered water for future DOM task cards to cover. At bottom 90-100% height a narrow naturally curved pale golden sandy beach, gently reached by translucent turquoise shallow water and a thin white foam edge, bottom corners a few green leaves, center empty for future navigation. Dominant blue and green everywhere except this very bottom sand strip. Continuous coherent landscape, no bands or horizontal seams, detailed but soft friendly sunlight, high clarity. All objects natural undistorted proportions; designed as a portrait composition from the start rather than stretched landscape. No people, raccoon, bear, mascot, writing or UI.

## 最终定向编辑提示词

Edit this portrait mobile game background with one precise change: move the small grassy landing with rope railing from left to horizontally CENTERED, and a little higher, so its flat green top surface is at 38% of total image height. Make landing about 45% of image width, naturally connected to a side shoreline by a narrow green rocky path. This is where a separate character will stand. Keep the portrait aspect ratio, all blue-green water, two lighthouses, sky, bottom-only sandy beach, original illustration style and natural object proportions unchanged. No characters, no text, no UI. High resolution.

## 卡通场景与站姿更新（内置imagegen）

最终角色：`dist/assets/hd/library-v2/raccoon-standing-v2.png`。最终背景：`dist/assets/hd/today-cartoon-portrait-v3.png`。原素材保留。

角色提示词：Precise pose edit of this exact cute school raccoon mascot. Preserve its identity, face, big eyes, smiling expression, yellow bucket hat, cream yellow short sleeve shirt, blue shorts, blue backpack, brown cream shoes, raised waving arm, striped tail, soft polished cartoon 3D style and colors. Change ONLY the lower body and balance: stand upright at rest with both legs straight and BOTH SHOES planted flat on the SAME horizontal ground baseline. Feet a comfortable shoulder width apart, toes toward viewer, show the shoe uppers, NOT the soles. No walking, no running, no jumping, no lifted foot, no lean. Full body isolated on genuinely transparent background, no ground, no scene, no text. Leave minimal transparent margin below both shoe soles so the sprite can be aligned precisely to ground in a game. High resolution.

背景提示词：Image 1 is the BACKGROUND EDIT TARGET. Image 2 is STYLE REFERENCE ONLY, do not put this character into the output. Restyle image 1 into a cute animated children's mobile game environment matching the rounded friendly cartoon rendering of image 2: simpler large rounded rocks, plump stylized emerald foliage, broad clear turquoise water color shapes with sparse clean curved wave strokes, fluffy cloud shapes, softer toy-like lighthouse architecture, cleaner outlines and shading, much less photographic texture or tiny realistic detail. Preserve EXACT image 1 portrait aspect ratio and composition: islands/lighthouses at upper sides, grassy landing centered at about38% height, long uncluttered blue-green water area below, sand only at bottom 10%. Keep the standing landing's flat top clearly visible, horizontal and centered, with railing behind and at sides, no railing across the center foreground where character feet will stand. Do not add any character, interface, card, button, text, logo, border. This output is a separate background layer only. Natural proportional geometry, no stretching. Beach should have a clear clean illustrated curved outline separating sand from water, no blurry gradient.

## 连续沙路更新（2026-10-27，内置 imagegen）

使用原背景和用户最新海边小路参考图定向编辑。新背景 `dist/assets/hd/today-sandy-path-v4.png`，853×1844；原图位于 `/Users/miazou/.codex/generated_images/01a172da-613c-7fd3-be3e-1f2b73441bca/exec-27fd0a02-0460-41a9-a294-3eb9e699b23d.png`。

提示词：Preserve portrait composition and cartoon style. Replace only the central grassy landing with a continuous pale golden sandy path entering from the left land bridge and crossing the standing area. Use irregular edges penetrated by grass tufts, small stones and flowers; preserve railing and leafy front cliff. No oval disk, rug, uniform outline, mascot, text, UI or red annotation. Keep other scenery unchanged.

移除独立椭圆 SVG 沙垫，改为背景中连续的沙路；角色脚下只保留短接触阴影。390×844 页面截图已检查，沙地与绿地连续，双脚位于沙路上。原生像素仍满足此尺寸 DPR2，严格 DPR3 母版待补。
