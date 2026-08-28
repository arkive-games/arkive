"""Export Ragnarok Online 3's MVP bosses and its ordinary monsters.

What this stage is, next to the raw one
---------------------------------------
:mod:`.export_config` ships the client's config tables close to verbatim — ``npcs.json``
is every ``NPCConfig`` column, ``monster-attributes.json`` every ``AttriMonsterConfig``
row. This stage is the **joined** layer over those: one entry per creature, with the
things a reader would otherwise have to assemble by hand already assembled —

* the ``_iRace`` / ``_iElement`` / ``_iSize`` codes replaced by the names the client's
  own language table gives them,
* a stat block, because a monster's numbers are not on its row: the row names a key into
  ``AttriMonsterConfig`` (whose id is ``monsterType * 1000 + level``) and a per-attribute
  percentage in ``_kAttriScale`` that has to be applied to it,
* the WebP in ``resource-ro3`` that its head icon and its model's colour map became,
* the skills it casts and the drop pools it rolls, resolved to their own rows.

Nothing here supersedes ``bosses.json``, which is a different harvest: that file lists 152
creatures recovered from *animation clip names* and carries their animation states and no
stats. The two join on neither id nor name — a clip-name entity is ``EddgaHigh``, an
``NPCConfig`` row is 5020009 named 虎王 whose unit's prefab is ``model_boss_eddgahigh`` —
so the model prefab is the bridge, and this module records it as ``modelPrefab`` for
exactly that reason.

Where the rows come from
------------------------
The same place ``export_config`` reads: ``Config/DataConfig/*.lua`` inside the ``.bytes``
containers, executed by :mod:`.lua_tables` in a real Lua 5.4 interpreter. A config appears
in several containers, and the copies **nest rather than conflict** — but not always
harmlessly: ``AreaConcurMonsterConfig`` is empty in two of its three copies and holds 228
rows in the third, and ``MVPConfig`` has 18 rows in one copy and 17 in the others. So the
union is taken, and every copy's contribution is reported (``variants``) rather than a
copy being picked by name.

Art
---
The head icons and the boss colour maps were already exported by :mod:`.art`; those are
joined, not re-cut. What was missing is the **ordinary monsters'** appearance —
``art.CATEGORIES`` covers ``Model_Boss_*`` and stops there, while the 小怪 ship as
``Model_MonsterJunior_*`` and ``Model_MonsterSenior_*`` — plus the MVP battle backdrops
that ``MVPConfig`` names. :data:`ART_CATEGORIES` adds those, and is fed to
:func:`.art.export` unchanged, so the atlas/crop machinery has one implementation.

Usage::

    uv run python -m ro3.export_mvp_monsters --art --dry-run
    uv run python -m ro3.export_mvp_monsters --art
    uv run python -m ro3.export_mvp_monsters
"""

from __future__ import annotations

import argparse
import os
import re
from pathlib import Path

from . import art, localization, lua_tables
from .catalog import CATALOG
from .common import dumps, write_json
from .env import require_dir
from .unpack import stage_dir

#: ``Config/DataConfig/<Name>.lua`` — the same shape ``export_config`` matches, with this
#: stage's own table list behind it.
DATA_CONFIG = re.compile(r"(?:^|/)Config/DataConfig/(?P<name>[A-Za-z0-9_]+)\.lua$")

#: ``Language/Resources/<Language>/Script/LuaScript/Localization_<code>.lua``.
LOCALIZATION = re.compile(r"(?:^|/)LuaScript/Localization_(?P<code>[A-Za-z_]+)\.lua$")

#: Every table this stage reads, and why.
TABLES = {
    "NPCConfig": "the creature roster: one row per NPC, monsters among them",
    "UnitConfig": "the model behind a creature — its prefab, height and speed",
    "AttriMonsterConfig": "base stats per (monster type, level)",
    "AttributeConfig": "what attribute id 101 means (and its stable variable name)",
    "MVPConfig": "the world-MVP rotation: 18 bosses, their map, timer and rewards",
    "MVPScoreConfig": "the MVP damage/heal/death score ladder",
    "MvpChallengeConfig": "which MVPs the solo challenge mode offers",
    "TenGameplayBossConfig": "the ten-player raid bosses, their dungeon and awards",
    "SkillConfig": "the skills a monster casts",
    "DropPoolConfig": "a creature's drop pool: 16 weighted group slots",
    "DropGroupConfig": "one drop group: the item, its weight and its stack range",
    "ItemConfig": "the item a drop group yields",
    "AreaConcurMonsterConfig": "per-map kill-time rewards, keyed by monster",
    "OnHookMonsterRecommendConfig": "idle-farming recommendations, keyed by monster",
    "OnHookMonsterTagsConfig": "idle-farming difficulty bands, keyed by monster",
    "PronteraDefenseMonsterConfig": "which monsters the Prontera defence mode spawns",
}

#: Locales inlined into each row. The full string tables ship under ``locales/`` from
#: ``export_config``, and every row keeps the source field, so any language can be redone.
INLINE_LOCALES = ("zh-CN", "en", "ko")

LOCALE_TAGS = {"zh_CN": "zh-CN", "zh_TW": "zh-TW", "en": "en", "ko": "ko"}

#: ``_iNPCType`` 1 is a hostile creature; 2 is a town/quest NPC, and the rest are props.
MONSTER_NPC_TYPE = 1

#: ``_kShowIcon`` is the badge the client draws over a creature's health bar, and is the
#: only rank marker on the row that means one definite thing. Anything else is "normal".
RANK_BY_SHOW_ICON = {
    "common_icon_monster_mvp.png": "mvp",
    "common_icon_monster_boss.png": "boss",
    "common_icon_monster_elite.png": "elite",
}

#: Enum name blocks in the language table. Each is contiguous and 1-based: race 1 is
#: ``FIRST_SID``, race 2 the next id, and so on. Verified against creatures whose classic
#: Ragnarok typing is known — Poring is Plant/Water/Medium, Angeling Angel/Holy, Drops
#: Fire, Peco Peco Egg Formless — so the offsets are checked rather than assumed.
ENUM_BLOCKS = {
    "race": (10100000022, 10),
    "element": (10100000032, 10),
    "size": (10100000042, 3),
}

