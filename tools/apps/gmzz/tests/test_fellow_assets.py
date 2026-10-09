import pytest

from gmzz.fellows import _convert_portraits, _convert_skill_icons


def test_reuse_preserves_existing_art_without_raw_export(tmp_path):
    target = tmp_path / "fellows"
    target.mkdir()
    (target / "portrait.webp").write_bytes(b"existing-portrait")
    (target / "skill.webp").write_bytes(b"existing-skill")
    fellows = [{"id": 1, "name": "Fellow", "_iconCandidates": ["portrait", "other"], "skill": {"icon": "skill"}}]
    assert _convert_portraits(tmp_path / "missing", tmp_path, fellows, True)["reused"] == 1
    assert fellows[0]["portrait"] == "portrait"
    assert _convert_skill_icons(tmp_path / "missing", tmp_path, fellows, True) == (1, [])
    assert (target / "portrait.webp").read_bytes() == b"existing-portrait"
    assert (target / "skill.webp").read_bytes() == b"existing-skill"


def test_reuse_requires_a_real_portrait(tmp_path):
    with pytest.raises(FileNotFoundError, match="No existing portrait"):
        _convert_portraits(tmp_path, tmp_path, [{"id": 1, "_iconCandidates": ["missing"]}], True)


def test_missing_skill_art_is_explicit(tmp_path):
    fellows = [{"name": "Fellow", "skill": {"icon": "missing"}}]
    count, missing = _convert_skill_icons(tmp_path, tmp_path, fellows, True)
    assert count == 0 and len(missing) == 1
    assert fellows[0]["skill"]["icon"] == ""
