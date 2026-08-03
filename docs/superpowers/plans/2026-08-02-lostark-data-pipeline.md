# Lost Ark Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Lost Ark combat-power coefficients and localized names from the game's own SQLite tables into a `data-lostark` artifact set, replacing the fan-site scraping the superseded plan proposed.

**Architecture:** A Python pipeline at `tools/apps/lostark`, matching the four existing pipelines. It reads the read-only `EFTable_*.db` files produced by `lostark-explorer` and emits JSON. No new extractor is written — `lostark-explorer` already fills the uex/unex/gdex role, and its output is plain SQLite.

**Tech Stack:** Python 3.11+ under uv, stdlib `sqlite3`, pytest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-02-lostark-combat-power-calculator-design.md`

**Supersedes:** `2026-08-02-lostark-calc-core.md` Tasks 4 and 10.

**Phase:** 1 of 4. Phase 2 is the calc engine consuming this data, phase 3 the UI, phase 4 persistence.

---

## Verified source facts

Everything below was confirmed by querying the extracted CN client on 2026-08-02. Tests in this
plan assert these exact values, so a table that shifts under a patch fails loudly.

**`EFTable_BattlePoint.db`** — 16,707 rows, columns
`PrimaryKey, SecondaryKey, Type, ValueA..ValueE, ClassifyType, ClassifyIndex, SourceRow, Milestone`.
`PrimaryKey` 1 = DPS (14,764 rows), 2 = support (1,943 rows).

| Type | Shape | Verified values |
| --- | --- | --- |
| 1 | one row per role, `ValueA` = base rate ×10⁻⁶ | dps 288, support 124 |
| 2 | support only, `ValueA` = heal rate ×10⁻⁴ | 12 |
| 3 | per combat level: `ValueA` = level, `ValueB` = amp ×10⁻⁴ | levels 55–70; dps 895→2945, support 95→476 |
| 5 | `ValueA` = evolution rate ×10⁻⁴ | dps 75, support 160 |
| 6 | `ValueA` = enlightenment rate ×10⁻⁴ | dps 70, support 72 |
| 7 | `ValueA` = leap rate ×10⁻⁴ | both 20 |
| 9 | dps only, `ValueA` = leap-karma rate ×10⁻⁴ | 2 |
| 29 | `ValueA` = Ark-core id, `ValueB` = points, `ValueC` = value | 13,272 rows, ids 673000003–673120006 |

**`EFTable_ItemLevelOption.db`** — 10,185 rows, columns
`PrimaryKey, SecondaryKey, MaxDam, Def, Res, Str, Agi, Int, Con, …`.
`SecondaryKey` is the **item level**. `Str`/`Agi`/`Int` are the same main-stat value emitted once
per class stat type; `Con` is vitality; `MaxDam` is weapon attack. At item level 1640:
head main = 57721, head vit = 7293, weapon MaxDam = 100036.

**`EFTable_GameMsg.db`** — tables `GameMsg_Chinese` and `GameMsg_Korean`, 694,755 rows each,
columns `KEY, MSG, …`. `tip.name.ability_adrenaline1` → 肾上腺素.
`sys.arkgrid.core_order_sun` → 秩序之日.

**`EFTable_ArkGridCore.db`** — 2,160 rows. `PrimaryKey` is the core id used by BattlePoint Type 29.
`CoreBookString` / `CoreBookCategoryString` are GameMsg keys.

Source root on this machine:
`D:\lostark-extracted\EFGame\data2\EFGame_Extra\ClientData\TableData`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `tools/apps/lostark/__init__.py` | Package marker |
| `tools/apps/lostark/env.py` | `LOSTARK_TABLES` / `LOSTARK_DATA_OUT`, env-only, no defaults |
| `tools/apps/lostark/db.py` | Read-only SQLite access, one table per `EFTable_*.db` |
| `tools/apps/lostark/battlepoint.py` | BattlePoint → per-role coefficient JSON |
| `tools/apps/lostark/itemlevel.py` | ItemLevelOption → gear stats per item level |
| `tools/apps/lostark/arkgrid.py` | ArkGridCore + Type 29 → core values |
| `tools/apps/lostark/locales.py` | GameMsg → zh-CN / ko-KR, markup stripped |
| `tools/apps/lostark/emit.py` | Orchestrates, writes `data-lostark/`, stamps version |
| `tools/apps/lostark/__main__.py` | `python -m lostark emit` |
| `tools/apps/lostark/tests/` | pytest, incl. the verified-value contract tests |
| `tools/.env.example` | Documents the two new vars |

---

### Task 1: Scaffold the pipeline package

**Files:**
- Create: `tools/apps/lostark/__init__.py`, `env.py`
- Modify: `tools/.env.example`

- [ ] **Step 1: Create the package and env module**

`tools/apps/lostark/__init__.py` — empty file.

`tools/apps/lostark/env.py`:

```python
"""Per-machine paths for the Lost Ark pipeline — environment only, no defaults.

Set the variables in ``tools/.env`` (see ``tools/.env.example``) or export them:

  LOSTARK_TABLES    lostark-explorer output: the ClientData/TableData directory
                    holding the EFTable_*.db SQLite files
  LOSTARK_DATA_OUT  data-lostark repo (dataset the frontend fetches)
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# tools/.env — anchored to the repo layout so the CWD doesn't matter.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def require_dir(name: str) -> Path:
    """The directory configured under ``name``; raises when unset."""
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"{name} is not set: add it to tools/.env (see tools/.env.example) or export it"
        )
    return Path(value)


def optional_dir(name: str) -> Path | None:
    """Like :func:`require_dir` but ``None`` when unset (for skippable tests)."""
    value = os.environ.get(name)
    return Path(value) if value else None
```

- [ ] **Step 2: Document the vars**

Append to `tools/.env.example`:

```dotenv
# Lost Ark — lostark-explorer output and the data-lostark repo
LOSTARK_TABLES=D:/lostark-extracted/EFGame/data2/EFGame_Extra/ClientData/TableData
LOSTARK_DATA_OUT=E:/arkive-games/data-lostark
```

- [ ] **Step 3: Verify it raises when unset**

Run:
```bash
cd tools && uv run python -c "
from lostark.env import require_dir
try:
    require_dir('LOSTARK_DEFINITELY_UNSET')
except RuntimeError as e:
    print('raised as expected:', e)
"
```
Expected: prints `raised as expected: LOSTARK_DEFINITELY_UNSET is not set: …`

- [ ] **Step 4: Commit**

```bash
git add tools/apps/lostark/__init__.py tools/apps/lostark/env.py tools/.env.example
git commit -m "feat(lostark): pipeline package scaffold and env paths"
```

---

### Task 2: Read-only table access

**Files:**
- Create: `tools/apps/lostark/db.py`
- Test: `tools/apps/lostark/tests/test_db.py`

- [ ] **Step 1: Write the failing test**

```python
import sqlite3

import pytest

from lostark.db import Tables, rows


def _make_db(path, name, cols, data):
    con = sqlite3.connect(path)
    con.execute(f"CREATE TABLE {name} ({','.join(cols)})")
    con.executemany(
        f"INSERT INTO {name} VALUES ({','.join('?' * len(cols))})", data
    )
    con.commit()
    con.close()


def test_rows_returns_dicts(tmp_path):
    db = tmp_path / "EFTable_Demo.db"
    _make_db(db, "Demo", ["A", "B"], [(1, 2), (3, 4)])
    out = list(rows(db, "Demo"))
    assert out == [{"A": 1, "B": 2}, {"A": 3, "B": 4}]


def test_tables_resolves_by_stem(tmp_path):
    _make_db(tmp_path / "EFTable_Demo.db", "Demo", ["A"], [(9,)])
    tables = Tables(tmp_path)
    assert [r["A"] for r in tables.read("Demo")] == [9]


def test_missing_table_raises_with_the_name(tmp_path):
    tables = Tables(tmp_path)
    with pytest.raises(FileNotFoundError, match="EFTable_Nope.db"):
        list(tables.read("Nope"))


def test_open_is_read_only(tmp_path):
    db = tmp_path / "EFTable_Demo.db"
    _make_db(db, "Demo", ["A"], [(1,)])
    tables = Tables(tmp_path)
    with tables.connect("Demo") as con:
        with pytest.raises(sqlite3.OperationalError):
            con.execute("INSERT INTO Demo VALUES (2)")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools && uv run pytest apps/lostark/tests/test_db.py -v`
Expected: FAIL — `ModuleNotFoundError: lostark.db`

- [ ] **Step 3: Implement**

```python
"""Read-only access to the EFTable_*.db SQLite files.

