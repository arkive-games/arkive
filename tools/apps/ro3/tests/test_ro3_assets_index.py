"""Tests for turning the bundle catalogue into dataset rows.

The index is where a wrong join would invent content, so the tests are mostly about what
must *not* happen: a boss keeps ``portrait: null`` unless the names really normalise to the
same string, a resolution-variant bundle never contributes a second row, and no row is
given a display name the game does not ship.
"""

from __future__ import annotations

import json

from ro3 import assets_index, catalog


def write_catalog(tmp_path, records):
    path = tmp_path / catalog.CATALOG
    path.write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8"
    )
    return path


def record(bundle, *objects):
    return {"bundle": bundle, "objects": [
        {"pathId": i, "class": c, "name": n} for i, (c, n) in enumerate(objects)
    ]}


def test_read_ignores_resolution_variant_bundles(tmp_path):
    path = write_catalog(tmp_path, [
        record("a1/base.bundle", ("Sprite", "icon_skill_acolyte_blessing")),
        record("a1/base.bundle.hd.bundle", ("Sprite", "icon_skill_acolyte_blessing")),
        record("a1/base.bundle.ld.bundle", ("Sprite", "icon_skill_acolyte_blessing")),
    ])
    index = assets_index.read(path)

    assert index["Sprite"]["icon_skill_acolyte_blessing"] == {"a1/base.bundle"}


def test_skills_take_their_family_from_the_icon_name(tmp_path):
    path = write_catalog(tmp_path, [record(
        "a/b.bundle",
        ("Sprite", "icon_skill_acolyte_blessing"),
        ("Sprite", "icon_skill_runeknight_dragonwaterbreath"),
        ("Sprite", "icon_skill_acolyte_angelus"),
        ("Sprite", "common_btn_close"),
    )])
    rows = assets_index.skills(assets_index.read(path))

    assert [r["id"] for r in rows] == [
        "acolyte_angelus", "acolyte_blessing", "runeknight_dragonwaterbreath",
    ]
    assert {r["family"] for r in rows} == {"acolyte", "runeknight"}
    assert rows[0]["icon"] == "icons/skills/icon_skill_acolyte_angelus.webp"
    assert "name" not in rows[0] and "description" not in rows[0]


def test_a_single_token_skill_id_has_no_family(tmp_path):
    """25 icons are named `icon_skill_judex` with nothing to split on. The family is then
    null rather than the whole id, so a consumer cannot mistake it for a class."""
    path = write_catalog(tmp_path, [record(
        "a/b.bundle", ("Sprite", "icon_skill_judex"), ("Sprite", "icon_skill_middleheal"),
    )])
    rows = assets_index.skills(assets_index.read(path))

    assert [r["id"] for r in rows] == ["judex", "middleheal"]
    assert [r["family"] for r in rows] == [None, None]


def test_every_skill_icon_gets_a_row(tmp_path):
    """The row count must equal the icon count; a row without art, or art without a row,
    is a silent gap in the dataset."""
    names = ["icon_skill_acolyte_blessing", "icon_skill_judex", "icon_skill_totem_hit_purple"]
    path = write_catalog(tmp_path, [record("a/b.bundle", *(("Sprite", n) for n in names))])
    rows = assets_index.skills(assets_index.read(path))

    assert {r["icon"] for r in rows} == {f"icons/skills/{n}.webp" for n in names}


def test_talents_are_kept_apart_from_skills(tmp_path):
    path = write_catalog(tmp_path, [record(
        "a/b.bundle",
        ("Sprite", "icon_talent_assassin_poison_blade"),
        ("Sprite", "icon_skill_assassin_venomdust"),
    )])
    index = assets_index.read(path)

    assert [r["id"] for r in assets_index.skills(index)] == ["assassin_venomdust"]
    assert [r["id"] for r in assets_index.talents(index)] == ["assassin_poison_blade"]


