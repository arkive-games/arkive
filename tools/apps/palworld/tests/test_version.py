import json

from palworld.version import stamp_version


def _write(root, rel, text):
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def test_stamp_writes_version_file(tmp_path):
    _write(tmp_path, "maps.json", '{"maps": []}')
    v = stamp_version(tmp_path)
    on_disk = json.loads((tmp_path / "version.json").read_text(encoding="utf-8"))
    assert on_disk == {"version": v}
    assert len(v) == 12 and int(v, 16) >= 0


def test_restamp_is_stable(tmp_path):
    """version.json itself is excluded from the digest, so stamping an
    unchanged artifact twice yields the same version (no spurious cache bust)."""
    _write(tmp_path, "maps.json", '{"maps": []}')
    _write(tmp_path, "locales/en-US/maps.json", "{}")
    assert stamp_version(tmp_path) == stamp_version(tmp_path)


def test_content_change_changes_version(tmp_path):
    _write(tmp_path, "maps.json", '{"maps": []}')
    v1 = stamp_version(tmp_path)
    _write(tmp_path, "maps.json", '{"maps": [1]}')
    v2 = stamp_version(tmp_path)
    assert v1 != v2


def test_new_file_changes_version(tmp_path):
    _write(tmp_path, "maps.json", '{"maps": []}')
    v1 = stamp_version(tmp_path)
    _write(tmp_path, "markers/MainWorld.json", '{"markers": []}')
    assert stamp_version(tmp_path) != v1


def test_dot_paths_ignored(tmp_path):
    """The data repos are git repos — .git internals must not affect the version."""
    _write(tmp_path, "maps.json", '{"maps": []}')
    v1 = stamp_version(tmp_path)
    _write(tmp_path, ".git/index.json", "x")
    _write(tmp_path, ".gitignore", "y")
    assert stamp_version(tmp_path) == v1