Each EFTable file holds exactly one table whose name is the file stem minus the
``EFTable_`` prefix, except GameMsg which holds one table per language.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


def _connect_ro(path: Path) -> sqlite3.Connection:
    if not path.exists():
        raise FileNotFoundError(f"no such table file: {path.name} (looked in {path.parent})")
    con = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def rows(path: Path, table: str) -> Iterator[dict]:
    """Every row of ``table`` in ``path`` as a dict."""
    con = _connect_ro(path)
    try:
        for row in con.execute(f'SELECT * FROM "{table}"'):
            yield dict(row)
    finally:
        con.close()


class Tables:
    """The ClientData/TableData directory."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def path(self, name: str) -> Path:
        return self.root / f"EFTable_{name}.db"

    @contextmanager
    def connect(self, name: str):
        con = _connect_ro(self.path(name))
        try:
            yield con
        finally:
            con.close()

    def read(self, name: str, table: str | None = None) -> Iterator[dict]:
        yield from rows(self.path(name), table or name)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools && uv run pytest apps/lostark/tests/test_db.py -v`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/apps/lostark/db.py tools/apps/lostark/tests/test_db.py
git commit -m "feat(lostark): read-only EFTable access"
```

---

### Task 3: BattlePoint coefficients

**Files:**
- Create: `tools/apps/lostark/battlepoint.py`
- Test: `tools/apps/lostark/tests/test_battlepoint.py`

- [ ] **Step 1: Write the failing test**

These assert the values verified against the live tables, so they double as a patch tripwire.
They are skipped when `LOSTARK_TABLES` is unset so the suite still runs on a machine without
the extraction.

```python
import pytest

from lostark.battlepoint import DPS, SUPPORT, extract
from lostark.db import Tables
from lostark.env import optional_dir

TABLES = optional_dir("LOSTARK_TABLES")
pytestmark = pytest.mark.skipif(TABLES is None, reason="LOSTARK_TABLES not set")


@pytest.fixture(scope="module")
def coeffs():
    return extract(Tables(TABLES))


def test_base_rates(coeffs):
    assert coeffs[DPS]["base_rate"] == pytest.approx(0.000288)
    assert coeffs[SUPPORT]["base_rate"] == pytest.approx(0.000124)


def test_heal_rate_is_support_only(coeffs):
    assert coeffs[SUPPORT]["heal_rate"] == pytest.approx(0.0012)
    assert "heal_rate" not in coeffs[DPS]


def test_combat_level_is_a_table_not_a_constant(coeffs):
    # The fan site hardcodes only level 70; the game covers 55-70.
    dps = coeffs[DPS]["combat_level_amp"]
    assert set(dps) == {str(lv) for lv in range(55, 71)}
    assert dps["70"] == pytest.approx(0.2945)
    assert dps["55"] == pytest.approx(0.0895)
    assert coeffs[SUPPORT]["combat_level_amp"]["70"] == pytest.approx(0.0476)


def test_growth_rates_differ_by_role(coeffs):
    assert coeffs[DPS]["evolution_rate"] == pytest.approx(0.0075)
    assert coeffs[SUPPORT]["evolution_rate"] == pytest.approx(0.016)
    assert coeffs[DPS]["enlightenment_rate"] == pytest.approx(0.007)
    assert coeffs[SUPPORT]["enlightenment_rate"] == pytest.approx(0.0072)
    assert coeffs[DPS]["leap_rate"] == pytest.approx(0.002)
    assert coeffs[SUPPORT]["leap_rate"] == pytest.approx(0.002)


def test_leap_karma_is_dps_only(coeffs):
    assert coeffs[DPS]["leap_karma_rate"] == pytest.approx(0.0002)
    assert "leap_karma_rate" not in coeffs[SUPPORT]


def test_ark_core_values_cover_every_core(coeffs):
    cores = coeffs[DPS]["ark_core_values"]
    assert len(cores) > 100
    # Ids are the ArkGridCore PrimaryKeys.
    assert all(k.isdigit() and 673000000 < int(k) < 674000000 for k in cores)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools && uv run pytest apps/lostark/tests/test_battlepoint.py -v`
Expected: FAIL — `ModuleNotFoundError: lostark.battlepoint`

- [ ] **Step 3: Implement**

```python
"""EFTable_BattlePoint -> per-role combat power coefficients.

