"""Taxonomy tree (types -> groups -> sections) from data_src/wiki.yaml config."""
from __future__ import annotations


def group_lookup(type_cfg: dict) -> dict[str, str]:
    """Game enum value -> group slug."""
    out: dict[str, str] = {}
    for g in type_cfg["groups"]:
        for t in g["types"]:
            out[t] = g["slug"]
    return out


def section_label(slug: str) -> str:
    return " ".join(p.capitalize() for p in slug.replace("-", "_").split("_"))


def build_quest_tree(cfg: dict, quests: list[dict]) -> tuple[dict, list[str]]:
    """Return (taxonomy tree, unmatched game-type names)."""
    qcfg = cfg["quest"]
    lookup = group_lookup(qcfg)
    per_group: dict[str, dict[str, int]] = {g["slug"]: {} for g in qcfg["groups"]}
    min_levels: dict[str, dict[str, int]] = {g["slug"]: {} for g in qcfg["groups"]}
    counts: dict[str, int] = {g["slug"]: 0 for g in qcfg["groups"]}
    unmatched: list[str] = []
    for q in quests:
        qtype = q["type"]
        slug = lookup.get(qtype)
        if slug is None:
            if qtype not in unmatched:
                unmatched.append(qtype)
            continue
        counts[slug] += 1
        section = q.get("part") or "other"
        per_group[slug][section] = per_group[slug].get(section, 0) + 1
        level = q.get("recommendedLevel")
        if level is None:
            level = 0
        min_levels[slug][section] = min(level, min_levels[slug].get(section, level))
    groups = []
    for g in qcfg["groups"]:
        slug = g["slug"]
        def section_sort_key(item: tuple[str, int]) -> tuple[bool, int, str]:
            section, _ = item
            return section == "other", min_levels[slug][section], section.lower()

        sections = [
            {"slug": s, "count": n}
            for s, n in sorted(per_group[slug].items(), key=section_sort_key)
        ]
        groups.append({"slug": slug, "count": counts[slug], "sections": sections})
    tree = {"types": [{"slug": "quest", "count": sum(counts.values()), "groups": groups}]}
    return tree, unmatched
