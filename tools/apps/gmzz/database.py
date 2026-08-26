"""Build the Lord of Mysteries equipment and sealed-item SQLite database.

The database has three layers:

* ``source_asset`` records exactly which cooked assets must be exported.
* ``source_row`` preserves every exported JSON row without interpretation.
* normalized entry/affix/effect/text tables power stable application queries.

Keeping the raw layer is intentional: game updates can rename or split columns
without making an older normalization rule silently discard information.
"""

from __future__ import annotations

import argparse
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import sqlite3
import tempfile
from typing import Any

from .sources import discover_sources, missing_required_tables, write_extraction_plan

SCHEMA_VERSION = 1

SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE source_asset (
    asset_path TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('equipment', 'sealed', 'effect', 'localization')),
    role TEXT NOT NULL CHECK (role IN ('data', 'annotation', 'localization')),
    required INTEGER NOT NULL CHECK (required IN (0, 1))
);

CREATE INDEX source_asset_table_name_idx ON source_asset(table_name);

CREATE TABLE source_row (
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    source_file TEXT NOT NULL,
    PRIMARY KEY (table_name, row_id)
);

CREATE TABLE localized_text (
    text_key TEXT NOT NULL,
    locale TEXT NOT NULL,
    text TEXT NOT NULL,
    source_table TEXT,
    raw_json TEXT CHECK (raw_json IS NULL OR json_valid(raw_json)),
    PRIMARY KEY (text_key, locale)
);

CREATE TABLE effect (
    effect_id TEXT PRIMARY KEY,
    effect_kind TEXT,
    description_text_key TEXT,
    formula_json TEXT CHECK (formula_json IS NULL OR json_valid(formula_json)),
    parameters_json TEXT CHECK (parameters_json IS NULL OR json_valid(parameters_json)),
    raw_json TEXT NOT NULL CHECK (json_valid(raw_json))
);

CREATE TABLE affix (
    affix_id TEXT PRIMARY KEY,
    system TEXT NOT NULL CHECK (system IN ('equipment', 'sealed', 'shared')),
    class_id TEXT,
    group_id TEXT,
    name_text_key TEXT,
    description_text_key TEXT,
    min_value REAL,
    max_value REAL,
    unit TEXT,
    raw_json TEXT NOT NULL CHECK (json_valid(raw_json))
);

