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
