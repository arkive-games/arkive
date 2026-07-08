"""Recolor the grayscale skill-bar strip into per-rarity PNGs.

Reproduces the in-game look: displayed = tint * (grayscale / grayscale.max()).
Normalizing by the strip's own max maps its brightest facet to the tint exactly
(the tint stops sampled by ``parse_colors`` are those bright facets), so darker
facets scale down proportionally — a faithful multiply without regenerating any
triangle geometry. Blue interpolates its two stops left->right; the uniform
rarities have equal stops.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

_HERE = Path(__file__).resolve().parent
_REPO = _HERE.parents[3]  # tools/apps/palworld/skill_bar -> repo root

RAW = Path(os.environ.get("PALWORLD_RAW", "E:/SteamLibrary/steamapps/common/Palworld/Exports/Pal/Content/Pal"))
DEFAULT_TEX = RAW / "Texture/UI/Main_Menu/T_prt_pal_skill_base_02.png"
FALLBACK_TEX = _HERE / "strip.png"  # checked-in copy of the grayscale strip
DEFAULT_COLORS = _HERE / "colors.json"
DEFAULT_OUT_DIR = _REPO / "frontend/apps/palworld/public/images/passive-rank"


def _rgb(hex_str: str) -> np.ndarray:
    h = hex_str.lstrip("#")
    return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float64)


def _gradient(left: str, right: str, width: int) -> np.ndarray:
    """(width, 3) linear RGB ramp from ``left`` to ``right``."""
    t = np.linspace(0.0, 1.0, width)[:, None]
    return _rgb(left) * (1 - t) + _rgb(right) * t


def recolor(strip: Image.Image, left: str, right: str) -> Image.Image:
    arr = np.asarray(strip.convert("RGBA")).astype(np.float64)
    lum = arr[..., :3].mean(2)
    norm = lum / lum.max()  # brightest facet -> 1.0 -> tint
    grad = _gradient(left, right, arr.shape[1])  # (W, 3)
    rgb = np.clip(np.round(grad[None, :, :] * norm[:, :, None]), 0, 255)
    out = arr.copy()
    out[..., :3] = rgb  # keep original alpha
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m apps.palworld.skill_bar.generate")
    ap.add_argument("--tex", type=Path, default=None, help="grayscale strip PNG (defaults to game export, then repo copy)")
    ap.add_argument("--colors", type=Path, default=DEFAULT_COLORS, help="colors JSON from parse_colors")
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR, help="output directory")
    args = ap.parse_args()

    tex = args.tex or (DEFAULT_TEX if DEFAULT_TEX.exists() else FALLBACK_TEX)
    if not tex.exists():
        raise SystemExit(f"grayscale strip not found: {tex}")

    strip = Image.open(tex)
    rarities = json.loads(args.colors.read_text(encoding="utf-8"))["rarities"]
    args.out_dir.mkdir(parents=True, exist_ok=True)

    print(f"strip {tex.name} {strip.size} -> {args.out_dir}")
    for name, stops in rarities.items():
        img = recolor(strip, stops["left"], stops["right"])
        dst = args.out_dir / f"skill_base_02_{name}.webp"
        img.save(dst, "WEBP", lossless=True)  # lossless keeps the facet edges crisp
        print(f"  {name:5} {stops['left']} -> {stops['right']}  {dst.name}")


if __name__ == "__main__":
    main()