PrimaryKey selects the role. Type selects the coefficient; the game stores rates as
scaled integers, so each Type carries its own divisor.
"""

from __future__ import annotations

from collections import defaultdict

from .db import Tables

DPS = "dps"
SUPPORT = "support"

_ROLE_BY_PRIMARY_KEY = {1: DPS, 2: SUPPORT}

# Type -> (output key, divisor). Single-row-per-role scalars only.
_SCALARS = {
    1: ("base_rate", 1_000_000),
    2: ("heal_rate", 10_000),
    5: ("evolution_rate", 10_000),
    6: ("enlightenment_rate", 10_000),
    7: ("leap_rate", 10_000),
    9: ("leap_karma_rate", 10_000),
}

_TYPE_COMBAT_LEVEL = 3
_TYPE_ARK_CORE = 29


def extract(tables: Tables) -> dict[str, dict]:
    """Coefficients keyed by role."""
    out: dict[str, dict] = {DPS: {}, SUPPORT: {}}
    levels: dict[str, dict[str, float]] = defaultdict(dict)
    cores: dict[str, dict[str, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))

    for row in tables.read("BattlePoint"):
        role = _ROLE_BY_PRIMARY_KEY.get(row["PrimaryKey"])
        if role is None:
            continue
        kind = row["Type"]

        if kind in _SCALARS:
            key, divisor = _SCALARS[kind]
            out[role][key] = row["ValueA"] / divisor
        elif kind == _TYPE_COMBAT_LEVEL:
            levels[role][str(row["ValueA"])] = row["ValueB"] / 10_000
        elif kind == _TYPE_ARK_CORE:
            cores[role][str(row["ValueA"])][str(row["ValueB"])] = row["ValueC"] / 10_000

    for role in (DPS, SUPPORT):
        out[role]["combat_level_amp"] = dict(sorted(levels[role].items(), key=lambda kv: int(kv[0])))
        out[role]["ark_core_values"] = {k: dict(v) for k, v in sorted(cores[role].items())}
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools && uv run pytest apps/lostark/tests/test_battlepoint.py -v`
Expected: PASS, 6 tests.

If `test_ark_core_values_cover_every_core` fails on the divisor, dump a few Type 29 rows and
compare one core's value against the fan site's `dpsArkCoreValues` for the same core and point
total — the id-to-name mapping comes from `ArkGridCore` in Task 5.

- [ ] **Step 5: Commit**

```bash
git add tools/apps/lostark/battlepoint.py tools/apps/lostark/tests/test_battlepoint.py
git commit -m "feat(lostark): extract BattlePoint coefficients per role"
```

---

### Task 4: Gear stats per item level

**Files:**
- Create: `tools/apps/lostark/itemlevel.py`
- Test: `tools/apps/lostark/tests/test_itemlevel.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest

from lostark.db import Tables
from lostark.env import optional_dir
from lostark.itemlevel import extract

TABLES = optional_dir("LOSTARK_TABLES")
pytestmark = pytest.mark.skipif(TABLES is None, reason="LOSTARK_TABLES not set")


@pytest.fixture(scope="module")
def gear():
    return extract(Tables(TABLES))


def test_indexed_by_item_level_then_piece(gear):
    assert "1640" in gear
    assert gear["1640"]


def test_head_stats_at_1640(gear):
    # Verified against EFTable_ItemLevelOption on 2026-08-02.
    head = gear["1640"]["11152511"]
    assert head["main"] == 57721
    assert head["vitality"] == 7293


def test_weapon_attack_at_1640(gear):
    assert gear["1640"]["11152500"]["weapon_attack"] == 100036


def test_main_stat_collapses_str_agi_int(gear):
    # The game emits one row per class stat with the same value; we keep one "main".
    head = gear["1640"]["11152511"]
    assert "str" not in head and "agi" not in head and "int" not in head


def test_defence_is_preserved(gear):
    # Data the fan site dropped; cheap to keep, useful later.
    assert gear["1640"]["11152511"]["defence"] == 6130
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools && uv run pytest apps/lostark/tests/test_itemlevel.py -v`
Expected: FAIL — `ModuleNotFoundError: lostark.itemlevel`

- [ ] **Step 3: Implement**

```python
"""EFTable_ItemLevelOption -> gear stats indexed by item level and piece id.

