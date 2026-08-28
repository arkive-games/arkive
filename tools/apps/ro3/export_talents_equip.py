"""Emit the ro3 talent and equipment tables, and the icons they reference.

:mod:`.export_config` covers skills, items, NPCs and the language tables; this covers the
two systems that hang off them -- the talent trees and the equipment table -- plus the
sprites they name, which no earlier art pass exported.

What joins to what
------------------
**Equipment is two tables.** ``EquipConfig`` holds the mechanics (base stats, entry pool,
special-attribute pool, rank) and ``ItemConfig`` holds the identity (name, description,
icon, slot, quality, level and job requirement). The bridge is ``ItemConfig.iEquipId``, and
it is a bijection over the rows that have one: 1,289 of the 1,304 ``EquipConfig`` rows are
named by exactly one item, and no item points at an id ``EquipConfig`` does not have.

**Talents are three unrelated systems** that happen to share the word:

``SeasonTalentTreeConfig`` / ``SeasonTalentConfig`` / ``SeasonTalentEffectConfig``
    the live season talent tree -- 11 trees, 232 nodes, 779 per-level rows. A node's
    ``iLevelGroupId`` selects the effect rows that give it its levels.
``PatronTalentConfig`` / ``PatronTalentAttrConfig`` / ``PatronTalentGroupConfig``
    the patron ("star matrix") board: 3 boards of 12 positions, each node stepping through
    three ``PatronTalentAttrConfig`` rows.
``SeasonTalent`` / ``SeasonTalentAttr`` / ``SeasonTalentAttrConfig``
    a five-node tree whose name ids resolve in **no** language table. It is emitted as
    found and flagged, not presented as content.

Attribute ids are resolved through ``AttributeConfig``, which carries both a stable
``kVariable`` slug (``maxhp``, ``atk``) and a localized name; only the ids these rows
actually reference are emitted, as a lookup rather than inline on every row.

Known gaps, measured not guessed
--------------------------------
Ten ``Equip*`` tables ship their **row ids with empty row bodies** -- the chunk builds
``m_kValues[id] = {}`` and the row has no metatable to inherit from, so this is the client
shipping a key set and nothing else, not a decode failure. ``EquipEntryLevel`` (2,856),
``EquipPrice`` (57,120) and ``EquipSpecialAttr`` (108) are the ones that would have named
and valued the entries and special attributes. Their id sets are reported under
``keysOnly`` and their ids are left unresolved wherever a row references them.

Usage::

    uv run python -m ro3.export_talents_equip
    uv run python -m ro3.export_talents_equip --skip-art
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from . import art, localization, lua_tables
from .common import write_json
from .env import require_dir
from .export_config import (
    DATA_CONFIG,
    INLINE_LOCALES,
    LOCALE_TAGS,
    LOCALIZATION,
    SHARD_BUDGET,
    Text,
    clean,
    plain_rows,
    union_rows,
)
from .unpack import stage_dir

#: ``DataConfig`` tables this export reads. The first two groups are the subject; the last
#: three are joined in (item identity, attribute names, special-effect text).
WANTED_TABLES = (
    # season talent tree
    "SeasonTalentTreeConfig",
    "SeasonTalentConfig",
    "SeasonTalentEffectConfig",
    # patron ("star matrix") board
    "PatronTalentConfig",
    "PatronTalentAttrConfig",
    "PatronTalentGroupConfig",
    # the five-node tree whose strings are absent
    "SeasonTalent",
    "SeasonTalentAttr",
    "SeasonTalentAttrConfig",
    # equipment
    "EquipConfig",
    "EquipGridConfig",
    "EquipAttriGroupConfig",
    "EquipAttriRandom",
    "EquipEntryRandom",
    "EquipSpecialGroupConfig",
    "EquipCraftConfig",
    "EquipCraftQualityConfig",
    "EquipReturnConfig",
    "EquipEffectivenessConfig",
    # equipment tables that ship ids only
    "EquipEntry",
    "EquipEntryLevel",
    "EquipEntryExclusion",
    "EquipPrice",
    "EquipSpecialAttr",
    "EquipSpecialAttrLevel",
    "EquipSpecialExclusion",
    "EquipBaseProportion",
    "EquipBaseRateLevel",
    "EquipWhiteList",
    # joined in
    "ItemConfig",
    "AttributeConfig",
    "SpecialEffectConfig",
)

#: Tables measured to ship every row body empty. Listed so the export states the gap even
#: when a future build starts filling them -- the assertion is checked, not assumed.
EXPECTED_KEYS_ONLY = (
    "EquipEntry",
    "EquipEntryLevel",
    "EquipEntryExclusion",
    "EquipPrice",
    "EquipSpecialAttr",
    "EquipSpecialAttrLevel",
    "EquipSpecialExclusion",
    "EquipBaseProportion",
    "EquipBaseRateLevel",
    "EquipWhiteList",
)

#: Icon families in the resource repo that a row may join to, ``icons/equipment`` included
#: (this module is what puts it there).
ICON_DIRS = ("equipment", "talents", "skills", "jobs", "monsters", "dungeons", "other")

#: ``EquipGridConfig`` names its slot only through its sprites (``icon_equip_weapon_01``),
#: so the slug is cut out of the sprite name rather than invented here.
SLOT_FROM_ICON = re.compile(r"^icon_equip_(?P<slot>[a-z]+)_01$")

#: Item ids from ``ItemConfig.iEquipId`` that name no ``EquipConfig`` row would be a broken
#: join; the export fails rather than dropping them silently.
JOIN_MUST_BE_TOTAL = True


def is_wanted(script: str) -> bool:
    m = DATA_CONFIG.search(script)
    if m and m.group("name") in WANTED_TABLES:
        return True
    return bool(LOCALIZATION.search(script))


def table_rows(table) -> dict[str, dict]:
    """``m_kValues`` as an id-keyed map, tolerating the tables that ship it as an array.

    A handful of small tables (``SeasonTalent``, ``EquipGridConfig``, ``EquipAttriRandom``)
    return ``m_kValues`` as a Lua sequence rather than a map. Their rows carry their own id
    column, so the key is taken from that where it exists and from the 1-based position
    otherwise.
    """
    values = table.get("m_kValues") if isinstance(table, dict) else None
    if isinstance(values, dict):
        return values
    if isinstance(values, list):
        out = {}
        for index, row in enumerate(values, start=1):
            key = None
            if isinstance(row, dict):
                for column in ("_iID", "_iId", "id"):
                    if isinstance(row.get(column), int):
                        key = str(row[column])
                        break
            out[key if key is not None else str(index)] = row
        return out
    raise lua_tables.LuaError(f"m_kValues is {type(values).__name__}")


def union(chunks, runner) -> tuple[dict, dict]:
    """:func:`.export_config.union_rows` over tables that may ship ``m_kValues`` as a list."""
    rows: dict[str, dict] = {}
    stats: dict[str, dict] = {}
    declared: set[int] = set()
    for chunk in chunks:
        table = runner.run(chunk.data)
        found = table_rows(table)
        count = table.get("m_kCount")
        if isinstance(count, int):
            declared.add(count)
        added = conflicts = 0
        for key, row in found.items():
            if key not in rows:
                rows[key] = row
                added += 1
            elif rows[key] != row:
                conflicts += 1
        stats[chunk.script or chunk.name] = {
            "rows": len(found),
            "added": added,
            "conflictingSharedRows": conflicts,
        }
    return rows, {
        "copies": stats,
        "union": len(rows),
        "declaredCount": sorted(declared)[0] if len(declared) == 1 else sorted(declared),
    }


def sort_key(key: str):
    return (0, int(key)) if key.lstrip("-").isdigit() else (1, key)


def ordered(rows: dict) -> list[str]:
    return sorted(rows, key=sort_key)


def keys_only(rows: dict) -> bool:
    """Whether every row body in the table is empty."""
    return bool(rows) and all(not row for row in rows.values())


def read_icons(res_out: Path) -> dict[str, str]:
    """Sprite basename -> repo-relative WebP path, over every family a row may name."""
    found: dict[str, str] = {}
    for family in ICON_DIRS:
        directory = res_out / "icons" / family
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.webp")):
            found.setdefault(path.stem.lower(), f"icons/{family}/{path.name}")
    return found


def icon_path(icons: dict[str, str], source_name) -> str | None:
    if not isinstance(source_name, str) or not source_name:
        return None
    return icons.get(Path(source_name).stem.lower())


def sprite_names(*fields) -> set[str]:
    """The distinct sprite stems named by a set of ``foo.png`` config values."""
    out = set()
    for value in fields:
        if isinstance(value, str) and value:
            out.add(Path(value).stem)
    return out


# --------------------------------------------------------------------------------------
# attribute lookup


def attribute_lookup(attributes: dict, referenced: set[int], text: Text) -> list[dict]:
    """The referenced ``AttributeConfig`` rows, as ``id -> slug + localized name``.

    Only the columns a consumer needs to render a ``[attributeId, value]`` pair: the
    ``kVariable`` slug, the flat/percent ``iDataType``, and the two names the client uses
    (the panel name and the one it shows on an equipment tooltip).
    """
    out = []
    for key in sorted(referenced):
        row = attributes.get(str(key))
        if row is None:
            out.append({"iID": key, "missingFromAttributeConfig": True})
            continue
        entry: dict = {"iID": key}
        for column in ("_kVariable", "_iDataType", "_iAttributeType", "_iCalculateType"):
            if row.get(column) not in (None, "", 0):
                entry[column.lstrip("_")] = row[column]
        name = text.render(row.get("_iName"))
        equip_name = text.render(row.get("_iNameEquip"))
        if name:
            entry["name"] = name
        if equip_name and equip_name != name:
            entry["nameEquip"] = equip_name
        out.append(entry)
    return out


def pair_ids(value) -> list[int]:
    """The leading id of every ``[id, ...]`` pair in a config list column."""
    if not isinstance(value, list):
        return []
    out = []
    for item in value:
        if isinstance(item, list) and item and isinstance(item[0], int):
            out.append(item[0])
        elif isinstance(item, int):
            out.append(item)
    return out


def flat_ids(value) -> list[int]:
    return [v for v in value if isinstance(v, int)] if isinstance(value, list) else []


# --------------------------------------------------------------------------------------
# special effects


def effect_rows(effects: dict, referenced: set[int], text: Text) -> tuple[list[dict], dict]:
    """``SpecialEffectConfig`` rows a talent or an equipment row points at, with text.

    ``iEffectDesc`` is the placeholder-heavy field: ``${n}`` comes from the row's own
    ``kDescData`` and ``^{n}`` / ``@{n}`` from the field's trailing arguments (markup and
    skill links). :mod:`.localization` does the substitution.

    ``kOtherDesc`` is **not** rendered: it holds a copy of ``kSpecialEffect`` on all 317
    rows that set it, never a language id, so treating it as text would be a mistake in
    both directions.
    """
    out = []
    named = described = unresolved = 0
    missing = []
    starved = []
    for key in sorted(referenced):
        row = effects.get(str(key))
        if row is None:
            missing.append(key)
            continue
        entry = clean(row)
        desc_data = row.get("_kDescData") if isinstance(row.get("_kDescData"), list) else None
        name = text.render(row.get("_iEffectName"))
        desc = text.render(row.get("_iEffectDesc"), desc_data)
        if name:
            entry["name"] = name
            named += 1
        if desc:
            entry["desc"] = desc
            described += 1
            if any(localization.unresolved(v) for v in desc.values()):
                unresolved += 1
                if not any(str(v) for v in (desc_data or [])):
                    starved.append(row.get("_iID", key))
        out.append(entry)
    return out, {
        "rows": len(out),
        "referenced": len(referenced),
        "withName": named,
        "withDescription": described,
        "withLeftoverPlaceholder": unresolved,
        "placeholderLeftBecauseDescDataIsEmpty": sorted(starved),
        "notInSpecialEffectConfig": sorted(missing),
    }


# --------------------------------------------------------------------------------------
# talents


def patron_nodes(nodes: dict, icons: dict, text: Text) -> tuple[list[dict], dict]:
    out = []
    named = joined = 0
    for key in ordered(nodes):
        row = nodes[key]
        entry = clean(row)
        name = text.render(row.get("_kName"))
        if name:
            entry["name"] = name
            named += 1
        icon = icon_path(icons, row.get("_kIcon"))
        if icon:
            entry["icon"] = icon
            joined += 1
        out.append(entry)
    return out, {"rows": len(out), "withName": named, "withIcon": joined}


def season_nodes(nodes: dict, effects_by_group: dict, text: Text) -> tuple[list[dict], dict]:
    """The tree's nodes, each carrying the effect-row ids that are its levels."""
    out = []
    with_levels = 0
    for key in ordered(nodes):
        row = nodes[key]
        entry = clean(row)
        group = row.get("_iLevelGroupId")
        levels = effects_by_group.get(group) or []
        if levels:
            entry["levels"] = levels
            with_levels += 1
        out.append(entry)
    return out, {"rows": len(out), "withLevelRows": with_levels}


