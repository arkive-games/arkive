from pathlib import Path

from lom.sources import discover_sources, missing_required_tables, write_extraction_plan


def _manifest(tmp_path: Path) -> Path:
    manifest = tmp_path / "Manifest_UFSFiles_Win64.txt"
    manifest.write_text(
        "\n".join(
            [
                "C7/Content/ScriptOPCode/Data/Excel/EquipmentData.luac\tdate",
                "C7/Content/ScriptOPCode/Data/Excel/Annotation/Anno_EquipmentData.luac\tdate",
                "C7/Content/ScriptOPCode/Data/Excel/SealedInfoData.luac\tdate",
                "C7/Content/ScriptOPCode/Data/Excel/LanguageData/"
                "StringDB_CN_Data_buffdata.luac\tdate",
                "C7/Content/ScriptOPCode/Data/Excel/UnrelatedTable.luac\tdate",
                "C7/Content/Arts/EquipmentData.uasset\tdate",
            ]
        ),
        encoding="utf-8",
    )
    return manifest


def test_discover_sources_filters_and_classifies(tmp_path):
    sources = discover_sources(_manifest(tmp_path))

    assert [(source.table_name, source.category, source.role) for source in sources] == [
        ("EquipmentData", "equipment", "data"),
        ("Anno_EquipmentData", "equipment", "annotation"),
        ("StringDB_CN_Data_buffdata", "localization", "localization"),
        ("SealedInfoData", "sealed", "data"),
    ]
    assert sources[0].required is True
    assert "EquipmentData" not in missing_required_tables(sources)
    assert "SealedExtraEffectData" in missing_required_tables(sources)


def test_write_extraction_plan_is_reviewable(tmp_path):
    output = tmp_path / "plan.json"
    payload = write_extraction_plan(_manifest(tmp_path), output)

    assert output.is_file()
    assert payload["assetCount"] == 4
    assert payload["assets"][0]["asset_path"].endswith("EquipmentData.luac")