SecondaryKey is the item level. Str/Agi/Int hold the same main-stat value once per
class stat type, so they collapse to a single ``main``. MaxDam is weapon attack.
"""

from __future__ import annotations

from collections import defaultdict

from .db import Tables


def extract(tables: Tables) -> dict[str, dict[str, dict[str, int]]]:
    out: dict[str, dict[str, dict[str, int]]] = defaultdict(dict)

    for row in tables.read("ItemLevelOption"):
        level = str(row["SecondaryKey"])
        piece = str(row["PrimaryKey"])
        main = row["Str"] or row["Agi"] or row["Int"] or 0

        entry: dict[str, int] = {}
        if main:
            entry["main"] = main
        if row["Con"]:
            entry["vitality"] = row["Con"]
        if row["MaxDam"]:
            entry["weapon_attack"] = row["MaxDam"]
        if row["Def"]:
            entry["defence"] = row["Def"]
        if row["Res"]:
            entry["resistance"] = row["Res"]
        if entry:
            out[level][piece] = entry

    return {lv: out[lv] for lv in sorted(out, key=int)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools && uv run pytest apps/lostark/tests/test_itemlevel.py -v`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/apps/lostark/itemlevel.py tools/apps/lostark/tests/test_itemlevel.py
git commit -m "feat(lostark): extract gear stats per item level"
```

---

### Task 5: Ark grid cores with names

**Files:**
- Create: `tools/apps/lostark/arkgrid.py`
- Test: `tools/apps/lostark/tests/test_arkgrid.py`

- [ ] **Step 1: Write the failing test**

```python
import pytest

from lostark.arkgrid import extract
from lostark.db import Tables
from lostark.env import optional_dir

TABLES = optional_dir("LOSTARK_TABLES")
pytestmark = pytest.mark.skipif(TABLES is None, reason="LOSTARK_TABLES not set")


@pytest.fixture(scope="module")
def cores():
    return extract(Tables(TABLES))


def test_cores_are_keyed_by_id(cores):
    assert "673000003" in cores


def test_core_carries_grade_and_localization_keys(cores):
    core = cores["673000003"]
    assert core["category_key"] == "sys.arkgrid.core_order_sun"
    assert core["name_key"] == "tip.name.core_673000003"
    assert core["grade"] == 0


def test_every_battlepoint_core_id_resolves(cores):
    from lostark.battlepoint import DPS, extract as bp_extract

    values = bp_extract(Tables(TABLES))[DPS]["ark_core_values"]
    unresolved = sorted(set(values) - set(cores))
    assert unresolved == [], f"core ids with no ArkGridCore row: {unresolved[:10]}"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools && uv run pytest apps/lostark/tests/test_arkgrid.py -v`
Expected: FAIL — `ModuleNotFoundError: lostark.arkgrid`

- [ ] **Step 3: Implement**

```python
"""EFTable_ArkGridCore -> core metadata keyed by the id BattlePoint Type 29 uses."""

from __future__ import annotations

from .db import Tables


def extract(tables: Tables) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for row in tables.read("ArkGridCore"):
        out[str(row["PrimaryKey"])] = {
            "group_id": row["GroupId"],
            "grade": row["Grade"],
            "gem_slot_point": row["GemSlotPoint"],
            "category_key": row["CoreBookCategoryString"],
            "name_key": row["CoreBookString"],
        }
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools && uv run pytest apps/lostark/tests/test_arkgrid.py -v`
Expected: PASS, 3 tests.

`test_every_battlepoint_core_id_resolves` is the important one — it proves the join between the
value table and the metadata table is total. If it reports unresolved ids, those cores exist in
BattlePoint but not `ArkGridCore`; inspect them before dropping them.

- [ ] **Step 5: Commit**

```bash
git add tools/apps/lostark/arkgrid.py tools/apps/lostark/tests/test_arkgrid.py
git commit -m "feat(lostark): extract ark grid core metadata"
```

---

### Task 6: Localized names

**Files:**
- Create: `tools/apps/lostark/locales.py`
- Test: `tools/apps/lostark/tests/test_locales.py`

Game strings carry presentational markup and template directives. Markup is stripped; templates
are **rejected loudly**, never shipped raw.

- [ ] **Step 1: Write the failing test**

```python
import pytest

from lostark.db import Tables
from lostark.env import optional_dir
from lostark.locales import LOCALES, has_template, resolve, strip_markup


def test_strip_markup_removes_font_and_img():
    assert strip_markup("<font color='{0}'>连续击溃</font>") == "连续击溃"
    assert strip_markup(
        " <img src='emoticon_arkgrid_order_sun' width='0'></img>秩序之日"
    ) == "秩序之日"


def test_strip_markup_collapses_whitespace():
    assert strip_markup("  a   b  ") == "a b"


def test_has_template_detects_calc_directives():
    assert has_template("增加<$CALC %2 <$TABLE_COMBATEFFECT Action0ArgA 608111000/>/100/>%")
    assert not has_template("秩序之日")


TABLES = optional_dir("LOSTARK_TABLES")


@pytest.mark.skipif(TABLES is None, reason="LOSTARK_TABLES not set")
def test_resolve_returns_every_locale():
    out = resolve(Tables(TABLES), ["tip.name.ability_adrenaline1", "sys.arkgrid.core_order_sun"])
    assert set(out) == set(LOCALES)
    assert out["zh-CN"]["tip.name.ability_adrenaline1"] == "肾上腺素"
    assert out["zh-CN"]["sys.arkgrid.core_order_sun"] == "秩序之日"
    assert out["ko-KR"]["sys.arkgrid.core_order_sun"] == "질서의 해"


@pytest.mark.skipif(TABLES is None, reason="LOSTARK_TABLES not set")
def test_missing_key_is_reported_not_silently_dropped():
    with pytest.raises(KeyError, match="not.a.real.key"):
        resolve(Tables(TABLES), ["not.a.real.key"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools && uv run pytest apps/lostark/tests/test_locales.py -v`
Expected: FAIL — `ModuleNotFoundError: lostark.locales`

- [ ] **Step 3: Implement**

```python
"""EFTable_GameMsg -> display names per locale.

