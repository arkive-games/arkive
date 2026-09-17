"""Emit the 人脉 (Fellow) dataset — the characters you befriend, and their bonds.

Run from ``tools/``::

    uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/ConfigIcon/Partners
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

**What is not here.** ``FellowData.DescribList`` holds five skill descriptions
per fellow and **nothing in the export says what unlocks each one** — five does
not line up with the seven affinity levels, nor with the four awakening steps of
``FellowRelationAwakeData``. They ship numbered, in the client's own order, with
no unlock condition attached, because inventing one would read as the game's.
Stories are different: ``FellowStoryData`` carries ``UnlockLevel`` outright, so
those do say when they open.
"""

from __future__ import annotations

import argparse
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
SKILLS_PER_FELLOW = 5
GRADE_COUNT = 6

#: Large first, Medium second. Neither directory is complete on its own — 克莱恩
#: has only a Medium, and 戴莉 / 班森 / 梅丽莎 only a Large — but together they
#: cover all fourteen. Order matters: Large is the portrait the game shows on a
#: fellow's own panel.
PORTRAIT_DIRS = (
    "C7/Content/Arts/UI_2/Resource/ConfigIcon/Partners/Large",
    "C7/Content/Arts/UI_2/Resource/ConfigIcon/Partners/Medium",
)


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


def build_fellows(tables: dict) -> list[dict]:
    stories = tables["FellowStory"]
    fellows = []
    for row in _rows(tables["Fellow"]):
        skills = _list(row.get("DescribList"))
        if len(skills) != SKILLS_PER_FELLOW:
            raise RuntimeError(
                f"fellow {row['ID']} ({row.get('Name')}) has {len(skills)} skill lines, "
                f"expected {SKILLS_PER_FELLOW}"
            )
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
            "order": row.get("Order", 0),
            "affinityLevelType": row.get("AffinityLevelType"),
            "defaultSkillId": row.get("DefaultSkillID"),
            # Numbered, with no unlock condition — see the module docstring.
            "skills": skills,
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


def build(excel: Path, raw: Path, data_out: Path, res_out: Path) -> dict[str, int]:
    strings = load_strings(excel)
    names = {
        "Fellow": "FellowData",
        "FellowStory": "FellowStoryData",
        "FellowRelation": "FellowRelationData",
        "RelationEffect": "RelationEffectData",
        "RelationRarity": "RelationRarityData",
        "FellowAffinityLevel": "FellowAffinityLevelData",
    }
    tables = {key: resolve_text(load_table(excel, table), strings) for key, table in names.items()}

    grades = build_grades(tables)
    effects, mismatches = build_effects(tables, grades)
    fellows = build_fellows(tables)
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
    for name, payload in payloads.items():
        write_json(Path(data_out) / OUT_DIR / f"{name}.json", payload)

    print(
        f"fellows: {len(fellows)} fellows, {len(relations)} relations, {len(effects)} effect sets "
        f"-> {OUT_DIR}/, {used['large']} large + {used['medium']} medium portraits -> {res_out}/{ICON_SUBDIR}"
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
