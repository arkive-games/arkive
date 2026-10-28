"""Emit the 非凡天赋 trees into ``data-gmzz`` for the rating calculator.

Run from ``tools/``::

    uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/ConfigIcon/Talent
    uex export --profile gmzz --only C7/Content/Arts/UI_2/Resource/Skill/Profession
    uv run python -m gmzz.talents

Writes ``score/talents.json``: every talent tree (``TalentTreeData``, two per
pathway) with its nodes (``TalentNodeData``) and each node's ``Mark``, and the
art the talent panel draws for them into ``resource-gmzz/talents/``.

**Icons.** A tree's ``TabIcon`` is a full object path. A node's ``Icon`` is a
bare texture name that the client's ``GetIcon`` resolves by name: a levelled
node's is one of six stat glyphs in ``ConfigIcon/Talent`` (``Talent_Atk_Y``),
a core's is the icon of the skill it changes, under
``Skill/Profession/<pathway>/``. No table maps the name to a directory, so it
is looked up here among those two roots and must match exactly one texture.
``Talent_AnD_R`` (the first node of every second tree) is absent from the
patched view — its updated chunk was never downloaded — so export it from the
install instead: ``uex export --profile gmzz-base --only
C7/Content/Arts/UI_2/Resource/ConfigIcon/Talent/Talent_AnD_R.uasset``.

**Why the Mark is the 非凡天赋 score.** No client script reads
``TalentNodeData.Mark`` — the talent panel jumps to the rating panel and
computes nothing — but the species' own benchmark curve is made of these
Marks and nothing else. Every tree is five normal nodes (``Mark 180``,
``MaxLevel 15``, ``Type 1``) and four special nodes (``Mark 1000``,
``MaxLevel 0``, ``Type 2`` — activated, not levelled), so one tree maxes at
``5 × 15 × 180 + 4 × 1000 = 17500``, which is exactly the species' ceiling at
神性 30; and the curve's early steps are ``1540 = 1000 + 3 × 180``,
``1900 = 1000 + 5 × 180``, ``2260 = 1000 + 7 × 180``, ``2620 = 1000 + 9 × 180``
— one special node plus an odd number of normal levels, climbing by 360 a
step. No other quantity in the package has that shape. The score is therefore
``Σ Mark × level`` over the normal nodes plus ``Σ Mark`` over the activated
special nodes, for the **active** tree only: the ceiling is one tree's worth,
not both, and talent points are spent in one tree at a time.

What is not asserted: that the server rounds or caps anything beyond this.
Levels sum to at most ``SequenceTalentPointMax[-1]`` (75 = 5 × 15), which the
page enforces as the cap on the total rather than per node.

``TalentNodeDevData`` is the designers' working copy of the same table and is
not read. ``TalentDefaultData`` names the tree a fresh character starts in, so
the page can pick the right one for a pathway before the player touches it.
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

TREE_TABLE = "TalentTreeData"
NODE_TABLE = "TalentNodeData"
DEFAULT_TABLE = "TalentDefaultData"

OUT_FILE = "score/talents.json"
ICON_SUBDIR = "talents"
WEBP_QUALITY = 90

#: Where ``GetIcon`` finds a talent's art, relative to GMZZ_RAW: the stat glyphs
#: of levelled nodes and the tree tabs, then the skill icons cores borrow.
ICON_ROOTS = (
    "C7/Content/Arts/UI_2/Resource/ConfigIcon/Talent",
    "C7/Content/Arts/UI_2/Resource/Skill/Profession",
)

#: ``TabIcon`` is a UE object path, ``/Game/<dir>/<Name>.<Name>``.
_OBJECT_PATH = re.compile(r"^/Game/.+/(?P<name>[^/.]+)\.(?P=name)$")

#: ``TalentNodeData.Type``: 1 is a levelled node, 2 an activate-only one.
NORMAL_NODE = 1
SPECIAL_NODE = 2

_TAG = re.compile(r"<[^>]+>")


def _rows(payload) -> list:
    return list(payload.values()) if isinstance(payload, dict) else list(payload)


def _plain(text) -> str:
    """The client's markup stripped; ``;`` separates a special node's two effects."""
    if not isinstance(text, str):
        return ""
    return "\n".join(part.strip() for part in _TAG.sub("", text).split(";") if part.strip())


def _object_name(path) -> str | None:
    """The asset name of an object path; None when the row has none."""
    if not path:
        return None
    match = _OBJECT_PATH.match(path)
    if not match:
        raise ValueError(f"{TREE_TABLE}: unparseable TabIcon {path!r}")
    return match.group("name")


def icon_names(trees: list[dict]) -> list[str]:
    """Every texture the trees name, trees' tabs and nodes alike."""
    names = {tree["icon"] for tree in trees} | {node["icon"] for tree in trees for node in tree["nodes"]}
    return sorted(name for name in names if name)


def locate_icons(raw: Path, names: list[str]) -> dict[str, Path]:
    """``{name: exported PNG}`` for every name, searched under :data:`ICON_ROOTS`.

    Raises when a name has no PNG (a partial export would ship holes) or more
    than one (the client's by-name lookup would be ambiguous, so ours is too).
    """
    found: dict[str, list[Path]] = {}
    for root in ICON_ROOTS:
        for png in (Path(raw) / root).rglob("*.png"):
            found.setdefault(png.stem, []).append(png)
    missing = [name for name in names if name not in found]
    if missing:
        raise FileNotFoundError(
            f"{len(missing)} talent icon(s) absent from the export, e.g. {missing[:5]} — "
            f"run: uex export --profile gmzz --only <root> for each of {list(ICON_ROOTS)} (see this module's docstring)"
        )
    ambiguous = [name for name in names if len(found[name]) > 1]
    if ambiguous:
        raise ValueError(f"talent icon name(s) match more than one texture: {ambiguous[:5]}")
    return {name: found[name][0] for name in names}