The CN client ships Chinese and Korean only; en-US requires an NAEU extraction.
"""

from __future__ import annotations

import re

from .db import Tables

LOCALES = {"zh-CN": "GameMsg_Chinese", "ko-KR": "GameMsg_Korean"}

_TAG = re.compile(r"<\s*/?\s*(?:font|img|br|b|i)\b[^>]*>", re.IGNORECASE)
_TEMPLATE = re.compile(r"<\$[A-Z_]+")
_WS = re.compile(r"\s+")


def strip_markup(text: str) -> str:
    """Remove presentational tags and collapse whitespace."""
    return _WS.sub(" ", _TAG.sub("", text)).strip()


def has_template(text: str) -> bool:
    """True when the string needs runtime table lookups we cannot resolve here."""
    return bool(_TEMPLATE.search(text))


def resolve(tables: Tables, keys: list[str]) -> dict[str, dict[str, str]]:
    """Every key in every locale, markup stripped.

    Raises KeyError listing keys absent from a locale, so a rename surfaces here
    rather than as a blank label in the UI.
    """
    wanted = list(dict.fromkeys(keys))
    out: dict[str, dict[str, str]] = {}

    with tables.connect("GameMsg") as con:
        for locale, table in LOCALES.items():
            found: dict[str, str] = {}
            for chunk_start in range(0, len(wanted), 500):
                chunk = wanted[chunk_start : chunk_start + 500]
                placeholders = ",".join("?" * len(chunk))
                for key, msg in con.execute(
                    f'SELECT KEY, MSG FROM "{table}" WHERE KEY IN ({placeholders})', chunk
                ):
                    found[key] = strip_markup(msg or "")
            missing = [k for k in wanted if k not in found]
            if missing:
                raise KeyError(f"{locale}: {len(missing)} key(s) absent, e.g. {missing[:5]}")
            out[locale] = found
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd tools && uv run pytest apps/lostark/tests/test_locales.py -v`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/apps/lostark/locales.py tools/apps/lostark/tests/test_locales.py
git commit -m "feat(lostark): resolve zh-CN and ko-KR names from GameMsg"
```

---

### Task 7: Emit the dataset

**Files:**
- Create: `tools/apps/lostark/emit.py`, `tools/apps/lostark/__main__.py`
- Test: `tools/apps/lostark/tests/test_emit.py`

- [ ] **Step 1: Write the failing test**

```python
import json

import pytest

from lostark.db import Tables
from lostark.emit import build, write
from lostark.env import optional_dir

TABLES = optional_dir("LOSTARK_TABLES")
pytestmark = pytest.mark.skipif(TABLES is None, reason="LOSTARK_TABLES not set")


@pytest.fixture(scope="module")
def dataset():
    return build(Tables(TABLES))


def test_dataset_has_the_expected_files(dataset):
    assert set(dataset) == {
        "battlepoint/dps.json",
        "battlepoint/support.json",
        "gear/item-levels.json",
        "arkgrid/cores.json",
        "locales/zh-CN.json",
        "locales/ko-KR.json",
        "version.json",
    }


def test_version_records_provenance(dataset):
    version = dataset["version.json"]
    assert version["source"] == "lostark-explorer"
    assert version["locales"] == ["zh-CN", "ko-KR"]
    assert version["generatedAt"]


def test_write_creates_every_file(tmp_path, dataset):
    write(dataset, tmp_path)
    for name in dataset:
        path = tmp_path / name
        assert path.exists(), name
        json.loads(path.read_text(encoding="utf-8"))


def test_write_refuses_a_path_inside_the_source(dataset):
    with pytest.raises(ValueError, match="inside the source"):
        write(dataset, TABLES / "out")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd tools && uv run pytest apps/lostark/tests/test_emit.py -v`
Expected: FAIL — `ModuleNotFoundError: lostark.emit`

- [ ] **Step 3: Implement**

```python
"""Assemble and write the data-lostark dataset."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from . import arkgrid, battlepoint, itemlevel, locales
from .db import Tables


