"""Encyclopedia stage: emit per-Pal encyclopedia data + the global passive list.

Reuses the breeding stage's roster/name logic (a Pal is catalogued iff
``IsPal`` and ``CombiRank != 9999`` and ``ZukanIndex >= 1`` and it has a real
name and a normal icon). For each such Pal we gather base stats, elements, work
suitability, its partner skill, its active-skill learnset, innate passives and
kill drops from the raw CUE4Parse tables under ``DataTable``.

Localized text (Pal descriptions, skill/passive names & descriptions, item
names, element/work labels) is layered exactly as ``breeding.py`` layers names:
the mojibake JA ``_Common`` base overlaid per-language from ``L10N/<folder>/Pal``.

Outputs (mirrors the maps/breeding split):
  data-palworld/pals.json                     {pals: [PalEntry]}
  data-palworld/passives.json                 {passives: [Passive]}  (115 displayable)
  data-palworld/locales/<tag>/pals.json       {palId: {name, description, partnerSkill{name,desc?}}}
  data-palworld/locales/<tag>/skills.json     {wazaId: {name, description?}}
  data-palworld/locales/<tag>/passives.json   {passiveId: {name, description?}}
  data-palworld/locales/<tag>/items.json      {itemId: name}
  data-palworld/locales/<tag>/enums.json      {elements: {Element: name}, work: {WorkType: name}}
  resource-palworld/icons/element_<Element>.webp   (9)
  resource-palworld/icons/work_<WorkType>.webp     (12; OilExtraction has no icon)

Run: ``uv run python -m palworld.encyclopedia`` (from the ``tools`` dir).
"""

from __future__ import annotations

import os
import re
from pathlib import Path

import yaml
from PIL import Image

from .breeding import _has_real_name, _names_by_lang
from .maps.common import read_rows, round2, write_json
from .maps.extract import JA_TAG, L10N_LANG_TAGS

RAW = Path(os.environ.get("PALWORLD_RAW", "E:/SteamLibrary/steamapps/common/Palworld/Exports/Pal/Content/Pal"))
DATA_OUT = Path(os.environ.get("PALWORLD_DATA_OUT", "E:/aion2-map/data-palworld"))
RES_OUT = Path(os.environ.get("PALWORLD_RES_OUT", "E:/aion2-map/resource-palworld"))

# Enum prefixes stripped to bare names in the output.
_ELEM = "EPalElementType::"
_WAZA = "EPalWazaID::"
_SIZE = "EPalSizeType::"
_GENUS = "EPalGenusCategoryType::"
_WORK = "EPalWorkSuitability::"
_CAT = "EPalWazaCategory::"
_EFFT = "EPalPassiveSkillEffectType::"
_TGT = "EPalPassiveSkillEffectTargetType::"

# EPalElementType enum order -> element icon T_Icon_element_00..08.
ELEMENTS = ["Normal", "Fire", "Water", "Leaf", "Electricity", "Ice", "Earth", "Dark", "Dragon"]
# The 13 work-suitability types (order = display order); OilExtraction lacks an icon.
WORK_TYPES = [
    "EmitFlame", "Watering", "Seeding", "GenerateElectricity", "Handcraft",
    "Collection", "Deforest", "Mining", "OilExtraction", "ProductMedicine",
    "Cool", "Transport", "MonsterFarm",
]

_NONE = {None, "None", ""}
# DT_WazaMasterLevel PalIds occasionally differ from the CharacterID only by
# casing (…Fish vs …fish) or a boss/gym prefix; strip those to match the roster.
_WAZA_PREFIX = re.compile(r"^(boss_|gym_)", re.I)


_DATA_SRC = Path(__file__).parent / "data_src"


def _strip(v: str | None, prefix: str) -> str:
    return (v or "").replace(prefix, "")


def _load_partner_labels() -> tuple[dict, dict]:
    """Hand-authored partner-skill labels from partner_effects.yaml:
    ({EffectType: {tag: label}}, {TargetType: {tag: label}})."""
    path = _DATA_SRC / "partner_effects.yaml"
    if not path.exists():
        return {}, {}
    doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return doc.get("effects") or {}, doc.get("targets") or {}