def build_trees(trees, nodes, defaults) -> list[dict]:
    """Trees with their nodes, in tree order; a tree with no nodes is dropped.

    ``TalentTreeData`` carries two empty rows for a pathway that has no talents
    yet (name and point caps blank). They have no nodes either, so they fall out
    here rather than appearing as a tree with nothing to level.
    """
    default_tree = {int(row["Profession"]): int(row["Key"]) for row in _rows(defaults)}
    by_tree: dict[int, list[dict]] = {}
    for row in _rows(nodes):
        node_type = int(row["Type"])
        if node_type not in (NORMAL_NODE, SPECIAL_NODE):
            raise ValueError(f"{NODE_TABLE} node {row['Key']} has unknown Type {node_type}")
        mark = row.get("Mark")
        if not isinstance(mark, int) or isinstance(mark, bool) or mark <= 0:
            raise ValueError(f"{NODE_TABLE} node {row['Key']} has no Mark")
        max_level = int(row.get("MaxLevel") or 0)
        if node_type == NORMAL_NODE and max_level < 1:
            raise ValueError(f"{NODE_TABLE} node {row['Key']} is levelled but has MaxLevel {max_level}")
        if node_type == SPECIAL_NODE and max_level != 0:
            raise ValueError(f"{NODE_TABLE} node {row['Key']} is activate-only but has MaxLevel {max_level}")
        by_tree.setdefault(int(row["TreeID"]), []).append({
            "key": int(row["Key"]),
            "name": row["Name"],
            "mark": mark,
            "maxLevel": max_level,
            "type": "normal" if node_type == NORMAL_NODE else "special",
            "parentKey": int(row["ParentNode"]) if row.get("ParentNode") else None,
            "position": int(row.get("Position") or 0),
            "description": _plain(row.get("PointDesc")),
            "icon": row.get("Icon") or None,
        })

    out = []
    for row in sorted(_rows(trees), key=lambda r: int(r["Key"])):
        key = int(row["Key"])
        members = by_tree.pop(key, None)
        if not members:
            continue
        members.sort(key=lambda n: n["position"])
        keys = {n["key"] for n in members}
        for node in members:
            if node["parentKey"] is not None and node["parentKey"] not in keys:
                raise ValueError(f"{NODE_TABLE} node {node['key']} names parent {node['parentKey']} outside tree {key}")
        caps = [int(v) for v in (row.get("SequenceTalentPointMax") or [])]
        normal_levels = sum(n["maxLevel"] for n in members if n["type"] == "normal")
        if caps and caps[-1] != normal_levels:
            raise ValueError(
                f"{TREE_TABLE} tree {key} caps at {caps[-1]} points but its normal nodes hold {normal_levels} levels"
            )
        profession = int(row["Profession"])
        out.append({
            "id": key,
            "name": row["Name"],
            "tag": row.get("Tag") or "",
            "description": row.get("Description") or "",
            "professionId": profession,
            "default": default_tree.get(profession) == key,
            "icon": _object_name(row.get("TabIcon")),
            "pointCapsBySequenceStage": caps,
            "maxScore": sum(n["mark"] * n["maxLevel"] for n in members if n["type"] == "normal")
            + sum(n["mark"] for n in members if n["type"] == "special"),
            "nodes": members,
        })
    if by_tree:
        raise ValueError(f"{NODE_TABLE} has nodes for trees absent from {TREE_TABLE}: {sorted(by_tree)}")
    if not out:
        raise ValueError(f"{TREE_TABLE} yielded no tree with nodes")
    return out


def build(excel: Path, data_out: Path, raw: Path, res_out: Path) -> dict[str, int]:
    strings = load_strings(excel)
    trees = build_trees(
        resolve_text(load_table(excel, TREE_TABLE), strings),
        resolve_text(load_table(excel, NODE_TABLE), strings),
        load_table(excel, DEFAULT_TABLE),
    )
    missing = unresolved_ids(trees)
    if missing:
        raise RuntimeError(f"{NODE_TABLE}: {len(missing)} text id(s) unresolved, e.g. {sorted(missing)[:3]}")
    # Every icon is located before anything is written, so a partial export
    # cannot leave the dataset naming images the image repo does not have.
    icons = locate_icons(raw, icon_names(trees))
    target = Path(res_out) / ICON_SUBDIR
    target.mkdir(parents=True, exist_ok=True)
    for name, png in icons.items():
        with Image.open(png) as img:
            img.save(target / f"{name}.webp", "WEBP", quality=WEBP_QUALITY, method=6)
    payload = {"trees": trees}
    write_json(Path(data_out) / OUT_FILE, payload)
    counts = {"trees": len(trees), "nodes": sum(len(t["nodes"]) for t in trees), "icons": len(icons)}
    print(f"talents: {counts} -> {OUT_FILE}, {target}")
    return counts


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--excel", type=Path, default=None, help="override the exported Data/Excel dir")
    parser.add_argument("--out", type=Path, default=None, help="override GMZZ_DATA_OUT")
    parser.add_argument("--raw", type=Path, default=None, help="override GMZZ_RAW")
    parser.add_argument("--res-out", type=Path, default=None, help="override GMZZ_RES_OUT")
    args = parser.parse_args(argv)

    data_out = args.out or require_dir("GMZZ_DATA_OUT")
    build(
        args.excel or excel_dir(),
        data_out,
        args.raw or require_dir("GMZZ_RAW"),
        args.res_out or require_dir("GMZZ_RES_OUT"),
    )
    stamp_version(data_out)


if __name__ == "__main__":
    main()
