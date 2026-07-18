"""Effigy (Statue of Power) progression (deferred-systems plan §4).

``DT_PlayerStatusRankMasterDataTable`` holds the full buff ladder: per
``RelicType`` (CapturePower, MoveSpeed, …) a rank list with the Lifmunk-effigy
count needed (``RequiredRelicNum``), the buff value at that rank
(``EffectRate``) and the gold cost to reset (``ResetRequiredMoney``).

The type's localized name/description is the Statue-of-Power UI text
``BUILDUP_PLAYER_STATUS[_DESC]_<NN>`` where ``NN`` is the type's first-seen
index in this table's row order — the same convention maps/extract.py uses for
the effigy marker descriptions (see ``relic_type_index``).

Emits:
  data-palworld/effigies.json               {types: [{type, ranks: [{rank, relics, effect, reset}]}]}
  data-palworld/locales/<tag>/effigies.json {type: {name, description?}}

Run: ``uv run python -m palworld.effigies`` (from the ``tools`` dir).
"""

from __future__ import annotations

from pathlib import Path

from .encyclopedia import _all_tags, _text_by_lang
from .env import require_dir
from .maps.common import read_rows, round2, write_json
from .maps.extract import relic_type_index

_RELIC = "EPalRelicType::"


def run_effigies(raw: Path, data_out: Path) -> dict:
    raw, data_out = Path(raw), Path(data_out)
    rows = read_rows(raw / "DataTable/Player/DT_PlayerStatusRankMasterDataTable.json")

    by_type: dict[str, list] = {}
    for r in rows.values():
        rtype = (r.get("RelicType") or "").replace(_RELIC, "")
        if not rtype or rtype == "None":
            continue
        by_type.setdefault(rtype, []).append({
            "rank": r.get("Rank", 0),
            "relics": r.get("RequiredRelicNum", 0),
            "effect": round2(r.get("EffectRate", 0.0)),
            "reset": r.get("ResetRequiredMoney", 0),
        })
    types = [
        {"type": t, "ranks": sorted(ranks, key=lambda x: x["rank"])}
        for t, ranks in by_type.items()
    ]
    write_json(data_out / "effigies.json", {"types": types})

    # localized names/descriptions from the Statue-of-Power UI strings.
    idx = relic_type_index(raw)
    ui_by_lang = _text_by_lang(raw, "DataTable/Text/DT_UI_Common_Text_Common.json", "")
    tags = _all_tags()
    ja = ui_by_lang[tags[0]]
    for tag in tags:
        ui = ui_by_lang[tag]
        loc = {}
        for t in by_type:
            i = idx.get(t)
            if i is None:
                continue
            name = ui.get(f"BUILDUP_PLAYER_STATUS_{i:02d}") or ja.get(f"BUILDUP_PLAYER_STATUS_{i:02d}")
            desc = ui.get(f"BUILDUP_PLAYER_STATUS_DESC_{i:02d}") or ja.get(f"BUILDUP_PLAYER_STATUS_DESC_{i:02d}")
            e = {"name": name or t}
            if desc:
                e["description"] = desc
            loc[t] = e
        write_json(data_out / "locales" / tag / "effigies.json", loc)

    n_ranks = sum(len(t["ranks"]) for t in types)
    print(f"effigies: {len(types)} buff types, {n_ranks} ranks, {len(tags)} locales")
    return {"types": types}


if __name__ == "__main__":
    from .version import stamp_version

    run_effigies(require_dir("PALWORLD_RAW"), require_dir("PALWORLD_DATA_OUT"))
    stamp_version(require_dir("PALWORLD_DATA_OUT"))
