"""Contract tests for the bracelet option lines and their BattlePoint decode.

Read out of the live CN client tables on 2026-08-05. The values pinned here are the
evidence for the decode: Types 19/20/21 reproduce every bracelet number the fan site
hard-coded, so if a patch moves them these fail rather than quietly regressing the
calculator back to fan-site accuracy.
"""

import pytest

from lostark import locales
from lostark.battlepoint import DPS, SUPPORT
from lostark.bracelets import (
    COLUMN_KEYS,
    OPTION_GROUPS,
    STAT_NAME_KEYS,
    UI_KEYS,
    localization_keys,
    option_groups,
    option_lines,
    unnamed_stats,
)
from lostark.db import Tables
from lostark.env import optional_dir

TABLES = optional_dir("LOSTARK_TABLES")

pytestmark = pytest.mark.skipif(
    TABLES is None or not TABLES.exists(), reason="LOSTARK_TABLES not set"
)


@pytest.fixture(scope="module")
def lines():
    return option_lines(Tables(TABLES))


@pytest.fixture(scope="module")
def by_id(lines):
    return {line["id"]: line for line in lines}


def test_groups_are_the_clients_four_labels():
    assert [g["name_key"] for g in option_groups()] == [
        "sys.bracelet.option_group_01",
        "sys.bracelet.option_group_02",
        "sys.bracelet.option_group_03",
        "sys.bracelet.option_group_04",
    ]


def test_option_groups_returns_copies():
    option_groups()[0]["key"] = "mutated"
    assert OPTION_GROUPS[0]["key"] == "basic"


def test_the_three_columns_are_the_groups_every_shipped_pool_offers(lines):
    """Only the legacy pool 910000010 uses the fourth label.

    Every ``2133…``/``2134…`` pool offers exactly groups 01/02/03, which is why the UI
    gets three columns and not four. Asserted so that a patch adding a real fourth
    column is noticed instead of being silently dropped.
    """
    assert COLUMN_KEYS == ["basic", "combat_trait", "engraving"]
    tiered = {line["group_key"] for line in lines if line["tiers"]}
    assert tiered == set(COLUMN_KEYS)


def test_every_column_has_lines(lines):
    for key in COLUMN_KEYS:
        assert [line for line in lines if line["group_key"] == key], key


def test_ability_lines_read_desc_not_name(by_id):
    """Ability.Name is a raw Korean literal; only Desc is a GameMsg key.

    Reading Name would produce a Korean string in the zh-CN payload and no
    translation at all, which is the exact failure this pins shut.
    """
    line = by_id["e3-11013"]
    assert line["name_key"] == "tip.desc.ability_11013"
    assert line["option_type"] == 3


def test_combat_effect_lines_resolve_through_combateffect(by_id):
    assert by_id["e4-605000001"]["name_key"] == "tip.desc.combateffect_605000001"


def test_type_20_amps_the_addon_lines(by_id):
    """BattlePoint Type 20, ValueA = the option's own Type, ValueB = the option id."""
    # "crit rate +5%, +1.5% damage on crit" -> the fan site's 0.045 crit-rate line.
    assert by_id["e3-11011"]["amp"][DPS] == pytest.approx(0.045)
    assert by_id["e3-11013"]["amp"][DPS] == pytest.approx(0.035)
    # "weapon attack +9000" -> the fan site's flat-attack family.
    assert by_id["e3-11111"]["amp"][DPS] == pytest.approx(0.0065)


def test_type_21_is_support_only_and_defensive(by_id):
    """The four ids 11181-11184 are party shield / party heal, support only.

    That asymmetry is the whole basis for reading Type 20 as the enum's
    ``bracelet_addontype_attack`` and Type 21 as ``…_defense``.
    """
    for suffix, amp in (("1", 0.049), ("2", 0.042), ("3", 0.035), ("4", 0.028)):
        line = by_id[f"e3-1118{suffix}"]
        # heal_amp, NOT amp: Type 21 is the protection and recovery channel, so it
        # feeds the support role's separate heal component the way the orb's and
        # the engravings' heal amps do. It used to be merged into the score amp,
        # which applied it to a base of 8.55 instead of 189.25.
        assert line["heal_amp"][SUPPORT] == pytest.approx(amp), suffix
        assert line["amp"][SUPPORT] == 0.0, suffix
        assert line["heal_amp"][DPS] == 0.0, suffix
        assert line["amp"][DPS] == 0.0, suffix


def test_type_19_is_a_ratio_not_an_amp(by_id):
    """``amp = Value * ValueC / 1e8``, and it is what explains the fan site exactly.

    The fan site's six non-integer bracelet values are this product and nothing else:
    0.0226644 = 680 * 3333 / 1e8 and 0.030768 = 400 * 7692 / 1e8. A Type-20-only
    decode leaves them, and its 0.0238 / 0.0294, unaccounted for.
    """
    assert by_id["s76-680"]["amp"][DPS] == pytest.approx(0.0226644)
    assert by_id["s76-840"]["amp"][DPS] == pytest.approx(0.0279972)
    assert by_id["s76-1000"]["amp"][DPS] == pytest.approx(0.03333)
    assert by_id["s50-400"]["amp"][DPS] == pytest.approx(0.030768)
    assert by_id["s74-340"]["amp"][DPS] == pytest.approx(0.0238)
    assert by_id["s74-420"]["amp"][DPS] == pytest.approx(0.0294)


