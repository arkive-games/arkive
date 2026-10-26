import json
from pathlib import Path

import pytest

from gmzz.secretpartners import build_attributes, build_level_unlock_days, build_records, build_scoring, portrait_path
from gmzz import secretpartners


def sample():
    return ({'1': {'ID': 1, 'Name': 'Puppet', 'Quality': 6, 'SkillID': 10, 'Prop_Talent': [100]}},
            {10: {'ID': 10, 'Name': 'Skill', 'Tag': 'Control', 'DesTags': [2],
                  'SkillDisc': 'Deal *d damage for <b>6</> seconds.', 'CD': 23}},
            {'11': {'ID': 11, 'PuppetID': 1, 'SkillStar': 2, 'PartnerStar': 10, 'ImproveText': 'More damage'}},
            {2: 'Area'}, {1: [{'key': 'MaxHp_P', 'name': 'Max HP', 'format': 'percent', 'values': [0.0018, 0.0036]}]})


def test_explicit_skill_tier_and_puppet_stage():
    record = build_records(*sample())[0]
    assert record['upgrades'] == [{'tier': 2, 'requiredStage': 10, 'description': 'More damage'}]
    assert record['category'] == 'Control'
    assert record['skill']['tags'] == ['Area']
    assert record['skill']['hasFormula']
    assert record['skill']['description'] == 'Deal … damage for <b>6</> seconds.'


def test_missing_skill_fails():
    config, _, upgrades, tags, attributes = sample()
    with pytest.raises(ValueError, match='Missing skill'):
        build_records(config, {}, upgrades, tags, attributes)


def test_unknown_upgrade_puppet_fails():
    config, skills, upgrades, tags, attributes = sample()
    upgrades['11']['PuppetID'] = 999
    with pytest.raises(ValueError, match='Unknown puppet'):
        build_records(config, skills, upgrades, tags, attributes)


def test_unknown_tag_fails():
    config, skills, upgrades, _, attributes = sample()
    with pytest.raises(ValueError, match='Unknown skill tag'):
        build_records(config, skills, upgrades, {}, attributes)


def test_missing_tiers_fail():
    config, skills, _, tags, attributes = sample()
    with pytest.raises(ValueError, match='Missing or duplicate'):
        build_records(config, skills, {}, tags, attributes)


def test_portrait_missing_is_explicit(tmp_path: Path):
    assert portrait_path(tmp_path, '/Game/Portraits/Test.Test') is None
    assert portrait_path(tmp_path, '') is None


def test_percent_escape_and_brief_formulas_are_formatted():
    config, skills, upgrades, tags, attributes = sample()
    skills[10]['SkillDisc'] = 'Chance *f**.'
    skills[10]['BriefDescription'] = 'Duration *s.'
    skill = build_records(config, skills, upgrades, tags, attributes)[0]['skill']
    assert skill['description'] == 'Chance \u2026%.'
    assert skill['brief'] == 'Duration \u2026.'
    assert skill['hasFormula']


def test_reused_puppet_art_is_required_and_unchanged(tmp_path: Path, monkeypatch):
    config, skills, upgrades, tags, _ = sample()
    tables = {
        'SecretPartnerConfigData': config,
        'SkillDataNew_split_1': skills,
        'SkillTagData': {str(key): {'ID': key, 'Tag': value} for key, value in tags.items()},
        'SecretPartnerSkillStarUpData': upgrades,
        'SecretPartnerTalentData': {'100': {'ID': 100, 'Type': 2, 'StarUpDescribe1': 'Max HP'}},
        'SecretPartnerTalentStarUpData': {'10001': {'TalentID': 100, 'Star': 1, 'FightProp': {'MaxHp_P': [0.0018]}, 'Mark': 20}},
        'FightPropModeData': {'1': {'PropMode': 'MaxHp_P', 'ShowType': 1}},
        'FightPropModeSetData': {},
        'SecretPartnerConstData': {**scoring_sample(), 'SECRET_PARTNER_MAX_STAR': 1},
        'SecretPartnerStarUpData': {'1': {'ID': 1, 'SeasonID': 100, 'SecretPartner_LevelUnlockTime': 0}},
    }
    monkeypatch.setattr(secretpartners, 'load_strings', lambda _: {})
    monkeypatch.setattr(secretpartners, 'load_table', lambda _, name: tables[name])
    monkeypatch.setattr(secretpartners, 'resolve_text', lambda table, _: table)
    monkeypatch.setattr(secretpartners, 'check_export_current', lambda _: None)
    resources = tmp_path / 'res'
    output = tmp_path / 'data'
    with pytest.raises(FileNotFoundError, match='Missing existing puppet portrait'):
        secretpartners.build(tmp_path / 'raw', output, resources, reuse_assets=True)
    assert not (output / 'secretpartners/secretpartners.json').exists()
    portrait = resources / 'secretpartners/1.webp'
    portrait.write_bytes(b'')
    with pytest.raises(FileNotFoundError, match='Missing existing puppet portrait'):
        secretpartners.build(tmp_path / 'raw', output, resources, reuse_assets=True)
    portrait.write_bytes(b'existing-art')
    result = secretpartners.build(tmp_path / 'raw', output, resources, reuse_assets=True)
    assert result['portraits'] == 1 and result['missing'] == []
    assert portrait.read_bytes() == b'existing-art'
    scoring = json.loads((output / 'secretpartners/scoring.json').read_text(encoding='utf-8'))
    assert scoring == {'inDominateRate': 1, 'nonDominateRate': 0.35, 'initialDominateSlots': 1,
                       'maxDominateSlots': 8, 'maxStar': 1, 'levelUnlockDays': [0]}


