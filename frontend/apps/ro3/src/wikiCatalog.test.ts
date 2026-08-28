import { describe, expect, it } from 'vitest'
import {
  filterWikiSkillIds,
  getWikiSkillDetail,
  WIKI_PROFESSION_LINES,
  WIKI_PROFESSION_STAGES,
  WIKI_PACKAGE_SOURCE,
  WIKI_SKILL_ASSET_COUNT,
  WIKI_SKILL_COUNT,
  WIKI_STAGE_BY_ID,
} from './wikiCatalog'

describe('RO3 Wiki catalog', () => {
  it('keeps every client-observed profession stage in a progression line', () => {
    const referencedStageIds = new Set(WIKI_PROFESSION_LINES.flatMap((line) => [
      line.baseStageId,
      ...line.paths.flat(),
    ]))

    expect(WIKI_PROFESSION_LINES).toHaveLength(6)
    expect(WIKI_PROFESSION_STAGES).toHaveLength(27)
    expect(referencedStageIds.size).toBe(WIKI_PROFESSION_STAGES.length)
    expect([...referencedStageIds].every((stageId) => WIKI_STAGE_BY_ID.has(stageId))).toBe(true)
  })

  it('keeps client skill identifiers unique across profession stages', () => {
    const skillIds = WIKI_PROFESSION_STAGES.flatMap((stage) => stage.skillIds)

    expect(WIKI_SKILL_COUNT).toBe(skillIds.length)
    expect(new Set(skillIds).size).toBe(skillIds.length)
  })

  it('filters skills by profession, stage, identifier, and source name', () => {
    expect(filterWikiSkillIds('swordman', 'rune-knight', '')).toHaveLength(14)
    expect(filterWikiSkillIds('swordman', '', '11641')).toMatchObject([
      { stage: { id: 'royal-guard' }, skillId: '11641' },
    ])
    expect(filterWikiSkillIds('magician', '', 'HighWizard')).toHaveLength(5)
    expect(filterWikiSkillIds('missing', '', '')).toEqual([])
  })

  it('exposes package-derived Wwise event evidence for each indexed skill', () => {
    const [entry] = filterWikiSkillIds('swordman', 'rune-knight', '11301')

    expect(entry.evidence).toEqual({
      eventName: 'Player_RuneKnight_Skill_11301',
      source: WIKI_PACKAGE_SOURCE.label,
      status: 'client-event-id',
    })
    expect(WIKI_PACKAGE_SOURCE.sha256).toHaveLength(64)
  })

  it('keeps unavailable skill fields explicit instead of inventing details', () => {
    const stage = WIKI_STAGE_BY_ID.get('rune-knight')!
    const detail = getWikiSkillDetail(stage, '11301')
    expect(detail).toMatchObject({
      stage,
      skillId: '11301',
      evidence: {
        eventName: 'Player_RuneKnight_Skill_11301',
        source: WIKI_PACKAGE_SOURCE.label,
        status: 'client-event-id',
      },
      fields: {
        name: 'unavailable',
        description: 'unavailable',
        values: 'unavailable',
      },
    })
    expect(detail.asset?.path).toMatch(/icon_skill_runeknight_/)
    expect(detail.asset?.match).toBe('family')
  })

  it('bundles the extracted client skill icon inventory', () => {
    expect(WIKI_SKILL_ASSET_COUNT).toBe(1106)
  })

  it('varies family candidates across skills in one stage', () => {
    const stage = WIKI_STAGE_BY_ID.get('wizard')!
    const first = getWikiSkillDetail(stage, stage.skillIds[0]).asset
    const second = getWikiSkillDetail(stage, stage.skillIds[1]).asset

    expect(first?.match).toBe('family')
    expect(second?.match).toBe('family')
    expect(first?.name).not.toBe(second?.name)
  })
})