def season_levels(effects: dict, icons: dict, text: Text) -> tuple[list[dict], dict]:
    out = []
    named = joined = 0
    for key in ordered(effects):
        row = effects[key]
        entry = clean(row)
        name = text.render(row.get("_iName"))
        if name:
            entry["name"] = name
            named += 1
        icon = icon_path(icons, row.get("_kIcon"))
        if icon:
            entry["icon"] = icon
            joined += 1
        out.append(entry)
    return out, {"rows": len(out), "withName": named, "withIcon": joined}


def tree_rows(trees: dict, text: Text) -> tuple[list[dict], dict]:
    out = []
    named = 0
    for key in ordered(trees):
        row = trees[key]
        entry = clean(row)
        name = text.render(row.get("_iTreeName"))
        if name:
            entry["name"] = name
            named += 1
        out.append(entry)
    return out, {"rows": len(out), "withName": named}


def legacy_nodes(nodes: dict, icons: dict, text: Text) -> tuple[list[dict], dict]:
    out = []
    named = joined = 0
    for key in ordered(nodes):
        row = nodes[key]
        entry = clean(row)
        name = text.render(row.get("name"))
        if name:
            entry["name"] = name
            named += 1
        icon = icon_path(icons, row.get("icon"))
        if icon:
            entry["icon"] = icon
            joined += 1
        out.append(entry)
    return out, {"rows": len(out), "withName": named, "withIcon": joined}