CREATE TABLE affix_effect (
    affix_id TEXT NOT NULL REFERENCES affix(affix_id) ON DELETE CASCADE,
    effect_id TEXT NOT NULL REFERENCES effect(effect_id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (affix_id, effect_id)
);

CREATE TABLE game_entry (
    entry_id TEXT PRIMARY KEY,
    entry_kind TEXT NOT NULL CHECK (entry_kind IN ('equipment', 'sealed')),
    quality TEXT,
    slot TEXT,
    name_text_key TEXT,
    description_text_key TEXT,
    risk_text_key TEXT,
    icon TEXT,
    raw_json TEXT NOT NULL CHECK (json_valid(raw_json))
);

CREATE INDEX game_entry_kind_idx ON game_entry(entry_kind);

CREATE TABLE entry_affix (
    entry_id TEXT NOT NULL REFERENCES game_entry(entry_id) ON DELETE CASCADE,
    affix_id TEXT NOT NULL REFERENCES affix(affix_id) ON DELETE CASCADE,
    pool TEXT,
    weight REAL,
    position INTEGER NOT NULL DEFAULT 0,
    raw_json TEXT CHECK (raw_json IS NULL OR json_valid(raw_json)),
    PRIMARY KEY (entry_id, affix_id, position)
);

CREATE VIEW equipment AS
SELECT * FROM game_entry WHERE entry_kind = 'equipment';

CREATE VIEW sealed_item AS
SELECT * FROM game_entry WHERE entry_kind = 'sealed';

CREATE VIEW equipment_search_zh_cn AS
SELECT
    e.entry_id,
    entry_name.text AS entry_name,
    entry_description.text AS entry_description,
    e.quality,
    e.slot,
    a.affix_id,
    affix_name.text AS affix_name,
    affix_description.text AS affix_description,
    a.min_value,
    a.max_value,
    a.unit,
    fx.effect_id,
    fx.effect_kind,
    effect_description.text AS effect_description,
    fx.formula_json,
    fx.parameters_json,
    ea.pool,
    ea.weight,
    ea.position
FROM game_entry AS e
LEFT JOIN localized_text AS entry_name
    ON entry_name.text_key = e.name_text_key AND entry_name.locale = 'zh-CN'
LEFT JOIN localized_text AS entry_description
    ON entry_description.text_key = e.description_text_key AND entry_description.locale = 'zh-CN'
LEFT JOIN entry_affix AS ea ON ea.entry_id = e.entry_id
LEFT JOIN affix AS a ON a.affix_id = ea.affix_id
LEFT JOIN localized_text AS affix_name
    ON affix_name.text_key = a.name_text_key AND affix_name.locale = 'zh-CN'
LEFT JOIN localized_text AS affix_description
    ON affix_description.text_key = a.description_text_key AND affix_description.locale = 'zh-CN'
LEFT JOIN affix_effect AS af ON af.affix_id = a.affix_id
LEFT JOIN effect AS fx ON fx.effect_id = af.effect_id
LEFT JOIN localized_text AS effect_description
    ON effect_description.text_key = fx.description_text_key AND effect_description.locale = 'zh-CN'
WHERE e.entry_kind = 'equipment';

CREATE VIEW sealed_search_zh_cn AS
SELECT
    e.entry_id,
    entry_name.text AS entry_name,
    entry_description.text AS entry_description,
    risk_description.text AS risk_description,
    e.quality,
    e.slot,
    a.affix_id,
    affix_name.text AS affix_name,
    affix_description.text AS affix_description,
    a.min_value,
    a.max_value,
    a.unit,
    fx.effect_id,
    fx.effect_kind,
    effect_description.text AS effect_description,
    fx.formula_json,
    fx.parameters_json,
    ea.pool,
    ea.weight,
    ea.position
FROM game_entry AS e
LEFT JOIN localized_text AS entry_name
    ON entry_name.text_key = e.name_text_key AND entry_name.locale = 'zh-CN'
LEFT JOIN localized_text AS entry_description
    ON entry_description.text_key = e.description_text_key AND entry_description.locale = 'zh-CN'
LEFT JOIN localized_text AS risk_description
    ON risk_description.text_key = e.risk_text_key AND risk_description.locale = 'zh-CN'
LEFT JOIN entry_affix AS ea ON ea.entry_id = e.entry_id
LEFT JOIN affix AS a ON a.affix_id = ea.affix_id
LEFT JOIN localized_text AS affix_name
    ON affix_name.text_key = a.name_text_key AND affix_name.locale = 'zh-CN'
LEFT JOIN localized_text AS affix_description
    ON affix_description.text_key = a.description_text_key AND affix_description.locale = 'zh-CN'
LEFT JOIN affix_effect AS af ON af.affix_id = a.affix_id
LEFT JOIN effect AS fx ON fx.effect_id = af.effect_id
LEFT JOIN localized_text AS effect_description
    ON effect_description.text_key = fx.description_text_key AND effect_description.locale = 'zh-CN'
WHERE e.entry_kind = 'sealed';
"""


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _optional_json(value: Any) -> str | None:
    return None if value is None else _json(value)


def _required_string(row: Mapping[str, Any], key: str) -> str:
    value = row.get(key)
    if not isinstance(value, (str, int)) or str(value) == "":
        raise ValueError(f"Expected non-empty '{key}' in normalized row: {row!r}")
    return str(value)


def _iter_rows(payload: Any) -> Iterable[tuple[str, Any]]:
    """Accept common exporter shapes without interpreting their columns."""

    if isinstance(payload, Mapping) and "rows" in payload:
        payload = payload["rows"]
    if isinstance(payload, Mapping):
        for row_id, row in payload.items():
            yield str(row_id), row
        return
    if isinstance(payload, list):
        for index, row in enumerate(payload):
            if isinstance(row, Mapping):
                row_id = next(
                    (
                        row[key]
                        for key in ("id", "ID", "Id", "key", "Key", "_key")
                        if key in row and row[key] not in (None, "")
                    ),
                    index,
                )
            else:
                row_id = index
            yield str(row_id), row
        return
    raise ValueError(f"Unsupported table export shape: {type(payload).__name__}")


def import_table_exports(connection: sqlite3.Connection, root: Path) -> int:
    """Preserve all rows from recursively discovered JSON table exports."""

    if not Path(root).is_dir():
        raise NotADirectoryError(f"Table export directory does not exist: {root}")
    imported = 0
    for source_file in sorted(Path(root).rglob("*.json")):
        with source_file.open(encoding="utf-8-sig") as handle:
            payload = json.load(handle)
        for row_id, row in _iter_rows(payload):
            connection.execute(
                """
                INSERT INTO source_row(table_name, row_id, payload_json, source_file)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(table_name, row_id) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    source_file = excluded.source_file
                """,
                (source_file.stem, row_id, _json(row), str(source_file.resolve())),
            )
            imported += 1
    return imported


def import_normalized(connection: sqlite3.Connection, dataset: Mapping[str, Any]) -> dict[str, int]:
    """Import the stable interchange format into relational query tables."""

    counts = {"texts": 0, "effects": 0, "affixes": 0, "entries": 0}

    for key, value in (dataset.get("metadata") or {}).items():
        connection.execute(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)",
            (f"dataset.{key}", str(value)),
        )

    for row in dataset.get("texts") or []:
        text_key = _required_string(row, "id")
        locale = _required_string(row, "locale")
        text = _required_string(row, "text")
        connection.execute(
            """
            INSERT INTO localized_text(text_key, locale, text, source_table, raw_json)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(text_key, locale) DO UPDATE SET
                text = excluded.text,
                source_table = excluded.source_table,
                raw_json = excluded.raw_json
            """,
            (text_key, locale, text, row.get("sourceTable"), _json(row)),
        )
        counts["texts"] += 1

    for row in dataset.get("effects") or []:
        effect_id = _required_string(row, "id")
        connection.execute(
            """
            INSERT INTO effect(
                effect_id, effect_kind, description_text_key, formula_json,
                parameters_json, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(effect_id) DO UPDATE SET
                effect_kind = excluded.effect_kind,
                description_text_key = excluded.description_text_key,
                formula_json = excluded.formula_json,
                parameters_json = excluded.parameters_json,
                raw_json = excluded.raw_json
            """,
            (
                effect_id,
                row.get("kind"),
                row.get("descriptionTextId"),
                _optional_json(row.get("formula")),
                _optional_json(row.get("parameters")),
                _json(row),
            ),
        )
        counts["effects"] += 1

    for row in dataset.get("affixes") or []:
        affix_id = _required_string(row, "id")
        system = _required_string(row, "system")
        connection.execute(
            """
            INSERT INTO affix(
                affix_id, system, class_id, group_id, name_text_key,
                description_text_key, min_value, max_value, unit, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(affix_id) DO UPDATE SET
                system = excluded.system,
                class_id = excluded.class_id,
                group_id = excluded.group_id,
                name_text_key = excluded.name_text_key,
                description_text_key = excluded.description_text_key,
                min_value = excluded.min_value,
                max_value = excluded.max_value,
                unit = excluded.unit,
                raw_json = excluded.raw_json
            """,
            (
                affix_id,
                system,
                row.get("classId"),
                row.get("groupId"),
                row.get("nameTextId"),
                row.get("descriptionTextId"),
                row.get("minValue"),
                row.get("maxValue"),
                row.get("unit"),
                _json(row),
            ),
        )
        for position, effect_ref in enumerate(row.get("effectIds") or []):
            effect_id = (
                str(effect_ref.get("id"))
                if isinstance(effect_ref, Mapping)
                else str(effect_ref)
            )
            connection.execute(
                """
                INSERT OR REPLACE INTO affix_effect(affix_id, effect_id, position)
                VALUES (?, ?, ?)
                """,
                (affix_id, effect_id, position),
            )
        counts["affixes"] += 1

    for row in dataset.get("entries") or []:
        entry_id = _required_string(row, "id")
        entry_kind = _required_string(row, "kind")
        connection.execute(
            """
            INSERT INTO game_entry(
                entry_id, entry_kind, quality, slot, name_text_key,
                description_text_key, risk_text_key, icon, raw_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(entry_id) DO UPDATE SET
                entry_kind = excluded.entry_kind,
                quality = excluded.quality,
                slot = excluded.slot,
                name_text_key = excluded.name_text_key,
                description_text_key = excluded.description_text_key,
                risk_text_key = excluded.risk_text_key,
                icon = excluded.icon,
                raw_json = excluded.raw_json
            """,
            (
                entry_id,
                entry_kind,
                row.get("quality"),
                row.get("slot"),
                row.get("nameTextId"),
                row.get("descriptionTextId"),
                row.get("riskTextId"),
                row.get("icon"),
                _json(row),
            ),
        )
        for position, affix_ref in enumerate(row.get("affixes") or []):
            if isinstance(affix_ref, Mapping):
                affix_id = _required_string(affix_ref, "id")
                pool = affix_ref.get("pool")
                weight = affix_ref.get("weight")
                raw_json = _json(affix_ref)
            else:
                affix_id = str(affix_ref)
                pool = None
                weight = None
                raw_json = None
            connection.execute(
                """
                INSERT OR REPLACE INTO entry_affix(
                    entry_id, affix_id, pool, weight, position, raw_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (entry_id, affix_id, pool, weight, position, raw_json),
            )
        counts["entries"] += 1

    return counts


def database_summary(connection: sqlite3.Connection) -> dict[str, Any]:
    tables = (
        "source_asset",
        "source_row",
        "localized_text",
        "effect",
        "affix",
        "game_entry",
        "entry_affix",
        "affix_effect",
    )
    counts = {
        table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        for table in tables
    }
    kinds = dict(
        connection.execute(
            "SELECT entry_kind, COUNT(*) FROM game_entry GROUP BY entry_kind ORDER BY entry_kind"
        ).fetchall()
    )
    return {"counts": counts, "entriesByKind": kinds}


def build_database(
    output: Path,
    manifest: Path,
    *,
    table_exports: Path | None = None,
    normalized: Path | None = None,
    replace: bool = False,
) -> dict[str, Any]:
    """Create a complete database from the currently available input layers."""

    output = Path(output)
    if output.exists() and not replace:
        raise FileExistsError(f"Database already exists: {output}; pass replace=True to rebuild")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_file = tempfile.NamedTemporaryFile(
        dir=output.parent,
        prefix=f".{output.name}.",
        suffix=".tmp",
        delete=False,
    )
    temporary_file.close()
    temporary_output = Path(temporary_file.name)

    sources = discover_sources(Path(manifest))
    connection = sqlite3.connect(temporary_output)
    try:
        connection.executescript(SCHEMA_SQL)
        connection.execute(
            "INSERT INTO metadata(key, value) VALUES ('schema_version', ?)",
            (SCHEMA_VERSION,),
        )
        connection.execute(
            "INSERT INTO metadata(key, value) VALUES ('built_at_utc', ?)",
            (datetime.now(UTC).isoformat(),),
        )
        connection.execute(
            "INSERT INTO metadata(key, value) VALUES ('manifest', ?)",
            (str(Path(manifest).resolve()),),
        )
        connection.executemany(
            """
            INSERT INTO source_asset(asset_path, table_name, category, role, required)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    source.asset_path,
                    source.table_name,
                    source.category,
                    source.role,
                    int(source.required),
                )
                for source in sources
            ],
        )

        raw_rows = import_table_exports(connection, table_exports) if table_exports else 0
        normalized_counts = {"texts": 0, "effects": 0, "affixes": 0, "entries": 0}
        if normalized:
            with Path(normalized).open(encoding="utf-8-sig") as handle:
                normalized_counts = import_normalized(connection, json.load(handle))
        connection.commit()
        summary = database_summary(connection)
    except Exception:
        connection.close()
        temporary_output.unlink(missing_ok=True)
        raise
    else:
        connection.close()
        os.replace(temporary_output, output)

    return {
        "database": str(output.resolve()),
        "schemaVersion": SCHEMA_VERSION,
        "sourceAssets": len(sources),
        "missingRequiredTables": missing_required_tables(sources),
        "rawRowsImported": raw_rows,
        "normalizedImported": normalized_counts,
        **summary,
    }


def _env_path(name: str) -> Path | None:
    # Via env.optional_dir, whose import loads tools/.env — reading os.environ
    # directly meant the GMZZ_* values documented in .env.example only ever
    # worked as a shell export.
    from .env import optional_dir

    return optional_dir(name)


def _manifest_argument(value: str | None) -> Path:
    if value:
        return Path(value)
    client_root = _env_path("GMZZ_CLIENT_ROOT")
    if client_root:
        return client_root / "Game" / "Manifest_UFSFiles_Win64.txt"
    raise SystemExit("Pass --manifest or set GMZZ_CLIENT_ROOT")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan_parser = subparsers.add_parser("plan", help="write the focused cooked-asset export plan")
    plan_parser.add_argument("--manifest")
    plan_parser.add_argument("--output", required=True)

    build_parser = subparsers.add_parser("build", help="build the SQLite database")
    build_parser.add_argument("--manifest")
    build_parser.add_argument("--tables", type=Path, default=_env_path("GMZZ_TABLE_EXPORT"))
    build_parser.add_argument("--normalized", type=Path)
    build_parser.add_argument("--output", type=Path, default=_env_path("GMZZ_DB_OUT"))
    build_parser.add_argument("--replace", action="store_true")

    inspect_parser = subparsers.add_parser("inspect", help="print database row counts")
    inspect_parser.add_argument("database", type=Path)

    args = parser.parse_args(argv)
    if args.command == "plan":
        payload = write_extraction_plan(_manifest_argument(args.manifest), Path(args.output))
    elif args.command == "build":
        if args.output is None:
            parser.error("Pass --output or set GMZZ_DB_OUT")
        payload = build_database(
            args.output,
            _manifest_argument(args.manifest),
            table_exports=args.tables,
            normalized=args.normalized,
            replace=args.replace,
        )
    else:
        connection = sqlite3.connect(args.database)
        try:
            payload = database_summary(connection)
        finally:
            connection.close()
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
