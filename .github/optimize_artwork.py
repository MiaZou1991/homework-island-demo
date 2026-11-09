#!/usr/bin/env python3
"""Build a WebP-optimized Pages artifact while preserving source artwork in dist/."""
from pathlib import Path
import shutil
from PIL import Image

SOURCE = Path("dist")
BUILD = Path("build/pages")
TARGETS = [
    *[Path(f"assets/our-island-v1/{name}.png") for name in ("map", "girl", "tree")],
    *[Path(f"assets/island-stage-{i}.png") for i in range(4)],
    Path("assets/room.png"),
    Path("assets/characters/char_dog.png"),
    *[Path(f"assets/characters/companion-{name}-v3.png")
      for name in ("bear", "rabbit", "fox", "panda", "owl", "lion", "unicorn")],
]

if BUILD.exists():
    shutil.rmtree(BUILD)
shutil.copytree(SOURCE, BUILD)

converted_names = set()
before_total = after_total = 0
for relative in TARGETS:
    source = BUILD / relative
    if not source.is_file():
        raise FileNotFoundError(f"Expected artwork is missing: {source}")
    target = source.with_suffix(".webp")
    with Image.open(source) as image:
        has_alpha = image.mode in ("RGBA", "LA") or "transparency" in image.info
        image = image.convert("RGBA" if has_alpha else "RGB")
        for quality in (86, 80, 74):
            image.save(target, "WEBP", quality=quality, method=6)
            if target.stat().st_size < source.stat().st_size:
                break
    if target.stat().st_size >= source.stat().st_size:
        raise RuntimeError(f"WebP conversion did not reduce {relative}")
    before_total += source.stat().st_size
    after_total += target.stat().st_size
    converted_names.add(str(relative))
    source.unlink()

# Rewrite only paths for assets converted above. The dynamic island-stage path
# is handled separately because the stage number is interpolated at runtime.
for path in BUILD.rglob("*"):
    if path.suffix.lower() not in (".html", ".js", ".css"):
        continue
    text = path.read_text(encoding="utf-8")
    for filename in converted_names:
        webp_filename = str(Path(filename).with_suffix(".webp"))
        text = text.replace(filename, webp_filename)
        # Companion filenames are assembled dynamically in demo-core.js as
        # 'assets/characters/' + file, so there is no literal full path to match.
        if filename.startswith("assets/characters/"):
            text = text.replace(Path(filename).name, Path(webp_filename).name)
    text = text.replace("island-stage-${stage(d)}.png", "island-stage-${stage(d)}.webp")
    text = text.replace("assets/our-island-v1/${name}.png", "assets/our-island-v1/${name}.webp")
    path.write_text(text, encoding="utf-8")

# Catch broken companion paths before publishing: the PNGs were removed above.
core = (BUILD / "demo-core.js").read_text(encoding="utf-8")
for relative in TARGETS:
    if relative.parts[:2] == ("assets", "characters") and relative.name in core:
        raise RuntimeError(f"Unconverted companion filename in demo-core.js: {relative.name}")

saved = before_total - after_total
print(f"Optimized {len(TARGETS)} images: {before_total:,} -> {after_total:,} bytes "
      f"({saved / before_total:.0%} smaller).")



# Pages font delivery: preserve the approved Chill Round Gothic outlines, but
# never make a phone download the 12.5 MB TrueType file just to draw the first tab.
# A UI-character subset covers the app's static copy; the full WOFF2 face is
# kept for uncommon characters in family-entered homework and journal text.
from fontTools import subset
from fontTools.ttLib import TTFont

font_path = BUILD / "assets/font-candidates/chill.ttf"
full_path = font_path.with_suffix(".woff2")
ui_path = font_path.with_name("chill-ui.woff2")
if not font_path.is_file():
    raise FileNotFoundError(f"Approved child font is missing: {font_path}")

full_font = TTFont(font_path)
full_font.flavor = "woff2"
full_font.save(full_path)
coverage = set(full_font.getBestCmap())
full_font.close()

static_sources = ("child.html", "upgrade.js", "demo-core.js",
                  "family-schedule.js", "child-dialogs.js", "v2-reminders.js")
ui_codepoints = set(range(0x20, 0x7F))
ui_codepoints.update(range(0x3000, 0x3040))
ui_codepoints.update(range(0xFF00, 0xFF66))
for name in static_sources:
    ui_codepoints.update(map(ord, (SOURCE / name).read_text(encoding="utf-8")))
ui_codepoints.intersection_update(coverage)
if not ui_codepoints:
    raise RuntimeError("Failed to select any glyphs for the child UI font")

options = subset.Options()
options.flavor = "woff2"
options.layout_features = ["*"]
ui_font = TTFont(font_path)
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=ui_codepoints)
subsetter.subset(ui_font)
ui_font.flavor = "woff2"
ui_font.save(ui_path)
ui_font.close()
if not (ui_path.stat().st_size < full_path.stat().st_size < font_path.stat().st_size):
    raise RuntimeError("Chill font compression/subsetting did not save bandwidth")

def as_unicode_ranges(codes):
    chunks = []
    first = previous = None
    for code in sorted(codes):
        if first is None:
            first = previous = code
        elif code == previous + 1:
            previous = code
        else:
            chunks.append(f"U+{first:X}" if first == previous else f"U+{first:X}-{previous:X}")
            first = previous = code
    if first is not None:
        chunks.append(f"U+{first:X}" if first == previous else f"U+{first:X}-{previous:X}")
    return ",".join(chunks)

child_css = BUILD / "child-dialogs.css"
css = child_css.read_text(encoding="utf-8")
source_face = "@font-face{font-family:IslandRound;src:url('assets/font-candidates/chill.ttf') format('truetype');font-weight:500;font-style:normal;font-display:swap}"
if css.count(source_face) != 1:
    raise RuntimeError("Approved font declaration has changed; review it before release")
full_face = source_face.replace("chill.ttf') format('truetype')",
                                "chill.woff2') format('woff2')")
ui_face = full_face.replace("chill.woff2", "chill-ui.woff2")[:-1] + (
    ";unicode-range:" + as_unicode_ranges(ui_codepoints) + "}")
child_css.write_text(css.replace(source_face, full_face + "\n" + ui_face),
                     encoding="utf-8")
print(f"ChillRound font: TTF {font_path.stat().st_size:,} bytes; "
      f"full WOFF2 {full_path.stat().st_size:,}; "
      f"first-screen UI subset {ui_path.stat().st_size:,} "
      f"({1 - ui_path.stat().st_size / font_path.stat().st_size:.0%} smaller).")
