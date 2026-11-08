"""Loadout identities must come from the unlock table, never ID arithmetic."""
from gmzz.builds import build_catalog
import pytest


def sample():
    tables = {
        'unlocks': {'10': {'ID': 10, 'SkillID': 86011040, 'SkillType': 2, 'ClassID': 1200001, 'BranchingSkills': [20]},
                    '20': {'ID': 20, 'SkillID': 86011048, 'SkillType': 2, 'ClassID': 1200001}},
        'tags': {}, 'unlockConditions': {}, 'talentNodes': [],
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


@pytest.mark.parametrize('tags,tree,role', [([1262, 1011], 201, 'basicAttack'),
                                         ([1264], 201, None), ([1263, 1018], 202, 'finisher'),
                                         ([1013], None, 'decontrol')])
def test_gameplay_tags_gate_stances_and_identify_fixed_roles(tags, tree, role):
    tables, skills = sample()
    skills[86011040]['Tags'] = tags
    skill = build_catalog(tables, skills)['skills'][0]
    assert skill['stanceTalentTreeId'] == tree
    assert skill['requiredTalentTreeId'] is None
    assert skill['fixedRole'] == role


def test_legacy_basic_attacks_use_the_unlock_type_without_specialized_tags():
    tables, skills = sample()
    tables['unlocks']['10']['SkillType'] = 1
    assert build_catalog(tables, skills)['skills'][0]['fixedRole'] == 'basicAttack'


def test_relic_actions_keep_the_client_action_identity_instead_of_a_carried_slot():
    tables, skills = sample()
    tables['relicActions'] = [{'ID': 1, 'Name': 'Bell', 'SealID': 2085001, 'Icon': 'ClientIcon'}]
    assert build_catalog(tables, skills)['relicActions'] == [
        {'id': 1, 'name': 'Bell', 'artifactId': 2085001, 'icon': 'ClientIcon'}]


def test_fool_resource_uses_the_client_scale_and_buff_order_is_stable():
    tables, skills = sample()
    tables['resources'] = [{'ID': 1200003, 'ProfessionName': 'Cards', 'PropMaxValue': 100}]
    tables['buffs'] = {'12': {'Name': 'Fear', 'bIsStatus': True}, '8': {'Name': 'Sun', 'Profession': [1200001]}}
    result = build_catalog(tables, skills)
    assert result['resources'][0]['max'] == 5
    assert [row['id'] for row in result['buffs']] == [8, 12]


def test_skill_effects_use_the_paired_skill_description_not_the_tree_summary():
    tables, skills = sample()
    tables['unlocks']['10']['BranchingSkillsUnlockTalent'] = [10107]
    tables['talentNodes'] = [{'Key': 10107, 'TreeID': 101, 'Name': 'Light',
                            'PointDesc': 'Outdated summary', 'RelatedRoleSkillID': [10],
                            'SkillPointDesc': ['Current skill effect', '']}]
    records = build_catalog(tables, skills)['skills']
    assert records[0]['talentEffects'] == [{'nodeId': 10107, 'treeId': 101, 'name': 'Light', 'description': 'Current skill effect'}]
    assert records[1]['talentEffects'] == records[0]['talentEffects']
    assert records[1]['requiredTalentTreeId'] == 101
    assert records[0]['requiredTalentTreeId'] is None


def test_missing_or_unpaired_skill_effect_text_fails_instead_of_shifting_the_join():
    tables, skills = sample()
    for related, descriptions in [([10, 20], ['One effect']), ([10], ['One effect', 'Unpaired effect'])]:
        tables['talentNodes'] = [{'Key': 10107, 'TreeID': 101, 'Name': 'Light',
                                'RelatedRoleSkillID': related, 'SkillPointDesc': descriptions}]
        with pytest.raises(ValueError, match='misaligned'):
            build_catalog(tables, skills)
