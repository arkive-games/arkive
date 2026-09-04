"""The export-freshness guard: an export has to come from the assembled patched view."""

from __future__ import annotations

import pytest

from gmzz import env
from gmzz.env import BUILD_MARKER, assembled_build, check_export_current, export_build


def _patched(tmp_path, build: str | None):
    patched = tmp_path / "patched"
    content = patched / "C7" / "Content"
    content.mkdir(parents=True)
    if build is not None:
        (content / "package.txt").write_text(build)
    return patched


def _export(tmp_path, build: str | None):
    raw = tmp_path / "raw"
    marker = raw / BUILD_MARKER
    marker.parent.mkdir(parents=True)
    if build is not None:
        marker.write_text(f"{build}\n")
    return raw


def test_reads_the_marker_and_the_assembled_build(tmp_path):
    assert export_build(_export(tmp_path, "2097705")) == "2097705"
    assert export_build(_export(tmp_path / "bare", None)) is None
    assert assembled_build(_patched(tmp_path, "2097705")) == "2097705"
    assert assembled_build(tmp_path / "nowhere") is None


def test_accepts_an_export_of_the_assembled_build(tmp_path, monkeypatch):
    monkeypatch.setenv("GMZZ_PATCHED", str(_patched(tmp_path, "2097705")))
    check_export_current(_export(tmp_path, "2097705"))


def test_refuses_an_export_of_the_bare_install(tmp_path, monkeypatch):
    monkeypatch.setenv("GMZZ_PATCHED", str(_patched(tmp_path, "2097705")))
    with pytest.raises(RuntimeError, match="bare install"):
        check_export_current(_export(tmp_path, None))


def test_refuses_an_export_behind_the_assembled_build(tmp_path, monkeypatch):
    monkeypatch.setenv("GMZZ_PATCHED", str(_patched(tmp_path, "2097705")))
    with pytest.raises(RuntimeError, match="build 2044036, but .* holds build 2097705"):
        check_export_current(_export(tmp_path, "2044036"))


def test_is_silent_without_an_assembled_view(tmp_path, monkeypatch):
    monkeypatch.delenv("GMZZ_PATCHED", raising=False)
    check_export_current(_export(tmp_path, None))
    monkeypatch.setenv("GMZZ_PATCHED", str(_patched(tmp_path, None)))
    check_export_current(_export(tmp_path / "other", None))


def test_excel_dir_runs_the_check(tmp_path, monkeypatch):
    monkeypatch.setenv("GMZZ_RAW", str(_export(tmp_path, None)))
    monkeypatch.setenv("GMZZ_PATCHED", str(_patched(tmp_path, "2097705")))
    with pytest.raises(RuntimeError, match="bare install"):
        env.excel_dir()
