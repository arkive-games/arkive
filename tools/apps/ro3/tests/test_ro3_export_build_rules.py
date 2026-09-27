from ro3.export_build_rules import normalize


def test_preserves_job_branch_and_skill_identity_spaces():
    tables = {
        'JobConfig': {'1400': {'_iID': 1400, '_iName': [1], '_iJobRank': 5, '_kProfessionID': [131], '_kSubType': [2, 50], '_kWeaponForm': [1, 2]}},
        'JobProfessConfig': {'131': {'_iID': 131, '_iName': [2], '_iProfessionID': 101, '_kSkillMain': [1130105], '_kSkillMinor': {}}},
        'ProfessBuildSuggConfig': {'1': {'_iProfessionID': 131, '_kSeasonTalent': [[20, 21], [21]]}},
    }
    result = normalize(tables, {'1': 'Knight', '2': 'Blade'})
    assert result['jobs'][0]['branchIds'] == [131]
    assert result['branches'][0]['professionId'] == 101
    assert result['branches'][0]['suggestedSkills'] == [1130105]
    assert result['recommendations'][0] == {'branchId': 131, 'talentLevelIds': [20, 21]}


def test_empty_lua_tables_become_arrays():
    result = normalize({'JobConfig': {'1': {'_iID': 1, '_kSubType': {}, '_kProfessionID': {}, '_kWeaponForm': {}}}}, {})
    assert result['jobs'][0]['subtypes'] == []
    assert result['jobs'][0]['branchIds'] == []
    assert result['branches'] == []


def test_exports_profession_talent_membership_separately_from_recommendations():
    result = normalize({'SeasonTalentEffectConfig': {'562': {
        '_iId': 562, '_iGroup': 230101, '_iLevel': 1,
        '_iJobId': [5400, 5300, 5200], '_kProfessionID': [503, 505],
    }}}, {})
    assert result['talentEffects'] == [{'id': 562, 'group': 230101, 'level': 1,
                                        'jobIds': [5400, 5300, 5200], 'professionIds': [503, 505]}]
    assert result['recommendations'] == []