def _read_text(path: Path, prefix: str) -> dict:
    """{idAfterPrefix: string} from a DT_*Text table (localized or source)."""
    if not path.exists():
        return {}
    out = {}
    for key, r in read_rows(path).items():
        if not key.startswith(prefix):
            continue
        td = r.get("TextData") or {}
        s = td.get("LocalizedString") or td.get("SourceString")
        if s:
            out[key[len(prefix):]] = s
    return out


def _text_by_lang(raw: Path, rel: str, prefix: str) -> dict[str, dict]:
    """{tag: {id: string}}; each L10N folder layered over the ja base for one table."""
    ja = _read_text(raw / rel, prefix)
    by_lang = {JA_TAG: ja}
    for folder, tag in L10N_LANG_TAGS.items():
        loc = _read_text(raw.parent / "L10N" / folder / "Pal" / rel, prefix)
        by_lang[tag] = {**ja, **loc}
    return by_lang


def _all_tags() -> list[str]:
    return [JA_TAG, *L10N_LANG_TAGS.values()]


def _is_roster(cid: str, r: dict, names_by_lang: dict, raw_icons: set) -> bool:
    return (
        r.get("IsPal") is True
        and r.get("CombiRank") != 9999
        and (r.get("ZukanIndex", -1) or -1) >= 1
        and _has_real_name(names_by_lang, cid)
        and f"T_{cid}_icon_normal" in raw_icons
    )


def _stats(r: dict) -> dict:
    return {
        "hp": r.get("Hp", 0),
        "meleeAttack": r.get("MeleeAttack", 0),
        "shotAttack": r.get("ShotAttack", 0),
        "defense": r.get("Defense", 0),
        "craftSpeed": r.get("CraftSpeed", 0),
        "stamina": r.get("Stamina", 0),
        "foodAmount": r.get("FoodAmount", 0),
        "maxFullStomach": r.get("MaxFullStomach", 0),
        "captureRate": round2(r.get("CaptureRateCorrect", 1.0)),
        "price": int(r.get("Price", 0)),
        "maleProbability": r.get("MaleProbability", 0),
        "walkSpeed": r.get("WalkSpeed", 0),
        "runSpeed": r.get("RunSpeed", 0),
        "rideSprintSpeed": r.get("RideSprintSpeed", 0),
        "transportSpeed": r.get("TransportSpeed", 0),
    }


def _work(r: dict) -> dict:
    out = {}
    for wt in WORK_TYPES:
        lvl = r.get(f"WorkSuitability_{wt}", 0) or 0
        if lvl > 0:
            out[wt] = lvl
    return out


def _passives_of(r: dict) -> list[str]:
    out = []
    for i in (1, 2, 3, 4):
        p = r.get(f"PassiveSkill{i}")
        if p not in _NONE:
            out.append(p)
    return out


def _waza_lookup(waza_data: dict) -> dict:
    """{bare WazaID: row} from DT_WazaDataTable (keyed WazaType)."""
    out = {}
    for r in waza_data.values():
        wid = _strip(r.get("WazaType"), _WAZA)
        if wid and wid != "None":
            out[wid] = r
    return out


def _learnset_for(cid: str, grouped: dict[str, list]) -> list:
    """Rows from DT_WazaMasterLevel for a Pal, tolerating casing / boss-gym prefixes."""
    target = cid.lower()
    exact = next((rows for pid, rows in grouped.items() if pid.lower() == target), None)
    if exact:
        return exact
    best = None
    for pid, rows in grouped.items():
        if _WAZA_PREFIX.sub("", pid.lower()) == target and (best is None or len(pid) < len(best[0])):
            best = (pid, rows)
    return best[1] if best else []


def _active_skills(cid: str, learnset: list, waza_by_id: dict) -> list:
    out = []
    for row in learnset:
        wid = _strip(row.get("WazaID"), _WAZA)
        if not wid or wid == "None":
            continue
        w = waza_by_id.get(wid, {})
        out.append({
            "wazaId": wid,
            "level": row.get("Level", 1),
            "element": _strip(w.get("Element"), _ELEM),
            "category": _strip(w.get("Category"), _CAT),
            "power": w.get("DisplayPower", w.get("Power", 0)),
            "coolTime": round2(w.get("CoolTime", 0.0)),
        })
    out.sort(key=lambda s: (s["level"], s["wazaId"]))
    return out


