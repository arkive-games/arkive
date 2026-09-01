"""Emit the Beyonder-rating (非凡评分) reference data into ``data-gmzz``.

Run from ``tools/``::

    uv run python -m gmzz.score

非凡评分 is the game's single number for how developed a character is. Its panel
breaks into 4 groups (``CEGenusData``: 途径 / 装备 / 封印物 / 非凡人物) over 14
items (``CESpeciesData``: 等级, 非凡天赋, 途径技能, 封印物装配, 封印物主属性,
封印物词条, 秘偶技能, 秘偶属性, 人脉技能, 历史研究, 装备基础, 装备词条, 装备强化,
套装效果). "CE" is the client's own abbreviation — combat effectiveness — which
is why nothing in the export answers to `Score` or `Rating`.

**The per-item score itself is not in the client, and this pipeline does not
invent one.** ``Data/NetDefs/AvatarActorCEComponent.xml`` settles it: ``ZhanLi``
(the rating) and ``CESpeciesScore`` (item id -> score) are server properties
flagged ``OWN_CLIENT`` / ``OWN_INITIAL_ONLY``, pushed to the client by
``OnMsgSyncCESpeciesScore``. The client receives every number and computes none,
so how gear turns into points is server-side and unrecoverable from here.

What the client *does* own is the whole grading side, and that is what ships:

- **Benchmark curves.** Each item's ``ExpectedScoreFormula`` / ``MaxScoreFormula``
  is a step function of ``$1`` = 扮演等级 (role level, to 70) and ``$2`` = 神性等级
  (divinity level, to 30) — the pair the client itself calls 扮演等级与神性等级.
  These are the targets the game grades a player against at their progression.
- **The completion formula**, ``Extraordinary_Score_Percent_Species``:
  ``Min(1, Min(1, score/expected) * 0.9 + Min(1, score/max) * 0.1)``.
- **The rating bands** (``CEPercentageData``): 推荐提升 / 稳步增长 / 趋于完善 /
  登峰造极.
- **The improvement materials** each item consumes (``CEScoreDecsData``).

So a calculator built on this reproduces the in-game panel exactly: give it the
two levels and the 14 sub-scores it shows you, and every number it derives —
percentage, band, gap to expected, gap to max — is the client's own arithmetic.

Two findings worth keeping, because both are traps:

- **The static ``ExpectedScore`` / ``MaxScore`` columns match no level.** Fitting
  all 28 formulas across the whole 70x31 grid, the best point (L70 D21)
  reproduces 4 of 28 columns. They are emitted verbatim as the client's own
  fields, but the *curves* are what the calculator uses — a column pinned to
  nothing would misgrade every player who is not at whatever point it was
  authored for.
- **Divinity level is inert below role level 70**, verified over all 28 curves,
  because the divinity branches sit behind ``elseif $1<70``. Above 30 the value
  clamps. The curve is therefore exactly ``byLevel[1..69]`` plus
  ``byDivinity[0..30]``, which is emitted rather than a 2170-point grid. The
  build asserts both properties rather than trusting them.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from .common import write_json
from .env import excel_dir, require_dir
from .tables import load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version

GENUS_TABLE = "CEGenusData"
SPECIES_TABLE = "CESpeciesData"
BAND_TABLE = "CEPercentageData"
MATERIAL_TABLE = "CEScoreDecsData"
FORMULA_TABLE = "FormulaData"
ITEM_TABLE = "ItemNewData"

OUT_SUBDIR = "score"

#: Role level runs 1..70; the divinity level the client tracks alongside it runs
#: 0..30. Both bounds come from the formulas' own branch ladders.
MAX_ROLE_LEVEL = 70
MAX_DIVINITY = 30

#: ``Extraordinary_Score_Percent_Species`` — the panel's completion percentage.
PERCENT_FORMULA = 1641002

_PARAM = re.compile(r"\$(\d+)")


def _lua():
    """A runtime with the one helper the score formulas call."""
    from lupa.luajit21 import LuaRuntime

    runtime = LuaRuntime(encoding=None)
    runtime.execute(b"function Min(a, b) if a < b then return a else return b end end")
    return runtime


def compile_formula(runtime, source: str):
    """One ``FormulaData`` body as a callable of (roleLevel, divinityLevel).

    The client writes parameters as ``$1``/``$2``. Running its Lua rather than
    re-implementing the ladder is deliberate: the branches are ordered
    ``$1 < 40 ... $1 < 70`` and only then ``$2 < n``, and a transcription slip in
    that order would be invisible in the output.
    """
    return runtime.eval(f"function(arg1, arg2) {_PARAM.sub(lambda m: f'arg{m.group(1)}', source)} end".encode())


def curve(fn) -> dict:
    """A benchmark formula as ``{byLevel, byDivinity}``.

    Separability is asserted, because it is the property that makes this compact
    form equal to the full 70x31 grid: the divinity branches sit behind
    ``elseif $1 < 70``, so below the level cap the second parameter cannot move
    the result. If the client ever changes that, emitting two lists would
    silently drop a dimension, so the build stops instead.

    Nothing is asserted *outside* the domain. Each ladder ends at
    ``elseif $2 == 30``, so a divinity of 31 matches no branch and falls through
    to the ``local Score`` default at the top of the body — which for 秘偶属性 is
    a different number than its own value at 30. That is out-of-domain
    behaviour for a level the game caps, not a curve still growing, and callers
    clamp instead. The curves are also not all monotonic (5, 6, 10, 11, 12 and
    13 dip somewhere), so that is not asserted either: it is the client's data,
    and a build that refused it would be asserting a design opinion.
    """
    by_level = []
    for level in range(1, MAX_ROLE_LEVEL):
        # Every divinity level, not a sample of them. Sampling cannot *prove*
        # separability — a formula could match at the sampled points and differ
        # between them — and the whole grid is only ~2k evaluations per curve.
        seen = {_whole(fn(level, d)) for d in range(0, MAX_DIVINITY + 1)}
        if len(seen) != 1:
            raise RuntimeError(
                f"divinity level changes the benchmark at role level {level} ({sorted(seen)}) — "
                f"the curve is no longer separable, emit the full grid instead"
            )
        by_level.append(seen.pop())

    return {
        "byLevel": by_level,
        "byDivinity": [_whole(fn(MAX_ROLE_LEVEL, d)) for d in range(0, MAX_DIVINITY + 1)],
    }


def _whole(value) -> int:
    """A formula result as an int, refusing to truncate a fractional one.

    Every shipped curve returns integer literals. Rounding a future fractional
    benchmark down would quietly shift what the page grades against, so it stops
    instead.
    """
    number = float(value)
    if not number.is_integer():
        raise RuntimeError(f"benchmark formula returned {number}, expected a whole number of points")
    return int(number)


def _rows(payload):
    """A client table as a list, whatever shape the reader returned."""
    return list(payload.values()) if isinstance(payload, dict) else list(payload)


def _object_name(path: str) -> str:
    """Asset name out of a ``/Game/<dir>/<Name>.<Name>`` object path."""
    return path.rsplit(".", 1)[-1] if path else ""


def build(excel: Path, data_out: Path) -> dict[str, int]:
    strings = load_strings(excel)
    formulas = load_table(excel, FORMULA_TABLE)
    runtime = _lua()

    genus = [
        {
            "id": row["ID"],
            "name": row["Name"],
            "module": row["Module_Enum"],
            "priority": row["Priority"],
            "icon": _object_name(row.get("BasicIcon") or ""),
        }
        for row in sorted(_rows(resolve_text(load_table(excel, GENUS_TABLE), strings)), key=lambda r: r["Priority"])
    ]

    species = []
    for row in sorted(_rows(resolve_text(load_table(excel, SPECIES_TABLE), strings)), key=lambda r: r["ID"]):
        expected_id, max_id = row["ExpectedScoreFormula"], row["MaxScoreFormula"]
        species.append({
            "id": row["ID"],
            "name": row["Name"],
            "genusId": row["BelongGroupID"],
            "module": row["ModuleEnum"],
            "priority": row["Priority"],
            # The client's own columns, kept because they are its fields — but
            # see the module docstring: they correspond to no level.
            "expectedScoreColumn": row["ExpectedScore"],
            "maxScoreColumn": row["MaxScore"],
            "expectedFormulaId": expected_id,
            "maxFormulaId": max_id,
            "expected": curve(compile_formula(runtime, formulas[str(expected_id)]["Formula"])),
            "max": curve(compile_formula(runtime, formulas[str(max_id)]["Formula"])),
            "materialItemIds": [int(i) for i in row.get("ItemIDs") or []],
        })
    if len(species) != 14:
        raise RuntimeError(f"{SPECIES_TABLE} has {len(species)} rows, expected the panel's 14")

    known = {g["id"] for g in genus}
    orphans = sorted({s["genusId"] for s in species} - known)
    if orphans:
        raise RuntimeError(f"{SPECIES_TABLE} references genus {orphans}, absent from {GENUS_TABLE}")

    bands = [
        {"id": row["ID"], "percentage": row["Percentage"], "label": row["ShowText"]}
        for row in sorted(_rows(resolve_text(load_table(excel, BAND_TABLE), strings)), key=lambda r: r["Percentage"])
    ]

    # Material blurbs are keyed by item; the item's own name comes from the item
    # table, so the page can label a material rather than print a bare id.
    items = resolve_text(load_table(excel, ITEM_TABLE), strings)
    materials = []
    for row in _rows(resolve_text(load_table(excel, MATERIAL_TABLE), strings)):
        item_id = int(row["ItemID"])
        item = items.get(str(item_id))
        if item is None:
            raise RuntimeError(f"{MATERIAL_TABLE} names item {item_id}, absent from {ITEM_TABLE}")
        # `itemName`, not `name` — every other id-keyed table here uses `Name`,
        # and reading the wrong one yields an empty label rather than an error.
        materials.append({
            "itemId": item_id,
            "name": item["itemName"],
            "quality": item["quality"],
            "icon": item["icon"],
            "description": row["Description"],
        })
    materials.sort(key=lambda m: m["itemId"])

    payload = {
        "genus": genus,
        "species": species,
        "bands": bands,
        "materials": materials,
        "maxRoleLevel": MAX_ROLE_LEVEL,
        "maxDivinityLevel": MAX_DIVINITY,
        # Emitted so the page's arithmetic can be checked against its source
        # rather than taken on trust.
        "percentFormula": formulas[str(PERCENT_FORMULA)]["Formula"],
    }
    missing = unresolved_ids(payload)
    if missing:
        raise RuntimeError(
            f"{SPECIES_TABLE}: {len(missing)} text id(s) had no zh-CN string, e.g. {sorted(missing)[:3]}"
        )

    write_json(Path(data_out) / OUT_SUBDIR / "rating.json", payload)
    counts = {"genus": len(genus), "species": len(species), "bands": len(bands), "materials": len(materials)}
    print(f"score: {counts} -> {OUT_SUBDIR}/rating.json")
    return counts


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--excel", type=Path, default=None, help="override the exported Data/Excel dir")
    parser.add_argument("--out", type=Path, default=None, help="override GMZZ_DATA_OUT")
    args = parser.parse_args(argv)

    data_out = args.out or require_dir("GMZZ_DATA_OUT")
    build(args.excel or excel_dir(), data_out)
    stamp_version(data_out)


if __name__ == "__main__":
    main()
