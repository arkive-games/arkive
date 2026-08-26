import json
from pathlib import Path
import sqlite3

import pytest

from gmzz.database import build_database


def _manifest(tmp_path: Path) -> Path:
    manifest = tmp_path / "Manifest_UFSFiles_Win64.txt"
    manifest.write_text(
        "\n".join(
            [
                "C7/Content/ScriptOPCode/Data/Excel/EquipmentData.luac\tdate",
                "C7/Content/ScriptOPCode/Data/Excel/SealedInfoData.luac\tdate",
                "C7/Content/ScriptOPCode/Data/Excel/BuffDataNew.luac\tdate",
            ]
        ),
        encoding="utf-8",
    )
    return manifest


def _normalized(tmp_path: Path) -> Path:
    path = tmp_path / "normalized.json"
    path.write_text(
        json.dumps(
            {
                "metadata": {"clientVersion": "test-version"},
                "texts": [
                    {"id": "ENTRY_NAME", "locale": "zh-CN", "text": "Test Equipment"},
                    {"id": "AFFIX_NAME", "locale": "zh-CN", "text": "Test Affix"},
                    {"id": "EFFECT_DESC", "locale": "zh-CN", "text": "Increase attack"},
                ],
                "effects": [
                    {
                        "id": "BUFF_1",
                        "kind": "buff",
                        "descriptionTextId": "EFFECT_DESC",
                        "parameters": {"percent": 10},
                    }
                ],
                "affixes": [
                    {
                        "id": "AFFIX_1",
                        "system": "equipment",
                        "nameTextId": "AFFIX_NAME",
                        "minValue": 5,
                        "maxValue": 10,
                        "unit": "percent",
                        "effectIds": ["BUFF_1"],
                    }
                ],
                "entries": [
                    {
                        "id": "ITEM_1",
                        "kind": "equipment",
                        "nameTextId": "ENTRY_NAME",
                        "quality": "rare",
                        "slot": "weapon",
                        "affixes": [{"id": "AFFIX_1", "pool": "weapon", "weight": 100}],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return path


def test_build_database_preserves_raw_rows_and_flattens_search(tmp_path):
    exports = tmp_path / "tables"
    exports.mkdir()
    (exports / "EquipmentData.json").write_text(
        json.dumps({"rows": {"ITEM_1": {"Quality": "rare", "UnknownFutureField": 42}}}),
        encoding="utf-8",
    )
    output = tmp_path / "gmzz.sqlite"

    summary = build_database(
        output,
        _manifest(tmp_path),
        table_exports=exports,
        normalized=_normalized(tmp_path),
    )

    assert summary["rawRowsImported"] == 1
    assert summary["normalizedImported"] == {
        "texts": 3,
        "effects": 1,
        "affixes": 1,
        "entries": 1,
    }

    connection = sqlite3.connect(output)
    connection.row_factory = sqlite3.Row
    try:
        raw = json.loads(
            connection.execute(
                "SELECT payload_json FROM source_row WHERE table_name = 'EquipmentData'"
            ).fetchone()[0]
        )
        search = dict(connection.execute("SELECT * FROM equipment_search_zh_cn").fetchone())
        metadata = dict(connection.execute("SELECT key, value FROM metadata").fetchall())
    finally:
        connection.close()

    assert raw["UnknownFutureField"] == 42
    assert search["entry_name"] == "Test Equipment"
    assert search["affix_name"] == "Test Affix"
    assert search["effect_description"] == "Increase attack"
    assert json.loads(search["parameters_json"]) == {"percent": 10}
    assert metadata["dataset.clientVersion"] == "test-version"


def test_build_refuses_to_overwrite_without_replace(tmp_path):
    output = tmp_path / "gmzz.sqlite"
    build_database(output, _manifest(tmp_path))

    with pytest.raises(FileExistsError):
        build_database(output, _manifest(tmp_path))

    rebuilt = build_database(output, _manifest(tmp_path), replace=True)
    assert rebuilt["database"] == str(output.resolve())


def test_failed_rebuild_keeps_the_previous_database(tmp_path):
    output = tmp_path / "gmzz.sqlite"
    build_database(output, _manifest(tmp_path))
    original = output.read_bytes()

    with pytest.raises(NotADirectoryError):
        build_database(
            output,
            _manifest(tmp_path),
            table_exports=tmp_path / "missing-tables",
            replace=True,
        )

    assert output.read_bytes() == original