def test_job_icons_group_their_size_variants(tmp_path):
    path = write_catalog(tmp_path, [record(
        "a/b.bundle",
        ("Sprite", "icon_job_acolyte"),
        ("Sprite", "icon_job_acolyte_s"),
        ("Sprite", "icon_job_novice_s"),
    )])
    icons = assets_index.job_icons(assets_index.read(path))

    assert icons["acolyte"] == [
        "icons/jobs/icon_job_acolyte.webp", "icons/jobs/icon_job_acolyte_s.webp",
    ]
    assert icons["novice"] == ["icons/jobs/icon_job_novice_s.webp"]


def test_a_boss_records_the_lods_that_ship(tmp_path):
    path = write_catalog(tmp_path, [record(
        "a/b.bundle",
        ("Mesh", "Model_Boss_BaphometHigh_LOD0"),
        ("Mesh", "Model_Boss_BaphometHigh_LOD1"),
        ("Mesh", "Model_Boss_BaphometHigh_LOD2"),
        ("Texture2D", "Model_Boss_BaphometHigh_LOD0"),
        ("Sprite", "headicon_monster_baphomet"),
    )])
    (row,) = assets_index.bosses(assets_index.read(path))

    assert row["id"] == "BaphometHigh"
    assert row["lods"] == [0, 1, 2]
    assert row["portrait"] == "icons/monsters/headicon_monster_baphomet.webp"
    assert row["baseColorMap"] == "bosses/models/Model_Boss_BaphometHigh_LOD0.webp"


def test_a_boss_with_no_matching_portrait_keeps_null(tmp_path):
    path = write_catalog(tmp_path, [record(
        "a/b.bundle",
        ("Mesh", "Model_Boss_KrakenLegHigh_LOD0"),
        ("Sprite", "headicon_monster_poring"),
    )])
    (row,) = assets_index.bosses(assets_index.read(path))

    assert row["portrait"] is None
    assert row["baseColorMap"] is None


def test_a_boss_portrait_is_matched_past_the_quality_suffix(tmp_path):
    """Models carry High/Low/Middle/Fine; the portraits do not."""
    path = write_catalog(tmp_path, [record(
        "a/b.bundle",
        ("Mesh", "Model_Boss_BloodyKnightHigh_LOD0"),
        ("Sprite", "headicon_monster_bloody_knight"),
    )])
    (row,) = assets_index.bosses(assets_index.read(path))
    assert row["portrait"] == "icons/monsters/headicon_monster_bloody_knight.webp"


def test_a_raid_boss_portrait_comes_from_the_boss_directory(tmp_path):
    path = write_catalog(tmp_path, [record(
        "a/b.bundle",
        ("Mesh", "Model_Boss_Nessa_LOD0"),
        ("Sprite", "headicon_boss_nessa"),
    )])
    (row,) = assets_index.bosses(assets_index.read(path))
    assert row["portrait"] == "bosses/portraits/headicon_boss_nessa.webp"


def test_monsters_list_the_models_that_normalise_to_their_name(tmp_path):
    path = write_catalog(tmp_path, [record(
        "a/b.bundle",
        ("Sprite", "headicon_monster_alice"),
        ("Mesh", "Model_MonsterJunior_AliceHigh_LOD0"),
        ("Mesh", "Model_MonsterJunior_AliceHigh_LOD1"),
        ("Mesh", "Model_MonsterJunior_PoringLow_LOD0"),
    )])
    (row,) = assets_index.monsters(assets_index.read(path))

    assert row["id"] == "alice"
    assert row["models"] == ["AliceHigh"]


def test_dungeon_art_is_listed_for_any_dungeon_named_sprite(tmp_path):
    path = write_catalog(tmp_path, [record(
        "a/b.bundle",
        ("Sprite", "dungeon_bg_bar01"),
        ("Sprite", "Fx_Tex_UI_dungeon_img_card04"),
        ("Sprite", "common_btn_close"),
    )])
    assert assets_index.dungeon_art(assets_index.read(path)) == [
        "icons/dungeons/Fx_Tex_UI_dungeon_img_card04.webp",
        "icons/dungeons/dungeon_bg_bar01.webp",
    ]