# --------------------------------------------------------------------------------------
# equipment


def slot_table(grid: dict, icons: dict) -> list[dict]:
    out = []
    for key in ordered(grid):
        row = grid[key]
        entry = clean(row)
        m = SLOT_FROM_ICON.match(Path(row.get("_kEquipGridIconS1") or "").stem)
        if m:
            entry["slot"] = m.group("slot")
        icon = icon_path(icons, row.get("_kEquipGridIcon1"))
        if icon:
            entry["icon"] = icon
        out.append(entry)
    return out


#: ``ItemConfig`` columns carried onto an equipment row. Identity and requirements only --
#: the rest of the item row is in ``items/`` and is not duplicated here.
ITEM_COLUMNS = (
    "_iID",
    "_iType",
    "_iSubType",
    "_iEquipPart",
    "_iQuality",
    "_iLevelNeed",
    "_kJobNeed",
    "_iSexNeed",
    "_iEnchantSlot",
    "_iStackLimit",
    "_iTrade",
    "_iAuction",
    "_iSort",
    "_kIcon",
    "_kParam1",
    "_kParam2",
    "_kDecompose",
    "_kSell",
    "_kMultiverseArray",
)


def equipment_rows(
    equip: dict, items: dict, slots: dict, icons: dict, text: Text
) -> tuple[list[dict], dict]:
    by_equip: dict[str, str] = {}
    duplicates = 0
    for key, row in items.items():
        target = row.get("_iEquipId")
        if isinstance(target, int) and target:
            if str(target) in by_equip:
                duplicates += 1
                continue
            by_equip[str(target)] = key

    dangling = sorted(set(by_equip) - set(equip), key=sort_key)
    if dangling and JOIN_MUST_BE_TOTAL:
        raise RuntimeError(
            f"{len(dangling)} items name an EquipConfig row that does not exist: "
            f"{dangling[:10]}"
        )

    out = []
    with_item = named = described = joined = unresolved = 0
    unexported: set[str] = set()
    for key in ordered(equip):
        row = equip[key]
        entry = clean(row)
        item_key = by_equip.get(key)
        if item_key is None:
            out.append(entry)
            continue
        item = items[item_key]
        with_item += 1
        carried = {
            column.lstrip("_"): item[column]
            for column in ITEM_COLUMNS
            if column in item and item[column] not in (None, "", 0, {}, [])
        }
        entry["item"] = carried
        part = item.get("_iEquipPart")
        slot = slots.get(part)
        if slot:
            entry["slot"] = slot
        name = text.render(item.get("_iName"))
        desc = text.render(item.get("_iDescription"))
        if name:
            entry["name"] = name
            named += 1
        if desc:
            entry["desc"] = desc
            described += 1
            if any(localization.unresolved(v) for v in desc.values()):
                unresolved += 1
        icon = icon_path(icons, item.get("_kIcon"))
        if icon:
            entry["icon"] = icon
            joined += 1
        elif isinstance(item.get("_kIcon"), str) and item["_kIcon"]:
            unexported.add(item["_kIcon"])
        out.append(entry)
    return out, {
        "rows": len(out),
        "withItem": with_item,
        "withoutItem": len(out) - with_item,
        "withName": named,
        "withDescription": described,
        "withIcon": joined,
        "withLeftoverPlaceholder": unresolved,
        "itemsSharingAnEquipId": duplicates,
        "iconsNotExported": sorted(unexported),
    }


