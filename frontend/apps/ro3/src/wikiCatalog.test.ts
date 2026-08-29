import { describe, expect, it } from 'vitest'
import {
  filterWikiSkillIds,
  WIKI_PROFESSION_LINES,
  WIKI_PROFESSION_STAGES,
  WIKI_SKILL_COUNT,
  WIKI_STAGE_BY_ID,
} from './wikiCatalog'
import type { SkillIndexEntry } from './wikiData'

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

  it('filters skills by profession, stage, identifier, and resolved name', () => {
    const index = new Map<number, SkillIndexEntry>([[11001, {
      iSkillID: 11001,
      iMaxLevel: 10,
      name: { 'zh-CN': 'Bash' },
      levels: [1100101],
    }]])

    expect(filterWikiSkillIds('swordman', 'rune-knight', '')).toHaveLength(14)
    expect(filterWikiSkillIds('swordman', '', '11641')).toMatchObject([
      { stage: { id: 'royal-guard' }, skillId: '11641' },
    ])
    expect(filterWikiSkillIds('swordman', '', 'Bash', index)).toMatchObject([
      { stage: { id: 'swordman' }, skillId: '11001', skill: { iMaxLevel: 10 } },
    ])
    expect(filterWikiSkillIds('missing', '', '')).toEqual([])
  })

  it('exposes package-derived event evidence for each indexed skill', () => {
    const [entry] = filterWikiSkillIds('swordman', 'rune-knight', '11301')

    expect(entry.evidence).toMatchObject({
      eventName: 'Player_RuneKnight_Skill_11301',
      status: 'client-event-id',
    })
  })
})
