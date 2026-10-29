"""Icons stage: every texture the wiki datasets name, as WebP under ``wiki/``.

Icons are kept small (they render at most a few hundred pixels wide); the gallery
portraits and item paintings are larger opaque artwork and keep more of their size.
A texture missing from the export is reported, not fatal: the page falls back to
its name, and the remedy is widening the ``uex export`` roots.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ICON_EDGE = 256
PICTURE_EDGE = 768
# Large artwork: the enemy gallery paintings and busts, item and accessory paintings.
PICTURE_DIRS = ("/Literature/Gallery", "/UINew/Material", "/UINew/System/Character")


def _source(raw: Path, game_path: str) -> Path:
    """``/Game/PBZContent/...`` -> the PNG ``uex export`` wrote for it."""
    rel = game_path.removeprefix("/Game/")
    return Path(raw) / "ProjectPBZ/Content" / f"{rel}.png"


def run_icons(raw: Path, res_out: Path, textures: dict[str, str]) -> None:
    out_dir = Path(res_out) / "wiki"
    out_dir.mkdir(parents=True, exist_ok=True)
    written, missing = 0, []
    for name, game_path in sorted(textures.items()):
        src = _source(raw, game_path)
        if not src.is_file():
            missing.append(name)
            continue
        dst = out_dir / f"{name}.webp"
        edge = PICTURE_EDGE if any(d in game_path for d in PICTURE_DIRS) else ICON_EDGE
        with Image.open(src) as img:
            img = img.convert("RGBA")
            img.thumbnail((edge, edge), Image.LANCZOS)
            img.save(dst, "WEBP", quality=88, method=4)
        written += 1
    # Drop icons no dataset names any more, so the resource repo doesn't accrete.
    stale = [p for p in out_dir.glob("*.webp") if p.stem not in textures]
    for p in stale:
        p.unlink()
    print(f"icons: {written} written, {len(stale)} stale removed, {len(missing)} missing from the export")
    if missing:
        print("icons: missing " + ", ".join(missing[:20]) + (" ..." if len(missing) > 20 else ""))