# --------------------------------------------------------------------------------------
# art


def art_categories(equipment_icons: set[str], talent_icons: set[str]):
    """Two :class:`.art.Category` values matching exactly the sprites these rows name.

    An enumerated alternation rather than a family prefix: ``^item_`` would drag in every
    one of the client's 1,000-plus item sprites, and only the equipment rows' icons belong
    under ``icons/equipment``.
    """
    categories = []
    if equipment_icons:
        pattern = "^(?:%s)$" % "|".join(re.escape(n) for n in sorted(equipment_icons))
        categories.append(
            art.Category("icons/equipment", pattern, "item sprites named by the equipment rows")
        )
    if talent_icons:
        pattern = "^(?:%s)$" % "|".join(re.escape(n) for n in sorted(talent_icons))
        categories.append(
            art.Category("icons/talents", pattern, "talent sprites no earlier art pass exported")
        )
    return tuple(categories)


def export_art(equipment_icons: set[str], talent_icons: set[str], res_out: Path) -> dict:
    categories = art_categories(equipment_icons, talent_icons)
    if not categories:
        return {}
    stage = stage_dir()
    work = stage.parent / f"{stage.name}-art-talents-equip"
    counts = art.export(stage, stage / art.CATALOG, work, res_out, categories)
    return {
        c.out: {
            "selected": counts[c.out].selected,
            "written": counts[c.out].written,
            "duplicateNames": counts[c.out].duplicates,
            "unresolved": counts[c.out].unresolved,
        }
        for c in categories
    }


