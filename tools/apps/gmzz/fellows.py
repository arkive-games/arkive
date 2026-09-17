"""Emit the 人脉 (Fellow) dataset — the characters you befriend, and their bonds.

Run from ``tools/``::

    uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/ConfigIcon/Partners
    uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/Skill/Follow
    uv run python -m gmzz.fellows

The system is ``Fellow`` internally. **``SecretPartner`` is a different system**
(秘偶) that also has ``Partner`` in its table names and its own art directory, so
grepping for "Partner" finds the wrong one first.

Two joins carry the mechanics, and both are easy to get subtly wrong:

**A relation's effect is per member, not per relation.**
``FellowRelationData.MemberEffectList`` maps a fellow id to an id in
``RelationEffectData`` — so 永远的守护者 gives 克莱恩 effect 6 and its other two
members something else entirely. An effect id of **0 means no combat effect**:
that member is in the relation for its story only. Reading the relation as
having one shared effect would put the wrong skill on two thirds of the roster.

**The six tiers are named by a table, not by the text.** Each effect's
``DescribList`` is keyed "0".."5" and every description happens to *begin* with
its tier in brackets — 【风闻】, 【浅见】 … — but those brackets are the client's
own typography. ``RelationRarityData`` maps the same 0..5 to
:data:`GRADE_COUNT` names, so the label is joined rather than parsed out of a
string that is free to change its punctuation.

**``DescribList`` is the star ladder, not five separate skills.** A fellow has
exactly one skill — ``DefaultSkillID``, in ``SkillDataNew`` — and the five lines
of ``DescribList`` are the 一阶…五阶 upgrades that its stars unlock, in order.
The game's own panel proves it: 奥黛丽's 一阶 chip reads "持续时间内目标受到的治疗
量增加5%", which is ``DescribList[0]`` verbatim. Nothing in the table says so,
which is exactly why it was first read as five skills and shipped that way.

**The skill's numbers cannot be recovered offline.** ``SkillDisc`` is written
against a client that expands ``*d`` and ``buffdisc(*id)`` at display time from
the caster's level, so a static export sees the placeholder rather than the 2247
the game prints. They are replaced with :data:`FORMULA_MARK` and counted — never
guessed. ``BriefDescription`` is placeholder-free for all fourteen and carries
the same shape of the skill without the figures, so both ship.

Stories do state when they open: ``FellowStoryData`` carries ``UnlockLevel``.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image

from .common import write_json
from .env import excel_dir, require_dir
from .tables import load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version

OUT_DIR = "fellows"
ICON_SUBDIR = "fellows"
WEBP_QUALITY = 90

#: Asserted against the client rather than assumed.
FELLOW_COUNT = 14
UPGRADE_COUNT = 5
GRADE_COUNT = 6

#: ``SkillDataNew`` ships as eight shards. All fourteen fellow skills sit in the
#: first one today, so the loader stops as soon as it has them all rather than
#: parsing nineteen megabytes of bytecode to find nothing new.
SKILL_TABLE = "SkillDataNew_split_{index}"
SKILL_TABLE_SHARDS = 8

#: What replaces a client-side formula in a skill description. Chosen to read as
#: an omission in running Chinese: "回复…点生命值" is plainly a missing figure,
#: where a 0 or a copied 2247 would be a wrong one.
FORMULA_MARK = "…"

#: ``*d`` is a scaled number; ``skilldisc(*id)`` and its siblings are whole
#: clauses the client assembles from another row. Neither survives an export.
FORMULA = re.compile(r"[A-Za-z]*disc\(\*id\)|\*id|\*d")

#: Large first, Medium second. Neither directory is complete on its own — 克莱恩
#: has only a Medium, and 戴莉 / 班森 / 梅丽莎 only a Large — but together they
#: cover all fourteen. Order matters: Large is the portrait the game shows on a
#: fellow's own panel.
PORTRAIT_DIRS = (
    "C7/Content/Arts/UI_2/Resource/ConfigIcon/Partners/Large",
    "C7/Content/Arts/UI_2/Resource/ConfigIcon/Partners/Medium",
)

#: The fellow skills' own icons. Unlike 愚者棋局's art this directory does mount,
#: so all fourteen resolve — but it is not part of the Partners export above and
#: has to be asked for by name.
SKILL_ICON_DIR = "C7/Content/Arts/UI_2/Resource/Skill/Follow"


def _rows(table) -> list:
    return list(table.values()) if isinstance(table, dict) else list(table)


def _list(value) -> list:
    """A client list field; LuaJIT writes ``{}`` for "none", which arrives as a dict."""
    return list(value) if isinstance(value, list) else []


def _asset_name(object_path: str | None) -> str:
    """``/Game/<dir>/<Name>.<Name>`` -> ``Name``."""
    text = object_path or ""
    return text.rsplit(".", 1)[-1] if "/" in text and "." in text else ""


def build_grades(tables: dict) -> list[dict]:
    """The six tiers a relation effect steps through, named by the client."""
    grades = sorted(
        ({"grade": int(row["ID"]), "name": row["GradeName"]} for row in _rows(tables["RelationRarity"])),
        key=lambda row: row["grade"],
    )
    if len(grades) != GRADE_COUNT:
        raise RuntimeError(
            f"RelationRarityData has {len(grades)} grades, expected {GRADE_COUNT} — "
            "the 风闻/浅见/实证/隐迹/秘辛/本相 ladder changed"
        )
    return grades


def build_effects(tables: dict, grades: list[dict]) -> tuple[list[dict], list[str]]:
    """The relation effects, and any tier whose text contradicts its own grade.

    Returns the mismatches rather than raising on them: at least one is the
    client's own copy-paste — effect 7's 秘辛 tier repeats its 实证 tier word for
    word, label included — and refusing to build over a defect in the game's
    data would block the whole dataset for something the game itself ships.
    """
    names = {row["grade"]: row["name"] for row in grades}
    known = set(names.values())
    mismatches: list[str] = []
    effects = []
    for row in _rows(tables["RelationEffect"]):
        described = row.get("DescribList") or {}
        tiers = []
        for key in sorted(described, key=int):
            grade = int(key)
            if grade not in names:
                raise RuntimeError(
                    f"effect {row['ID']}: tier {grade} has no name in RelationRarityData"
                )
            label = names[grade]
            text = described[key]
            # The client prefixes each description with its own tier label, and
            # the label is already a field here, so the prefix is dropped to
            # avoid printing 【风闻】 twice. Any of the six is stripped, not just
            # the expected one — otherwise the one row the client mislabelled
            # would render with a visible duplicate — and the disagreement is
            # reported instead.
            prefix = text[: text.find("】") + 1] if text.startswith("【") else ""
            if prefix in known:
                text = text[len(prefix):].lstrip()
                if prefix != label:
                    mismatches.append(
                        f"effect {row['ID']} tier {grade}: text is labelled {prefix} "
                        f"but RelationRarityData calls that tier {label}"
                    )
            tiers.append({"grade": grade, "gradeName": label, "description": text})
        effects.append({
            "id": int(row["ID"]),
            "summary": row.get("Introduce", ""),
            "skillId": row.get("SkillID"),
            "tiers": tiers,
        })
    return sorted(effects, key=lambda effect: effect["id"]), mismatches


def load_skills(excel: Path, strings: dict, wanted: set[int]) -> dict[int, dict]:
    """The rows behind the fellows' ``DefaultSkillID``, across ``SkillDataNew``."""
    found: dict[int, dict] = {}
    for index in range(1, SKILL_TABLE_SHARDS + 1):
        for key, row in load_table(excel, SKILL_TABLE.format(index=index)).items():
            skill_id = int(key)
            if skill_id in wanted:
                found[skill_id] = resolve_text(row, strings)
        if len(found) == len(wanted):
            return found
    raise RuntimeError(
        f"{len(wanted) - len(found)} fellow skill(s) absent from {SKILL_TABLE.format(index='*')}: "
        f"{sorted(wanted - set(found))}"
    )