#: Attribute ids that carry a monster's stats, mapped to the ``_kVariable`` token
#: ``AttributeConfig`` gives each one. Read from that table at runtime; this is the
#: fallback naming for the handful of ids it does not describe.
ATTRIBUTE_FALLBACK = {
    101: "hp", 102: "mp", 103: "physicalAttack", 104: "magicAttack",
    105: "physicalDefense", 106: "magicDefense",
}

#: Added to ``art.CATEGORIES`` for this stage's own art. The boss models and the monster
#: head icons are already exported by ``art.py`` and are joined, not re-cut, so nothing
#: here writes into a directory that module owns.
ART_CATEGORIES: tuple[art.Category, ...] = (
    art.Category(
        "monsters/models",
        r"^Model_Monster(Junior|Senior)_.*_LOD0$",
        "base colour map of each ordinary-monster model, at its highest LOD",
        "Texture2D",
    ),
    art.Category(
        "mvp/backgrounds",
        r"^mvp_bg_battle_[a-z]+(_\d+)?$",
        "the battle backdrop MVPConfig names in _iBg",
        "Texture2D",
    ),
)


# --------------------------------------------------------------------------------------
# reading the tables
# --------------------------------------------------------------------------------------

def _wanted(script: str) -> bool:
    m = DATA_CONFIG.search(script)
    if m and m.group("name") in TABLES:
        return True
    return bool(LOCALIZATION.search(script))


def read_tables(vfs_root: Path):
    """``({table name: chunks}, {language code: chunks})`` for :data:`TABLES`."""
    found = lua_tables.collect_chunks(vfs_root, _wanted)
    languages = {}
    for name in list(found):
        m = LOCALIZATION.search(found[name][0].script or "")
        if m:
            languages[m.group("code")] = found.pop(name)
    return found, languages


def union_rows(chunks, runner) -> tuple[dict, dict]:
    """Merge a table's container copies into one row map.

    A row seen in an earlier copy wins; ``stats`` records what each copy added, because
    the copies are not interchangeable (see the module docstring) and a reader should be
    able to see which one carried a row.
    """
    rows: dict = {}
    stats: dict = {}
    for chunk in chunks:
        table = runner.run(chunk.data)
        found = lua_tables.rows(table)
        added = conflicts = 0
        for key, row in found.items():
            if key not in rows:
                rows[key] = row
                added += 1
            elif rows[key] != row:
                conflicts += 1
        stats[chunk.script or chunk.name] = {
            "rows": len(found), "added": added, "conflictingSharedRows": conflicts,
        }
    return rows, {"copies": stats, "union": len(rows)}


def list_rows(rows: dict) -> list:
    """A table whose ``m_kValues`` is a Lua array comes back keyed ``1..n``."""
    return [rows[key] for key in sorted(rows, key=int)]


class Text:
    """The language tables, and the rendered text of one localized field."""

    def __init__(self, tables: dict[str, dict[str, str]]) -> None:
        self.tables = tables
        self.placeholders_left: list[str] = []
        #: How many localized slots were dropped for carrying their own id as text.
        self.sid_echo = 0

    def render(self, field, desc_data=None) -> dict[str, str]:
        out: dict[str, str] = {}
        sid = str(field[0]) if isinstance(field, list) and field else None
        for tag in INLINE_LOCALES:
            table = self.tables.get(tag)
            if table is None:
                continue
            text = localization.lookup(table, field, desc_data)
            if text is None:
                continue
            # A second untranslated marker, alongside the literal "None" that
            # localization.text_table already drops: 1,869 entries in each of en and ko
            # carry their own id as their text. That is an empty slot the exporter filled
            # with the key, not a translation, so it is an absence here too.
            if text == sid:
                self.sid_echo += 1
                continue
            out[tag] = text
            left = localization.unresolved(text)
            if left and len(self.placeholders_left) < 40:
                self.placeholders_left.append(f"{tag} {field}: {text}")
        return out

    def enums(self) -> dict[str, dict[int, dict[str, str]]]:
        """The race/element/size code -> name tables, per :data:`ENUM_BLOCKS`."""
        out: dict[str, dict[int, dict[str, str]]] = {}
        for kind, (first, count) in ENUM_BLOCKS.items():
            out[kind] = {}
            for code in range(1, count + 1):
                names = self.render([first + code - 1])
                if names:
                    out[kind][code] = names
        return out


# --------------------------------------------------------------------------------------
# joins
# --------------------------------------------------------------------------------------

def attribute_names(attribute_config: dict) -> dict[int, str]:
    """Attribute id -> the ``_kVariable`` token the client uses for it."""
    out = dict(ATTRIBUTE_FALLBACK)
    for row in attribute_config.values():
        ident = row.get("_iID")
        token = row.get("_kVariable")
        if isinstance(ident, int) and isinstance(token, str) and token:
            out[ident] = token
    return out


def _scaled(value: int, factor: int) -> int:
    """``value * factor / 10000``, rounded half away from zero.

    Not Python's ``round``: that is banker's rounding, which would send 24 of the 1,415
    scaled values in this table to the even neighbour instead. ``common.round2`` documents
    half-toward-+Inf as this repo's convention, and this is the integer form of it, made
    symmetric so a negative attribute (ele_dmg is -10000 on 991 rows) rounds the same
    distance from zero as its positive twin.
    """
    scaled = value * factor
    return (scaled + 5000) // 10000 if scaled >= 0 else -((-scaled + 5000) // 10000)


def _apply(base: dict, scale: dict, names: dict[int, str]) -> tuple[dict, list[int]]:
    """One ``AttriMonsterConfig`` row with ``_kAttriScale`` applied.

    Returns the stats and the scale entries that had **no attribute to apply to** --
    62 rows scale ids (312-319) the base row does not carry, and dropping those silently
    would hide that the row asks for something this table cannot express.
    """
    stats = {}
    for ident, value in base.get("_kAttri") or []:
        factor = scale.get(ident)
        if factor is not None:
            value = _scaled(value, factor)
        stats[names.get(ident, f"attr{ident}")] = value
    base_ids = {ident for ident, _ in base.get("_kAttri") or []}
    return stats, sorted(set(scale) - base_ids)