def build(tables: Tables) -> dict[str, object]:
    coeffs = battlepoint.extract(tables)
    cores = arkgrid.extract(tables)
    gear = itemlevel.extract(tables)

    keys = sorted(
        {c["name_key"] for c in cores.values() if c["name_key"]}
        | {c["category_key"] for c in cores.values() if c["category_key"]}
    )
    names = locales.resolve(tables, keys)

    dataset: dict[str, object] = {
        "battlepoint/dps.json": coeffs[battlepoint.DPS],
        "battlepoint/support.json": coeffs[battlepoint.SUPPORT],
        "gear/item-levels.json": gear,
        "arkgrid/cores.json": cores,
        "version.json": {
            "source": "lostark-explorer",
            "generatedAt": datetime.now(UTC).isoformat(),
            "locales": list(locales.LOCALES),
            "counts": {
                "itemLevels": len(gear),
                "arkCores": len(cores),
                "localeKeys": len(keys),
            },
        },
    }
    for locale, table in names.items():
        dataset[f"locales/{locale}.json"] = table
    return dataset


def write(dataset: dict[str, object], out_dir: Path, source: Path | None = None) -> None:
    out_dir = Path(out_dir).resolve()
    if source is not None and (out_dir == Path(source).resolve() or Path(source).resolve() in out_dir.parents):
        raise ValueError(f"refusing to write inside the source tree: {out_dir}")
    for name, payload in dataset.items():
        path = out_dir / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