def build_skill(row: dict, tags: dict[int, str]) -> dict:
    """One fellow's skill, in the shape the game's own panel shows it.

    The panel's two chips are ``DesTags``, not the single ``Tag`` field: 奥黛丽 is
    tagged 急救 there while the game shows 单体 and 治疗, which are ``DesTags``
    [1, 11]. ``Tags`` is the superset used by the combat code and carries
    bookkeeping entries (1004 伙伴技能, 1012 非普攻战斗技能) that are not labels.
    """
    named = []
    for tag_id in _list(row.get("DesTags")):
        name = tags.get(int(tag_id))
        if not name:
            raise RuntimeError(f"skill {row['ID']}: DesTags names {tag_id}, absent from SkillTagData")
        named.append(name)
    # `SkillCastDesc` rows are (shape id, human text); only the text is kept —
    # the shape id is an enum the client renders as that same text.
    cast = [str(entry[1]) for entry in _list(row.get("SkillCastDesc")) if len(entry) > 1]
    description = FORMULA.sub(FORMULA_MARK, row.get("SkillDisc", ""))
    return {
        "id": int(row["ID"]),
        "name": row.get("Name", ""),
        "cooldown": row.get("CD"),
        "tags": named,
        "castTargets": cast,
        "description": description,
        # Placeholder-free for all fourteen, so it is what a reader gets when
        # the detailed line collapses into marks.
        "brief": row.get("BriefDescription", ""),
        "hasFormula": FORMULA_MARK in description,
        "icon": _asset_name(row.get("SkillIcon")),
    }