def stat_block(row: dict, attri: dict, names: dict[int, str]) -> dict:
    """The stat fields for one creature.

    A row points at ``AttriMonsterConfig`` two ways and they are **not** equivalent:

    ``_iAttribute``
        the full composite key (monster type * 1000 + level). Set on 2,067 of the 2,290
        monsters, and resolves for every one of them.
    ``_iAttributeVariated``
        the monster **type** alone, to be combined with the row's own level. This is what
        an MVP carries: all 18 have it and none has ``_iAttribute``.

    206 rows carry both, and on **74 of those the two resolve to different numbers**, so
    which one the server uses cannot be settled from the tables alone. Nor is the answer
    one-sided: 4104001, named 【首领】(boss), reads its ``_iAttribute`` off the ordinary
    level-70 curve (71,390 HP) while its ``_iAttributeVariated`` gives boss-scale HP
    (14,991,745), and 15000401 has that exactly backwards. So both are emitted --
    ``stats`` from ``_iAttribute`` when it is present, and ``statsVariated`` alongside it
    when the other key resolves to something different -- and nothing here claims to know
    the precedence.

    ``_kAttriScale`` scales individual attributes in hundredths of a percent, 10000 being
    unchanged, and applies to whichever base is used.
    """
    scale = dict(row.get("_kAttriScale") or [])
    level = row.get("_iLevel")
    variated = row.get("_iAttributeVariated")
    primary_key = row.get("_iAttribute") or None
    variated_key = variated * 1000 + level if (variated and level) else None

    out: dict = {}
    primary = attri.get(str(primary_key)) if primary_key else None
    second = attri.get(str(variated_key)) if variated_key else None

    if primary is not None:
        stats, unapplied = _apply(primary, scale, names)
        out["stats"] = stats or None
        out["attributeKey"] = primary_key
        if unapplied:
            out["unappliedScaleAttributes"] = unapplied
        if second is not None and variated_key != primary_key:
            alternate, _ = _apply(second, scale, names)
            if (alternate or None) != out["stats"]:
                out["statsVariated"] = alternate or None
                out["attributeVariatedKey"] = variated_key
    elif second is not None:
        stats, unapplied = _apply(second, scale, names)
        out["stats"] = stats or None
        out["attributeKey"] = variated_key
        out["attributeKeyFrom"] = "_iAttributeVariated"
        if unapplied:
            out["unappliedScaleAttributes"] = unapplied
    elif primary_key or variated_key:
        # Nothing resolved; keep the key that was named so the miss stays traceable.
        out["attributeKeyUnresolved"] = primary_key or variated_key
    if scale:
        out["attributeScaled"] = True
    return out


def resource_index(res_out: Path) -> dict[str, str]:
    """stem (lowercased) -> repo-relative WebP path, over the whole resource repo."""
    found: dict[str, str] = {}
    for path in sorted(res_out.rglob("*.webp")):
        found.setdefault(path.stem.lower(), path.relative_to(res_out).as_posix())
    return found


def art_for(icon: str | None, prefab: str | None, have: dict[str, str]):
    """``(head icon webp, model colour-map webp)`` for one creature.

    A model's texture is named after the prefab with the LOD suffix the mesh carries, so
    the prefab stem plus ``_lod0`` is the join; a few models ship the texture under the
    bare stem instead, and both are tried.
    """
    head = None
    if isinstance(icon, str) and icon:
        head = have.get(Path(icon).stem.lower())
    model = None
    if isinstance(prefab, str) and prefab:
        stem = Path(prefab).stem.lower()
        model = have.get(f"{stem}_lod0") or have.get(stem)
    return head, model


def _group_candidates(group) -> list[dict]:
    """A drop group's candidate rows.

    The table stores a group either as a Lua array of rows or, when the serials are not
    ``1..n``, as a map keyed by ``_iSerial``. Both come back here as one list.
    """
    if isinstance(group, list):
        return [row for row in group if isinstance(row, dict)]
    if isinstance(group, dict):
        if "_kDropItem" in group or "_iID" in group:
            return [group]
        keys = list(group)
        # Numeric serials, so sort them as numbers: 10 map-shaped groups here have keys
        # whose string order differs from their numeric order ('10' before '2').
        if all(str(k).lstrip("-").isdigit() for k in keys):
            keys.sort(key=lambda k: int(k))
        else:
            keys.sort(key=str)
        return [group[k] for k in keys if isinstance(group[k], dict)]
    return []


