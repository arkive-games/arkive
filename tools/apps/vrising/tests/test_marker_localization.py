from __future__ import annotations

import json

import pytest

from vrising.markers.localization import load_boss_localized_names


def _write_language(path, nodes, *, lowercase: bool) -> None:
    if lowercase:
        payload = {"nodes": [{"guid": guid, "text": text} for guid, text in nodes]}
    else:
        payload = {"Nodes": [{"Guid": guid, "Text": text} for guid, text in nodes]}
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def test_boss_names_follow_shared_game_localization_guids(tmp_path):
    guid = "53d5aebb-d82b-4a94-a070-2d79d42a5760"
    _write_language(tmp_path / "English.json", [(guid, "Ziva the Engineer")], lowercase=False)
    _write_language(tmp_path / "SChinese.json", [(guid, "工程师齐瓦")], lowercase=True)
    _write_language(tmp_path / "TChinese.json", [(guid, "工程師齊瓦")], lowercase=True)

    names = load_boss_localized_names(tmp_path, ["Ziva the Engineer"])

    assert names["Ziva the Engineer"] == {
        "en-US": "Ziva the Engineer",
        "zh-CN": "工程师齐瓦",
        "zh-TW": "工程師齊瓦",
    }


def test_legacy_boss_name_aliases_to_the_current_game_name(tmp_path):
    guid = "4ec97a89-7b65-4343-8036-a534785882f6"
    _write_language(tmp_path / "English.json", [(guid, "Alpha the White Wolf")], lowercase=False)
    _write_language(tmp_path / "SChinese.json", [(guid, "白色头狼阿尔法")], lowercase=True)
    _write_language(tmp_path / "TChinese.json", [(guid, "白色頭狼阿爾法")], lowercase=True)

    names = load_boss_localized_names(tmp_path, ["Alpha Wolf"])

    assert names["Alpha Wolf"]["en-US"] == "Alpha the White Wolf"
    assert names["Alpha Wolf"]["zh-CN"] == "白色头狼阿尔法"


def test_missing_official_translation_is_rejected(tmp_path):
    guid = "53d5aebb-d82b-4a94-a070-2d79d42a5760"
    _write_language(tmp_path / "English.json", [(guid, "Ziva the Engineer")], lowercase=False)
    _write_language(tmp_path / "SChinese.json", [], lowercase=True)
    _write_language(tmp_path / "TChinese.json", [(guid, "工程師齊瓦")], lowercase=True)

    with pytest.raises(ValueError, match="zh-CN"):
        load_boss_localized_names(tmp_path, ["Ziva the Engineer"])
