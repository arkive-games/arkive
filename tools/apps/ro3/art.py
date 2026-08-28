"""Export Ragnarok Online 3's UI art to WebP in ``resource-ro3``.

Where the icons actually are
----------------------------
Nowhere addressable. The game ships no asset paths — every bundle's ``AssetBundle``
container map holds the single literal key ``asset`` — so the only handle on an icon is
the object's ``m_Name``, which :mod:`.catalog` indexes for all 188,361 bundles. Icons are
named plainly enough for that to be sufficient: ``icon_skill_acolyte_blessing``,
``icon_talent_assassin_poison_blade``, ``icon_dungeon_...``.

Nor are they whole images. Every UI icon is a ``Sprite`` **packed into a sprite atlas**,
and its ``m_RD.texture`` is null, because Unity resolves the real texture at runtime
through the ``SpriteAtlas``. So an icon is only reachable as: sprite ->
``m_RenderDataKey`` -> the atlas's ``m_RenderDataMap`` -> a texture and a rect on an atlas
page. This module makes that join explicit, then crops the page.

Division of labour: ``unex`` mounts the bundles, deserializes objects through their type
trees and decodes atlas pages to PNG (:mod:`.unex` drives it); Pillow crops and writes
WebP. Nothing here parses a Unity type or a texture format itself.

Usage::

    uv run python -m ro3.art                      # every category
    uv run python -m ro3.art --only skills --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image

from .catalog import CATALOG, load
from .common import write_json
from .env import optional_dir, require_dir
from .unex import PROFILE, Serve, write_profile
from .unpack import stage_dir


@dataclass(frozen=True, slots=True)
class Category:
    """One output directory, and the object names that belong in it.

    ``klass`` picks the route: a ``Sprite`` has to be cut out of its atlas, while a
    ``Texture2D`` is a whole image and is decoded straight to PNG by unex.
    """

    out: str
    pattern: str
    note: str
    klass: str = "Sprite"

    @property
    def regex(self) -> re.Pattern[str]:
        return re.compile(self.pattern, re.IGNORECASE)


#: Order matters: the first matching category wins, so the specific ones come first and
#: the ``icon_`` catch-all last.
CATEGORIES: tuple[Category, ...] = (
    Category("icons/skills", r"^icon_skill_", "class, pet and boss skill icons"),
    Category("icons/talents", r"^icon_talent_", "talent-tree icons"),
    Category("icons/jobs", r"^(icon_job_|job_icon_)", "job / class icons"),
    Category("bosses/portraits", r"^headicon_(boss|explicit)_", "raid-boss head portraits"),
    Category("icons/monsters", r"^headicon_monster_", "monster head portraits"),
    Category("icons/dungeons", r"dungeon", "dungeon panel and entry art"),
    Category("icons/other", r"^icon_", "every remaining icon_* sprite"),
    Category("bosses/art", r"^Fx_Ui_Boss_", "full-size boss art used by the raid UI",
             "Texture2D"),
    Category("bosses/models", r"^Model_Boss_.*_LOD0$",
             "base colour map of each boss model, at its highest LOD", "Texture2D"),
)

#: A bundle whose name ends in one of these is a resolution variant of another bundle;
#: exporting all three would write the same icon three times at different sizes.
VARIANT_SUFFIXES = (".bundle.hd.bundle", ".bundle.ld.bundle")


@dataclass
class Counts:
    selected: int = 0
    written: int = 0
    duplicates: int = 0
    unresolved: list[str] = field(default_factory=list)


def match(categories, obj) -> Category | None:
    """The first category claiming this object, or ``None``."""
    for c in categories:
        if obj["class"] == c.klass and c.regex.search(obj["name"]):
            return c
    return None


def selection(catalog: Path, categories):
    """``(wanted bundles, atlas bundles)`` needed to satisfy ``categories``.

    ``wanted`` maps a bundle to the objects claimed inside it. Only base bundles are
    considered; ``.hd``/``.ld`` variants are the same art at another resolution and would
    collide on the output name.

    Every ``SpriteAtlas`` in the game is pulled in regardless of category, because a sprite
    names its atlas only by tag and the atlas usually lives in a different bundle. There
    are 168 of them, so this is cheap.
    """
    wanted: dict[str, list[dict]] = defaultdict(list)
    atlases: dict[str, list[dict]] = defaultdict(list)
    for bundle, obj in load(catalog):
        if bundle.endswith(VARIANT_SUFFIXES):
            continue
        if obj["class"] == "SpriteAtlas":
            atlases[bundle].append(obj)
        elif match(categories, obj) is not None:
            wanted[bundle].append(obj)
    return dict(wanted), dict(atlases)


def stage_selection(stage: Path, work: Path, bundles) -> Path:
    """Copy the chosen bundles into a directory small enough for unex to mount quickly."""
    out = work / "selection"
    if out.exists():
        shutil.rmtree(out)
    for rel in sorted(bundles):
        source = stage / rel
        target = out / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    return out


def _key(node) -> tuple:
    first = node["first"]
    return (first["data[0]"], first["data[1]"], first["data[2]"], first["data[3]"],
            node["second"])


def atlas_render_data(serve: Serve, vfs_path: str) -> dict[tuple, dict]:
    """``m_RenderDataMap`` of one SpriteAtlas, keyed the way a Sprite refers to it."""
    doc = serve.preview(vfs_path)
    return {_key(e["first"]): e["second"] for e in doc["fields"]["m_RenderDataMap"]}


def crop(page: Image.Image, rect: dict, settings_raw: int) -> Image.Image:
    """Cut one sprite out of an atlas page.

    ``textureRect`` is in Unity texture space, whose origin is the **bottom** left, while
    Pillow counts from the top — hence the flip. ``settingsRaw`` bit 3 marks a sprite the
    packer rotated 90 degrees to fit; those are rotated back.
    """
    x = int(round(rect["x"]))
    y = int(round(rect["y"]))
    w = int(round(rect["width"]))
    h = int(round(rect["height"]))
    top = page.height - y - h
    out = page.crop((x, top, x + w, top + h))
    if settings_raw & 0b1000:
        out = out.transpose(Image.Transpose.ROTATE_270)
    return out


def export(stage: Path, catalog: Path, work: Path, res_out: Path, categories,
           *, dry_run: bool = False, quality: int = 90) -> dict[str, Counts]:
    source_bundles, atlas_bundles = selection(catalog, categories)
    wanted = sorted(set(source_bundles) | set(atlas_bundles))
    counts = {c.out: Counts() for c in categories}
    for objs in source_bundles.values():
        for obj in objs:
            category = match(categories, obj)
            if category is not None:
                counts[category.out].selected += 1

    print(f"source bundles : {len(source_bundles)}")
    print(f"atlas bundles  : {len(atlas_bundles)}")
    print(f"objects wanted : {sum(c.selected for c in counts.values())}")
    for c in categories:
        print(f"  {c.out:<18} {counts[c.out].selected:>6}  ({c.note})")
    if dry_run:
        return counts

    selection_dir = stage_selection(stage, work, wanted)
    pages_dir = work / "pages"
    config = write_profile(work, selection_dir, work / "unex-out")

    started = time.time()
    with Serve(config) as serve:
        # atlas VFS path -> render-data map, and (bundle, pathId) -> decoded page
        atlas_maps: dict[str, dict[tuple, dict]] = {}
        page_cache: dict[tuple[str, int], Image.Image] = {}
        pathid_to_texture: dict[tuple[str, int], str] = {}

        for bundle, objs in atlas_bundles.items():
            container = Path(bundle).name
            for obj in objs:
                vfs = f"bundles/{container}/SpriteAtlas/{obj['name']}"
                try:
                    atlas_maps[vfs] = atlas_render_data(serve, vfs)
                except Exception as exc:  # noqa: BLE001
                    print(f"  atlas {obj['name']}: {type(exc).__name__}: {exc}")
        # Texture pathIds in every mounted bundle, so a render-data entry can name its page.
        mounted = set(wanted)
        for bundle, obj in load(catalog):
            if bundle in mounted and obj["class"] == "Texture2D":
                pathid_to_texture[(Path(bundle).name, obj["pathId"])] = obj["name"]

        done = 0
        seen: set[str] = set()
        for bundle, objs in sorted(source_bundles.items()):
            container = Path(bundle).name
            for obj in objs:
                category = match(categories, obj)
                if category is None:
                    continue
                # The same icon is shipped in more than one bundle; one copy is enough,
                # and a later copy is not always resolvable from the mounted atlases.
                if obj["name"] in seen:
                    counts[category.out].duplicates += 1
                    continue
                vfs = f"bundles/{container}/{category.klass}/{obj['name']}"
                try:
                    if category.klass == "Texture2D":
                        # Not cached: these are whole pages, used once, and 149 of them at
                        # 2048 square would be gigabytes of resident RGBA.
                        image = _page(serve, container, obj["name"], None, pages_dir)
                    else:
                        image = _sprite_image(serve, vfs, atlas_maps, page_cache,
                                              pathid_to_texture, pages_dir)
                except Exception as exc:  # noqa: BLE001 - report, never invent an icon
                    if len(counts[category.out].unresolved) < 25:
                        counts[category.out].unresolved.append(
                            f"{obj['name']}: {type(exc).__name__}: {exc}"
                        )
                    continue
                target = res_out / category.out / f"{safe_name(obj['name'])}.webp"
                target.parent.mkdir(parents=True, exist_ok=True)
                image.save(target, "WEBP", quality=quality, method=6)
                counts[category.out].written += 1
                seen.add(obj["name"])
                done += 1
                if done % 200 == 0:
                    print(f"  {done} icons  {time.time() - started:.0f}s")
    return counts


def _sprite_image(serve: Serve, vfs: str, atlas_maps, page_cache, pathid_to_texture,
                  pages_dir: Path) -> Image.Image:
    doc = serve.preview(vfs)
    fields = doc["fields"]
    key = _key(fields["m_RenderDataKey"])
    tags = fields.get("m_AtlasTags") or []
    container = doc["container"]

    # A sprite that was never packed keeps its own texture, and needs no atlas at all.
    own = fields.get("m_RD") or {}
    own_texture = (own.get("texture") or {}).get("m_PathID") or 0
    if own_texture:
        name = pathid_to_texture.get((container, own_texture))
        if name is not None:
            page = _page(serve, container, name, page_cache, pages_dir)
            return crop(page, own["textureRect"], int(own.get("settingsRaw") or 0))

    for atlas_vfs, table in atlas_maps.items():
        entry = table.get(key)
        if entry is None:
            continue
        if tags and Path(atlas_vfs).name not in tags:
            continue
        container = atlas_vfs.split("/")[1]
        path_id = entry["texture"]["m_PathID"]
        name = pathid_to_texture.get((container, path_id))
        if name is None:
            raise KeyError(f"atlas page pathId {path_id} is not in {container}")
        page = _page(serve, container, name, page_cache, pages_dir)
        return crop(page, entry["textureRect"], int(entry.get("settingsRaw") or 0))
    raise KeyError(f"render-data key {key} is in no mounted atlas (tags {tags})")


def safe_name(name: str) -> str:
    """A file name Windows accepts. Atlas pages carry ``|`` in their Unity name."""
    return re.sub(r'[<>:"/\\|?*]', "_", name)


def _page(serve: Serve, container: str, name: str, cache, pages_dir: Path) -> Image.Image:
    if cache is not None:
        hit = cache.get((container, name))
        if hit is not None:
            return hit
    png = pages_dir / container / f"{safe_name(name)}.png"
    serve.texture_png(f"bundles/{container}/Texture2D/{name}", png)
    image = Image.open(png).convert("RGBA")
    image.load()
    if cache is not None:
        cache[(container, name)] = image
    return image


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--stage", type=Path, default=None)
    ap.add_argument("--work", type=Path, default=None, help="scratch dir for the selection")
    ap.add_argument("--out", type=Path, default=None, help="resource-ro3 root")
    ap.add_argument("--only", action="append", default=None,
                    help="restrict to a category (its output directory)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--quality", type=int, default=90)
    args = ap.parse_args()

    stage = args.stage or stage_dir()
    work = args.work or stage.parent / f"{stage.name}-art"
    res_out = args.out or require_dir("RO3_RES_OUT")
    categories = CATEGORIES
    if args.only:
        wanted = set(args.only)
        categories = tuple(c for c in CATEGORIES if c.out in wanted or c.out.split("/")[-1] in wanted)
        if not categories:
            raise SystemExit(f"no category matches {args.only}; have "
                             f"{[c.out for c in CATEGORIES]}")

    counts = export(stage, stage / CATALOG, work, res_out, categories,
                    dry_run=args.dry_run, quality=args.quality)
    if args.dry_run:
        return 0

    print()
    total = 0
    for c in categories:
        n = counts[c.out]
        total += n.written
        print(f"{c.out:<18} {n.written:>6} written of {n.selected} selected "
              f"({n.duplicates} duplicate names, {len(n.unresolved)} unresolved)")
        for line in n.unresolved[:5]:
            print(f"    unresolved: {line}")
        if len(n.unresolved) > 5:
            print(f"    ... and {len(n.unresolved) - 5} more unresolved")
    print(f"total              {total:>6} WebP files -> {res_out}")

    manifest = {
        "source": (
            "sprites and textures in the decrypted Unity bundles, cut out of their sprite "
            "atlases and written as WebP into resource-ro3"
        ),
        "categories": [
            {
                "out": c.out,
                "pattern": c.pattern,
                "note": c.note,
                "class": c.klass,
                "selected": counts[c.out].selected,
                "written": counts[c.out].written,
                "duplicateNames": counts[c.out].duplicates,
                "unresolved": counts[c.out].unresolved,
                "files": sorted(
                    p.relative_to(res_out).as_posix()
                    for p in (res_out / c.out).glob("*.webp")
                ),
            }
            for c in categories
        ],
    }
    (work / "art-manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    # The same manifest goes into the dataset, so data-ro3 describes what resource-ro3 holds
    # and a consumer never has to guess a file name.
    data_out = optional_dir("RO3_DATA_OUT")
    if data_out is not None:
        write_json(data_out / "art.json", manifest)
        print(f"art index          -> {data_out / 'art.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