def test_stale_export_is_rejected_before_loading_tables(tmp_path: Path, monkeypatch):
    def reject(_):
        raise RuntimeError('Stale export')
    monkeypatch.setattr(secretpartners, 'check_export_current', reject)
    with pytest.raises(RuntimeError, match='Stale export'):
        secretpartners.build(tmp_path / 'raw', tmp_path / 'data', tmp_path / 'res', reuse_assets=True)
    assert not (tmp_path / 'data').exists()


def growth_sample():
    return (sample()[0], {'100': {'ID': 100, 'Type': 2, 'StarUpDescribe1': 'Max HP'}},
            {'2': {'TalentID': 100, 'Star': 2, 'FightProp': {'MaxHp_P': [0.0035]}, 'Mark': 40},
             '1': {'TalentID': 100, 'Star': 1, 'FightProp': {'MaxHp_P': [0.0018]}, 'Mark': 20}},
            {'1': {'PropMode': 'MaxHp_P', 'ShowType': 1}}, {}, 2)


def test_base_attributes_preserve_exact_per_level_values():
    attributes = build_attributes(*growth_sample())
    assert attributes[1] == [{'key': 'MaxHp_P', 'name': 'Max HP', 'format': 'percent',
                              'values': [0.0018, 0.0035], 'marks': [20, 40]}]
    config, skills, upgrades, tags, _ = sample()
    assert build_records(config, skills, upgrades, tags, attributes)[0]['attributes'] == attributes[1]


def test_grouped_attributes_use_member_display_format():
    config, talents, growth, modes, _, maximum = growth_sample()
    for row in growth.values():
        row['FightProp'] = {'AllAttack_N': [7]}
    modes = {'1': {'PropMode': 'Physical_N', 'ShowType': 0}, '2': {'PropMode': 'Magic_N', 'ShowType': 0}}
    groups = {'1': {'Prop': 'AllAttack_N', 'PropNameSet': ['Physical_N', 'Magic_N']}}
    assert build_attributes(config, talents, growth, modes, groups, maximum)[1][0]['format'] == 'number'
    modes['2']['ShowType'] = 1
    with pytest.raises(ValueError, match='inconsistent attribute format'):
        build_attributes(config, talents, growth, modes, groups, maximum)


def test_decimal_display_type_is_not_a_percentage():
    config, talents, growth, modes, groups, maximum = growth_sample()
    modes['1']['ShowType'] = 2
    assert build_attributes(config, talents, growth, modes, groups, maximum)[1][0]['format'] == 'number'


@pytest.mark.parametrize('problem', ['missing', 'duplicate', 'key', 'value', 'talent', 'format', 'mark'])
def test_invalid_base_attribute_ladders_fail(problem):
    config, talents, growth, modes, groups, maximum = growth_sample()
    if problem == 'missing':
        del growth['2']
    elif problem == 'duplicate':
        growth['3'] = growth['2'].copy()
    elif problem == 'key':
        growth['2']['FightProp'] = {'Other_N': [2]}
    elif problem == 'value':
        growth['2']['FightProp']['MaxHp_P'] = [1, 2]
    elif problem == 'talent':
        talents.clear()
    elif problem == 'mark':
        growth['2']['Mark'] = 'high'
    else:
        modes.clear()
    with pytest.raises(ValueError):
        build_attributes(config, talents, growth, modes, groups, maximum)


def scoring_sample():
    return {'SECRET_PARTNER_IN_DOMINATE_RATE': 1, 'SECRET_PARTNER_NON_DOMINATE_RATE': 0.35,
            'SECRET_PARTNER_INIT_DOMINATE_NUM': 1, 'SECRET_PARTNER_MAX_DOMINATE_NUM': 8,
            'SECRET_PARTNER_MAX_STAR': 50, 'SECRET_PARTNER_STAR_STEP': 1}


def test_scoring_constants_are_named_and_checked():
    assert build_scoring(scoring_sample()) == {
        'inDominateRate': 1, 'nonDominateRate': 0.35, 'initialDominateSlots': 1,
        'maxDominateSlots': 8, 'maxStar': 50,
    }


@pytest.mark.parametrize('problem', ['missing', 'rates', 'slots'])
def test_invalid_scoring_constants_fail(problem):
    constants = scoring_sample()
    if problem == 'missing':
        del constants['SECRET_PARTNER_NON_DOMINATE_RATE']
    elif problem == 'rates':
        constants['SECRET_PARTNER_NON_DOMINATE_RATE'] = 2
    else:
        constants['SECRET_PARTNER_INIT_DOMINATE_NUM'] = 9
    with pytest.raises(ValueError):
        build_scoring(constants)


def test_level_unlock_days_are_a_complete_rising_schedule():
    rows = {str(n): {'ID': n, 'SecretPartner_LevelUnlockTime': day} for n, day in ((1, 0), (2, 0), (3, 2))}
    assert build_level_unlock_days(rows, 3) == [0, 0, 2]
    assert build_level_unlock_days(list(rows.values()), 3) == [0, 0, 2], 'the packed reader returns a list'
    with pytest.raises(ValueError, match='every level'):
        build_level_unlock_days(rows, 4)
    rows['3']['SecretPartner_LevelUnlockTime'] = -1
    with pytest.raises(ValueError, match='rising'):
        build_level_unlock_days(rows, 3)
