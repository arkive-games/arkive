"""Tests for dataset assembly and writing."""

import json

import pytest

from lostark.db import Tables
from lostark.emit import build, write
from lostark.env import optional_dir

TABLES = optional_dir("LOSTARK_TABLES")

pytestmark = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)


@pytest.fixture(scope="module")
def dataset():
    return build(Tables(TABLES))


def test_dataset_has_the_expected_files(dataset):
    assert set(dataset) == {
        "battlepoint/dps.json",
        "battlepoint/support.json",
        "gear/item-levels.json",
        "gear/items.json",
        "arkgrid/cores.json",
        "arkgrid/slots.json",
        "arkpassive/trees.json",
        "bracelets/options.json",
        "engravings/list.json",
        "avatars/options.json",
        "combat/stats.json",
        "esther/weapons.json",
        "classes.json",
        "locales/zh-CN.json",
        "locales/ko-KR.json",
        "version.json",
    }


def test_version_records_provenance(dataset):
    version = dataset["version.json"]
    assert version["source"] == "lostark-explorer"
    assert version["locales"] == ["zh-CN", "ko-KR"]
    assert version["generatedAt"]
    assert version["counts"]["arkCores"] == 2160


def test_version_reports_what_was_dropped(dataset):
    # Silence here would read as full coverage when it is not.
    assert dataset["version.json"]["droppedArkCoreValues"]["dps"] == 72


def test_emitted_core_values_all_have_definitions(dataset):
    cores = set(dataset["arkgrid/cores.json"])
    for role in ("dps", "support"):
        values = dataset[f"battlepoint/{role}.json"]["ark_core_values"]
        assert set(values) <= cores, role


def test_coefficients_survive_assembly(dataset):
    assert dataset["battlepoint/dps.json"]["base_rate"] == pytest.approx(0.000288)
    assert len(dataset["battlepoint/dps.json"]["combat_level_amp"]) == 16


def test_write_creates_every_file(tmp_path, dataset):
    write(dataset, tmp_path)
    for name in dataset:
        path = tmp_path / name
        assert path.exists(), name
        json.loads(path.read_text(encoding="utf-8"))


def test_write_refuses_a_path_inside_the_source(tmp_path, dataset):
    with pytest.raises(ValueError, match="inside the source"):
        write(dataset, TABLES / "out", source=TABLES)


def test_write_allows_an_unrelated_path(tmp_path, dataset):
    write(dataset, tmp_path / "out", source=TABLES)
    assert (tmp_path / "out" / "version.json").exists()


def test_slots_carry_resolved_option_descriptions(dataset):
    """Option text must arrive with its numbers filled in, not as directives."""
    slots = dataset["arkgrid/slots.json"]["dps"]
    names = dataset["locales/zh-CN.json"]

    described = 0
    for slot in slots:
        for variants in slot["by_class"].values():
          for variant in variants:
            for grade in variant["grades"].values():
                for key in grade["options"].values():
                    text = names.get(key)
                    if not text:
                        continue
                    # $MACRO and $PLAYER_INFO depend on runtime state and are
                    # deliberately left unresolved; everything else must resolve.
                    if "$MACRO" in text or "$PLAYER_INFO" in text:
                        continue
                    described += 1
                    assert "$TABLE" not in text, text[:80]
                    assert "/>" not in text, text[:80]
    assert described > 20, described


def test_slot_grade_names_resolve(dataset):
    names = dataset["locales/zh-CN.json"]
    grades = {
        g["name_key"]
        for slot in dataset["arkgrid/slots.json"]["dps"]
        for variants in slot["by_class"].values()
        for v in variants
        for g in v["grades"].values()
    }
    assert {names[k] for k in grades} == {"英雄", "传说", "遗物", "古代"}