def build_fellows(tables: dict, skills: dict[int, dict], tags: dict[int, str]) -> list[dict]:
    stories = tables["FellowStory"]
    fellows = []
    for row in _rows(tables["Fellow"]):
        upgrades = _list(row.get("DescribList"))
        if len(upgrades) != UPGRADE_COUNT:
            raise RuntimeError(
                f"fellow {row['ID']} ({row.get('Name')}) has {len(upgrades)} upgrade lines, "
                f"expected {UPGRADE_COUNT} (一阶…五阶)"
            )
        skill_id = row.get("DefaultSkillID")
        if skill_id is None:
            raise RuntimeError(f"fellow {row['ID']} ({row.get('Name')}) has no DefaultSkillID")
        told = []
        for story_id in _list(row.get("StoryList")):
            story = stories.get(str(int(story_id)))
            if story is None:
                raise RuntimeError(f"fellow {row['ID']}: StoryList names {story_id}, absent from FellowStoryData")
            told.append({
                "title": story.get("StoryTitle", ""),
                # Unlike the skills, a story does say when it opens.
                "unlockLevel": story.get("UnlockLevel"),
                "text": story.get("StoryText", ""),
            })
        fellows.append({
            "id": int(row["ID"]),
            "name": row["Name"],
            "englishName": row.get("EnglishName", ""),
            "shortName": row.get("ShortName", ""),
            "quality": row.get("Quality"),
            # `Label` is the one the game puts under the name; `BackgroudDesc`
            # (the client's spelling) lists every faction they belong to.
            "label": row.get("Label", ""),
            "affiliations": row.get("BackgroudDesc", ""),
            "gender": row.get("Gender"),
            "voiceActor": row.get("VoiceActor", ""),
            # The pathway the game prints on the fellow's own panel (空想家途径).
            "sequence": row.get("SequenceDesc", ""),
            "order": row.get("Order", 0),
            "affinityLevelType": row.get("AffinityLevelType"),
            "skill": build_skill(skills[int(skill_id)], tags),
            # 一阶…五阶, unlocked by stars — index carries the stage.
            "upgrades": [
                {"stage": stage, "description": text}
                for stage, text in enumerate(upgrades, start=1)
            ],
            "stories": told,
            "relationIds": [int(r) for r in _list(row.get("RelationList"))],
            "portrait": "",  # filled by _convert_portraits, which knows what exists
            "_iconCandidates": [
                _asset_name(row.get("IconPath")),
                _asset_name(row.get("IconPath_M")),
            ],
        })

    if len(fellows) != FELLOW_COUNT:
        raise RuntimeError(f"expected {FELLOW_COUNT} fellows, got {len(fellows)}")
    return sorted(fellows, key=lambda fellow: (-(fellow["quality"] or 0), fellow["order"]))


