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
from .tables import load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version


def rows(value):
    return list(value.values()) if isinstance(value, dict) else list(value)


def build_catalog(tables: dict, skills: dict[int, dict]) -> dict:
    unlocks = {int(row['ID']): row for row in rows(tables['unlocks'])}
    tags = {int(row['ID']): row['Tag'] for row in rows(tables['tags'])}
    parents = {int(branch): row['SkillID'] for row in unlocks.values()
               for branch in row.get('BranchingSkills', [])}
    records = []
    for row in sorted(unlocks.values(), key=lambda row: row['ID']):
        skill = build_skill(skills[int(row['SkillID'])], tags)
        skill.update({
            'autoCast': not bool(skills[int(row['SkillID'])].get('NoAutoCast')),
            'professionId': row.get('ClassID', 0),
            'type': row['SkillType'],
            'family': parents.get(int(row['ID']), row['SkillID']),
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
    for skill in catalog['skills']:
        row = skills[skill['id']]
        asset = row.get('SkillIcon') or row.get('IconTexture') or ''
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