def drop_pools(wanted: set[int], pools: dict, groups: dict, items: dict):
    """The wanted drop pools, each resolved to the items its groups yield.

    A pool holds 16 ``_iDropGroup_<n>`` slots, each ``[groupId, weight, minRolls,
    maxRolls]`` with the weight in millionths. A group holds candidate rows, each naming
    one item in ``_kDropItem`` with its own ``_iWeights`` and stack range; a group may
    list the same item several times under different serials, which is how the table
    expresses a heavier weight, so the rows are kept rather than deduplicated.

    Pools are emitted **once** and referenced by id from a monster's ``dropPool`` /
    ``normalDropPools``, because a few hundred pools serve a few thousand monsters.
    Item ids are not resolved to names here -- ``items.json`` is the item table, and
    copying 3,187 names into this file would double it for nothing.
    """
    out = []
    resolved_groups = missing_groups = empty_candidates = 0
    for ident in sorted(wanted):
        pool = pools.get(str(ident))
        if pool is None:
            continue
        slots = []
        for slot in range(1, 17):
            entry = pool.get(f"_iDropGroup_{slot}")
            if not isinstance(entry, list) or len(entry) < 4:
                continue
            group_id, weight, low, high = entry[0], entry[1], entry[2], entry[3]
            group = groups.get(str(group_id))
            candidates = []
            if group is None:
                missing_groups += 1
            else:
                resolved_groups += 1
                # A group lists the same item under several serials to weight it more
                # heavily, and identical rows are collapsed to one carrying `copies`.
                # The restrictions below are part of the identity, not decoration: 171
                # buckets in this table hold rows that agree on item/weight/count and
                # differ in _iJobLimit, so collapsing on the item alone would merge a
                # class-restricted drop into an unrestricted one and silently widen it.
                collapsed: dict[tuple, dict] = {}
                for candidate in _group_candidates(group):
                    item_id = candidate.get("_kDropItem")
                    if not item_id:
                        empty_candidates += 1
                        continue
                    which = {"item": item_id, "weight": candidate.get("_iWeights")}
                    span = [candidate.get("_iMinNumber"), candidate.get("_iMaxNumber")]
                    if span != [1, 1]:
                        which["count"] = span
                    limits = _clean({
                        "jobs": _ids(candidate.get("_iJobLimit")),
                        "minLevel": candidate.get("_iMinLevelLimit") or None,
                        # 999 is "no limit" on every row that carries it.
                        "maxLevel": (candidate.get("_iMaxLevelLimit")
                                     if candidate.get("_iMaxLevelLimit") not in (0, 999)
                                     else None),
                        "quest": candidate.get("_iQuestLimit") or None,
                        "bound": bool(candidate.get("_iBind")) or None,
                        "attenuationPlan": candidate.get("_iAttenuationPlanID") or None,
                        "activity": candidate.get("_iActivityid") or None,
                        "serverLevel": _ids(candidate.get("_kServerLevel")),
                        "coefficient": candidate.get("_kCoefficient") or None,
                    })
                    if limits:
                        which["limits"] = limits
                    if str(item_id) not in items:
                        which["unknownItem"] = True
                    key = (item_id, which.get("weight"), tuple(span),
                           dumps(limits) if limits else "")
                    if key in collapsed:
                        collapsed[key]["copies"] = collapsed[key].get("copies", 1) + 1
                    else:
                        collapsed[key] = _clean(which)
                candidates = list(collapsed.values())
            slot_out = {"slot": slot, "group": group_id, "chance": weight / 1_000_000}
            if [low, high] != [1, 1]:
                slot_out["rolls"] = [low, high]
            if candidates:
                slot_out["items"] = candidates
            slots.append(slot_out)
        out.append({"id": ident, "slots": slots})
    return out, {"pools": len(out), "groupsResolved": resolved_groups,
                 "groupsMissing": missing_groups,
                 "candidatesWithoutItem": empty_candidates}


#: Byte budget for one emitted file, matching ``export_config``: the dataset is fetched a
#: file at a time by a browser, so a table over this is split rather than shipped whole.
SHARD_BUDGET = 1_500_000

#: Room left for a shard's own ``source``/``note``/``counts`` preamble, which the per-row
#: cost below does not account for. Without it a shard measured at exactly the budget
#: lands a few hundred bytes over it.
SHARD_HEADER_ALLOWANCE = 4096


#: Bytes each line costs beyond its ``\n``. ``common.write_json`` writes through
#: ``Path.write_text``, which applies the platform's newline translation -- so on Windows
#: every line of every file in this dataset is CRLF and the file on disk is about 7% larger
#: than ``dumps`` reports. A budget measured against ``dumps`` alone is therefore wrong by
#: 100 KB at this size, which is what let a "1.43 MB" shard land at 1.65 MB.
LINE_OVERHEAD = len(os.linesep) - 1


def row_cost(row: dict, depth: int) -> int:
    """Bytes ``row`` adds to a file on disk when nested ``depth`` levels below the top.

    Two things ``len(dumps(row))`` misses: ``dumps`` indents by one space per level, so a
    row written inside ``{"pools": [ ... ]}`` pays one extra space per line per level of
    nesting; and the newline translation above adds :data:`LINE_OVERHEAD` per line.
    """
    text = dumps(row)
    lines = text.count("\n") + 1
    return len(text.encode()) + 2 + lines * (depth + LINE_OVERHEAD)


def shard_by_id(rows: list[dict], *, depth: int = 2,
                budget: int = SHARD_BUDGET) -> list[list[dict]]:
    """Split ``rows`` into id-ordered runs that each serialize under ``budget``.

    Runs rather than id-prefix bands: the ids are sparse and clustered, so a prefix split
    lands almost everything in one band. A run keeps ids contiguous, which is what lets a
    shard be named by its range and found without scanning the index.
    """
    if not rows:
        return []
    budget -= SHARD_HEADER_ALLOWANCE
    shards: list[list[dict]] = [[]]
    size = 0
    for row in rows:
        cost = row_cost(row, depth)
        if shards[-1] and size + cost > budget:
            shards.append([])
            size = 0
        shards[-1].append(row)
        size += cost
    return shards


def monster_skills(wanted: set[int], skills: dict, text: Text):
    """The skills monsters cast, each as the few columns that describe its behaviour."""
    out = []
    for ident in sorted(wanted):
        row = skills.get(str(ident))
        if row is None:
            continue
        entry = {"id": ident, "skillId": row.get("_iSkillID"), "level": row.get("_iLevel")}
        name = text.render(row.get("_iName"), row.get("_kDescData"))
        if name:
            entry["name"] = name
        for key, field in (
            ("cooldown", "_iCD"), ("castTime", "_iActionTime"), ("rangeMax", "_iDistanceMax"),
            ("element", "_iEleType"), ("damageType", "_iDmgType"), ("hit", "_iSkillHit"),
            ("targetMax", "_iTargetMax"), ("rangeType", "_iRangeType"),
        ):
            value = row.get(field)
            if value not in (None, 0, "", {}):
                entry[key] = value
        if row.get("_kDamageParam1"):
            entry["damageParam"] = row["_kDamageParam1"]
        if row.get("_kScriptLogic"):
            entry["script"] = row["_kScriptLogic"]
        out.append(entry)
    return out


def _ids(value) -> list[int]:
    if isinstance(value, list):
        return [int(v) for v in value if isinstance(v, (int, float))]
    if isinstance(value, (int, float)) and value:
        return [int(value)]
    return []


def _clean(entry: dict) -> dict:
    return {k: v for k, v in entry.items() if v not in (None, "", {}, [])}


# --------------------------------------------------------------------------------------
# rows
# --------------------------------------------------------------------------------------

