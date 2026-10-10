from pathlib import Path

import pytest

from gmzz.secretpartners import build_records, portrait_path
from gmzz import secretpartners


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


def test_percent_escape_and_brief_formulas_are_formatted():
    config, skills, upgrades, tags = sample()
    skills[10]['SkillDisc'] = 'Chance *f**.'
    skills[10]['BriefDescription'] = 'Duration *s.'
    skill = build_records(config, skills, upgrades, tags)[0]['skill']
    assert skill['description'] == 'Chance \u2026%.'
    assert skill['brief'] == 'Duration \u2026.'
    assert skill['hasFormula']


def test_reused_puppet_art_is_required_and_unchanged(tmp_path: Path, monkeypatch):
    config, skills, upgrades, tags = sample()
    tables = {
        'SecretPartnerConfigData': config,
        'SkillDataNew_split_1': skills,
        'SkillTagData': {str(key): {'ID': key, 'Tag': value} for key, value in tags.items()},
        'SecretPartnerSkillStarUpData': upgrades,
    }
    monkeypatch.setattr(secretpartners, 'load_strings', lambda _: {})
    monkeypatch.setattr(secretpartners, 'load_table', lambda _, name: tables[name])
    monkeypatch.setattr(secretpartners, 'resolve_text', lambda table, _: table)
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