def test_support_amplify_channels_score_through_type_19(by_id):
    """Types 54/59 have no id to key on, so Type 19's ValueA 2/3 carries their ratio.

    The game offers four grades on each channel; the fan site drops the 0.0225 one.
    """
    attack = [by_id[f"a54-{v}"]["amp"][SUPPORT] for v in (300, 400, 500, 600)]
    damage = [by_id[f"a59-{v}"]["amp"][SUPPORT] for v in (450, 600, 750, 900)]
    assert attack == pytest.approx([0.0225, 0.03, 0.0375, 0.045])
    assert damage == pytest.approx([0.0225, 0.03, 0.0375, 0.045])


def test_every_fan_site_bracelet_value_exists_in_the_game(lines):
    """The reason the fan-site tables can be deleted: nothing is left over.

    All 30 distinct damage-dealer values and all 15 support values that
    ``fansite.generated.ts`` hard-codes appear among the amps derived here, so the
    client is a strict superset rather than a partial replacement.
    """
    fan_site = {
        DPS: [
            0.0054, 0.0059, 0.0065, 0.0105, 0.0113, 0.0121, 0.0126, 0.0147, 0.0175,
            0.0188, 0.02, 0.021, 0.0214, 0.0226644, 0.023076, 0.0238, 0.024, 0.0245,
            0.025, 0.026922, 0.0279972, 0.028, 0.0294, 0.03, 0.030768, 0.03333, 0.034,
            0.035, 0.04, 0.045,
        ],
        SUPPORT: [
            0.0054, 0.0059, 0.0065, 0.0105, 0.0113, 0.0121, 0.0188, 0.0214, 0.024,
            0.03, 0.0375, 0.045, 0.0906, 0.107, 0.1275,
        ],
    }
    for role, values in fan_site.items():
        amps = {round(line["amp"][role], 7) for line in lines}
        missing = [v for v in values if round(v, 7) not in amps]
        assert missing == [], f"{role}: {missing}"


def test_lines_are_uniquely_identified(lines):
    ids = [line["id"] for line in lines]
    assert len(ids) == len(set(ids))


def test_grades_are_a_set_because_they_are_not_stable_per_line(lines):
    """The same effect id is declared at different BraceletOptionGrades across pools.

    605000001 sits at grade 0 in one pool and grade 3 in another, so grade cannot be
    part of a line's identity; it is reported as the set of grades observed.
    """
    multi = [line for line in lines if len(line["grades"]) > 1]
    assert multi, "expected lines seen at more than one grade"
    by_id = {line["id"]: line for line in lines}
    assert by_id["e4-605000001"]["grades"] == [0, 3]


def test_tiers_come_from_the_pool_id(lines):
    for line in lines:
        assert set(line["tiers"]) <= {3, 4}, line["id"]
    assert any(line["tiers"] == [4] for line in lines)


def test_every_key_resolves_in_every_locale(lines):
    keys = localization_keys(lines)
    got = locales.resolve(Tables(TABLES), keys, missing="skip")
    assert set(got) == {"zh-CN", "ko-KR"}
    for locale, table in got.items():
        missing = [k for k in keys if k not in table]
        assert not missing, f"{locale} is missing {len(missing)}: {missing[:5]}"
        blank = [k for k in keys if not (table[k] or "").strip()]
        assert not blank, f"{locale} has blank text for {blank[:5]}"


def test_localization_keys_cover_the_group_labels_and_slot_headings(lines):
    keys = set(localization_keys(lines))
    assert {g["name_key"] for g in OPTION_GROUPS} <= keys
    assert set(UI_KEYS.values()) <= keys


def test_only_stat_11_is_still_unnamed(lines):
    """Seven of the eight unnamed stats now have a name; the eighth has nothing to read.

    ``ItemOptionAlias`` still carries none of them, but ``ArkPassive`` nodes
    1010100…1010600 anchor 15-20 to the six combat traits and ``SkillBuff`` anchors 6
    to 体力 — see :data:`lostark.bracelets.STAT_NAME_KEYS`. Stat **11** appears once
    outside a bracelet, on a ``SkillBuff`` with no description, so it stays unnamed
    rather than being guessed at.

    Pinned so that a future patch shipping a real alias — or a new unnamed stat
    appearing in a scoring column — surfaces here.
    """
    assert unnamed_stats(lines) == [11]
    for line in lines:
        if line["name_key"] is None:
            assert line["amp"][DPS] == 0.0, line["id"]
            assert line["amp"][SUPPORT] == 0.0, line["id"]


def test_the_recovered_stat_names_resolve():
    """The seven recovered name keys are real GameMsg entries in both locales."""
    names = locales.resolve(Tables(TABLES), sorted(STAT_NAME_KEYS.values()))
    for locale, table in names.items():
        for stat_id, key in sorted(STAT_NAME_KEYS.items()):
            assert table.get(key, "").strip(), (locale, stat_id, key)
    assert names["zh-CN"][STAT_NAME_KEYS[15]] == "会心"
    assert names["ko-KR"][STAT_NAME_KEYS[15]] == "치명"
