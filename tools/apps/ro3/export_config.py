"""Emit the ro3 skill, job-skill and NPC tables, and the language tables.

This is the second half of the dataset. :mod:`.export_data` covers what the *asset* side
knows (icon inventories, models, the scene manifest); this covers the game's own
``Config/DataConfig`` tables, which became readable once :mod:`.lua` undid the four layers
of Lua obfuscation and :mod:`.lua_tables` ran the chunks.

Three things are worth knowing about the shapes here.

**Field names are the game's own.** ``_iSkillID`` is emitted as ``iSkillID`` -- the leading
underscore goes, the Hungarian prefix stays. Renaming a column to something friendlier
would mean claiming to know what it means, and for most of the 110 skill columns nobody
here does. Units are likewise not converted: ``iCD`` is whatever the client stores.

**Empty values are dropped.** Every row carries all of its table's columns after the
template merge, and most of them hold the column default. A row therefore lists only the
fields whose value is not ``0``, ``""``, ``[]`` or ``{}`` -- absent means default, which is
also what the client's own accessors return.

**It emits only the tables listed in** :data:`WANTED_TABLES`. 500+ ``DataConfig`` tables
decode; the item, equipment, monster-stat, card, pet and map tables are emitted by their
own stages, and adding one here would have two writers for one file.

**The multiverse variants are unioned.** Each ``DataConfig`` ships once under
``LuaScript/`` and again under ``LuaMultiverse/M101`` and ``M102``. The shared rows are
byte-identical across all three; each variant adds rows the others do not have, and the
row's own ``_kMultiverseArray`` says which (``[0]`` shared, ``[101]``/``[102]`` variant).
For ``SkillConfig`` the union is 8,348 rows, which is exactly the ``m_kCount`` all three
copies declare -- so the union is the whole authored table, not a guess.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from . import localization, lua_tables
from .common import dumps, write_json
from .env import require_dir
from .version import stamp_version

#: Byte budget for one emitted file. The dataset is fetched by browsers a file at a time,
#: and the other pipelines' largest table is 2.1 MB, so a table that would exceed this is
#: sharded rather than shipped whole. ``locales/`` is the exception -- one file per language
#: is already the natural split, and zh-CN lands just over 2 MB with nothing to divide.
SHARD_BUDGET = 1_500_000

#: ``Config/DataConfig/<Name>.lua``, under ``LuaScript/`` or a ``LuaMultiverse/M1xx/``.
DATA_CONFIG = re.compile(r"(?:^|/)Config/DataConfig/(?P<name>[A-Za-z0-9_]+)\.lua$")

#: ``Language/Resources/<Language>/Script/LuaScript/Localization_<code>.lua``.
LOCALIZATION = re.compile(r"(?:^|/)LuaScript/Localization_(?P<code>[A-Za-z_]+)\.lua$")

#: Which ``DataConfig`` tables this export reads. Everything else in the corpus is left
#: alone: 500+ tables decode, and a dataset served to browsers is better as a few
#: well-formed ones than as all of them.
WANTED_TABLES = (
    "SkillConfig",
    "JobProfessSkillConfig",
    "NPCConfig",
)

#: Language table -> the locale tag the dataset uses. The client's own codes, retagged to
#: BCP 47 so they match the rest of the platform.
LOCALE_TAGS = {
    "zh_CN": "zh-CN",
    "zh_TW": "zh-TW",
    "en": "en",
    "ko": "ko",
    "th": "th",
    "id": "id",
    "vi": "vi",
}

#: Locales whose rendered name/description is inlined into each table row. The full string
#: tables ship under ``locales/``, and every row keeps its own ``iName`` / ``iDescription``
#: / ``kDescData`` arguments, so any other language can be rendered from those.
INLINE_LOCALES = ("zh-CN", "en", "ko")

#: Where ``art.py`` puts each icon family in the resource repo.
ICON_DIRS = ("skills", "talents", "monsters", "jobs", "dungeons", "other")

#: Columns kept even when they read as their default, because the dataset's own notes
#: cite them: ``kMultiverseArray`` is ``[0]`` on every shared row, and that ``[0]`` is the
#: evidence for how the variant copies nest.
ALWAYS_KEEP = ("_kMultiverseArray",)


def is_empty(value) -> bool:
    """Whether a column holds its default.

    Recursive, because the exporter writes a default list as a list of defaults:
    ``[""]``, ``[0]``, ``[0, 0]`` and ``[[""]]`` all mean "nothing set" and all occur on
    thousands of rows.
    """
    if value is None or value == 0 or value == "":
        return True
    if isinstance(value, dict):
        return all(is_empty(v) for v in value.values())
    if isinstance(value, list):
        return all(is_empty(v) for v in value)
    return False


def is_data_config(script: str) -> bool:
    m = DATA_CONFIG.search(script)
    return bool(m and m.group("name") in WANTED_TABLES)


def is_localization(script: str) -> bool:
    return bool(LOCALIZATION.search(script))


def wanted(script: str) -> bool:
    return is_data_config(script) or is_localization(script)


def clean(row: dict) -> dict:
    """Strip the leading underscore from each column and drop the columns holding defaults."""
    return {
        key.lstrip("_"): value
        for key, value in sorted(row.items())
        if key in ALWAYS_KEEP or not is_empty(value)
    }


def union_rows(chunks: list[lua_tables.Chunk], runner: lua_tables.Runner) -> tuple[dict, dict]:
    """Merge a table's variant copies into one row map.

    Returns ``(rows, stats)``. A row present in more than one copy is taken from the first,
    and ``stats`` records each copy's row count plus how many rows it contributed that no
    earlier copy had -- which is the evidence that the copies nest rather than conflict.
    """
    rows: dict[str, dict] = {}
    stats: dict[str, dict] = {}
    declared: set[int] = set()
    for chunk in chunks:
        table = runner.run(chunk.data)
        found = lua_tables.rows(table)
        count = table.get("m_kCount")
        if isinstance(count, int):
            declared.add(count)
        added = 0
        conflicts = 0
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


def shard_rows(rows: list[dict], id_of, *, depth: int = 2) -> dict[str, list[dict]]:
    """Group rows into id-prefix bands, deepening a band's prefix until the band fits.

    The bands are **mechanical id ranges, not categories** -- ``skills/23`` is every skill
    whose id starts with 23, and RO3's ids do group a job's skills together, but the shard
    boundary is a byte budget rather than a meaning. A consumer resolves a row to its shard
    by taking the longest band prefix that its id starts with, which the index lists.
    """
    bands: dict[str, list[dict]] = {}

    def place(group: list[dict], at: int) -> None:
        buckets: dict[str, list[dict]] = {}
        for row in group:
            buckets.setdefault(str(id_of(row))[:at], []).append(row)
        for key, bucket in sorted(buckets.items()):
            longest = max(len(str(id_of(row))) for row in bucket)
            if len(dumps(bucket).encode()) <= SHARD_BUDGET or at >= longest:
                bands[key] = bucket
            else:
                place(bucket, at + 1)

    if rows:
        place(rows, depth)
    return dict(sorted(bands.items()))


def write_shards(out: Path, name: str, bands: dict[str, list[dict]], field: str) -> list[dict]:
    """Write one file per band and return the manifest the index file carries."""
    manifest = []
    for prefix, band in bands.items():
        path = f"{name}/{prefix}.json"
        write_json(out / path, {
            "shardOf": f"{name}.json",
            "idPrefix": prefix,
            "counts": {"rows": len(band)},
            field: band,
        })
        manifest.append({"idPrefix": prefix, "path": path, "rows": len(band)})
    return manifest


@dataclass(frozen=True, slots=True)
class Icons:
    """Basename -> repo-relative WebP path, over every icon ``art.py`` exported."""

    by_name: dict[str, str]

    @classmethod
    def read(cls, res_out: Path) -> "Icons":
        found: dict[str, str] = {}
        for family in ICON_DIRS:
            directory = res_out / "icons" / family
            if not directory.is_dir():
                continue
            for path in sorted(directory.glob("*.webp")):
                found.setdefault(path.stem, f"icons/{family}/{path.name}")
        return cls(found)

    def lookup(self, source_name) -> str | None:
        """The exported WebP for a config field naming a client sprite (``foo.png``)."""
        if not isinstance(source_name, str) or not source_name:
            return None
        return self.by_name.get(Path(source_name).stem)


class Text:
    """The language tables, and the rendered text for one localized field."""

    def __init__(self, tables: dict[str, dict[str, str]]) -> None:
        self.tables = tables
        self.rendered = 0
        self.with_placeholders = 0

    def render(self, field, desc_data=None) -> dict[str, str]:
        """``{locale: text}`` over :data:`INLINE_LOCALES`, omitting the locales with none."""
        out: dict[str, str] = {}
        for tag in INLINE_LOCALES:
            table = self.tables.get(tag)
            if table is None:
                continue
            text = localization.lookup(table, field, desc_data)
            if text is None:
                continue
            out[tag] = text
            self.rendered += 1
            if localization.unresolved(text):
                self.with_placeholders += 1
        return out


def skill_rows(rows: dict, icons: Icons, text: Text) -> tuple[list[dict], dict]:
    out = []
    joined = 0
    named = 0
    described = 0
    unjoined: set[str] = set()
    for key in sorted(rows, key=int):
        row = rows[key]
        entry = clean(row)
        icon = icons.lookup(row.get("_kIcon"))
        if icon:
            entry["icon"] = icon
            joined += 1
        elif isinstance(row.get("_kIcon"), str) and row["_kIcon"]:
            unjoined.add(row["_kIcon"])
        desc_data = row.get("_kDescData") if isinstance(row.get("_kDescData"), list) else None
        name = text.render(row.get("_iName"))
        desc = text.render(row.get("_iDescription"), desc_data)
        if name:
            entry["name"] = name
            named += 1
        if desc:
            entry["desc"] = desc
            described += 1
        out.append(entry)
    return out, {
        "rows": len(out),
        "withIcon": joined,
        "withName": named,
        "withDescription": described,
        "iconsNotExported": len(unjoined),
    }


def npc_rows(rows: dict, icons: Icons, text: Text) -> tuple[list[dict], dict]:
    out = []
    named = 0
    titled = 0
    joined = 0
    for key in sorted(rows, key=int):
        row = rows[key]
        entry = clean(row)
        icon = icons.lookup(row.get("_kHeadIcon"))
        if icon:
            entry["headIcon"] = icon
            joined += 1
        name = text.render(row.get("_kName"))
        title = text.render(row.get("_kTitle"))
        if name:
            entry["name"] = name
            named += 1
        if title:
            entry["title"] = title
            titled += 1
        out.append(entry)
    return out, {
        "rows": len(out),
        "withName": named,
        "withTitle": titled,
        "withHeadIcon": joined,
    }


def plain_rows(rows: dict) -> list[dict]:
    return [clean(rows[key]) for key in sorted(rows, key=int)]


def skill_index(skill_list: list[dict]) -> list[dict]:
    """One entry per skill, collapsing its level rows to the ids that carry them."""
    grouped: dict[int, list[dict]] = {}
    for row in skill_list:
        grouped.setdefault(row["iSkillID"], []).append(row)
    index = []
    for skill_id in sorted(grouped):
        levels = sorted(grouped[skill_id], key=lambda r: r.get("iLevel", 0))
        first = levels[0]
        entry: dict = {"iSkillID": skill_id}
        for column in ("iJob", "iMaxLevel", "iSystemType", "icon"):
            if first.get(column):
                entry[column] = first[column]
        if first.get("name"):
            entry["name"] = first["name"]
        entry["levels"] = [row["iID"] for row in levels]
        index.append(entry)
    return index


def light_index(rows: list[dict], columns: tuple[str, ...]) -> list[dict]:
    """A searchable stub of a sharded table: the id, the name, and a few key columns."""
    out = []
    for row in rows:
        entry: dict = {"iID": row["iID"]}
        for column in columns:
            if row.get(column):
                entry[column] = row[column]
        if row.get("name"):
            entry["name"] = row["name"]
        out.append(entry)
    return out


def read_tables(vfs_root: Path) -> tuple[dict[str, list[lua_tables.Chunk]], dict]:
    """Group the wanted chunks by table name, and separate the language tables out."""
    found = lua_tables.collect_chunks(vfs_root, wanted)
    languages: dict[str, list[lua_tables.Chunk]] = {}
    for name in list(found):
        m = LOCALIZATION.search(found[name][0].script or "")
        if m:
            languages[m.group("code")] = found.pop(name)
    return found, languages


def main() -> None:
    vfs = require_dir("RO3_GAME") / "StreamingAssets" / "VFS"
    out = require_dir("RO3_DATA_OUT")
    icons = Icons.read(require_dir("RO3_RES_OUT"))
    runner = lua_tables.Runner()

    tables, languages = read_tables(vfs)
    missing = [name for name in WANTED_TABLES if name not in tables]
    if missing:
        raise RuntimeError(f"config tables not found in the containers: {', '.join(missing)}")

    # --- locales ---------------------------------------------------------------------
    text_tables: dict[str, dict[str, str]] = {}
    locale_stats: dict[str, dict] = {}
    for code, chunks in sorted(languages.items()):
        tag = LOCALE_TAGS.get(code)
        if tag is None:
            continue
        rows = lua_tables.rows(runner.run(chunks[0].data))
        table = localization.text_table(rows)
        text_tables[tag] = table
        locale_stats[tag] = {
            "entries": len(rows),
            "translated": len(table),
            "untranslated": len(rows) - len(table),
        }
        write_json(out / "locales" / f"{tag}.json", {
            "source": f"Localization_{code}.lua in the .bytes data containers",
            "note": (
                "the client's string table, id -> text. Entries whose text is the literal "
                "\"None\" are untranslated slots in this CN build and are omitted rather "
                "than presented as translations."
            ),
            "locale": tag,
            "counts": locale_stats[tag],
            "strings": {key: table[key] for key in sorted(table, key=int)},
        })
    text = Text(text_tables)

    write_json(out / "locales" / "index.json", {
        "source": "Localization_*.lua in the .bytes data containers",
        "note": (
            "one file per language. This is a CN build, so zh-CN and zh-TW are complete "
            "while en, ko, th and id ship ~19,300 untranslated slots each; those are "
            "counted here and omitted from the files."
        ),
        "locales": [
            {"locale": tag, "path": f"locales/{tag}.json", **locale_stats[tag]}
            for tag in sorted(locale_stats)
        ],
    })

    # --- skills ----------------------------------------------------------------------
    skills, skill_variants = union_rows(tables["SkillConfig"], runner)
    skill_list, skill_counts = skill_rows(skills, icons, text)
    skill_bands = shard_rows(skill_list, lambda r: r["iSkillID"])
    skill_shards = write_shards(out, "skills", skill_bands, "skills")
    skills_index = skill_index(skill_list)
    write_json(out / "skills.json", {
        "source": "SkillConfig.lua in the .bytes data containers (deobfuscated Lua 5.4)",
        "iconSource": "icon_skill_* WebP in resource-ro3, joined on kIcon",
        "note": (
            "the skill index. One entry per skill; the full level rows live in the shards "
            "under skills/, which carry every column the client ships. iSkillID is the "
            "skill and iLevel its level, and a level row's key is the client's own "
            "composite id (iSkillID * 100 + iLevel). Field names are the game's own with "
            "the leading underscore removed, and a column absent from a row holds its "
            "default. Text is rendered from the language tables under locales/: ${n} comes "
            "from the row's kDescData, ^{n} and @{n} from the field's own arguments."
        ),
        "counts": {
            **skill_counts,
            "skills": len(skills_index),
            "shards": len(skill_shards),
        },
        "variants": skill_variants,
        "shards": skill_shards,
        "skills": skills_index,
    })

    # --- job skill trees -------------------------------------------------------------
    job_skills, job_variants = union_rows(tables["JobProfessSkillConfig"], runner)
    job_list = plain_rows(job_skills)
    write_json(out / "job-skills.json", {
        "source": "JobProfessSkillConfig.lua in the .bytes data containers",
        "note": (
            "one row per profession, job rank and job level. kDescData holds skill row ids "
            "into skills.json - the column is named that way in the source even though it "
            "carries skill ids rather than description arguments, and it is not renamed "
            "here."
        ),
        "counts": {"rows": len(job_list)},
        "variants": job_variants,
        "jobSkills": job_list,
    })

    # --- monsters and NPCs -----------------------------------------------------------
    npcs, npc_variants = union_rows(tables["NPCConfig"], runner)
    npc_list, npc_counts = npc_rows(npcs, icons, text)
    npc_shards = write_shards(
        out, "npcs", shard_rows(npc_list, lambda r: r["iID"], depth=1), "npcs"
    )
    write_json(out / "npcs.json", {
        "source": "NPCConfig.lua in the .bytes data containers",
        "headIconSource": "headicon_* WebP in resource-ro3, joined on kHeadIcon",
        "note": (
            "the index of every unit the client places -- NPCs, monsters and bosses "
            "together, as one table, keyed by the client's own id. The full rows live in "
            "the shards under npcs/. iAttribute is a row id into AttriMonsterConfig, "
            "which the monster-stat stage emits; it is carried here unresolved."
        ),
        "counts": {**npc_counts, "shards": len(npc_shards)},
        "variants": npc_variants,
        "shards": npc_shards,
        "npcs": light_index(npc_list, ("iLevel", "iNPCType", "iNPCSubType", "iRace", "headIcon")),
    })

    stamp_version(out)

    print(f"locales      : {len(locale_stats)} languages")
    for tag in sorted(locale_stats):
        s = locale_stats[tag]
        print(f"  {tag:<6} {s['translated']:>6} translated, {s['untranslated']:>6} untranslated")
    print(
        f"skills       : {skill_counts['rows']} rows, {skill_counts['withIcon']} with an icon, "
        f"{skill_counts['withName']} named, {skill_counts['withDescription']} described "
        f"({len(skill_shards)} shards)"
    )
    print(f"job skills   : {len(job_list)} rows")
    print(
        f"npcs         : {npc_counts['rows']} rows, {npc_counts['withName']} named, "
        f"{npc_counts['withHeadIcon']} with a head icon ({len(npc_shards)} shards)"
    )
    print(
        f"text         : {text.rendered} strings rendered, "
        f"{text.with_placeholders} with a placeholder left unresolved"
    )


if __name__ == "__main__":
    main()
