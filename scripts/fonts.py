# /// script
# requires-python = ">=3.12"
# dependencies = ["fonttools>=4.60"]
# ///
"""Builds the style's glyphs: dist/fonts/<fontstack>/<range>.pbf.

Downloads each family in fonts/fonts.json from Google Fonts' repository at a
pinned commit, cuts static instances out of variable fonts, names each
instance "<Family> <Style>", and runs build_pbf_glyphs over them. Every
instance also gets a stack with the fallback family's same style behind it,
"<Family> <Style>,<Fallback> <Style>", which is the URL that a style's
`["<Family> <Style>", "<Fallback> <Style>"]` text-font requests.

Usage: uv run scripts/fonts.py [family ...]
"""

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "fonts"
OUT = ROOT / "dist" / "fonts"


def download(source: str, path: str) -> Path:
  target = CACHE / "src" / path
  if not target.exists():
    target.parent.mkdir(parents=True, exist_ok=True)
    url = source + urllib.parse.quote(path)
    print(f"downloading {path}", file=sys.stderr)
    with urllib.request.urlopen(url) as response:
      target.write_bytes(response.read())
  return target


def rename(font: TTFont, family: str, style: str) -> None:
  names = font["name"]
  full = f"{family} {style}"
  for record in list(names.names):
    if record.nameID in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
      names.removeNames(nameID=record.nameID)
  for name_id, value in (
    (1, family),
    (2, style),
    (3, full),
    (4, full),
    (6, full.replace(" ", "")),
    (16, family),
    (17, style),
  ):
    names.setName(value, name_id, 3, 1, 0x409)


def widen_space(font: TTFont, of_n: float) -> None:
  """Sets the word space's advance to `of_n` times the "n"'s: a family whose
  space is narrow runs words together at map sizes."""
  cmap = font.getBestCmap()
  metrics = font["hmtx"].metrics
  space = cmap[ord(" ")]
  width = round(metrics[cmap[ord("n")]][0] * of_n)
  metrics[space] = (max(width, metrics[space][0]), metrics[space][1])


def instance(config: dict, family: str, style: str, spec: dict) -> Path:
  entry = config["families"][family]
  # Keyed by everything that shapes the instance, so a changed setting builds
  # it again.
  key = hashlib.sha256(
    json.dumps([config["source"], entry, spec], sort_keys=True).encode()
  ).hexdigest()[:12]
  target = CACHE / "ttf" / f"{family} {style} {key}.ttf"
  if target.exists():
    return target
  path = entry["italic" if spec.get("italic") else "upright"]
  font = TTFont(download(config["source"], path))
  location = {tag: value for tag, value in entry.get("axes", {}).items()}
  location["wght"] = spec["wght"]
  # Pin every axis, so the instance is a static font.
  for axis in font["fvar"].axes:
    location.setdefault(axis.axisTag, axis.defaultValue)
  font = instancer.instantiateVariableFont(font, location)
  if "wordSpace" in entry:
    widen_space(font, entry["wordSpace"])
  rename(font, family, style)
  target.parent.mkdir(parents=True, exist_ok=True)
  font.save(target)
  return target


def main() -> None:
  config = json.loads((ROOT / "fonts" / "fonts.json").read_text())
  fallback = config["fallback"]
  wanted = sys.argv[1:] or list(config["families"])
  if fallback not in wanted:
    wanted.append(fallback)
  with tempfile.TemporaryDirectory() as tmp:
    work = Path(tmp)
    combos: dict[str, list[str]] = {}
    for family in wanted:
      for style, spec in config["styles"].items():
        ttf = instance(config, family, style, spec)
        shutil.copy(ttf, work / f"{family} {style}.ttf")
        if family != fallback:
          name = f"{family} {style}"
          combos[f"{name},{fallback} {style}"] = [name, f"{fallback} {style}"]
    (work / "combinations.json").write_text(json.dumps(combos))
    OUT.mkdir(parents=True, exist_ok=True)
    subprocess.run(
      [
        "build_pbf_glyphs",
        "--combinations",
        str(work / "combinations.json"),
        str(work),
        str(OUT),
      ],
      check=True,
    )


if __name__ == "__main__":
  main()