def _partner_effects(cid: str, partner_rows: dict, passive_main: dict) -> list:
    """Buff-type partner effects: the rank tiers (``SkillName.Key`` ``_1``…``_5``)
    resolved through ``DT_PassiveSkill_Main`` and grouped by (type, target), each
    with the per-rank ``values`` array."""
    r = partner_rows.get(cid)
    if not r:
        return []
    grouped: dict[tuple[str, str], list] = {}
    order: list[tuple[str, str]] = []
    for ps in r.get("PassiveSkills") or []:
        for s in ps.get("SkillAndParametersArray") or []:
            key = ((s.get("SkillName") or {}).get("Key"))
            row = passive_main.get(key)
            if not row:
                continue
            for i in (1, 2, 3, 4):
                et = _strip(row.get(f"EffectType{i}"), _EFFT)
                if not et or et in ("no", "None"):
                    continue
                tgt = _strip(row.get(f"TargetType{i}"), _TGT)
                gk = (et, tgt)
                if gk not in grouped:
                    grouped[gk] = []
                    order.append(gk)
                grouped[gk].append(round2(row.get(f"EffectValue{i}", 0.0)))
    return [
        {"type": et, "target": tgt, "values": grouped[(et, tgt)]}
        for (et, tgt) in order
    ]


def _partner_skill(cid: str, partner_rows: dict, waza_by_id: dict, passive_main: dict) -> dict:
    r = partner_rows.get(cid)
    if not r:
        return {}
    act = r.get("ActiveSkill") or {}
    wid = _strip(act.get("WazaID"), _WAZA)
    out: dict = {}
    if wid and wid != "None":
        out["wazaId"] = wid
        el = _strip(waza_by_id.get(wid, {}).get("Element"), _ELEM)
        if el and el != "None":
            out["element"] = el
    ranks = [round2(v) for v in (act.get("ActiveSkill_MainValueByRank") or [])]
    if ranks:
        out["rankValues"] = ranks
    unlock = next(
        (it.get("Key") for it in (r.get("RestrictionItems") or []) if it.get("Key")),
        None,
    )
    if unlock:
        out["unlockItem"] = unlock
    effects = _partner_effects(cid, partner_rows, passive_main)
    if effects:
        out["effects"] = effects
    return out


def _drops(cid: str, drop_rows: dict) -> list:
    best: dict[str, dict] = {}
    for r in drop_rows.values():
        if r.get("CharacterID") != cid:
            continue
        for i in range(1, 11):
            item = r.get(f"ItemId{i}")
            if item in _NONE:
                continue
            rate = round2(r.get(f"Rate{i}", 0.0))
            entry = {"item": item, "rate": rate, "min": r.get(f"min{i}", 0), "max": r.get(f"Max{i}", 0)}
            prev = best.get(item)
            if prev is None or rate > prev["rate"]:
                best[item] = entry
    out = list(best.values())
    out.sort(key=lambda d: (-d["rate"], d["item"]))
    return out


def _displayable_passives(passive_main: dict) -> dict:
    return {
        k: v for k, v in passive_main.items()
        if v.get("Category") == "EPalPassiveCategory::SortDisplayable"
    }


def _passive_effects(r: dict) -> list:
    out = []
    for i in (1, 2, 3, 4):
        et = _strip(r.get(f"EffectType{i}"), _EFFT)
        if not et or et in ("no", "None"):
            continue
        out.append({
            "type": et,
            "value": round2(r.get(f"EffectValue{i}", 0.0)),
            "target": _strip(r.get(f"TargetType{i}"), _TGT),
        })
    return out


