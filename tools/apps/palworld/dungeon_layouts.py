"""Dungeon-layouts stage: emit per-layout spawn-point maps for the frontend.

Palworld's random dungeons are World Partition **data layers** under the main
map: every grid cell ``Maps/MainWorld_5/PL_MainWorld5/_Generated_/
MainGrid_*_DL<hash>.json`` whose hash resolves to a ``Dungeon_Random_*`` layer
is one interior layout. The hash → layer join lives in the persistent level
``PL_MainWorld5.json`` (~180 MB, parsed once):
``WorldPartitionRuntimeLevelStreamingCell.DataLayers`` → ``DataLayerInstance
WithAsset`` GUID → ``DataLayerAsset'Dungeon_Random_<family>_<variant>'``.

Layer families map 1:1 onto dungeon ``SpawnAreaId``s (``_LAYER_TO_AREA``).
Parsing strips exactly one trailing ``_NN`` suffix and looks the rest up as a
family — this resolves the one ambiguous name (bare ``Dungeon_Random_Grass_02``
= Grass001 variant 02; Grass002's variants are ``Dungeon_Random_Grass_02_NN``).

Out of each layout we extract the gameplay-relevant point actors
(``_TYPE_TO_POINT``): boss-reward spawner points (tier from the per-instance
``RewardSpawnerType``; the native CDO default is ``Easy01``), enemy spawner
points by rank, interior chest points, exits, the defeat-boss unlockable wall,
and gatherables. Coordinates are world-space centimetres from the actor root
component, rounded to ints; the frontend normalizes to the layout's bounds.

Output:
  data-palworld/dungeon-layouts.json    {layouts: [{dungeon, variant, points}]}

Run: ``uv run python -m palworld.dungeon_layouts`` (from the ``tools`` dir).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .env import require_dir
from .maps.common import write_json

_GENERATED = "Maps/MainWorld_5/PL_MainWorld5/_Generated_"
_PERSISTENT = "Maps/MainWorld_5/PL_MainWorld5.json"
_DL_SUFFIX = re.compile(r"_DL([0-9A-F]+)\.json$")
_VARIANT = re.compile(r"^(.*)_(\d+)$")

# Layer family → dungeon SpawnAreaId (the id everything else keys off).
_LAYER_TO_AREA = {
    "Dungeon_Random_Grass": "Grass001",
    "Dungeon_Random_Grass_02": "Grass002",
    "Dungeon_Random_Forest_01": "Forest001",
    "Dungeon_Random_Forest_02": "Forest002",
    "Dungeon_Random_Dessert_01": "Dessert001",
    "Dungeon_Random_Volcano_01": "Volcano001",
    "Dungeon_Random_Snow_01": "Snow001",
    "Dungeon_Random_Island_01": "Island001",
    "Dungeon_Random_Island_02": "Island002",
    "Dungeon_Random_Island_03": "Island003",
    "Dungeon_Random_Sakura_01": "Sakura001",
    "Dungeon_Random_Viking_01": "Viking001",
    "Dungeon_Random_Yakushima_01": "Yakushima001",
    "Dungeon_Random_Skyland_01": "Skyland001",
}

_REWARD_TIER = {  # EPalDungeonRewardSpawnerType → display tier
    "Easy01": "easy", "Easy02": "easy", "Easy03": "easy",
    "Medium01": "medium", "Medium02": "medium", "Medium03": "medium",
    "Hard01": "hard", "Hard02": "hard", "Hard03": "bonus",
}

# Actor Type → (kind, sub). ``sub=None`` for kinds without a sub-category;
# reward tiers come from the instance property instead (see _point_for).
_TYPE_TO_POINT: dict[str, tuple[str, str | None]] = {
    "BP_DungeonRewardSpawnerPoint_C": ("reward", None),
    "BP_DungeonRewardSpawnerPoint_Hard03_C": ("reward", "bonus"),
    "BP_DungeonEnemySpawnerPoint_Normal_C": ("enemy", "normal"),
    "BP_DungeonEnemySpawnerPoint_Normal02_C": ("enemy", "floor2"),
    "BP_DungeonEnemySpawnerPoint_Normal03_C": ("enemy", "floor3"),
    "BP_DungeonEnemySpawnerPoint_Normal04_C": ("enemy", "floor4"),
    "BP_DungeonEnemySpawnerPoint_Boss_C": ("enemy", "boss"),
    "BP_DungeonEnemySpawnerPointMidboss1_C": ("enemy", "midBoss"),
    "BP_DungeonEnemySpawnerPoint_FishPal_C": ("enemy", "fishing"),
    "BP_DungeonEnemySpawnerPoint_MonsterOnly_C": ("enemy", "monster"),
    "BP_DungeonEnemySpawnerPoint_NPCHuman_C": ("enemy", "human"),
    "BP_DungeonEnemySpawnerPointBase_C": ("enemy", "base"),
    "BP_DungeonItemSpawnerPoint_Normal_C": ("chest", "normal"),
    "BP_DungeonItemSpawnerPoint_Yakushima_Normal_C": ("chest", "normal"),
    "BP_DungeonItemSpawnerPoint_Base_C": ("chest", "normal"),
    "BP_DungeonItemSpawnerPoint_Special_C": ("chest", "special"),
    "BP_DungeonItemSpawnerPoint_Yakushima_Special_C": ("chest", "special"),
    "BP_DungeonExit_C": ("exit", None),
    "BP_DungeonPortalV2_Exit_C": ("exit", None),
    "BP_DungeonGimmick_UnlockableWall_DefatBoss_C": ("bossDoor", None),
    "BP_PalMapObjectSpawner_RockCoal_C": ("gather", "coal"),
    "BP_PalMapObjectSpawner_RockCopper_C": ("gather", "copper"),
    "BP_PalMapObjectSpawner_Sulfur_C": ("gather", "sulfur"),
    "BP_PalMapObjectSpawner_RockQuartz_C": ("gather", "quartz"),
    "BP_PalMapObjectSpawner_RockStone_C": ("gather", "stone"),
    "BP_PalMapObjectSpawner_RockStone2_C": ("gather", "stone"),
    "BP_PalMapObjectSpawner_RockStone3_C": ("gather", "stone"),
    "BP_PalMapObjectSpawner_CaveMushroom_C": ("gather", "mushroom"),
    "BP_PalMapObjectSpawner_PalCrystal_C": ("gather", "crystal"),
    "BP_PalMapObjectSpawner_PalCrystal_Small_C": ("gather", "crystal"),
}
# Lotus / junk spawners come in many percent-suffixed variants; fishing spots
# in per-biome variants. Matched by stem instead of listing each.
_TYPE_STEMS: list[tuple[re.Pattern, tuple[str, str]]] = [
    (re.compile(r"^BP_PalMapObjectSpawner_Lotus_"), ("gather", "lotus")),
    (re.compile(r"^BP_PalMapObjectSpawner_Junk_"), ("gather", "junk")),
    (re.compile(r"^BP_FishingSpot_"), ("gather", "fishing")),
]
# Spawn-point families we claim to fully understand: any new game-update
# variant of these should fail loudly rather than vanish from the plots.
_MUST_MAP = re.compile(
    r"^BP_Dungeon(RewardSpawnerPoint|EnemySpawnerPoint|ItemSpawnerPoint)"
)
_SPAWNER_TYPE = "EPalDungeonRewardSpawnerType::"


def _cell_layers(raw: Path) -> dict[str, str]:
    """DL hash → dungeon layer name, from the persistent level (parsed once)."""
    objs = json.loads((raw / _PERSISTENT).read_text(encoding="utf-8"))
    inst_to_asset = {
        o["Name"]: o["Properties"]["DataLayerAsset"]["ObjectName"]
        .removeprefix("DataLayerAsset'").removesuffix("'")
        for o in objs
        if o.get("Type") == "DataLayerInstanceWithAsset"
        and (o.get("Properties") or {}).get("DataLayerAsset")
    }
    out: dict[str, str] = {}
    for o in objs:
        if "RuntimeLevelStreamingCell" not in (o.get("Type") or ""):
            continue
        m = re.search(r"_DL([0-9A-F]+)$", o.get("Name") or "")
        if not m or m.group(1) == "0":
            continue
        for ref in (o.get("Properties") or {}).get("DataLayers") or []:
            name = ref if isinstance(ref, str) else (ref.get("ObjectName") or "")
            name = name.rstrip("'").rsplit(".", 1)[-1]
            layer = inst_to_asset.get(name, "")
            if layer.startswith("Dungeon_Random_"):
                prev = out.setdefault(m.group(1), layer)
                assert prev == layer, f"cell DL{m.group(1)}: {prev} vs {layer}"
    return out


def _split_layer(layer: str) -> tuple[str, str] | None:
    """(SpawnAreaId, variant) for one layer name; None for unmapped families
    (Test). Strips exactly one trailing ``_NN`` — see the module docstring."""
    m = _VARIANT.match(layer)
    if m and m.group(1) in _LAYER_TO_AREA:
        return _LAYER_TO_AREA[m.group(1)], m.group(2)
    if layer in _LAYER_TO_AREA:  # family-level cell should not occur
        raise AssertionError(f"cell mapped to bare family layer {layer}")
    return None


def _point_for(obj: dict, objs: list) -> dict | None:
    """The emitted point for one actor object, or None for irrelevant types."""
    typ = obj.get("Type") or ""
    hit = _TYPE_TO_POINT.get(typ)
    if hit is None:
        for stem, mapped in _TYPE_STEMS:
            if stem.match(typ):
                hit = mapped
                break
    if hit is None:
        assert not _MUST_MAP.match(typ), f"unmapped dungeon spawn point type {typ}"
        return None
    props = obj.get("Properties") or {}
    kind, sub = hit
    if kind == "reward" and sub is None:
        raw_tier = (props.get("RewardSpawnerType") or f"{_SPAWNER_TYPE}Easy01")
        sub = _REWARD_TIER[raw_tier.removeprefix(_SPAWNER_TYPE)]
    root = (props.get("RootComponent") or {}).get("ObjectPath") or ""
    try:
        comp = objs[int(root.rsplit(".", 1)[1])]
    except (IndexError, ValueError):
        return None  # no placed root component → not a placed actor
    loc = (comp.get("Properties") or {}).get("RelativeLocation")
    if not loc:
        return None
    return {
        "kind": kind,
        "sub": sub,
        "x": round(loc["X"]),
        "y": round(loc["Y"]),
        "z": round(loc["Z"]),
    }


def run_dungeon_layouts(raw: Path, data_out: Path) -> dict:
    layers_by_hash = _cell_layers(raw)
    # A layout's actors normally live in one grid cell, but merge defensively
    # in case a layer ever spans several cells.
    by_layout: dict[tuple[str, str], list] = {}
    for path in sorted((raw / _GENERATED).glob("*.json")):
        m = _DL_SUFFIX.search(path.name)
        if not m or m.group(1) not in layers_by_hash:
            continue
        split = _split_layer(layers_by_hash[m.group(1)])
        if split is None:
            continue
        objs = json.loads(path.read_text(encoding="utf-8"))
        by_layout.setdefault(split, []).extend(
            p for o in objs if (p := _point_for(o, objs))
        )

    layouts = []
    for (area, variant), points in sorted(by_layout.items()):
        points.sort(key=lambda p: (p["kind"], p["sub"] or "", p["x"], p["y"]))
        layouts.append({"dungeon": area, "variant": variant, "points": points})
    out = {"layouts": layouts}
    write_json(data_out / "dungeon-layouts.json", out)
    return out


if __name__ == "__main__":
    result = run_dungeon_layouts(require_dir("PALWORLD_RAW"), require_dir("PALWORLD_DATA_OUT"))
    print(f"dungeon_layouts: {len(result['layouts'])} layouts")
