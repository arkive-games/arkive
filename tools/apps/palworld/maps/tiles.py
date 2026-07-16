"""Tiles stage (port of tiles.mjs).

Slices each world map image into 8x8 1024px WebP tiles and converts every
referenced marker icon to WebP, into the resource-palworld repo. Uses Pillow
(the aion2 tools' image lib); WebP bytes differ from the old sharp output but
the images are equivalent.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None  # source maps are 8192x8192

MAP_IMAGES = {"MainWorld": "Texture/UI/Map/T_WorldMap.png", "WorldTree": "Texture/UI/Map/T_TreeMap.png"}
TILE = 1024
COUNT = 8
# Long-edge cap for note illustrations (they only render in a small popup).
NOTE_MAX_EDGE = 1024
# The border art is a bright cyan glow line (the map's true edge) with a dark
# vignette gradient fading from it out to a flat near-black void (MainWorld
# ~#0d161e, WorldTree ~#0d151c). ``_clear_void`` clears the void to transparent
# so the frontend background shows through, per-map parameters below.
#
# `tol` is the Manhattan colour-distance from the border colour below which a
# pixel counts as "void-like" for the edge-connected flood fill. It is high (140)
# so the fill sweeps through the flat void and most of the dark vignette; the
# bright cyan line (distance ~400–600) forms a closed barrier that stops the fill
# from leaking into in-map water of a similar dark tone. `tol` can't go much
# higher — WorldTree's barrier has a weak point (~240) where the fill would flood
# the whole ocean (void jumps 62%→88%).
#
# `inset` then shifts the cleared coastline inward by N px (folded into the
# signed-distance ramp) to thin the remaining dark rim. MainWorld's vignette is
# steep (~30px void→line) so tol alone lands near the line: inset 0. WorldTree's
# is far wider and more gradual (~500px, double glow ring), so tol leaves a wide
# rim that the flood fill can't reach; a large inset trims it to match.
VOID_PARAMS: dict[str, dict[str, int]] = {
    "MainWorld": {"tol": 140, "inset": 0},
    "WorldTree": {"tol": 140, "inset": 40},
}
# Feather width (px) of the signed-distance alpha ramp centred on the coastline.
# ~1px of anti-aliasing so the edge is smooth (no jaggies) yet crisp.
VOID_FEATHER_PX = 1.2


def _collect_icon_names(data_out: Path) -> set[str]:
    icons: set[str] = set()
    types = json.loads((data_out / "types.json").read_text(encoding="utf-8"))
    for c in types["categories"]:
        for s in c["subtypes"]:
            if s.get("icon"):
                icons.add(s["icon"])
    for f in sorted((data_out / "markers").iterdir()):
        markers = json.loads(f.read_text(encoding="utf-8"))["markers"]
        for m in markers:
            if m.get("icon"):
                icons.add(m["icon"])
    return icons


def _collect_note_images(data_out: Path) -> set[str]:
    """Note markers carry a full-page illustration stem in their ``image`` field
    (see data-contract ``MarkerInstance.image``); collect the referenced stems."""
    images: set[str] = set()
    for f in sorted((data_out / "markers").iterdir()):
        markers = json.loads(f.read_text(encoding="utf-8"))["markers"]
        for m in markers:
            if m.get("image"):
                images.add(m["image"])
    return images


def _icon_source_path(raw: Path, name: str) -> Path | None:
    compass = raw / "Texture/UI/InGame" / f"{name}.png"
    if name.startswith("T_icon_compass_") and compass.exists():
        return compass
    build = raw / "Texture/BuildObject/PNG" / f"{name}.png"
    if name.startswith("T_icon_buildObject_") and build.exists():
        return build
    # Fishing-minigame UI icons (the fishing-spot marker uses the pond icon).
    fishing = raw / "Texture/UI/Fishing" / f"{name}.png"
    if name.startswith("T_Fishing_") and fishing.exists():
        return fishing
    # Inventory item icons (resource materials, etc.) live in the sibling
    # `Content/Others` tree, not under `Content/Pal`. e.g. ore/oil markers use
    # T_itemicon_Material_<Item>.
    item = raw.parent / "Others/InventoryItemIcon/Texture" / f"{name}.png"
    if name.startswith("T_itemicon_") and item.exists():
        return item
    npc = raw / "Texture/PalIcon/NPC" / f"{name}.png"
    if name.startswith("T_BOSS_NPC_") and npc.exists():
        return npc
    pal = raw / "Texture/PalIcon/Normal" / f"{name}.png"
    if pal.exists():
        return pal
    # Collab pal icons sit in subfolders (e.g. Normal/Yakushima/).
    return next((raw / "Texture/PalIcon/Normal").rglob(f"{name}.png"), None)


def _save_webp(img: Image.Image, dest: Path) -> None:
    img.save(dest, "WEBP", quality=90, method=6)


def _clear_void(img: Image.Image, tol: int, inset: int) -> Image.Image:
    """Make the out-of-border "void" transparent so the frontend's Leaflet
    background colour shows through (letting it differ per light/dark theme).

    The source map bakes an opaque dark fill outside the playable border, so a
    fixed CSS background can only match one theme. Here we clear the void to
    alpha 0 instead: take the border colour from a corner pixel, find every
    pixel within ``tol`` of it, and keep only the connected components touching
    an image edge (so in-map water of a similar tone, walled off by the cyan
    border line, is preserved — see ``VOID_PARAMS``). The coastline is then
    shifted inward by ``inset`` px and anti-aliased with a ``VOID_FEATHER_PX``
    signed-distance ramp, so it is thin and smooth rather than a jagged binary
    cut. Returns a new RGBA image.
    """
    rgba = np.array(img.convert("RGBA"))
    border = rgba[0, 0, :3].astype(np.int16)
    dist = np.abs(rgba[:, :, :3].astype(np.int16) - border).sum(axis=2)
    close = dist <= tol
    labels, _ = ndimage.label(close)
    edge = np.unique(
        np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    )
    edge = edge[edge != 0]
    void = np.isin(labels, edge)
    # Signed distance to the void boundary (+ inside island, − inside void).
    # Subtracting `inset` shifts the boundary that many px into the island;
    # dividing by the feather width gives a soft ~1px ramp → anti-aliased alpha.
    signed = ndimage.distance_transform_edt(~void) - ndimage.distance_transform_edt(void)
    ramp = np.clip((signed - inset) / VOID_FEATHER_PX + 0.5, 0.0, 1.0)
    rgba[:, :, 3] = (rgba[:, :, 3] * ramp).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def slice_tiles(raw: Path, res_out: Path) -> None:
    """Slice each world map image into 8x8 ``TILE``-px WebP tiles, with the
    out-of-border void cleared to transparent (see ``_clear_void`` /
    ``VOID_PARAMS``). Kept separate from icon/note conversion so tiles can be
    regenerated on their own.
    """
    raw, res_out = Path(raw), Path(res_out)
    for map_id, img_rel in MAP_IMAGES.items():
        dir_ = res_out / "tiles" / map_id
        dir_.mkdir(parents=True, exist_ok=True)
        params = VOID_PARAMS[map_id]
        with Image.open(raw / img_rel) as img:
            img = _clear_void(img, params["tol"], params["inset"])
            for x in range(COUNT):
                for y in range(COUNT):
                    tile = img.crop((x * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE))
                    _save_webp(tile, dir_ / f"{map_id}_{x:02d}_{y:02d}.webp")
        print(f"tiles: {map_id} 64 tiles")


def convert_notes(raw: Path, data_out: Path, res_out: Path) -> None:
    """Convert note illustrations (large full-page drawings under Texture/Note)
    to resource-palworld ``notes/<stem>.webp`` (kept out of ``icons/`` — not pin
    icons). Source art is ~2560px; downscale the long edge to ``NOTE_MAX_EDGE``
    since these only render in a ~320px popup — keeps each file web-friendly
    (~1MB -> ~150KB)."""
    raw, data_out, res_out = Path(raw), Path(data_out), Path(res_out)
    note_dir = res_out / "notes"
    note_dir.mkdir(parents=True, exist_ok=True)
    ok, missing = 0, []
    for name in _collect_note_images(data_out):
        src = raw / "Texture/Note" / f"{name}.png"
        if not src.exists():
            missing.append(name)
            continue
        with Image.open(src) as im:
            im = im.convert("RGBA") if im.mode not in ("RGB", "RGBA") else im
            scale = NOTE_MAX_EDGE / max(im.size)
            if scale < 1:
                im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
            _save_webp(im, note_dir / f"{name}.webp")
        ok += 1
    print(f"notes: {ok} converted")
    if missing:
        print(f"notes missing sources: {missing}")


def run_tiles(raw: Path, data_out: Path, res_out: Path) -> None:
    raw, data_out, res_out = Path(raw), Path(data_out), Path(res_out)
    slice_tiles(raw, res_out)

    icon_dir = res_out / "icons"
    icon_dir.mkdir(parents=True, exist_ok=True)
    ok, missing = 0, []
    for name in _collect_icon_names(data_out):
        src = _icon_source_path(raw, name)
        if not src:
            missing.append(name)
            continue
        with Image.open(src) as im:
            _save_webp(im, icon_dir / f"{name}.webp")
        ok += 1
    print(f"icons: {ok} converted")
    if missing:
        print(f"icons missing sources: {missing}")

    convert_notes(raw, data_out, res_out)