def build_relations(tables: dict, fellows: list[dict], effects: list[dict]) -> list[dict]:
    known_fellows = {fellow["id"] for fellow in fellows}
    known_effects = {effect["id"] for effect in effects}
    relations = []
    for row in _rows(tables["FellowRelation"]):
        members = []
        # `MemberEffectMapList` is the ordered form of `MemberEffectList`; the
        # dict's iteration order is a Lua hash order and is not stable.
        for pair in _list(row.get("MemberEffectMapList")):
            fellow_id, effect_id = int(pair[0]), int(pair[1])
            if fellow_id not in known_fellows:
                raise RuntimeError(f"relation {row['ID']} names fellow {fellow_id}, absent from FellowData")
            if effect_id and effect_id not in known_effects:
                raise RuntimeError(f"relation {row['ID']} names effect {effect_id}, absent from RelationEffectData")
            members.append({
                "fellowId": fellow_id,
                # 0 means story only — the member gains nothing in combat here.
                "effectId": effect_id or None,
            })
        relations.append({
            "id": int(row["ID"]),
            "name": row["Name"],
            "quality": row.get("RelationQuality"),
            "type": row.get("Type"),
            "isOriginal": bool(row.get("IsOriginal")),
            "order": row.get("Order", 0),
            "story": row.get("Story", ""),
            "awakeStory": row.get("AwakeStory", ""),
            "members": members,
        })
    return sorted(relations, key=lambda relation: (relation["order"], relation["id"]))


def build_levels(tables: dict) -> list[dict]:
    """The affinity ladders, one per `AffinityLevelType`."""
    ladders = []
    for index, ladder in enumerate(_rows(tables["FellowAffinityLevel"]), start=1):
        ladders.append({
            "type": index,
            "levels": [
                {
                    "level": level,
                    "name": row.get("Desc", ""),
                    # The last rung has no cost: there is nothing above it.
                    "exp": row.get("Exp"),
                    "interactCount": row.get("InteractCount"),
                }
                for level, row in enumerate(_rows(ladder), start=1)
            ],
        })
    return ladders


