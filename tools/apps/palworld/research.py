"""Research Lab projects (deferred-systems plan §5).

``DT_LabResearchDataTable`` (168 rows) is the whole research-lab upgrade
system: per project a work-suitability category, the lab work amount, up to 4
material costs, a prerequisite chain (``RequiredResearchId``) and the granted
effect (``EffectType``/``EffectValue``, optionally scoped to a work suitability
— e.g. CraftSpeed +10% for Handcraft stations). ``TechnologyUnlock`` rows carry
no effect: they gate technology entries instead (the tech side already links
back via ``requireResearch``).

Emits:
  data-palworld/research.json                {projects: [{id, category, work,
      materials: [{item, count}], effect?: {type, value, work?}, requires?,
      essential?}]}
  data-palworld/locales/<tag>/research.json  {id: {name}}

Run: ``uv run python -m palworld.research`` (from the ``tools`` dir).
"""

from __future__ import annotations

from pathlib import Path

from .encyclopedia import _all_tags, _strip, _text_by_lang
from .env import require_dir
from .maps.common import read_rows, round2, write_json

_NONE = {None, "None", ""}
_WORK = "EPalWorkSuitability::"
_EFFT = "EPalPassiveSkillEffectType::"


def run_research(raw: Path, data_out: Path) -> dict:
    raw, data_out = Path(raw), Path(data_out)
    rows = read_rows(raw / "DataTable/Lab/DT_LabResearchDataTable.json")

    projects = []
    for rid, r in rows.items():
        entry: dict = {
            "id": rid,
            "category": _strip(r.get("LabCategoryWorkSuitability"), _WORK),
            "work": round2(r.get("RequiredWorkAmount", 0.0)),
        }
        mats = []
        for i in range(1, 5):
            item = r.get(f"Material{i}_Id")
            cnt = r.get(f"Material{i}_Count", 0) or 0
            if item not in _NONE and cnt > 0:
                mats.append({"item": item, "count": cnt})
        entry["materials"] = mats
        et = _strip(r.get("EffectType"), _EFFT)
        if et and et not in ("no", "None"):
            effect: dict = {"type": et, "value": round2(r.get("EffectValue", 0.0))}
            ew = _strip(r.get("EffectOptionWorkSuitability"), _WORK)
            if ew and ew != "None":
                effect["work"] = ew
            entry["effect"] = effect
        req = r.get("RequiredResearchId")
        if req not in _NONE:
            entry["requires"] = req
        if r.get("bIsEssential"):
            entry["essential"] = True
        projects.append(entry)

    write_json(data_out / "research.json", {"projects": projects})

    # Localized project names (DT_LabResearchText, keyed by the row's TextId).
    name_by_lang = _text_by_lang(raw, "DataTable/Text/DT_LabResearchText.json", "")
    tags = _all_tags()
    ja = name_by_lang[tags[0]]
    for tag in tags:
        names = name_by_lang[tag]
        loc = {}
        for rid, r in rows.items():
            tid = r.get("TextId") or ""
            nm = (names.get(tid) or "").strip() or (ja.get(tid) or "").strip()
            loc[rid] = {"name": nm or rid}
        write_json(data_out / "locales" / tag / "research.json", loc)

    print(f"research: {len(projects)} projects, {len(tags)} locales")
    return {"projects": projects}


if __name__ == "__main__":
    from .version import stamp_version

    run_research(require_dir("PALWORLD_RAW"), require_dir("PALWORLD_DATA_OUT"))
    stamp_version(require_dir("PALWORLD_DATA_OUT"))
