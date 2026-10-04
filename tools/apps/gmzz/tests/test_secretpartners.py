from pathlib import Path

import pytest

from gmzz.secretpartners import build_records, portrait_path


def sample():
    return ({'1': {'ID': 1, 'Name': 'Puppet', 'Quality': 6, 'SkillID': 10}},
            {10: {'ID': 10, 'Name': 'Skill', 'Tag': 'Control', 'DesTags': [2],
                  'SkillDisc': 'Deal *d damage for <b>6</> seconds.', 'CD': 23}},
            {'11': {'ID': 11, 'PuppetID': 1, 'SkillStar': 2, 'PartnerStar': 10, 'ImproveText': 'More damage'}},
            {2: 'Area'})


def test_explicit_skill_tier_and_puppet_stage():
    record = build_records(*sample())[0]
    assert record['upgrades'] == [{'tier': 2, 'requiredStage': 10, 'description': 'More damage'}]
    assert record['category'] == 'Control'
    assert record['skill']['tags'] == ['Area']
    assert record['skill']['hasFormula']
    assert record['skill']['description'] == 'Deal … damage for <b>6</> seconds.'


def test_missing_skill_fails():
    config, _, upgrades, tags = sample()
    with pytest.raises(ValueError, match='Missing skill'):
        build_records(config, {}, upgrades, tags)


def test_unknown_upgrade_puppet_fails():
    config, skills, upgrades, tags = sample()
    upgrades['11']['PuppetID'] = 999
    with pytest.raises(ValueError, match='Unknown puppet'):
        build_records(config, skills, upgrades, tags)


def test_unknown_tag_fails():
    config, skills, upgrades, _ = sample()
    with pytest.raises(ValueError, match='Unknown skill tag'):
        build_records(config, skills, upgrades, {})


def test_missing_tiers_fail():
    config, skills, _, tags = sample()
    with pytest.raises(ValueError, match='Missing or duplicate'):
        build_records(config, skills, {}, tags)


def test_portrait_missing_is_explicit(tmp_path: Path):
    assert portrait_path(tmp_path, '/Game/Portraits/Test.Test') is None
    assert portrait_path(tmp_path, '') is None
