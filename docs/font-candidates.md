# 作业岛字体候选（待用户确认）

2026-10-27 经网络检索，按圆润、动漫感、中文界面适配筛选四款。`dist/font-preview.html` 使用真实字体文件展示同一段标题、正文、导航、数字，可编辑试字。字体只在对比页加载，未替换主页面。

| 编号 | 字体 | 建议 | 原始项目 |
|---|---|---|---|
| A | 寒蝉圆黑体 Medium | 圆润清楚，适合全界面 | https://github.com/Warren2060/ChillRoundGothic |
| B | 荆南麦圆体 Regular | 童趣手写感，优先推荐给本项目 | https://github.com/maoken-fonts/KNMaiyuan |
| C | 站酷快乐体 Regular | 动漫标题感强，正文需确认风格 | https://github.com/googlefonts/zcool-kuaile |
| D | 站酷庆科黄油体 Regular | 圆润窄体，标题按钮醒目 | https://github.com/googlefonts/zcool-qingke-huangyou |

文件从上述项目main分支下载，来源路径在`dist/assets/font-candidates/sources.json`，四份OFL许可证与字体一起保存。未安装到操作系统。原字体文件未作修改。浏览器已确认四份真实字体载入及样张显示。全文字覆盖、字重分配与移动端排版检查在用户选定后执行。

已考虑粉圆体，但官方定位为台湾繁体中文使用，暂不作为本项目简体中文全界面替换首选。官方：https://github.com/justfont/open-huninn-font

本轮页面微调：小熊双脚下新增独立SVG沙色小地面，保留外围草地。已人工核对手机预览。

## 第二轮（尚未应用）

预览：`dist/font-preview-round2.html`。E 荆南波波黑 Bold（作者授权仓库 https://github.com/maoken-fonts/KNBobohei ，OFL）；F 标小智龙珠体（https://github.com/maoken-fonts/LongZhuTi ，OFL）；G 阿里妈妈方圆体 VF（https://www.alibabafonts.com/#/more）。

阿里字体下载自官网所引用服务器 `https://fonts.alibabadesign.com/AlimamaFangYuanTiVF/AlimamaFangYuanTiVF-Thin/AlimamaFangYuanTiVF-Thin.woff2`。读取字体 fvar 确认 wght 200–700、BEVL 1–100。官方法律声明链接 https://www.yuque.com/alimama_ai-font/vfse9w/fco5g1gifud8lls2 当前正文未成功读取，正式全站使用前需核实；本轮仅独立视觉样张。

主应用未改变字体，等待用户选择。

## 已确认

用户选择 A 寒蝉圆黑体。儿童端在 child-dialogs.css 中统一加载既有 chill.ttf（Medium），保留原 OFL 文件，父母端字体不变。第二轮候选未采用。
