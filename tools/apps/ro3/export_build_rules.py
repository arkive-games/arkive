"""Export build-planner job/branch rules without flattening multiverse variants."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .lua_tables import Runner, iter_chunks, rows

TABLES = {"JobConfig", "JobProfessConfig", "ProfessBuildSuggConfig", "SeasonTalentEffectConfig", "EmblemMarkConfig"}


def array(value):
    return value if isinstance(value, list) else []


def normalize(tables: dict, strings: dict) -> dict:
    def name(row):
        return strings.get(str(next(iter(array(row.get("_iName"))), "")), "")

    jobs = [{"id": r["_iID"], "name": name(r), "rank": r.get("_iJobRank", 0),
             "parentId": r.get("_iParentId", 0), "branchIds": array(r.get("_kProfessionID")),
             "subtypes": array(r.get("_kSubType")), "weaponForms": array(r.get("_kWeaponForm"))}
            for r in tables.get("JobConfig", {}).values()]
    branches = [{"id": r["_iID"], "name": name(r), "professionId": r.get("_iProfessionID", 0),
                 "suggestedSkills": array(r.get("_kSkillMain")) + array(r.get("_kSkillMinor"))}
                for r in tables.get("JobProfessConfig", {}).values()]
    recommendations = [{"branchId": r.get("_iProfessionID"),
                         "talentLevelIds": sorted({v for group in array(r.get("_kSeasonTalent")) for v in array(group)})}
                        for r in tables.get("ProfessBuildSuggConfig", {}).values()]
    talent_effects = [{"id": r["_iId"], "group": r.get("_iGroup", 0),
                       "level": r.get("_iLevel", 0), "jobIds": array(r.get("_iJobId")),
                       "professionIds": array(r.get("_kProfessionID"))}
                      for r in tables.get("SeasonTalentEffectConfig", {}).values()]
    mark_stages = [{"markId": r["_iEmblemMarkID"], "threshold": r.get("_iMarkNum", 0),
                    "stage": r.get("_iMarkStage", 0), "effects": array(r.get("_kSpecialAttribute")),
                    "multiverses": array(r.get("_kMultiverseArray")),
                    "icon": "icons/other/" + Path(r["_kEmblemMarkPic"]).stem + ".webp"}
                   for r in tables.get("EmblemMarkConfig", {}).values()
                   if r.get("_iEmblemMarkID") and r.get("_kEmblemMarkPic")]
    return {"jobs": jobs, "branches": branches, "recommendations": recommendations,
            "talentEffects": talent_effects, "markStages": mark_stages}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vfs", type=Path, required=True)
    parser.add_argument("--locales", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Output already exists; review it before choosing a new output path.")
    runner = Runner()
    shared: dict = {}
    variants: dict = {}
    sources = []
    for chunk in iter_chunks(args.vfs, lambda p: p is not None and "/Config/DataConfig/" in p and Path(p).stem in TABLES):
        source = chunk.script or ""
        sources.append(source)
        target = shared if source.startswith("LuaScript/") else variants.setdefault(source.split("/")[1], {})
        target[chunk.name] = rows(runner.run(chunk.data))
    strings = json.loads(args.locales.read_text(encoding="utf-8"))["strings"]
    result = {"schemaVersion": 1, "sources": sources, "shared": normalize(shared, strings), "variants": {}}
    for variant, tables in variants.items():
        merged = {name: {**shared.get(name, {}), **tables.get(name, {})} for name in TABLES}
        result["variants"][variant] = normalize(merged, strings)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(result['shared']['jobs'])} shared jobs; variants: {', '.join(variants)}")


if __name__ == "__main__":
    main()
