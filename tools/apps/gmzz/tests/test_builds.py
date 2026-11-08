"""Loadout identities must come from the unlock table, never ID arithmetic."""
from gmzz.builds import build_catalog


def sample():
    tables = {
        'unlocks': {'10': {'ID': 10, 'SkillID': 86011040, 'SkillType': 2, 'ClassID': 1200001, 'BranchingSkills': [20]},
                    '20': {'ID': 20, 'SkillID': 86011048, 'SkillType': 2, 'ClassID': 1200001}},
        'tags': {}, 'unlockConditions': {},
        'professions': [{'ID': 1200001, 'Name': 'Sun'}, {'ID': 1200004, 'Name': 'Unused'}],
        'resources': [{'ID': 1200001, 'ProfessionName': 'Sun', 'PropMaxValue': 5}],
        'types': [], 'conditions': [], 'params': [], 'buffs': {}, 'presets': {},
        'constants': {'ONE_CLICK_NODE_LIMIT': 50, 'ONE_CLICK_NAME_LIMIT': 7, 'ONE_CLICK_DESC_LIMIT': 60},
    }
    skills = {86011040: {'ID': 86011040, 'Name': 'Base'},
              86011048: {'ID': 86011048, 'Name': 'Branch', 'NoAutoCast': True}}
    return tables, skills


def test_branches_share_the_base_skill_family_and_keep_actual_skill_ids():
    tables, skills = sample()
    records = build_catalog(tables, skills)['skills']
    assert [row['id'] for row in records] == [86011040, 86011048]
    assert [row['family'] for row in records] == [86011040, 86011040]
    assert [row['autoCast'] for row in records] == [True, False]


def test_unavailable_pathways_do_not_become_empty_picker_options():
    tables, skills = sample()
    assert build_catalog(tables, skills)['professions'] == [{'id': 1200001, 'name': 'Sun'}]


def test_fool_resource_uses_the_client_scale_and_buff_order_is_stable():
    tables, skills = sample()
    tables['resources'] = [{'ID': 1200003, 'ProfessionName': 'Cards', 'PropMaxValue': 100}]
    tables['buffs'] = {'12': {'Name': 'Fear', 'bIsStatus': True}, '8': {'Name': 'Sun', 'Profession': [1200001]}}
    result = build_catalog(tables, skills)
    assert result['resources'][0]['max'] == 5
    assert [row['id'] for row in result['buffs']] == [8, 12]
