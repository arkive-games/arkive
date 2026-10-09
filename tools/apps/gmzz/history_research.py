"""Join research ranks to their attributes and game-owned display metadata."""


def rows(table):
    return table.values() if isinstance(table, dict) else table


def build_research_rewards(values, grades):
    if not isinstance(values, list) or len(values) != len(grades):
        raise ValueError("Incomplete research reward ladder")
    if [grade["grade"] for grade in grades] != list(range(len(grades))):
        raise ValueError("Research reward grades must be contiguous and zero-based")
    return [
        {"grade": grade["grade"], "gradeName": grade["name"], "value": value}
        for grade, value in zip(grades, values, strict=True)
    ]


def build_history_research(ranks, properties, modes, groups):
    if not isinstance(properties, list):
        raise ValueError("HistoryResearchPropData must have contiguous positional IDs")
    by_mode = {row["PropMode"]: row for row in rows(modes)}
    by_group = {row["Prop"]: row for row in rows(groups)}
    result = []
    seen = set()
    for rank in sorted(rows(ranks), key=lambda row: row["Score"]):
        prop_id = int(rank["PropID"])
        if prop_id in seen or not 1 <= prop_id <= len(properties):
            raise ValueError(f"Invalid or duplicate research PropID {prop_id}")
        seen.add(prop_id)
        attributes = []
        for key, value in sorted(properties[prop_id - 1].items()):
            if key in by_group:
                group = by_group[key]
                members = [by_mode[name] for name in group["PropNameSet"]]
                formats = {member["ShowType"] for member in members}
                if len(formats) != 1:
                    raise ValueError(f"Inconsistent display formats for {key}")
                name = group["Discription"]
                show_type = formats.pop()
            elif key in by_mode:
                name = by_mode[key]["PropName"]
                show_type = by_mode[key]["ShowType"]
            else:
                raise ValueError(f"Missing research attribute metadata for {key}")
            if show_type not in (0, 1):
                raise ValueError(f"Unknown attribute display format {show_type}")
            attributes.append({
                "key": key, "name": name, "value": value,
                "format": "percent" if show_type == 1 else "number",
            })
        result.append({
            "id": prop_id, "rank": int(rank["Rank"]),
            "subRank": int(rank["SubRank"]), "name": rank["Name"].strip(),
            "score": rank["Score"], "mark": rank["Mark"], "attributes": attributes,
        })
    return result
