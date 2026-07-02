"""Emit data/wiki/** from raw quest tables.

Run:  uv run python -m aion2.tools.wiki.emit_wiki
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import yaml
from opencc import OpenCC

from aion2.tools.maps import TOOLS_ROOT, map_table_key, worldmap_path
from aion2.tools.maps.extract import ORIENTATION, _table
from aion2.tools.maps.l10n import L10N
from aion2.tools.maps.subzones import map_data_path
from aion2.tools.maps.transform import WorldMapTransform
from aion2.tools.maps.worldmap import WorldMapMeta
from aion2.tools.wiki import resolvers, tables, taxonomy

DATA_REPO = TOOLS_ROOT.parent / "data"
WIKI_CFG = TOOLS_ROOT / "data_src" / "wiki.yaml"
LANGS = ("en", "zh-CN", "zh-TW")
_s2t = OpenCC("s2t")


def _write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def ltext(l10n, key) -> dict:
    en, cn = l10n.en(key), l10n.zh_cn(key)
    return {"en": en, "zhCN": cn, "zhTW": _s2t.convert(cn) if cn else ""}


def _has_text(text: dict) -> bool:
    return any(text.values())


def _quest_ltext(l10n, quest_text_key: str | None, suffix: str) -> dict | None:
    if not quest_text_key:
        return None
    text = ltext(l10n, f"QuestString_{quest_text_key}_{suffix}")
    return text if _has_text(text) else None


def _emitted_map_names() -> list[str]:
    maps_json = DATA_REPO / "maps.json"
    if not maps_json.exists():
        return []
    return [
        m["name"]
        for m in json.loads(maps_json.read_text(encoding="utf-8")).get("maps", [])
    ]


def build_mapid_to_name(map_rows, wanted: set[str]) -> dict[int, str]:
    """Map table ID -> frontend map name for already-emitted maps."""
    by_table_name = {r.get("Name"): r for r in map_rows}
    out: dict[int, str] = {}
    for frontend_name in wanted:
        row = by_table_name.get(map_table_key(frontend_name))
        if not row:
            continue
        mid = tables.val(row.get("MapId")) or tables.val(row.get("ID"))
        if mid is not None:
            out[int(mid)] = frontend_name
    return out


def build_spawn_indexes(map_names: list[str], npcs) -> dict[str, dict]:
    idx = {}
    for name in map_names:
        md = json.loads(map_data_path(name).read_text(encoding="utf-8"))
        meta = WorldMapMeta.from_json(worldmap_path(name), name)
        tr = WorldMapTransform(meta, ORIENTATION)
        idx[name] = resolvers.build_spawn_index(
            md["Properties"]["Data"]["SpawnInfoList"], npcs, tr
        )
    return idx


def build_item_names(l10n) -> dict[str, dict]:
    out = {}
    for r in _table("Item.json"):
        name = tables.val(r.get("Name"))
        key = tables.l10n_key(r.get("Desc")) or tables.l10n_key(r.get("DisplayName"))
        if name:
            out[name] = (
                ltext(l10n, key)
                if key
                else {"en": name, "zhCN": name, "zhTW": name}
            )
    return out


def _goal_label(goal, target_names: dict, l10n) -> dict:
    """Objective label: '<Type>: <localized target>' with raw-key fallback."""
    target = goal["values"][0] if goal["values"] else ""
    loc = target_names.get(target)
    base = loc if loc else {"en": target, "zhCN": target, "zhTW": target}
    return {k: f"{goal['type']}: {v}" if v else goal["type"] for k, v in base.items()}


def build_quest_entity(
    q,
    steps,
    rewards,
    l10n,
    mapid_to_name,
    spawn_index,
    name_to_id,
    prev_index,
    item_names,
    npc_names=None,
) -> dict:
    npc_names = npc_names or {}
    ent_steps = []
    for st in steps:
        objectives = []
        for index, g in enumerate(st["goals"], start=1):
            map_name = mapid_to_name.get(g["mapId"]) if g["mapId"] else None
            r = resolvers.resolve_goal(g, map_name, spawn_index)
            label = _quest_ltext(
                l10n, q["textKey"], f"step{st['order']}_obj_{index}"
            ) or _goal_label(g, npc_names, l10n)
            objectives.append(
                {
                    "type": g["type"],
                    "label": label,
                    "marker": g["marker"],
                    "optional": g["optional"],
                    "mapName": map_name,
                    "pois": r["pois"],
                    "resolved": r["resolved"],
                }
            )
        ent_steps.append({"order": st["order"], "objectives": objectives})

    rw = rewards.get(str(q["id"]).lstrip("0"), {"exp": 0, "items": [], "select": []})
    rw_items = [
        {
            "name": item_names.get(
                i["item"], {"en": i["item"], "zhCN": i["item"], "zhTW": i["item"]}
            ),
            "count": i["count"],
        }
        for i in rw["items"]
    ]
    name = _quest_ltext(l10n, q["textKey"], "quest_title") or {
        "en": q["name"],
        "zhCN": q["name"],
        "zhTW": q["name"],
    }
    return {
        "id": q["id"],
        "type": "quest",
        "name": name,
        "questType": q["type"],
        "race": (q["race"] or "All").lower(),
        "unlockLevel": q["unlockLevel"],
        "recommendedLevel": q["recommendedLevel"],
        "repeatable": q["repeatType"] == "Infinitely",
        "acquireMapName": (
            mapid_to_name.get(q["acquireMapId"]) if q["acquireMapId"] else None
        ),
        "steps": ent_steps,
        "rewards": {"exp": rw["exp"], "items": rw_items},
        "chain": {
            "next": name_to_id.get(q["nextQuestName"]),
            "prev": prev_index.get(q["name"], []),
        },
    }


def emit() -> None:
    l10n = L10N()
    quests = tables.parse_quests(_table("Quest.json"))
    steps = tables.parse_steps(_table("QuestStep.json"))
    rewards = tables.parse_rewards(_table("QuestReward.json"))
    npcs = tables.parse_npcs(_table("NpcData.json"))
    cfg = yaml.safe_load(WIKI_CFG.read_text(encoding="utf-8"))

    map_names = _emitted_map_names()
    mapid_to_name = build_mapid_to_name(_table("Map.json"), set(map_names))
    spawn_index = build_spawn_indexes(map_names, npcs)
    item_names = build_item_names(l10n)
    npc_names = {
        n["name"]: ltext(l10n, n["descKey"])
        for n in npcs["by_id"].values()
        if n.get("name") and n.get("descKey")
    }

    name_to_id = {q["name"]: q["id"] for q in quests}
    prev_index: dict[str, list[int]] = {}
    for q in quests:
        if q["nextQuestName"]:
            prev_index.setdefault(q["nextQuestName"], []).append(q["id"])

    tree, unmatched = taxonomy.build_quest_tree(cfg, quests)
    group_of = taxonomy.group_lookup(cfg["quest"])

    docs, cover = [], {}
    for q in quests:
        ent = build_quest_entity(
            q,
            steps.get(q["name"], []),
            rewards,
            l10n,
            mapid_to_name,
            spawn_index,
            name_to_id,
            prev_index,
            item_names,
            npc_names,
        )
        _write_json(DATA_REPO / "wiki" / "quest" / f"{q['id']}.json", ent)
        docs.append(
            {
                "id": q["id"],
                "group": group_of.get(q["type"]),
                "section": q["part"] or "other",
                "race": ent["race"],
                "level": q["recommendedLevel"],
                "mapId": ent["acquireMapName"],
            }
        )
        for st in ent["steps"]:
            for ob in st["objectives"]:
                if ob["resolved"] is not None:
                    k = ob["type"]
                    hit, tot = cover.get(k, (0, 0))
                    cover[k] = (hit + (1 if ob["resolved"] else 0), tot + 1)
    _write_json(DATA_REPO / "wiki" / "index" / "quest.json", {"docs": docs})
    _write_json(DATA_REPO / "wiki" / "taxonomy.json", tree)

    def lang_key(lng):
        return {"en": "en", "zh-CN": "zhCN", "zh-TW": "zhTW"}[lng]

    for lng in LANGS:
        lk = lang_key(lng)
        tax_loc = {
            "types.quest": {
                "name": cfg["quest"]["labels"].get(lk) or cfg["quest"]["labels"]["en"]
            }
        }
        for g in cfg["quest"]["groups"]:
            tax_loc[f"groups.quest.{g['slug']}"] = {
                "name": g["labels"].get(lk) or g["labels"]["en"]
            }
        for t in tree["types"]:
            for g in t["groups"]:
                for s in g["sections"]:
                    tax_loc.setdefault(
                        f"sections.{s['slug']}",
                        {"name": taxonomy.section_label(s["slug"])},
                    )
        _write_json(DATA_REPO / "locales" / lng / "wiki" / "taxonomy.json", tax_loc)

        q_loc = {}
        for q in quests:
            nm = _quest_ltext(l10n, q["textKey"], "quest_title")
            q_loc[str(q["id"])] = {"name": (nm or {}).get(lk) or q["name"]}
        _write_json(DATA_REPO / "locales" / lng / "wiki" / "quest.json", q_loc)

    base = os.environ.get("SITE_BASE_URL", "https://example.invalid").rstrip("/")
    urls = [f"{base}/wiki", f"{base}/wiki/quest"]
    urls += [f"{base}/wiki/quest/{g['slug']}" for g in tree["types"][0]["groups"]]
    urls += [f"{base}/wiki/quest/{d['id']}" for d in docs]
    xml = "\n".join(
        [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            *[f"  <url><loc>{u}</loc></url>" for u in urls],
            "</urlset>",
        ]
    )
    (DATA_REPO / "wiki" / "sitemap.xml").parent.mkdir(parents=True, exist_ok=True)
    (DATA_REPO / "wiki" / "sitemap.xml").write_text(xml, encoding="utf-8")

    print(f"quests: {len(quests)}   unmatched types: {unmatched or 'none'}")
    for k, (hit, tot) in sorted(cover.items()):
        print(f"  {k:<14} {hit}/{tot} resolved ({hit / tot:.0%})")


def main() -> None:
    argparse.ArgumentParser(description="Emit wiki dataset").parse_args()
    emit()


if __name__ == "__main__":
    main()