def _convert_portraits(raw: Path, res_out: Path, fellows: list[dict]) -> dict[str, int]:
    """One portrait per fellow, preferring the large art the game's own panel uses."""
    target = Path(res_out) / ICON_SUBDIR
    target.mkdir(parents=True, exist_ok=True)
    used = {"large": 0, "medium": 0}
    for fellow in fellows:
        candidates = fellow.pop("_iconCandidates")
        chosen = None
        for directory, size in zip(PORTRAIT_DIRS, ("large", "medium")):
            for name in candidates:
                png = Path(raw) / directory / f"{name}.png"
                if name and png.is_file():
                    chosen = (name, png, size)
                    break
            if chosen:
                break
        if chosen is None:
            raise FileNotFoundError(
                f"fellow {fellow['id']} ({fellow['name']}) has no portrait in either "
                f"{PORTRAIT_DIRS} — run: uex export --profile gmzz --only "
                "C7/Content/Arts/UI_2/Resource/ConfigIcon/Partners"
            )
        name, png, size = chosen
        with Image.open(png) as img:
            img.save(target / f"{name}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
        fellow["portrait"] = name
        used[size] += 1
    return used


def _convert_skill_icons(raw: Path, res_out: Path, fellows: list[dict]) -> tuple[int, list[str]]:
    """Eleven of the fourteen skill icons; the other three do not exist to export.

    ``Follow_Skill_01``, ``_05`` and ``_08`` — 邓恩, 佛尔思 and 梅丽莎 — are absent
    from the pak index itself, not merely from the last export: ``uex search
    Follow_Skill_0`` lists 02, 03, 04, 06, 07 and 09 and skips exactly those
    three. That is the same blind spot 愚者棋局's art falls into, so the three are
    named in the output and their `icon` cleared, and the page prints their name
    instead of a broken image.
    """
    source = Path(raw) / SKILL_ICON_DIR
    if not source.is_dir():
        raise FileNotFoundError(
            f"{source} is absent — run: uex export --profile gmzz --only {SKILL_ICON_DIR}"
        )
    target = Path(res_out) / ICON_SUBDIR
    target.mkdir(parents=True, exist_ok=True)
    count, missing = 0, []
    for fellow in fellows:
        name = fellow["skill"]["icon"]
        png = source / f"{name}.png"
        if not png.is_file():
            missing.append(f"{fellow['name']} ({name})")
            fellow["skill"]["icon"] = ""
            continue
        with Image.open(png) as img:
            img.save(target / f"{name}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
        count += 1
    return count, missing


def build(excel: Path, raw: Path, data_out: Path, res_out: Path) -> dict[str, int]:
    strings = load_strings(excel)
    names = {
        "Fellow": "FellowData",
        "FellowStory": "FellowStoryData",
        "FellowRelation": "FellowRelationData",
        "RelationEffect": "RelationEffectData",
        "RelationRarity": "RelationRarityData",
        "FellowAffinityLevel": "FellowAffinityLevelData",
        "SkillTag": "SkillTagData",
    }
    tables = {key: resolve_text(load_table(excel, table), strings) for key, table in names.items()}
    tags = {int(row["ID"]): row["Tag"] for row in _rows(tables["SkillTag"])}
    skills = load_skills(
        excel, strings, {int(row["DefaultSkillID"]) for row in _rows(tables["Fellow"])}
    )

    grades = build_grades(tables)
    effects, mismatches = build_effects(tables, grades)
    fellows = build_fellows(tables, skills, tags)
    relations = build_relations(tables, fellows, effects)
    levels = build_levels(tables)

    payloads = {"fellows": fellows, "relations": relations, "effects": effects, "levels": levels}
    missing = unresolved_ids(payloads)
    if missing:
        raise RuntimeError(
            f"{len(missing)} text id(s) had no zh-CN string, e.g. {sorted(missing)[:3]}"
        )

    # Portraits before the JSON: each fellow's `portrait` is decided here, and a
    # dataset naming art the image repo lacks is worse than no dataset.
    used = _convert_portraits(raw, res_out, fellows)
    skill_icons, iconless = _convert_skill_icons(raw, res_out, fellows)
    for name, payload in payloads.items():
        write_json(Path(data_out) / OUT_DIR / f"{name}.json", payload)

    formulas = sum(1 for fellow in fellows if fellow["skill"]["hasFormula"])
    print(
        f"fellows: {len(fellows)} fellows, {len(relations)} relations, {len(effects)} effect sets "
        f"-> {OUT_DIR}/, {used['large']} large + {used['medium']} medium portraits + "
        f"{skill_icons} skill icons -> {res_out}/{ICON_SUBDIR}"
    )
    if iconless:
        print(
            f"fellows: {len(iconless)} skill icon(s) are not in the pak index at all — "
            f"{', '.join(iconless)}"
        )
    if formulas:
        print(
            f"fellows: {formulas} of {len(fellows)} skill descriptions carry a client-side "
            f"formula, shown as '{FORMULA_MARK}' — the figure depends on the caster's level "
            "and is not in the tables"
        )
    for line in mismatches:
        print(f"fellows: {line} (the client's own data; shipped as it stands)")
    return {"fellows": len(fellows), "relations": len(relations), "effects": len(effects)}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--excel", type=Path, default=None)
    parser.add_argument("--raw", type=Path, default=None)
    parser.add_argument("--data-out", type=Path, default=None)
    parser.add_argument("--res-out", type=Path, default=None)
    args = parser.parse_args(argv)

    data_out = args.data_out or require_dir("GMZZ_DATA_OUT")
    build(
        args.excel or excel_dir(),
        args.raw or require_dir("GMZZ_RAW"),
        data_out,
        args.res_out or require_dir("GMZZ_RES_OUT"),
    )
    stamp_version(data_out)


if __name__ == "__main__":
    main()