def monster_row(row: dict, ctx) -> dict:
    """One creature, with its codes named, its stats computed and its art joined."""
    unit = ctx.units.get(str(row.get("_iUnitID"))) or {}
    prefab = unit.get("_kModelPath_Default") or None
    head, model = art_for(row.get("_kHeadIcon"), prefab, ctx.have)
    stats = stat_block(row, ctx.attri, ctx.attribute_names)

    entry = {
        "id": row.get("_iID"),
        "name": ctx.text.render(row.get("_kName")),
        "title": ctx.text.render(row.get("_kTitle")),
        "level": row.get("_iLevel") or None,
        # Omitted when it is "normal", the way every other column holding its default is.
        "rank": RANK_BY_SHOW_ICON.get(row.get("_kShowIcon") or ""),
        "subType": row.get("_iNPCSubType") or None,
        # Bare codes; the names are in this file's `enums` block, once each rather than
        # 2,290 times. Inlining them cost 470 KB, a quarter of the file.
        "race": row.get("_iRace") or None,
        "element": row.get("_iElement") or None,
        "size": row.get("_iSize") or None,
        "camp": row.get("_iCamp") or None,
        **stats,
        "unitId": row.get("_iUnitID") or None,
        # The bridge to bosses.json, whose entities are named after this prefab's stem.
        "modelPrefab": Path(prefab).stem if prefab else None,
        "headIcon": head,
        "modelTexture": model,
        # Only when the join failed -- that is when the client's own sprite name is the
        # useful thing to report. When it succeeded, headIcon already carries the stem.
        "sourceHeadIcon": None if head else (row.get("_kHeadIcon") or None),
        "skills": _ids(row.get("_kSkills")),
        "dropPool": row.get("_iDrop") or None,
        "normalDropPools": _ids(row.get("_iNormalDrop")),
        "ai": row.get("_iAI") or None,
        "aiSpecial": row.get("_iAISpecial") or None,
        "speed": row.get("_iSpeed") or None,
        "attackRange": row.get("_iAttackDistance") or None,
        # No table in the corpus is keyed by this value; kept under its own name so a
        # later award export can join it rather than it being silently dropped.
        "sourceDropPreview": row.get("_iDropPreview") or None,
        "maps": [pair[0] for pair in (row.get("_iCoordinateId") or [])
                 if isinstance(pair, list) and pair],
        "tags": _ids(row.get("_kNpcTag")),
    }
    return _clean(entry)


def mvp_row(row: dict, ctx) -> dict:
    """One entry of the world-MVP rotation, joined to the creature it spawns."""
    npc_id = row.get("_iNPCID")
    npc = ctx.npcs.get(str(npc_id)) or {}
    creature = monster_row(npc, ctx) if npc else {}
    head, _ = art_for(row.get("_iHeadIcon"), None, ctx.have)
    background = None
    if isinstance(row.get("_iBg"), str) and row["_iBg"]:
        background = ctx.have.get(Path(row["_iBg"]).stem.lower())

    entry = {
        "id": row.get("_iID"),
        "npcId": npc_id,
        "name": creature.get("name"),
        "level": creature.get("level"),
        "challengeLevel": row.get("_iChallengeLevel") or None,
        # 18 rows, so the names are inlined here rather than left as codes.
        "race": ctx.enum("race", npc.get("_iRace")),
        "element": ctx.enum("element", npc.get("_iElement")),
        "size": ctx.enum("size", npc.get("_iSize")),
        "stats": creature.get("stats"),
        "attributeKey": creature.get("attributeKey"),
        "attributeKeyFrom": creature.get("attributeKeyFrom"),
        "statsVariated": creature.get("statsVariated"),
        "attributeVariatedKey": creature.get("attributeVariatedKey"),
        "skills": creature.get("skills") or [],
        "mapId": row.get("_iMapID") or None,
        "respawnSeconds": row.get("_iRefreshTime") or None,
        "shortestKillSeconds": row.get("_iShortestDeadTime") or None,
        "rareRewardChance": (row["_iRareRewardProbability"] / 10000
                             if row.get("_iRareRewardProbability") else None),
        "rareRewardTeamChance": (row["_iRareRewardTeamProbability"] / 100
                                 if row.get("_iRareRewardTeamProbability") else None),
        "awards": _clean({
            "firstDamage": row.get("_iFirstDamageAward"),
            "lastDamage": row.get("_iLastDamageAward"),
            "team": row.get("_iTeamAward"),
            "participation": row.get("_iPartAward"),
            "rare": row.get("_iRareAward"),
            "preview": row.get("_iAwardPreview"),
        }),
        "awardPreviewItems": _ids(row.get("_kAwardPreview")),
        "soloChallenge": npc_id in ctx.mvp_challenge or None,
        "modelPrefab": creature.get("modelPrefab"),
        "headIcon": head or creature.get("headIcon"),
        "modelTexture": creature.get("modelTexture"),
        "background": background,
        "sourceHeadIcon": row.get("_iHeadIcon") or None,
        "sourceBackground": row.get("_iBg") or None,
    }
    return _clean(entry)


def raid_boss_row(row: dict, ctx) -> dict:
    """One ten-player raid boss (``TenGameplayBossConfig``)."""
    npc_id = row.get("_iBoss")
    npc = ctx.npcs.get(str(npc_id)) or {}
    creature = monster_row(npc, ctx) if npc else {}
    entry = {
        "boss": npc_id,
        "name": creature.get("name") or ctx.text.render(row.get("_iDungeonBossName")),
        "level": creature.get("level"),
        "dungeon": row.get("_iDungeon") or None,
        "matchId": row.get("_iMatchID") or None,
        "hidden": bool(row.get("_iHide")) or None,
        "reviveCharges": row.get("_iOriginalReviveNum") or None,
        "danExp": row.get("_iDanExp") or None,
        "recommendedAttributes": row.get("_iRecommendation") or None,
        "unlock": row.get("_kUnlock") or None,
        "personalUnlock": row.get("_kPersonalUnlock") or None,
        "awards": _clean({
            "personal": row.get("_iPersonAward"),
            "participation": row.get("_iPartAward"),
            "guildByRank": row.get("_iGuildAward"),
        }),
        "bondIds": _ids(row.get("_kBondsID")),
        "headIcon": ctx.have.get(Path(row["_kHeadBigIcon"]).stem.lower())
        if isinstance(row.get("_kHeadBigIcon"), str) and row["_kHeadBigIcon"] else None,
        "modelPrefab": creature.get("modelPrefab"),
        "modelTexture": creature.get("modelTexture"),
    }
    return _clean(entry)


