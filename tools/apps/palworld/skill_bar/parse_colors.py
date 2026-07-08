"""Sample per-rarity skill-bar tints from a reference in-game screenshot.

The reference is a Palworld pal detail screenshot whose "被动技能" (passive) section
shows faceted bars: a blue/cyan bar (破浪王者) that transitions teal->blue across its
width, and near-uniform gold bars (游泳健将 / 无限精力). Each bar is the grayscale
``T_prt_pal_skill_base_02`` strip multiplied by a tint, so we recover the tint by
reading the *brightest* facets
(the light triangles ~= the pure tint; the dark ones are the same tint scaled
down). Dark passive-name text and white text are rejected before averaging.

The bar rectangles below are calibrated to the specific 769x510 reference
screenshot; pass a different ``--src`` only if it has the same layout.

Output: ``colors.json`` with, per rarity, a ``left``/``right`` hex stop
(equal for the uniform bars, a real gradient for blue).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

_HERE = Path(__file__).resolve().parent
DEFAULT_SRC = _HERE / "reference.png"  # checked-in copy of the calibration screenshot
DEFAULT_OUT = _HERE / "colors.json"

# (x0, x1, y0, y1, is_gradient) in the 769x510 reference screenshot. Only the
# rarities that get a faceted figure are sampled; "normal" (+1/unranked) and
# "red" (detrimental) use a flat background in the app, so they need no tint.
BARS: dict[str, tuple[int, int, int, int, bool]] = {
    "blue": (398, 655, 370, 404, True),  # 破浪王者 — real teal->blue gradient
    "gold": (58, 344, 418, 452, False),  # 游泳健将 — uniform gold
}

# Fraction of brightest (facet) pixels averaged for a tint; rejects the darker
# facets and any dark text, keeping the light-triangle color that is the tint.
_BRIGHT_PCT = 88
# Pixels whose min channel exceeds this are white UI text, not bar facets.
_WHITE_MIN = 200


def _hex(c: np.ndarray) -> str:
    return "#%02X%02X%02X" % tuple(int(round(v)) for v in c)


def _tint(region: np.ndarray) -> np.ndarray:
    """Mean color of the brightest non-white facets in an (h, w, 3) region."""
    px = region.reshape(-1, 3).astype(np.float64)
    px = px[px.min(1) <= _WHITE_MIN]
    if len(px) == 0:
        raise ValueError("no facet pixels left after white-text rejection")
    value = px.max(1)
    return px[value >= np.percentile(value, _BRIGHT_PCT)].mean(0)


def parse(src: Path) -> dict[str, dict[str, str]]:
    img = np.asarray(Image.open(src).convert("RGB"))
    out: dict[str, dict[str, str]] = {}
    for name, (x0, x1, y0, y1, gradient) in BARS.items():
        box = img[y0:y1, x0:x1]
        if gradient:
            mid = box.shape[1] // 2
            left, right = _tint(box[:, :mid]), _tint(box[:, mid:])
        else:
            left = right = _tint(box)
        out[name] = {"left": _hex(left), "right": _hex(right)}
    return out


def main() -> None:
    ap = argparse.ArgumentParser(prog="python -m apps.palworld.skill_bar.parse_colors")
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC, help="reference screenshot")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="colors JSON path")
    args = ap.parse_args()

    rarities = parse(args.src)
    payload = {"source": args.src.name, "rarities": rarities}
    args.out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(f"parsed {args.src.name} -> {args.out}")
    for name, stops in rarities.items():
        print(f"  {name:5} {stops['left']} -> {stops['right']}")


if __name__ == "__main__":
    main()