def run_encyclopedia(raw: Path, data_out: Path, res_out: Path) -> dict:
    raw, data_out, res_out = Path(raw), Path(data_out), Path(res_out)

    mon = read_rows(raw / "DataTable/Character/DT_PalMonsterParameter.json")
    waza_data = read_rows(raw / "DataTable/Waza/DT_WazaDataTable.json")
    waza_master = read_rows(raw / "DataTable/Waza/DT_WazaMasterLevel.json")
    partner_rows = read_rows(raw / "DataTable/PassiveSkill/DT_PartnerSkillParameter.json")
    passive_main = read_rows(raw / "DataTable/PassiveSkill/DT_PassiveSkill_Main.json")
    drop_rows = read_rows(raw / "DataTable/Character/DT_PalDropItem.json")
    names_by_lang = _names_by_lang(raw)
    raw_icons = {p.stem for p in (raw / "Texture/PalIcon/Normal").iterdir() if p.suffix == ".png"}

    waza_by_id = _waza_lookup(waza_data)

    # Learnset grouped by PalId (matched to CharacterID via _learnset_for).
    learnsets: dict[str, list] = {}
    for row in waza_master.values():
        learnsets.setdefault(row.get("PalId"), []).append(row)

    roster = {cid: r for cid, r in mon.items() if _is_roster(cid, r, names_by_lang, raw_icons)}

    pals = []
    for cid, r in roster.items():
        elements = [_strip(r.get("ElementType1"), _ELEM)]
        e2 = _strip(r.get("ElementType2"), _ELEM)
        if e2 and e2 != "None":
            elements.append(e2)
        pals.append({
            "id": cid,
            "zukanIndex": r["ZukanIndex"],
            "zukanIndexSuffix": r.get("ZukanIndexSuffix", "") or "",
            "icon": f"T_{cid}_icon_normal",
            "elements": elements,
            "genus": _strip(r.get("GenusCategory"), _GENUS),
            "size": _strip(r.get("Size"), _SIZE),
            "rarity": r.get("Rarity", 0),
            "nocturnal": bool(r.get("Nocturnal")),
            "stats": _stats(r),
            "work": _work(r),
            "bestWork": _strip(r.get("BestWorkSuitability"), _WORK),
            "partnerSkill": _partner_skill(cid, partner_rows, waza_by_id, passive_main),
            "activeSkills": _active_skills(cid, _learnset_for(cid, learnsets), waza_by_id),
            "passives": _passives_of(r),
            "drops": _drops(cid, drop_rows),
        })
    pals.sort(key=lambda p: (p["zukanIndex"], p["zukanIndexSuffix"], p["id"]))

    disp = _displayable_passives(passive_main)
    passives = [
        {"id": pid, "rank": v.get("Rank", 0), "effects": _passive_effects(v)}
        for pid, v in disp.items()
    ]

    write_json(data_out / "pals.json", {"pals": pals})
    write_json(data_out / "passives.json", {"passives": passives})

    # ---- Localized text ----------------------------------------------------
    desc_by_lang = _text_by_lang(raw, "DataTable/Text/DT_PalLongDescriptionText.json", "PAL_LONG_DESC_")
    skill_name_by_lang = _text_by_lang(raw, "DataTable/Text/DT_SkillNameText_Common.json", "")
    skill_desc_by_lang = _text_by_lang(raw, "DataTable/Text/DT_SkillDescText_Common.json", "")
    item_name_by_lang = _text_by_lang(raw, "DataTable/Text/DT_ItemNameText_Common.json", "ITEM_NAME_")
    ui_by_lang = _text_by_lang(raw, "DataTable/Text/DT_UI_Common_Text_Common.json", "")

    active_waza = {s["wazaId"] for p in pals for s in p["activeSkills"]}
    partner_waza = {p["partnerSkill"].get("wazaId") for p in pals if p["partnerSkill"].get("wazaId")}
    all_waza = sorted(active_waza | partner_waza)
    unlock_items = {p["partnerSkill"]["unlockItem"] for p in pals if p["partnerSkill"].get("unlockItem")}
    item_ids = sorted({d["item"] for p in pals for d in p["drops"]} | unlock_items)
    effect_types = sorted({e["type"] for p in pals for e in p["partnerSkill"].get("effects", [])})
    target_types = sorted({e["target"] for p in pals for e in p["partnerSkill"].get("effects", [])})
    pal_ids = [p["id"] for p in pals]
    passive_ids = [p["id"] for p in passives]

    # Partner-skill effect/target labels: hand-authored taxonomy
    # (data_src/partner_effects.yaml), per language, falling back lang -> en-US ->
    # raw enum. Types with no authored label are reported for review/localization.
    effect_labels, target_labels = _load_partner_labels()
    unauthored = [t for t in effect_types if t not in effect_labels]
    if unauthored:
        print(f"encyclopedia: {len(unauthored)} partner effect types unauthored (raw enum): {unauthored}")
    unauth_tgt = [t for t in target_types if t not in target_labels]
    if unauth_tgt:
        print(f"encyclopedia: {len(unauth_tgt)} partner target types unauthored (raw enum): {unauth_tgt}")

    def partner_name_desc(cid: str, table_name: dict, table_desc: dict) -> dict:
        r = mon[cid]
        name_key = _strip(r.get("OverridePartnerSkillNameTextID"), "")
        if name_key in _NONE:
            name_key = f"PARTNERSKILL_{cid}"
        desc_key = _strip(r.get("OverridePartnerSkillDescTextID"), "")
        if desc_key in _NONE:
            desc_key = f"PARTNERSKILL_{cid}"
        out = {"name": table_name.get(name_key) or table_name.get(f"PARTNERSKILL_{cid}") or ""}
        d = table_desc.get(desc_key)
        if d:
            out["desc"] = d
        return out

    def passive_desc_key(pid: str) -> str:
        o = disp[pid].get("OverrideDescMsgID")
        return o if o and o != "None" else f"PASSIVE_{pid}"

    for tag in _all_tags():
        tname, tdesc = skill_name_by_lang[tag], skill_desc_by_lang[tag]
        tdescr, titem, tui = desc_by_lang[tag], item_name_by_lang[tag], ui_by_lang[tag]

        pals_loc = {}
        for cid in pal_ids:
            entry = {
                "name": names_by_lang[tag].get(cid) or names_by_lang["en-US"].get(cid) or cid,
                "description": tdescr.get(cid, ""),
            }
            ps = partner_name_desc(cid, tname, tdesc)
            if ps.get("name") or ps.get("desc"):
                entry["partnerSkill"] = ps
            pals_loc[cid] = entry
        write_json(data_out / "locales" / tag / "pals.json", pals_loc)

        skills_loc = {}
        for wid in all_waza:
            s = {"name": tname.get(f"ACTION_SKILL_{wid}", "")}
            d = tdesc.get(f"ACTION_SKILL_{wid}")
            if d:
                s["description"] = d
            skills_loc[wid] = s
        write_json(data_out / "locales" / tag / "skills.json", skills_loc)

        passives_loc = {}
        for pid in passive_ids:
            s = {"name": tname.get(f"PASSIVE_{pid}", "")}
            d = tdesc.get(passive_desc_key(pid))
            if d:
                s["description"] = d
            passives_loc[pid] = s
        write_json(data_out / "locales" / tag / "passives.json", passives_loc)

        items_loc = {item: titem.get(item, item) for item in item_ids}
        write_json(data_out / "locales" / tag / "items.json", items_loc)

        enums_loc = {
            "elements": {e: tui.get(f"COMMON_ELEMENT_NAME_{e}", e) for e in ELEMENTS},
            "work": {wt: tui.get(f"COMMON_WORK_SUITABILITY_{wt}", wt) for wt in WORK_TYPES},
        }
        write_json(data_out / "locales" / tag / "enums.json", enums_loc)

        effects_loc = {
            t: (effect_labels.get(t, {}).get(tag) or effect_labels.get(t, {}).get("en-US") or t)
            for t in effect_types
        }
        write_json(data_out / "locales" / tag / "partnerEffects.json", effects_loc)

        targets_loc = {
            t: (target_labels.get(t, {}).get(tag) or target_labels.get(t, {}).get("en-US") or t)
            for t in target_types
        }
        write_json(data_out / "locales" / tag / "partnerTargets.json", targets_loc)

    # ---- Icons -------------------------------------------------------------
    icons_dir = res_out / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    converted = 0

    def convert(src: Path, dest: Path) -> int:
        if dest.exists() or not src.exists():
            return 0
        with Image.open(src) as img:
            img = img.convert("RGBA") if img.mode not in ("RGB", "RGBA") else img
            img.save(dest, "WEBP", quality=90, method=6)
        return 1

    for idx, name in enumerate(ELEMENTS):
        src = raw / "Texture/UI/Main_Menu" / f"T_Icon_element_{idx:02d}.png"
        converted += convert(src, icons_dir / f"element_{name}.webp")
    for wt in WORK_TYPES:
        src = raw / "Texture/UI/InGame/SkillIcon" / f"T_icon_skill_pal_WorkRank_{wt}.png"
        converted += convert(src, icons_dir / f"work_{wt}.webp")

    langs = len(_all_tags())
    print(
        f"encyclopedia: {len(pals)} pals, {len(passives)} passives, "
        f"{len(all_waza)} waza, {len(item_ids)} items, "
        f"{langs} locales, {converted} icons converted"
    )
    return {"pals": pals, "passives": passives, "wazaIds": all_waza}


if __name__ == "__main__":
    run_encyclopedia(RAW, DATA_OUT, RES_OUT)