class Context:
    """Everything the row builders join against."""

    def __init__(self, tables: dict, text: Text, have: dict[str, str]) -> None:
        self.text = text
        self.have = have
        self.npcs = tables["NPCConfig"]
        self.units = tables["UnitConfig"]
        self.attri = tables["AttriMonsterConfig"]
        self.attribute_names = attribute_names(tables["AttributeConfig"])
        self.enums = text.enums()
        self.mvp_challenge = {
            row.get("_iNPCID") for row in list_rows(tables["MvpChallengeConfig"])
        }

    def enum(self, kind: str, code) -> dict | None:
        """``{code, name}`` for a race/element/size code, or ``None`` when unset."""
        if not isinstance(code, int) or not code:
            return None
        names = self.enums.get(kind, {}).get(code)
        entry = {"code": code}
        if names:
            entry["name"] = names
        return entry


# --------------------------------------------------------------------------------------
# art
# --------------------------------------------------------------------------------------

def run_art(*, dry_run: bool = False, quality: int = 90) -> dict:
    """Cut this stage's art, reusing :func:`.art.export` unchanged."""
    stage = stage_dir()
    work = stage.parent / f"{stage.name}-art-monsters"
    res_out = require_dir("RO3_RES_OUT")
    counts = art.export(stage, stage / CATALOG, work, res_out, ART_CATEGORIES,
                        dry_run=dry_run, quality=quality)
    if dry_run:
        return {}
    return {
        c.out: {
            "pattern": c.pattern, "note": c.note, "class": c.klass,
            "selected": counts[c.out].selected, "written": counts[c.out].written,
            "duplicateNames": counts[c.out].duplicates,
            "unresolved": counts[c.out].unresolved,
        }
        for c in ART_CATEGORIES
    }


# --------------------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------------------

SOURCE = "NPCConfig / UnitConfig / AttriMonsterConfig / MVPConfig .lua in the .bytes " \
         "data containers (deobfuscated, executed in Lua 5.4)"

