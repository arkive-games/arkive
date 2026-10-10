"""Export SecretPartner records, their skill categories and explicit upgrade thresholds.

SkillStar is the skill tier; PartnerStar is its required puppet stage. Neither
is a skill level. Dynamic skill formulas remain explicitly unavailable offline.
Run with --raw, --data-out and --res-out to use existing local exports.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from PIL import Image

from .common import is_nonempty_file, write_json
from .skill_text import has_formula, skill_text
from .tables import EXCEL_DIR, load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version


def build_records(config: dict, skills: dict, upgrades: dict, tags: dict) -> list[dict]:
    records = []
    known = {int(row['ID']) for row in config.values()}
    for row in upgrades.values():
        if int(row['PuppetID']) not in known:
            raise ValueError(f"Unknown puppet in upgrade {row['ID']}")
    for row in sorted(config.values(), key=lambda item: (-item['Quality'], item['ID'])):
        skill_id = int(row['SkillID'])
        if skill_id not in skills:
            raise ValueError(f"Missing skill {skill_id}")
        skill = skills[skill_id]
        labels = []
        for tag in skill.get('DesTags', []):
            if int(tag) not in tags:
                raise ValueError(f"Unknown skill tag {tag}")
            labels.append(tags[int(tag)])
        tiers = sorted(({
            'tier': int(up['SkillStar']), 'requiredStage': int(up['PartnerStar']),
            'description': up['ImproveText'],
        } for up in upgrades.values() if int(up['PuppetID']) == int(row['ID'])), key=lambda up: up['tier'])
        if not tiers or len({up['tier'] for up in tiers}) != len(tiers):
            raise ValueError(f"Missing or duplicate upgrade tiers for {row['ID']}")
        description = skill.get('SkillDisc', '')
        records.append({
            'id': int(row['ID']), 'name': row['Name'], 'quality': int(row['Quality']),
            'description': row.get('Text', ''), 'portrait': '',
            'category': skill.get('Tag', ''),
            'skill': {'id': skill_id, 'name': skill['Name'], 'tags': labels,
                      'cooldown': skill.get('CD'),
                      'description': skill_text(description),
                      'brief': skill_text(skill.get('BriefDescription', '')),
                      'hasFormula': has_formula(description, skill.get('BriefDescription', '')),
                      'castTargets': [entry[1] for entry in skill.get('SkillCastDesc', []) if len(entry) > 1]},
            'upgrades': tiers,
        })
    if unresolved_ids(records):
        raise ValueError('Unresolved localized text in puppet records')
    return records


def portrait_path(raw: Path, reference: str) -> Path | None:
    if not reference.startswith('/Game/'):
        return None
    relative = reference.removeprefix('/Game/').split('.')[0]
    candidate = (raw / 'C7/Content' / f'{relative}.png').resolve()
    if not candidate.is_relative_to(raw.resolve()):
        raise ValueError('Portrait path escapes raw export')
    return candidate if candidate.is_file() else None


def build(raw: Path, data_out: Path, res_out: Path, reuse_assets: bool = False) -> dict:
    excel = raw / EXCEL_DIR
    strings = load_strings(excel)
    def table(name):
        return resolve_text(load_table(excel, name), strings)
    config = table('SecretPartnerConfigData')
    wanted = {int(row['SkillID']) for row in config.values()}
    skills = {}
    for index in range(1, 9):
        skills.update({int(row['ID']): row for row in table(f'SkillDataNew_split_{index}').values()
                       if int(row['ID']) in wanted})
        if wanted == set(skills):
            break
    tags = {int(row['ID']): row['Tag'] for row in table('SkillTagData').values()}
    records = build_records(config, skills, table('SecretPartnerSkillStarUpData'), tags)
    sources = {int(row['ID']): row for row in config.values()}
    output = res_out / 'secretpartners'
    output.mkdir(parents=True, exist_ok=True)
    missing = []
    for record in records:
        if reuse_assets:
            name = str(record['id'])
            if not is_nonempty_file(output / f'{name}.webp'):
                raise FileNotFoundError(f'Missing existing puppet portrait {name} in {output}')
            record['portrait'] = name
            continue
        row = sources[record['id']]
        source = portrait_path(raw, row.get('Icon', '')) or portrait_path(raw, row.get('IconSmall', ''))
        if source is None:
            missing.append(record['id'])
            continue
        name = str(record['id'])
        with Image.open(source) as image:
            image.convert('RGBA').save(output / f'{name}.webp', 'WEBP', quality=90)
        record['portrait'] = name
    write_json(data_out / 'secretpartners/secretpartners.json', records)
    return {'records': len(records), 'portraits': len(records) - len(missing), 'missing': missing}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--data-out', type=Path, required=True)
    parser.add_argument('--res-out', type=Path, required=True)
    parser.add_argument('--reuse-assets', action='store_true', help='Use existing WebP portraits instead of converting raw images')
    args = parser.parse_args()
    print(build(args.raw, args.data_out, args.res_out, args.reuse_assets))
    # The explicit input must also own the build provenance in the version stamp.
    os.environ['GMZZ_RAW'] = str(args.raw.resolve())
    stamp_version(args.data_out)


if __name__ == '__main__':
    main()
