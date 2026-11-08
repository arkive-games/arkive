"""Export the client loadout catalogue and one-click editor metadata.

Run python -m gmzz.builds with GMZZ_RAW, GMZZ_DATA_OUT and GMZZ_RES_OUT.
RoleSkillUnlockData owns the selectable skills and their branch families;
SkillDataNew alone also contains monsters and internal follow-up attacks.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image

from .common import write_json
from .env import excel_dir, require_dir
from .fellows import build_skill, load_skills
from .skill_text import skill_text
from .tables import load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version


def rows(value):
    return list(value.values()) if isinstance(value, dict) else list(value)


def build_catalog(tables: dict, skills: dict[int, dict]) -> dict:
    unlocks = {int(row['ID']): row for row in rows(tables['unlocks'])}
    tags = {int(row['ID']): row['Tag'] for row in rows(tables['tags'])}
    parents = {int(branch): row['SkillID'] for row in unlocks.values()
               for branch in row.get('BranchingSkills', [])}
    talent_nodes = {int(row['Key']): row for row in rows(tables['talentNodes'])}
    branch_trees = {int(branch): talent_nodes[int(node)]['TreeID'] for row in unlocks.values()
                    for branch, node in zip(row.get('BranchingSkills') or [], row.get('BranchingSkillsUnlockTalent') or [])}
    effects = {}
    for node in sorted(talent_nodes.values(), key=lambda row: row['Key']):
        related = node.get('RelatedRoleSkillID') or []
        descriptions = node.get('SkillPointDesc') or []
        if len(descriptions) < len(related) or any(descriptions[len(related):]):
            raise ValueError(f"Talent node {node['Key']} has misaligned skill descriptions")
        for role_id, text in zip(related, descriptions):
            if text:
                skill_id = unlocks[int(role_id)]['SkillID']
                effects.setdefault(skill_id, []).append({'nodeId': node['Key'], 'treeId': node['TreeID'],
                                                         'name': node['Name'], 'description': skill_text(text)})
    records = []
    for row in sorted(unlocks.values(), key=lambda row: row['ID']):
        source = skills[int(row['SkillID'])]
        gameplay_tags = set(source.get('Tags') or [])
        # The healing-only tag also covers Read Mind, which lacks tag 1262.
        mode_tree = 201 if gameplay_tags & {1262, 1264} else 202 if 1263 in gameplay_tags else None
        # These stance passives carry no gameplay tags in the client table.
        mode_tree = {86025030: 201, 86025040: 202}.get(row['SkillID'], mode_tree)
        role = ('basicAttack' if row['SkillType'] == 1 or 1011 in gameplay_tags
                else 'decontrol' if 1013 in gameplay_tags
                else 'finisher' if 1018 in gameplay_tags or 37 in (source.get('DesTags') or []) else None)
        # Arbiter's older records have generic tags; its two special skills
        # are Verdict Sword and Authority Release (labelled decontrol by Desc).
        role = {86040010: 'finisher', 86040005: 'decontrol'}.get(row['SkillID'], role)
        skill = build_skill(source, tags)
        skill.update({
            'autoCast': not bool(skills[int(row['SkillID'])].get('NoAutoCast')),
            'professionId': row.get('ClassID', 0),
            'type': row['SkillType'],
            'family': parents.get(int(row['ID']), row['SkillID']),
            'requiredTalentTreeId': branch_trees.get(int(row['ID'])),
            'stanceTalentTreeId': mode_tree,
            'fixedRole': role,
            'talentEffects': effects.get(parents.get(int(row['ID']), row['SkillID']), []),
            'order': row.get('DisplayOrder', 0),
            'unlock': tables['unlockConditions'].get(str(row.get('SkillUnlockCondition')), {}).get('Des', ''),
        })
        records.append(skill)
    return {
        'skills': records,
        'professions': [{'id': row['ID'], 'name': row['Name']}
                        for row in sorted(rows(tables['professions']), key=lambda row: row['ID'])
                        if not row.get('Disabled') and any(skill['professionId'] == row['ID'] and skill['type'] == 2 for skill in records)],
        'resources': [{'professionId': row['ID'], 'name': row['ProfessionName'],
                       'max': row['PropMaxValue'] / (20 if row['ID'] == 1200003 else 1),
                       'supported': row['PropMaxValue'] < 99999999}
                      for row in sorted(rows(tables['resources']), key=lambda row: row['ID'])],
        'types': rows(tables['types']),
        'relicActions': [{'id': row['ID'], 'name': row['Name'], 'artifactId': row['SealID'], 'icon': row.get('Icon') or ''}
                         for row in rows(tables.get('relicActions', []))],
        'conditions': rows(tables['conditions']),
        'params': rows(tables['params']),
        'buffs': [{'id': int(key), 'name': row['Name'], 'status': row.get('bIsStatus', False),
                   'professions': row.get('Profession') or []}
                  for key, row in sorted(tables['buffs'].items(), key=lambda item: int(item[0]))],
        'presets': tables['presets'],
        'limits': {'nodes': tables['constants']['ONE_CLICK_NODE_LIMIT'],
                   'name': tables['constants']['ONE_CLICK_NAME_LIMIT'],
                   'description': tables['constants']['ONE_CLICK_DESC_LIMIT']},
    }


def export_icons(raw: Path, res_out: Path, catalog: dict, skills: dict) -> int:
    converted = 0
    assets = [(skill, skills[skill['id']].get('SkillIcon') or skills[skill['id']].get('IconTexture') or '')
              for skill in catalog['skills']]
    assets.extend((action, action['icon']) for action in catalog['relicActions'])
    for skill, asset in assets:
        source = raw / 'C7/Content' / (asset.removeprefix('/Game/').split('.')[0] + '.png')
        if not asset.startswith('/Game/') or not source.is_file():
            skill['icon'] = ''
            continue
        name = source.stem
        dest = res_out / 'builds' / f'{name}.webp'
        dest.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as image:
            image.save(dest, 'WEBP', quality=90)
        skill['icon'] = name
        converted += 1
    return converted


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-out', type=Path)
    parser.add_argument('--res-out', type=Path)
    args = parser.parse_args()
    excel = excel_dir()
    strings = load_strings(excel)
    names = {'unlocks': 'RoleSkillUnlockData', 'tags': 'SkillTagData',
             'unlockConditions': 'SkillUnlockConditionData', 'professions': 'TransferPathProfessionData',
             'types': 'SkillTypeData', 'conditions': 'OneClickConditionData',
             'params': 'OneClickParamsData', 'buffs': 'OneClickBuffData',
             'presets': 'OneClickPresetData', 'constants': 'OneClickConstData'}
    names['resources'] = 'ProfessionSkillData'
    names['talentNodes'] = 'TalentNodeData'
    names['relicActions'] = 'OneClickRelcsData'
    tables = {key: resolve_text(load_table(excel, name), strings) for key, name in names.items()}
    wanted = {int(row['SkillID']) for row in rows(tables['unlocks'])}
    skills = load_skills(excel, strings, wanted)
    catalog = build_catalog(tables, skills)
    data_out = args.data_out or require_dir('GMZZ_DATA_OUT')
    count = export_icons(require_dir('GMZZ_RAW'), args.res_out or require_dir('GMZZ_RES_OUT'), catalog, skills)
    if unresolved_ids(catalog):
        raise ValueError('Unresolved localization in build catalogue')
    write_json(data_out / 'builds/catalog.json', catalog)
    stamp_version(data_out)
    print(f"Exported {len(catalog['skills'])} skills and {count} icons")


if __name__ == '__main__':
    main()