RELATION_NOTE = (
    "the joined creature tables. npcs.json and monster-attributes.json hold the same "
    "rows verbatim, column for column; this file is the assembled view over them, with "
    "race/element/size named from the client's language table, the AttriMonsterConfig "
    "stat block resolved and scaled, and the resource-ro3 WebP joined. bosses.json is a "
    "third, independent harvest -- 152 entities recovered from animation clip names, "
    "carrying animation states and no stats -- and shares no id with these rows; "
    "modelPrefab is the bridge between them (clip entity EddgaHigh <-> prefab "
    "model_boss_eddgahigh)."
)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--art", action="store_true", help="also cut this stage's art")
    ap.add_argument("--art-only", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--quality", type=int, default=90)
    args = ap.parse_args()

    art_stats = {}
    if args.art or args.art_only:
        art_stats = run_art(dry_run=args.dry_run, quality=args.quality)
        if args.art_only:
            return 0

    vfs = require_dir("RO3_GAME") / "StreamingAssets" / "VFS"
    out = require_dir("RO3_DATA_OUT")
    res_out = require_dir("RO3_RES_OUT")
    runner = lua_tables.Runner()

    chunks, languages = read_tables(vfs)
    missing = [name for name in TABLES if name not in chunks]
    if missing:
        raise RuntimeError(f"config tables not found: {', '.join(missing)}")

    tables: dict[str, dict] = {}
    variants: dict[str, dict] = {}
    for name in TABLES:
        tables[name], variants[name] = union_rows(chunks[name], runner)
        print(f"  {name:<32} {len(tables[name]):>6} rows")

    text_tables: dict[str, dict[str, str]] = {}
    for code, language_chunks in sorted(languages.items()):
        tag = LOCALE_TAGS.get(code)
        if tag is None:
            continue
        text_tables[tag] = localization.text_table(
            lua_tables.rows(runner.run(language_chunks[0].data))
        )
    text = Text(text_tables)
    have = resource_index(res_out)
    ctx = Context(tables, text, have)

    # --- monsters ---------------------------------------------------------------------
    monsters = [
        monster_row(row, ctx)
        for _, row in sorted(tables["NPCConfig"].items(), key=lambda kv: int(kv[0]))
        if row.get("_iNPCType") == MONSTER_NPC_TYPE
    ]
    by_rank: dict[str, int] = {}
    for entry in monsters:
        rank = entry.get("rank", "normal")
        by_rank[rank] = by_rank.get(rank, 0) + 1

    skill_ids = {ident for entry in monsters for ident in entry.get("skills", [])}
    pool_ids = {ident for entry in monsters
                for ident in ([entry["dropPool"]] if entry.get("dropPool") else [])
                + entry.get("normalDropPools", [])}
    skills = monster_skills(skill_ids, tables["SkillConfig"], text)
    pools, pool_counts = drop_pools(pool_ids, tables["DropPoolConfig"],
                                    tables["DropGroupConfig"], tables["ItemConfig"])

    localized = sum(1 for e in monsters if e.get("name"))
    with_stats = sum(1 for e in monsters if e.get("stats"))
    with_head = sum(1 for e in monsters if e.get("headIcon"))
    with_model = sum(1 for e in monsters if e.get("modelTexture"))

    # Keyed by monster id, so a consumer can attach these without a second index.
    idle_tags = {row["_iMonsterID"]: row.get("_kTimeDifficultTags")
                 for row in list_rows(tables["OnHookMonsterTagsConfig"])
                 if row.get("_iMonsterID")}
    idle_recommend = {row["_iMonsterID"]: _clean({
        "name": text.render(row.get("_iName")),
        "levels": row.get("_iRecommendationLevel"),
        "maps": row.get("_iMapID"),
        "awardPreview": row.get("_iAwardPreview"),
    }) for row in list_rows(tables["OnHookMonsterRecommendConfig"]) if row.get("_iMonsterID")}
    area_concur = [_clean({
        "id": row.get("_iID"), "map": row.get("_iMap"), "monster": row.get("_iNpc"),
        "killTimeAwards": row.get("_kMonsterAward"),
    }) for row in list_rows(tables["AreaConcurMonsterConfig"])]
    prontera = [_clean({"monster": row.get("_iNpcId"), "difficulty": row.get("_iDifficulty")})
                for row in list_rows(tables["PronteraDefenseMonsterConfig"])]

    monster_shards = []
    for shard in shard_by_id(monsters):
        low, high = shard[0]["id"], shard[-1]["id"]
        path = f"monsters/{low}-{high}.json"
        write_json(out / path, {
            "source": SOURCE,
            "note": f"monsters {low} to {high}; the index is monsters.json",
            "counts": {"monsters": len(shard)},
            "monsters": shard,
        })
        monster_shards.append({"path": path, "monsters": len(shard),
                               "from": low, "to": high})

    write_json(out / "monsters.json", {
        "source": SOURCE,
        "note": RELATION_NOTE,
        "artSource": "resource-ro3: icons/monsters (head icons), monsters/models "
                     "(Model_MonsterJunior_*/Model_MonsterSenior_* colour maps), "
                     "bosses/models (Model_Boss_* colour maps)",
        "artNote": (
            "modelTexture is the base colour map of the creature's model, not a render of "
            "it -- the geometry is not converted. 307 monster colour maps were exported "
            "for this table and 235 of them are referenced here; the rest belong to "
            "prefabs no NPCConfig monster row uses. A row with no modelTexture is drawn "
            "from a prefab that is an effect or a player body, which has no monster "
            "colour map to point at."
        ),
        "statNote": (
            "stats are AttriMonsterConfig's base row for the creature's attributeKey "
            "(monsterType * 1000 + level) with _kAttriScale applied per attribute, where "
            "10000 means unchanged. attributeScaled marks the rows a scale was applied "
            "to. Attribute names are AttributeConfig's own _kVariable tokens. A negative "
            "value is not an error: ele_dmg is -10000 on 991 AttriMonsterConfig rows in "
            "the source, and is passed through as it is stored."
        ),
        "attributeKeyNote": (
            "a row names its stat base two ways and they do not always agree. "
            "attributeKey is _iAttribute, the full composite key, which is what stats is "
            "computed from wherever it is set; attributeKeyFrom marks the rows that fell "
            "back to _iAttributeVariated (the monster type, combined with the row's "
            "level) because _iAttribute was absent -- every MVP is one of those. Where "
            "both keys resolve to different numbers, the second reading is kept as "
            "statsVariated with its own attributeVariatedKey. Which one the server "
            "actually uses is NOT established: a row named as a boss can take the "
            "ordinary level curve from _iAttribute and boss-scale HP from "
            "_iAttributeVariated, and another row has that reversed. Both are shipped so "
            "the choice is the reader's rather than silently ours. Note also that "
            "attributeKey is authoritative rather than derived: on 103 rows the "
            "AttriMonsterConfig row it names declares a different level from the "
            "creature's own, and the key is followed as written rather than recomputed."
        ),
        "scaleNote": (
            "unappliedScaleAttributes lists the _kAttriScale entries a row declares for "
            "an attribute its base AttriMonsterConfig row does not carry, so there is "
            "nothing here to apply them to. 62 rows do this, for attribute ids 312-319 "
            "and once for 104; the ids are reported rather than the entries being dropped "
            "in silence."
        ),
        "localeNote": (
            "names are zh-CN only, and that is the build rather than a gap in the "
            "export. This is a CN client: of the 2,111 monsters that have a name, the en "
            "and ko tables answer the literal \"None\" for 2,099 and echo the id back for "
            "12, so there are no monster translations to ship. The remaining 179 rows "
            "have no language entry in any table."
        ),
        "rankNote": (
            "rank is the badge the client draws over the health bar (_kShowIcon), not a "
            "field of its own, and is absent on a row meaning the default 'normal'. 'mvp' "
            "here means the creature carries the MVP badge; only the 18 in mvp.json are "
            "the world rotation, the rest are dungeon and raid encounters."
        ),
        "counts": {
            "monsters": len(monsters),
            "withLocalizedName": localized,
            "withStats": with_stats,
            "withHeadIcon": with_head,
            "withModelTexture": with_model,
            "byRank": by_rank,
            "skillsReferenced": len(skill_ids),
            "dropPoolsReferenced": len(pool_ids),
            "statsFromAttributeVariated": sum(
                1 for e in monsters if e.get("attributeKeyFrom")),
            "withDisagreeingSecondKey": sum(
                1 for e in monsters if e.get("statsVariated")),
        },
        "gaps": {
            "withoutLocalizedName": len(monsters) - localized,
            "withoutStats": len(monsters) - with_stats,
            "withoutHeadIcon": len(monsters) - with_head,
            "withoutModelTexture": len(monsters) - with_model,
            "note": (
                "a creature without stats names no AttriMonsterConfig key at all "
                "(props, gates and siege objects typed as monsters); one without a model "
                "texture is drawn from a prefab that is an effect or a player body rather "
                "than a monster model. Nothing is substituted for either."
            ),
        },
        "variants": {name: variants[name] for name in
                     ("NPCConfig", "UnitConfig", "AttriMonsterConfig")},
        "enums": ctx.enums,
        "related": {
            "monsters-skills.json": "the skills these creatures cast",
            "monsters-drops.json": "the drop pools they roll",
            "monsters-gameplay.json": "the modes that reference them by id",
        },
        "shardNote": (
            "the rows are in the shards below, split into contiguous id runs so the "
            "roster is a few bounded fetches rather than one file that grows without "
            "limit. Each shard's `monsters` holds the full rows this file's notes "
            "describe."
        ),
        "shards": monster_shards,
    })

    write_json(out / "monsters-gameplay.json", {
        "source": SOURCE,
        "note": (
            "the game modes that reference a monster by id, kept out of monsters.json so "
            "the roster stays one browser-sized fetch. Keys and monster fields are ids "
            "into monsters.json."
        ),
        "counts": {
            "idleFarmingTags": len(idle_tags),
            "idleFarmingRecommendations": len(idle_recommend),
            "areaKillTimeAwards": len(area_concur),
            "pronteraDefenseSpawns": len(prontera),
        },
        "variants": {name: variants[name] for name in
                     ("AreaConcurMonsterConfig", "OnHookMonsterRecommendConfig",
                      "OnHookMonsterTagsConfig", "PronteraDefenseMonsterConfig")},
        "idleFarmingNote": (
            "idleFarmingTags is OnHookMonsterTagsConfig: each entry is "
            "[secondsFrom, secondsTo, difficulty] -- the kill-time band a difficulty "
            "rating is shown for."
        ),
        "idleFarmingTags": idle_tags,
        "idleFarmingRecommendations": idle_recommend,
        "areaKillTimeAwards": area_concur,
        "pronteraDefenseSpawns": prontera,
    })

    write_json(out / "monsters-skills.json", {
        "source": SOURCE,
        "note": (
            "only the skills the creatures in monsters.json cast, resolved from "
            "SkillConfig. skills.json is the full skill export; this is the monster "
            "subset, so a monster page needs one fetch rather than the whole table."
        ),
        "counts": {"skills": len(skills), "referenced": len(skill_ids),
                   "unresolved": len(skill_ids) - len(skills)},
        "skills": skills,
    })

    pool_shards = []
    for shard in shard_by_id(pools):
        low, high = shard[0]["id"], shard[-1]["id"]
        path = f"monsters-drops/{low}-{high}.json"
        write_json(out / path, {
            "source": SOURCE,
            "note": f"drop pools {low} to {high}; the index is monsters-drops.json",
            "counts": {"pools": len(shard)},
            "pools": shard,
        })
        pool_shards.append({"path": path, "pools": len(shard), "from": low, "to": high})

    write_json(out / "monsters-drops.json", {
        "source": SOURCE,
        "note": (
            "the drop pools the creatures in monsters.json roll, resolved through "
            "DropGroupConfig to the item ids they yield. Pools are listed once and "
            "referenced by id from a monster's dropPool / normalDropPools, so inlining "
            "them per monster would multiply the file. chance is the slot's own weight in "
            "millionths expressed as a fraction, and the slots are independent rather "
            "than a normalized distribution -- only 302 of the 1,393 pools have weights "
            "totalling 1,000,000, while 149 total exactly 2,000,000 and others land "
            "elsewhere, so a slot is a roll of its own and not a share of one draw. "
            "rolls is how many times the slot is drawn; a candidate's weight is its own "
            "_iWeights within the group, and copies is how many identical rows the group "
            "listed, which is how the table expresses a heavier weight. limits carries "
            "the job, level, quest and binding restrictions a candidate declares -- "
            "candidates are only merged when those agree too. Item ids are not resolved "
            "to names; items.json is the item table."
        ),
        "counts": {**pool_counts, "referenced": len(pool_ids),
                   "unresolved": len(pool_ids) - pool_counts["pools"],
                   "shards": len(pool_shards)},
        "gaps": {
            "poolsReferencedButAbsent": sorted(
                ident for ident in pool_ids if str(ident) not in tables["DropPoolConfig"]
            ),
            "note": "a monster naming a pool DropPoolConfig does not declare; the id is "
                    "kept on the monster row rather than the reference being dropped.",
        },
        "shardNote": (
            "the pools themselves are in the shards below, split into contiguous id runs "
            "so one fetch covers a range. Each shard's `pools` has the same shape this "
            "file's counts describe."
        ),
        "shards": pool_shards,
    })

    # --- MVP --------------------------------------------------------------------------
    mvps = [mvp_row(row, ctx) for row in
            sorted(list_rows(tables["MVPConfig"]), key=lambda r: r.get("_iID") or 0)]
    raid = [raid_boss_row(row, ctx) for row in
            sorted(list_rows(tables["TenGameplayBossConfig"]),
                   key=lambda r: r.get("_iBoss") or 0)]
    score = [_clean({
        "rank": row.get("_iRankID"), "damage": row.get("_iDemage"),
        "damageTaken": row.get("_iDemageSuffer"), "heal": row.get("_iHeal"),
        "deaths": row.get("_iDeath"), "awardWeight": row.get("_iAwardWeight"),
    }) for row in sorted(list_rows(tables["MVPScoreConfig"]),
                         key=lambda r: r.get("_iRankID") or 0)]

    write_json(out / "mvp.json", {
        "source": SOURCE,
        "note": (
            "the world-MVP rotation and the ten-player raid bosses. Every MVP is an "
            "NPCConfig creature as well, so it also appears in monsters.json (rank "
            "'mvp'); this file adds what only MVPConfig carries -- the map, the respawn "
            "timer, the reward split and the battle backdrop."
        ),
        "artSource": "resource-ro3: icons/monsters (head icons), bosses/models "
                     "(Model_Boss_* colour maps), mvp/backgrounds (battle backdrops)",
        "counts": {
            "mvps": len(mvps),
            "withLocalizedName": sum(1 for e in mvps if e.get("name")),
            "withStats": sum(1 for e in mvps if e.get("stats")),
            "withHeadIcon": sum(1 for e in mvps if e.get("headIcon")),
            "withModelTexture": sum(1 for e in mvps if e.get("modelTexture")),
            "withBackground": sum(1 for e in mvps if e.get("background")),
            "soloChallenge": sum(1 for e in mvps if e.get("soloChallenge")),
            "raidBosses": len(raid),
            "scoreRanks": len(score),
        },
        "variants": {"MVPConfig": variants["MVPConfig"],
                     "TenGameplayBossConfig": variants["TenGameplayBossConfig"]},
        "scoreNote": (
            "scoreRanks is MVPScoreConfig: the thresholds a participant's damage, damage "
            "taken, healing and death count are ranked against, and the reward weight "
            "each rank carries."
        ),
        "mvps": mvps,
        "raidBosses": raid,
        "scoreRanks": score,
    })

    print()
    print(f"monsters           {len(monsters):>6}  "
          f"({localized} named, {with_stats} with stats, {with_model} with a model texture)")
    print(f"monster skills     {len(skills):>6}")
    print(f"drop pools         {len(pools):>6}")
    print(f"mvps               {len(mvps):>6}  ({len(raid)} raid bosses)")
    print(f"localized slots dropped for echoing their own id: {text.sid_echo}")
    if text.placeholders_left:
        print(f"unrendered placeholders: {len(text.placeholders_left)}")
        for line in text.placeholders_left[:5]:
            print(f"  {line}")
    for name, stats in art_stats.items():
        print(f"art {name:<18} {stats['written']:>6} written of {stats['selected']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