```

**Note:** `test_write_refuses_a_path_inside_the_source` calls `write(dataset, TABLES / "out")`
with no `source`. Make the guard work for that call by defaulting `source` to the tables root —
change the signature to take the `Tables` instance, or have `build` stash the root on the
dataset. Pick one and make the test pass without weakening it; the guard exists so a mistyped
`LOSTARK_DATA_OUT` cannot write into the extraction.

- [ ] **Step 4: Add the CLI entry**

`tools/apps/lostark/__main__.py`:

```python
"""python -m lostark emit"""

from __future__ import annotations

import sys

from .db import Tables
from .emit import build, write
from .env import require_dir


def main(argv: list[str]) -> int:
    if argv[1:2] != ["emit"]:
        print("usage: python -m lostark emit", file=sys.stderr)
        return 2
    tables = Tables(require_dir("LOSTARK_TABLES"))
    out = require_dir("LOSTARK_DATA_OUT")
    dataset = build(tables)
    write(dataset, out, source=tables.root)
    print(f"wrote {len(dataset)} files to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
```

- [ ] **Step 5: Run the tests and a real emit**

Run:
```bash
cd tools && uv run pytest apps/lostark -v
uv run python -m lostark emit
```
Expected: all tests pass; the emit prints `wrote 7 files to …`. Inspect
`battlepoint/dps.json` and confirm `base_rate` is `0.000288` and `combat_level_amp` has 16 entries.

- [ ] **Step 6: Commit**

```bash
git add tools/apps/lostark/emit.py tools/apps/lostark/__main__.py tools/apps/lostark/tests/test_emit.py
git commit -m "feat(lostark): emit the data-lostark dataset"
```

---

## Phase exit criteria

- [ ] `cd tools && uv run pytest apps/lostark` green
- [ ] `uv run python -m lostark emit` writes 7 files
- [ ] `battlepoint/dps.json` `base_rate` == 0.000288 and `combat_level_amp` covers levels 55–70
- [ ] `gear/item-levels.json` has head main 57721 / vit 7293 and weapon 100036 at level 1640
- [ ] Every BattlePoint Ark-core id resolves in `arkgrid/cores.json`
- [ ] Every emitted locale key resolves in both zh-CN and ko-KR
- [ ] `data-lostark` repo created (private) and populated

## Known gaps to close in phase 2

These systems are confirmed present in the tables but not yet extracted, and phase 2's engine
needs them. Each is a new module following the Task 3–6 pattern:

- **Engravings** — `EFTable_AbilityEngrave` (423 rows) plus `AbilityStoneBase` /
  `AbilityStoneUpgrade` / `AbilityStoneCarveOption`.
- **Gems** — the `ArkGridGem*` family (`ArkGridGem`, `ArkGridGemOption`, `ArkGridGemPotential`).
- **Accessories and bracelet** — `ItemAccessoryOptionSelect` / `ItemAccessoryUpgrade`,
  `ItemBraceletEnchant` / `ItemBraceletOptionSelect` / `ItemBraceletUpgrade`.
- **Advanced honing** — `ItemAmplificationBase` (992 rows) / `ItemAmplificationBonus`.
- **Cards, avatars, karma** — `ArcanaCard`, `AvatarGrade`, and the karma tables.

**BattlePoint Type decoding status** (updated 2026-08-03):

Decoded and extracted — 1 (base rate), 2 (heal rate), 3 (combat level 55–70), 4 (weapon quality
0–100, DPS only), 5/6/7/9 (evolution / enlightenment / leap / leap-karma), 8 (karma stage step),
29 (Ark-core values).

Decoded but not a coefficient — 10 is a per-item-group honing table (`ValueA` = group id,
`ValueB` = step, `ValueC` = value), **not** item levels. Do not repeat that dead end.
30 is four support-only Ark-core ids (673122003–673122006), all present in `ArkGridCore`.

Still undecoded — 11–28 and 31–34. Their shapes, profiled 2026-08-03, as a starting point:

| Type | rows | roles | ValueA | ValueB | ValueC | likely |
| --- | --- | --- | --- | --- | --- | --- |
| 11 | 61 | support | 1301 | 5..93 | 3080..5040 | item-group honing, support |
| 12 | 23 | both | 100..108 | 1..2 | 200..1400 | small tiered system |
| 13 | 115 | both | 10100..15005 | 1..5 | 2..450 | id × level → value |
| 14 | 25 | support | 12002..15008 | 1..5 | 90..588 | as 13, support-side |
| 15 | 8 | both | 1..3 | 0..124 | 700..10000 | — |
| 17 | 24 | both | 4..29 | 621000010… | 24..300 | keyed by item id |
| 20 | 196 | both | 3..4 | 605000001… | 49..1275 | keyed by item id |
| 22 | 40 | both | 3..4 | 1..10 | 20..1250 | tier × level |
| 23 | 12 | both | 6..8 | 1100106… | 50..190 | keyed by item id |
| 25 | 20 | both | 162..165 | 5..20 | 10..630 | — |
| 27 | 154 | both | 1001..1058 | 1..6 | 50..2100 | id × grade |
| 31 | 720 | both | 2001..2013 | 1..120 | 3..1500 | id × level, large |
| 33/34 | 14 | split | **id is in ValueA** 657800001… | 12..130 | 480..1000 | **Paradise Orb** |

**Attributions found 2026-08-03** by scanning every table for the distinctive ids as
`PrimaryKey` (the `EFTable_Item` join does *not* work — these are not item ids):

- **Type 33/34 → `EFTable_TrinityOrbItem`, 10/10 ids resolve.** This is 乐园宝珠, the Paradise
  Orb system. The table carries `TrinityOrbBaseForce` and `TrinityOrbBasePower`, which line up
  with the fan site's 宝具力 input and its `base + perMillion × (power / 1e6)` model. Note the id
  sits in `ValueA` here, not `ValueB`.
- **Type 17 → `EFTable_CombatEffect`** (unique hit, 11,055 rows). Rows carry a
  `tip.desc.combateffect_<id>` GameMsg key, `Ratio`, and `Action*` columns. This is the same
  table `ArkGridCoreOption` descriptions reference through `<$TABLE_COMBATEFFECT …/>`, so
  resolving it also unblocks those templated strings.
- **Type 20 → `CombatEffect` or `SkillBuff`** (2 candidates); `CombatEffect` is the likely one
  given Type 17.
- **Type 23 → `GameAction` / `ItemDisassembly` / `ItemEvolutionOption` / `SceneReplay`**
  (4 candidates); `ItemEvolutionOption` is the plausible one for combat power.

Types 27 and 31 use small ids (1001, 2001) that collide across dozens of tables, so id-scanning
cannot attribute them — decode those by row shape or by matching their values against a known
system's numbers instead.