# --------------------------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--skip-art", action="store_true",
                    help="join to the icons already in resource-ro3 and export none")
    args = ap.parse_args()

    vfs = require_dir("RO3_GAME") / "StreamingAssets" / "VFS"
    out = require_dir("RO3_DATA_OUT")
    res_out = require_dir("RO3_RES_OUT")
    runner = lua_tables.Runner()

    found = lua_tables.collect_chunks(vfs, is_wanted)
    languages: dict[str, list] = {}
    for name in list(found):
        m = LOCALIZATION.search(found[name][0].script or "")
        if m:
            languages[m.group("code")] = found.pop(name)
    missing = [name for name in WANTED_TABLES if name not in found]
    if missing:
        raise RuntimeError(f"config tables not found in the containers: {', '.join(missing)}")

    tables: dict[str, dict] = {}
    variants: dict[str, dict] = {}
    for name in WANTED_TABLES:
        tables[name], variants[name] = union(found[name], runner)

    text_tables: dict[str, dict[str, str]] = {}
    for code, chunks in sorted(languages.items()):
        tag = LOCALE_TAGS.get(code)
        if tag is None or tag not in INLINE_LOCALES:
            continue
        text_tables[tag] = localization.text_table(lua_tables.rows(runner.run(chunks[0].data)))
    text = Text(text_tables)

    # --- the keys-only gap, verified rather than assumed -------------------------------
    keys_only_report = {}
    for name in EXPECTED_KEYS_ONLY:
        rows = tables[name]
        keys_only_report[name] = {
            "ids": len(rows),
            "everyRowEmpty": keys_only(rows),
            "declaredCount": variants[name]["declaredCount"],
        }
    surprises = [n for n, r in keys_only_report.items() if not r["everyRowEmpty"] and r["ids"]]

    # --- icons ------------------------------------------------------------------------
    equip_ids = set(tables["EquipConfig"])
    equipment_icons = sprite_names(
        *(row.get("_kIcon") for row in tables["ItemConfig"].values()
          if str(row.get("_iEquipId") or "") in equip_ids)
    )
    talent_icons = sprite_names(
        *(row.get("_kIcon") for row in tables["SeasonTalentEffectConfig"].values()),
        *(row.get("_kIcon") for row in tables["PatronTalentConfig"].values()),
        *(row.get("icon") for row in tables["SeasonTalent"].values()),
    )
    art_report = {}
    if not args.skip_art:
        present = read_icons(res_out)
        art_report = export_art(
            {n for n in equipment_icons if n.lower() not in present},
            {n for n in talent_icons if n.lower() not in present},
            res_out,
        )
    icons = read_icons(res_out)

    # --- talents ----------------------------------------------------------------------
    effects_by_group: dict[int, list[int]] = {}
    for key in ordered(tables["SeasonTalentEffectConfig"]):
        row = tables["SeasonTalentEffectConfig"][key]
        group = row.get("_iGroup")
        if isinstance(group, int):
            effects_by_group.setdefault(group, []).append(row.get("_iId", int(key)))

    trees, tree_counts = tree_rows(tables["SeasonTalentTreeConfig"], text)
    nodes, node_counts = season_nodes(tables["SeasonTalentConfig"], effects_by_group, text)
    levels, level_counts = season_levels(tables["SeasonTalentEffectConfig"], icons, text)
    patron, patron_counts = patron_nodes(tables["PatronTalentConfig"], icons, text)
    patron_attrs = plain_rows(tables["PatronTalentAttrConfig"])
    patron_groups, patron_group_counts = _group_rows(tables["PatronTalentGroupConfig"], text)
    legacy, legacy_counts = legacy_nodes(tables["SeasonTalent"], icons, text)
    legacy_levels = [clean(tables["SeasonTalentAttrConfig"][k])
                     for k in ordered(tables["SeasonTalentAttrConfig"])]

    talent_attr_ids: set[int] = set()
    for row in tables["SeasonTalentEffectConfig"].values():
        talent_attr_ids.update(pair_ids(row.get("_kAttrs")))
    for row in tables["PatronTalentAttrConfig"].values():
        talent_attr_ids.update(pair_ids(row.get("_kAttrs")))
    for row in tables["SeasonTalentAttrConfig"].values():
        talent_attr_ids.update(pair_ids(row.get("_kAttrs")))

    talent_effect_ids: set[int] = set()
    for row in tables["SeasonTalentEffectConfig"].values():
        talent_effect_ids.update(flat_ids(row.get("_kSpecialEffectList")))
    talent_effects, talent_effect_counts = effect_rows(
        tables["SpecialEffectConfig"], talent_effect_ids, text
    )

    talent_variants = {
        name: variants[name]
        for name in (
            "SeasonTalentTreeConfig", "SeasonTalentConfig", "SeasonTalentEffectConfig",
            "PatronTalentConfig", "PatronTalentAttrConfig", "PatronTalentGroupConfig",
            "SeasonTalent", "SeasonTalentAttr", "SeasonTalentAttrConfig",
        )
    }
    write_json(out / "talents.json", {
        "source": (
            "SeasonTalent*.lua and PatronTalent*.lua in the .bytes data containers "
            "(deobfuscated Lua 5.4)"
        ),
        "iconSource": "icons/talents WebP in resource-ro3, joined on the row's icon column",
        "note": (
            "three separate systems share the word talent. seasonTalents is the live tree: "
            "a node in seasonTalents.nodes lists the ids of its per-level rows in "
            "seasonTalents.levels, selected by the node's iLevelGroupId. patronTalents is "
            "the star-matrix board, whose nodes step through kTalentAttrIds rows of "
            "patronTalents.attrLevels. The third, a five-node tree the client can no "
            "longer name, is in talents-legacy.json. Field names are the game's own with "
            "the leading underscore removed, a column absent from a row holds its default, "
            "and kAttrs is a list of [attributeId, value] pairs resolvable through the "
            "attributes lookup. Text comes from the language tables under locales/: ${n} "
            "from the row's kDescData, ^{n} and @{n} from the field's own arguments. The "
            "specialEffects rows listed under placeholderLeftBecauseDescDataIsEmpty still "
            "show a ${n}: their kDescData is a single empty string in the client, so the "
            "numbers were never authored and none are invented here."
        ),
        "counts": {
            "seasonTrees": tree_counts["rows"],
            "seasonNodes": node_counts["rows"],
            "seasonLevels": level_counts["rows"],
            "patronNodes": patron_counts["rows"],
            "patronAttrLevels": len(patron_attrs),
            "patronGroups": patron_group_counts["rows"],
            "specialEffects": talent_effect_counts["rows"],
            "attributesReferenced": len(talent_attr_ids),
        },
        "textCounts": {
            "seasonTreesNamed": tree_counts["withName"],
            "seasonLevelsNamed": level_counts["withName"],
            "seasonLevelsWithIcon": level_counts["withIcon"],
            "patronNodesNamed": patron_counts["withName"],
            "patronNodesWithIcon": patron_counts["withIcon"],
            "patronGroupsNamed": patron_group_counts["withName"],
            "specialEffectsNamed": talent_effect_counts["withName"],
            "specialEffectsDescribed": talent_effect_counts["withDescription"],
            "specialEffectsWithLeftoverPlaceholder":
                talent_effect_counts["withLeftoverPlaceholder"],
        },
        "placeholderLeftBecauseDescDataIsEmpty":
            talent_effect_counts["placeholderLeftBecauseDescDataIsEmpty"],
        "variants": talent_variants,
        "attributes": attribute_lookup(tables["AttributeConfig"], talent_attr_ids, text),
        "seasonTalents": {"trees": trees, "nodes": nodes, "levels": levels},
        "patronTalents": {
            "groups": patron_groups,
            "nodes": patron,
            "attrLevels": patron_attrs,
        },
        "legacySeasonTalent": {
            "path": "talents-legacy.json",
            "note": (
                "the five-node SeasonTalent tree and its level table live in their own file: "
                "its name ids resolve in no language table this build ships, so it is a "
                "half-megabyte of unnamed rows that nothing here can present as content."
            ),
        },
        "specialEffects": talent_effects,
    })

    referenced_legacy_groups = sorted(
        {row.get("levelGroupId") for row in tables["SeasonTalent"].values()}
        & {row.get("_iGroup") for row in tables["SeasonTalentAttrConfig"].values()}
    )
    write_json(out / "talents-legacy.json", {
        "source": (
            "SeasonTalent.lua, SeasonTalentAttr.lua and SeasonTalentAttrConfig.lua in the "
            ".bytes data containers"
        ),
        "note": (
            "a five-node talent tree the client still ships and cannot name: the nodes' "
            "name ids (13570000000-13570000002) resolve in NONE of the seven language "
            "tables, so nothing here has a name. Only levelGroupId "
            f"{referenced_legacy_groups} of the {len({r.get('_iGroup') for r in tables['SeasonTalentAttrConfig'].values()})} "
            "groups in levels is reached from a node, so most of the level table is "
            "unreachable from the shipped tree. attrRaw is SeasonTalentAttr, which the "
            "client marks m_bIsCompress = true; its packed integers are emitted exactly as "
            "the chunk returns them and are not decoded here. Kept out of talents.json "
            "because it is bulk with no text, not because it is any less real."
        ),
        "counts": {
            "nodes": legacy_counts["rows"],
            "levels": len(legacy_levels),
            "nodesNamed": legacy_counts["withName"],
            "nodesWithIcon": legacy_counts["withIcon"],
            "levelGroups": len({r.get("_iGroup") for r in tables["SeasonTalentAttrConfig"].values()}),
            "levelGroupsReachedFromANode": len(referenced_legacy_groups),
            "attrRawRows": len(tables["SeasonTalentAttr"]),
        },
        "variants": {
            name: variants[name]
            for name in ("SeasonTalent", "SeasonTalentAttr", "SeasonTalentAttrConfig")
        },
        "nodes": legacy,
        "levels": legacy_levels,
        "attrRaw": [tables["SeasonTalentAttr"][k] for k in ordered(tables["SeasonTalentAttr"])],
    })

    # --- equipment --------------------------------------------------------------------
    slots = {}
    for row in slot_table(tables["EquipGridConfig"], icons):
        if row.get("slot") and row.get("iGridCategory") == 1:
            slots[row["iID"]] = row["slot"]
    equipment, equip_counts = equipment_rows(
        tables["EquipConfig"], tables["ItemConfig"], slots, icons, text
    )

    equip_attr_ids: set[int] = set()
    equip_entry_attr_ids: set[int] = set()
    equip_special_groups: set[int] = set()
    for row in tables["EquipConfig"].values():
        equip_attr_ids.update(pair_ids(row.get("_kBasicAttribute")))
        equip_entry_attr_ids.update(pair_ids(row.get("_kFixedEntries")))
        equip_special_groups.update(pair_ids(row.get("_kSpecial")))
    for row in tables["EquipAttriGroupConfig"].values():
        if isinstance(row.get("_iAttriID"), int):
            equip_entry_attr_ids.add(row["_iAttriID"])

    equip_effect_ids: set[int] = set()
    for row in tables["EquipSpecialGroupConfig"].values():
        special = row.get("_iSpecialID")
        if isinstance(special, int) and special:
            equip_effect_ids.add(special)
    in_special_attr = {i for i in equip_effect_ids if str(i) in tables["EquipSpecialAttr"]}
    equip_effects, equip_effect_counts = effect_rows(
        tables["SpecialEffectConfig"], equip_effect_ids - in_special_attr, text
    )

    write_json(out / "equipment.json", {
        "source": "EquipConfig.lua in the .bytes data containers (deobfuscated Lua 5.4)",
        "itemSource": "ItemConfig.lua, joined on ItemConfig.iEquipId",
        "iconSource": "icons/equipment WebP in resource-ro3, joined on the item's kIcon",
        "note": (
            "one row per equippable, keyed by the client's own EquipConfig id. Columns "
            "outside item come from EquipConfig; the item object holds the identity columns "
            "of the ItemConfig row that names this equipment (the full item row is in "
            "items/ and is not duplicated here). slot is cut out of the EquipGridConfig "
            "sprite name for the item's iEquipPart, so it is the client's own word for the "
            "slot, and item.iID is the same number as iID on all 1,289 joined rows. "
            "kBasicAttribute entries are [attributeId, value] or [attributeId, low, high] "
            "(2,821 of 3,948 carry the third element, and 2,581 of those differ from the "
            "second). kFixedEntries is [attributeId, grade]: the first element is an "
            "AttributeConfig id, which is how the six rows whose item name spells its "
            "stats -- the fur coats, STR/LUK and INT/DEX -- agree with their own entries. "
            "Both id spaces resolve through the attributes lookup. iEntries names a kGroup "
            "in equipment-attrs.json entryGroups, kSpecial is [specialGroupId, weight] into "
            "its specialGroups, and kFixedSpecialAttribute is a flat list of "
            "EquipSpecialAttr ids. The grade in kFixedEntries and the definition behind any "
            "special-attribute id are NOT in the client -- see equipment-attrs.json "
            "keysOnly."
        ),
        "counts": {
            "equipment": equip_counts["rows"],
            "withItem": equip_counts["withItem"],
            "withoutItem": equip_counts["withoutItem"],
            "withName": equip_counts["withName"],
            "withDescription": equip_counts["withDescription"],
            "withIcon": equip_counts["withIcon"],
            "withLeftoverPlaceholder": equip_counts["withLeftoverPlaceholder"],
            "itemsSharingAnEquipId": equip_counts["itemsSharingAnEquipId"],
            "iconsNotExported": len(equip_counts["iconsNotExported"]),
        },
        "iconsNotExported": equip_counts["iconsNotExported"][:10],
        "variants": {"EquipConfig": variants["EquipConfig"], "ItemConfig": variants["ItemConfig"]},
        "attributes": attribute_lookup(
            tables["AttributeConfig"], equip_attr_ids | equip_entry_attr_ids, text
        ),
        "equipment": equipment,
    })

    write_json(out / "equipment-attrs.json", {
        "source": "Equip*.lua in the .bytes data containers (deobfuscated Lua 5.4)",
        "note": (
            "the tables behind an equipment row's rolls, crafting and salvage. entryGroups "
            "is the entry pool a row's iEntries selects (iAttriID is an AttributeConfig id, "
            "iMin/iMax the number of entries and iWeight the draw weight); entryRolls is "
            "EquipAttriRandom; specialGroups maps a kSpecial group to the special-attribute "
            "ids it can draw, and specialEffects carries the SpecialEffectConfig rows among "
            "them that the client does describe. effectiveness rows keep their iName as "
            "found: those ids (10170000000-10170000029) resolve in none of the language "
            "tables, so the size-effectiveness rows have no text. keysOnly is the honest "
            "gap: those tables ship their row ids with empty row bodies, so the entry "
            "values, the price table and the special-attribute definitions are absent from "
            "the client. EquipPrice (57,120 ids) and EquipEntryLevel (2,856) are counted "
            "but their id lists are not carried here."
        ),
        "counts": {
            "slots": len(tables["EquipGridConfig"]),
            "entryGroups": len(tables["EquipAttriGroupConfig"]),
            "entryRolls": len(tables["EquipAttriRandom"]),
            "entryCounts": len(tables["EquipEntryRandom"]),
            "specialGroups": len(tables["EquipSpecialGroupConfig"]),
            "specialEffects": equip_effect_counts["rows"],
            "specialIdsWithNoDefinition": len(in_special_attr),
            "craft": len(tables["EquipCraftConfig"]),
            "craftQuality": len(tables["EquipCraftQualityConfig"]),
            "salvage": len(tables["EquipReturnConfig"]),
            "effectiveness": len(tables["EquipEffectivenessConfig"]),
        },
        "variants": {
            name: variants[name]
            for name in (
                "EquipGridConfig", "EquipAttriGroupConfig", "EquipAttriRandom",
                "EquipEntryRandom", "EquipSpecialGroupConfig", "EquipCraftConfig",
                "EquipCraftQualityConfig", "EquipReturnConfig", "EquipEffectivenessConfig",
            )
        },
        "attributes": attribute_lookup(tables["AttributeConfig"], equip_entry_attr_ids, text),
        "slots": slot_table(tables["EquipGridConfig"], icons),
        "entryGroups": plain_rows(tables["EquipAttriGroupConfig"]),
        "entryRolls": [clean(tables["EquipAttriRandom"][k])
                       for k in ordered(tables["EquipAttriRandom"])],
        "entryCounts": plain_rows(tables["EquipEntryRandom"]),
        "specialGroups": plain_rows(tables["EquipSpecialGroupConfig"]),
        "specialEffects": equip_effects,
        "craft": plain_rows(tables["EquipCraftConfig"]),
        "craftQuality": plain_rows(tables["EquipCraftQualityConfig"]),
        "salvage": plain_rows(tables["EquipReturnConfig"]),
        "effectiveness": _effectiveness(tables["EquipEffectivenessConfig"], text),
        "keysOnly": {
            "note": (
                "each of these tables ships m_kValues[id] = {} for every id: the row body "
                "is an empty Lua table with no metatable to inherit defaults from, so the "
                "client holds the key set and nothing else. Verified by running the chunks "
                "and reading the rows raw."
            ),
            "tables": keys_only_report,
            "ids": {
                name: [int(k) if k.isdigit() else k for k in ordered(tables[name])]
                for name in ("EquipEntry", "EquipSpecialAttr", "EquipSpecialAttrLevel",
                             "EquipEntryExclusion", "EquipSpecialExclusion",
                             "EquipBaseProportion")
            },
        },
        "art": art_report,
    })

    if surprises:
        print(f"NOTE: these tables are no longer keys-only: {', '.join(surprises)}")
    print(
        f"talents      : {tree_counts['rows']} trees, {node_counts['rows']} nodes, "
        f"{level_counts['rows']} level rows ({level_counts['withName']} named, "
        f"{level_counts['withIcon']} with an icon)"
    )
    print(
        f"patron       : {patron_counts['rows']} nodes ({patron_counts['withName']} named, "
        f"{patron_counts['withIcon']} with an icon), {len(patron_attrs)} attr levels"
    )
    print(
        f"equipment    : {equip_counts['rows']} rows, {equip_counts['withItem']} joined to an "
        f"item, {equip_counts['withName']} named, {equip_counts['withDescription']} described, "
        f"{equip_counts['withIcon']} with an icon"
    )
    print(
        f"effects      : {talent_effect_counts['rows']} described talent effects of "
        f"{talent_effect_counts['referenced']} referenced; equipment special ids "
        f"{len(equip_effect_ids)} referenced, {equip_effect_counts['rows']} in "
        f"SpecialEffectConfig, {len(in_special_attr)} only in the keys-only EquipSpecialAttr"
    )
    for family, report in art_report.items():
        print(
            f"art          : {family} {report['written']} written of {report['selected']} "
            f"selected, {len(report['unresolved'])} unresolved"
        )
    print(
        f"text         : {text.rendered} strings rendered, "
        f"{text.with_placeholders} with a placeholder left unresolved"
    )
    for name, path in (("talents", "talents.json"),
                       ("talents-legacy", "talents-legacy.json"),
                       ("equipment", "equipment.json"),
                       ("equipment-attrs", "equipment-attrs.json")):
        size = (out / path).stat().st_size
        flag = "  OVER BUDGET" if size > SHARD_BUDGET else ""
        print(f"{name:<13}: {size / 1000:.0f} kB{flag}")


def _group_rows(groups: dict, text: Text) -> tuple[list[dict], dict]:
    out = []
    named = 0
    for key in ordered(groups):
        row = groups[key]
        entry = clean(row)
        name = text.render(row.get("_kName"))
        if name:
            entry["name"] = name
            named += 1
        out.append(entry)
    return out, {"rows": len(out), "withName": named}


def _effectiveness(rows: dict, text: Text) -> list[dict]:
    out = []
    for key in ordered(rows):
        row = rows[key]
        entry = clean(row)
        name = text.render(row.get("_iName"))
        if name:
            entry["name"] = name
        out.append(entry)
    return out


if __name__ == "__main__":
    main()
