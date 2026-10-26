"""Export SecretPartner records, their skill categories and explicit upgrade thresholds.

SkillStar is the skill tier; PartnerStar is its required puppet stage. Neither
is a skill level. Dynamic skill formulas remain explicitly unavailable offline.
Run with --raw, --data-out and --res-out to use existing local exports.

Every attribute ladder also carries its ``marks`` -- the 非凡评分 points the
client credits for that attribute at each stage -- and ``scoring.json`` holds the
constants that turn them into the panel's 秘偶属性 figure. That species is the
one bonds score the client computes itself: the 支配 page previews it as

    round(sum over owned puppets of rate x sum over Prop_Talent of Mark(stage))

with ``rate`` = ``SECRET_PARTNER_IN_DOMINATE_RATE`` for a puppet in a dominate
slot and ``SECRET_PARTNER_NON_DOMINATE_RATE`` otherwise
(``CalcDominateTalentMarkScore`` in ``SecretPartner_Dominate_Page.lua``). Only
``Prop_Talent`` counts; the ``Talent`` column (workshop and travel perks) scores
nothing there.
"""
from __future__ import annotations

import argparse
import math
import os
from pathlib import Path

from PIL import Image

from .common import is_nonempty_file, write_json
from .env import check_export_current
from .skill_text import has_formula, skill_text
from .tables import EXCEL_DIR, load_strings, load_table, resolve_text, unresolved_ids
from .version import stamp_version


def build_attributes(config, talents, growth, modes, groups, max_level):
    by_talent = {int(row['ID']): row for row in talents.values()}
    by_mode = {row['PropMode']: row for row in modes.values()}
    by_group = {row['Prop']: row for row in groups.values()}
    ladders = {}
    for talent_id in {int(key) for row in config.values() for key in row['Prop_Talent']}:
        if talent_id not in by_talent or by_talent[talent_id]['Type'] != 2:
            raise ValueError(f'Missing base attribute talent {talent_id}')
        # Each Star row is the current level's total, not an increment to sum.
        rows = sorted((row for row in growth.values() if int(row['TalentID']) == talent_id),
                      key=lambda row: row['Star'])
        if [row['Star'] for row in rows] != list(range(1, max_level + 1)):
            raise ValueError(f'Incomplete attribute ladder for {talent_id}')
        keys = {key for row in rows for key in row['FightProp']}
        if len(keys) != 1:
            raise ValueError(f'Inconsistent attribute keys for {talent_id}')
        key = next(iter(keys))
        if key in by_mode:
            metadata = [by_mode[key]]
        elif key in by_group and all(name in by_mode for name in by_group[key]['PropNameSet']):
            metadata = [by_mode[name] for name in by_group[key]['PropNameSet']]
        else:
            raise ValueError(f'Missing attribute metadata for {key}')
        formats = {entry['ShowType'] for entry in metadata}
        if len(formats) != 1 or not formats <= {0, 1, 2}:
            raise ValueError(f'Missing or inconsistent attribute format for {key}')
        values = []
        marks = []
        for row in rows:
            value = row['FightProp'].get(key)
            if (not isinstance(value, list) or len(value) != 1
                    or not isinstance(value[0], (int, float)) or not math.isfinite(value[0])):
                raise ValueError(f'Invalid attribute value for {talent_id} at level {row["Star"]}')
            values.append(value[0])
            # The rating points the attribute is worth at this stage. A ladder
            # without one would score the puppet as nothing on the calculator
            # while its attributes still displayed, so it is required.
            mark = row.get('Mark')
            if not isinstance(mark, int) or isinstance(mark, bool) or mark < 0:
                raise ValueError(f'Invalid attribute mark for {talent_id} at level {row["Star"]}')
            marks.append(mark)
        ladders[talent_id] = {
            'key': key, 'name': by_talent[talent_id]['StarUpDescribe1'],
            'format': 'percent' if formats.pop() == 1 else 'number', 'values': values,
            'marks': marks,
        }
    return {int(row['ID']): [ladders[int(key)] for key in row['Prop_Talent']] for row in config.values()}


def build_scoring(constants: dict) -> dict:
    """The 秘偶属性 constants, named for what they do rather than by the client's keys.

    ``maxDominateSlots`` is the most a player can ever hold; which season unlocks
    which slot is in ``SecretPartnerDominateData`` and is the player's own
    progression, so the calculator takes the count as input and only caps it.
    """
    wanted = {
        'inDominateRate': 'SECRET_PARTNER_IN_DOMINATE_RATE',
        'nonDominateRate': 'SECRET_PARTNER_NON_DOMINATE_RATE',
        'initialDominateSlots': 'SECRET_PARTNER_INIT_DOMINATE_NUM',
        'maxDominateSlots': 'SECRET_PARTNER_MAX_DOMINATE_NUM',
        'maxStar': 'SECRET_PARTNER_MAX_STAR',
    }
    scoring = {}
    for name, key in wanted.items():
        value = constants.get(key)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
            raise ValueError(f'Missing puppet scoring constant {key}')
        scoring[name] = value
    if not 0 <= scoring['nonDominateRate'] <= scoring['inDominateRate']:
        raise ValueError('Puppet dominate rates are not ordered')
    if not 1 <= scoring['initialDominateSlots'] <= scoring['maxDominateSlots']:
        raise ValueError('Puppet dominate slot counts are not ordered')
    return scoring


def build_level_unlock_days(rows: dict | list, max_star: int) -> list[int]:
    """The day after launch each puppet level opens, level 1 first.

    ``SecretPartnerStarUpData`` is one row per level, ``ID`` the level, and
    ``SecretPartner_LevelUnlockTime`` the days since the server opened before
    a puppet may reach it (0 for levels 1-2, 87 for 50). That is the level cap:
    on day 67 every puppet stops at 43, which is what live accounts show. A
    gap or a schedule that runs backwards fails rather than capping wrongly.
    """
    # The packed reader hands back a list where the ids run 1..N, a dict otherwise.
    listed = rows.values() if isinstance(rows, dict) else rows
    by_level = {int(row['ID']): row.get('SecretPartner_LevelUnlockTime') for row in listed}
    if sorted(by_level) != list(range(1, int(max_star) + 1)):
        raise ValueError('Puppet level unlock schedule does not cover every level')
    days = [by_level[level] for level in range(1, int(max_star) + 1)]
    if any(not isinstance(day, int) or day < 0 for day in days) or days != sorted(days):
        raise ValueError('Puppet level unlock days are not a rising schedule')
    return days


def build_records(config: dict, skills: dict, upgrades: dict, tags: dict, attributes: dict) -> list[dict]:
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
            'attributes': attributes[int(row['ID'])],
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
    check_export_current(raw)
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
    constants = table('SecretPartnerConstData')
    attributes = build_attributes(config, table('SecretPartnerTalentData'),
                                  table('SecretPartnerTalentStarUpData'), table('FightPropModeData'),
                                  table('FightPropModeSetData'),
                                  int(constants['SECRET_PARTNER_MAX_STAR']))
    scoring = build_scoring(constants)
    scoring['levelUnlockDays'] = build_level_unlock_days(table('SecretPartnerStarUpData'), scoring['maxStar'])
    records = build_records(config, skills, table('SecretPartnerSkillStarUpData'), tags, attributes)
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
    write_json(data_out / 'secretpartners/scoring.json', scoring)
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
