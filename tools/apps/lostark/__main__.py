"""Command line entry point: ``python -m lostark emit`` / ``python -m lostark maps``."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from . import maps
from .db import Tables
from .emit import build, write
from .env import require_dir

USAGE = "usage: python -m lostark (emit | maps <mapId> [<mapId> ...])"


def _emit() -> int:
    tables = Tables(require_dir("LOSTARK_TABLES"))
    out = require_dir("LOSTARK_DATA_OUT")

    dataset = build(tables)
    write(dataset, out, source=tables.root)

    version = dataset["version.json"]
    counts = version["counts"]
    print(f"wrote {len(dataset)} files to {out}")
    print(
        f"  item levels={counts['itemLevels']} "
        f"ark cores={counts['arkCores']} locale keys={counts['localeKeys']}"
    )
    for role, dropped in version["droppedArkCoreValues"].items():
        if dropped:
            print(f"  dropped {dropped} {role} ark-core values with no ArkGridCore definition")
    return 0


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _maps(map_ids: list[str]) -> int:
    """Emit tiles and markers for the named maps.

    Kept separate from ``emit`` deliberately: the calculator dataset and the map
    dataset read different inputs and fail in different ways, and a broken map
    extraction must not be able to take the calculator's output down with it.
    """
    mapdata = require_dir("LOSTARK_MAPDATA")
    art = require_dir("LOSTARK_MAP_ART")
    out = require_dir("LOSTARK_DATA_OUT")

    rows: list[dict[str, object]] = []
    all_actors: list[maps.Actor] = []
    for map_id in map_ids:
        folder = mapdata / map_id
        volume = maps.read_minimap(folder / "MinimapData.loa", map_id)
        if volume is None:
            print(f"{map_id}: no minimap volume, skipped", file=sys.stderr)
            continue

        actors = maps.read_actors(folder / "DeployData.loa", volume.bounds)
        images = maps.tile_images(art, volume)
        score, total = maps.verify_alignment(volume, actors, images)
        print(
            f"{map_id} {volume.texture_stem}: {volume.cols}x{volume.rows} tiles, "
            f"{len(images)}/{len(volume.tiles)} on disk, {total} actors, "
            f"{100 * score:.1f}% on walkable"
        )
        # A wrong transform still renders a handsome map, so refuse to write one
        # rather than ship silently misplaced points.
        if score < maps.MIN_ALIGNMENT:
            print(
                f"{map_id}: alignment {100 * score:.1f}% is below the "
                f"{100 * maps.MIN_ALIGNMENT:.0f}% floor - refusing to write",
                file=sys.stderr,
            )
            return 1

        written, tile_px = maps.write_tiles(images, out, map_id)
        rows.append(maps.map_meta(volume, tile_px, volume.texture_stem))
        all_actors.extend(actors)
        _write_json(out / "markers" / f"{map_id}.json", {"markers": maps.markers(actors)})
        print(f"  wrote {written} tiles ({tile_px}px) and {len(actors)} markers")

    if not rows:
        print("no maps emitted", file=sys.stderr)
        return 1

    _write_json(out / "maps.json", {"maps": rows})
    _write_json(out / "types.json", maps.types(all_actors))
    print(f"wrote maps.json ({len(rows)} maps) and types.json to {out}")
    return 0


def main(argv: list[str]) -> int:
    command = argv[1:2]
    if command == ["emit"]:
        return _emit()
    if command == ["maps"] and argv[2:]:
        return _maps(argv[2:])
    print(USAGE, file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
