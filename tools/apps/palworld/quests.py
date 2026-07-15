"""Quest stage: emit the quest log (main / sub / hidden quests).

Each quest is a row in ``DT_PalQuestData`` (id -> quest type + a Blueprint asset
path). The player-facing data lives in that Blueprint's ClassDefaultObject:

  * ``QuestTitleMsgId``       -> a key in DT_UI_Common_Text   (the quest name)
  * ``QuestDescriptionMsgId`` -> a key in DT_NpcTalkText      (the quest brief)
  * ``CommonRewardData``      -> {Exp, Items:[{Key:{Key:item}, Value:count}]}
  * ``AutoOrderQuests``       -> quest ids that auto-start on completion (chain)

Fixed objective coordinates (for a subset of quests) come from
``DT_PalQuestLocationData``; we assign each to a map via the world bounds.

Localized text is layered exactly as ``catalog.py`` layers it (JA ``_Common``
base overlaid per-language from ``L10N/<folder>/Pal``), and quest descriptions
carry ``<itemName id=|..|/>`` tokens, so we reuse ``catalog._resolve_tokens``.

Outputs:
  data-palworld/quests.json                 {quests: [QuestEntry]}
  data-palworld/locales/<tag>/quests.json   {id: {title, description?}}

Run: ``uv run python -m palworld.quests`` (from the ``tools`` dir). Reward item
names are resolved on the frontend via items.json (same id space).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .catalog import _ph, _resolve_tokens
from .encyclopedia import _all_tags, _text_by_lang
from .env import require_dir
from .maps.bounds import assign_map
from .maps.common import read_rows, round2, write_json

_QUEST_TYPE = "EPalQuestType::"
_NONE = {None, "None", ""}


def _bp_path(raw: Path, asset: str) -> Path | None:
    """Map a ``/Game/Pal/...BP_x.BP_x_C`` asset ref to its exported JSON path."""
    pkg = (asset or "").split(".")[0]  # drop the ``.<ClassName>`` object suffix
    if not pkg.startswith("/Game/Pal/"):
        return None  # e.g. /Game/PalEditor/... test quests aren't exported here
    p = raw / (pkg[len("/Game/Pal/"):] + ".json")
    return p if p.exists() else None


def _default_object(bp: list) -> dict:
    """The ClassDefaultObject export (Name ``Default__<Class>``) holds the data."""
    for exp in bp:
        if str(exp.get("Name", "")).startswith("Default__"):
            return exp.get("Properties") or {}
    return {}


def _reward_items(reward: dict) -> list[dict]:
    out = []
    for it in reward.get("Items") or []:
        iid = ((it.get("Key") or {}).get("Key"))
        cnt = it.get("Value", 0) or 0
        if iid and iid not in _NONE and cnt:
            out.append({"item": iid, "count": cnt})
    return out


def _bounds(raw: Path) -> dict:
    ui = read_rows(raw / "DataTable/WorldMapUIData/DT_WorldMapUIData.json")
    return {
        "MainWorld": {"min": ui["MainMap"]["landScapeRealPositionMin"],
                      "max": ui["MainMap"]["landScapeRealPositionMax"]},
        "WorldTree": {"min": ui["Tree"]["landScapeRealPositionMin"],
                      "max": ui["Tree"]["landScapeRealPositionMax"]},
    }


def run_quests(raw: Path, data_out: Path) -> dict:
    raw, data_out = Path(raw), Path(data_out)

    quest_rows = read_rows(raw / "DataTable/Quest/DT_PalQuestData.json")
    loc_rows = read_rows(raw / "DataTable/Quest/DT_PalQuestLocationData.json")
    bounds = _bounds(raw)
    assign_order = [
        {"mapId": "WorldTree", **bounds["WorldTree"]},
        {"mapId": "MainWorld", **bounds["MainWorld"]},
    ]

    # Text tables (JA base + per-language). Titles live in the UI table, quest
    # briefs in the NPC-talk table; both feed token resolution.
    title_by_lang = _text_by_lang(raw, "DataTable/Text/DT_UI_Common_Text_Common.json", "")
    desc_by_lang = _text_by_lang(raw, "DataTable/Text/DT_NpcTalkText_Common.json", "")
    item_name_by_lang = _text_by_lang(raw, "DataTable/Text/DT_ItemNameText_Common.json", "ITEM_NAME_")
    mapobj_name_by_lang = _text_by_lang(raw, "DataTable/Text/DT_MapObjectNameText_Common.json", "MAPOBJECT_NAME_")
    ui_by_lang = _text_by_lang(raw, "DataTable/Text/DT_UI_Common_Text_Common.json", "")
    tags = _all_tags()
    ja = tags[0]

    quests: list[dict] = []
    title_key: dict[str, str] = {}
    desc_key: dict[str, str] = {}
    for order, (qid, r) in enumerate(quest_rows.items()):
        bp_path = _bp_path(raw, (r.get("QuestData") or {}).get("AssetPathName", ""))
        if not bp_path:
            continue
        props = _default_object(json.loads(bp_path.read_text(encoding="utf-8")))
        t_key = props.get("QuestTitleMsgId") or ""
        # Skip quests with no resolvable name (editor/test/trigger stubs).
        if not _ph(title_by_lang[ja].get(t_key)):
            continue
        reward = props.get("CommonRewardData") or {}
        entry: dict = {
            "id": qid,
            "type": re.sub(f"^{_QUEST_TYPE}", "", r.get("QuestType") or "") or "Main",
            "order": order,
        }
        exp = reward.get("Exp", 0) or 0
        if exp:
            entry["rewardExp"] = exp
        items = _reward_items(reward)
        if items:
            entry["rewardItems"] = items
        nxt = [q for q in (props.get("AutoOrderQuests") or []) if q in quest_rows]
        if nxt:
            entry["nextQuests"] = nxt
        loc = loc_rows.get(qid)
        if loc and loc.get("Position"):
            pos = loc["Position"]
            mid = assign_map(pos, assign_order)
            if mid:
                entry["location"] = {"map": mid, "x": round2(pos["X"]), "y": round2(pos["Y"]), "z": round2(pos.get("Z", 0))}
        quests.append(entry)
        title_key[qid] = t_key
        desc_key[qid] = props.get("QuestDescriptionMsgId") or ""

    write_json(data_out / "quests.json", {"quests": quests})

    for tag in tags:
        title, desc = title_by_lang[tag], desc_by_lang[tag]
        iname, mname, ui = item_name_by_lang[tag], mapobj_name_by_lang[tag], ui_by_lang[tag]
        loc_out = {}
        for q in quests:
            qid = q["id"]
            raw_title = _ph(title.get(title_key[qid])) or _ph(title_by_lang[ja].get(title_key[qid])) or qid
            e = {"title": _resolve_tokens(raw_title, iname, mname, ui) or qid}
            dk = desc_key.get(qid)
            raw_desc = (_ph(desc.get(dk)) or _ph(desc_by_lang[ja].get(dk))) if dk else ""
            d = _resolve_tokens(raw_desc, iname, mname, ui)
            if d:
                e["description"] = d
            loc_out[qid] = e
        write_json(data_out / "locales" / tag / "quests.json", loc_out)

    by_type: dict[str, int] = {}
    for q in quests:
        by_type[q["type"]] = by_type.get(q["type"], 0) + 1
    print(f"quests: {len(quests)} quests ({by_type}), {len(tags)} locales")
    return {"quests": quests}


if __name__ == "__main__":
    from .version import stamp_version

    run_quests(require_dir("PALWORLD_RAW"), require_dir("PALWORLD_DATA_OUT"))
    stamp_version(require_dir("PALWORLD_DATA_OUT"))
