import { describe, expect, it } from 'vitest'
import { buildProfessionStages, PROFESSION_LINES, type ProfessionRoute } from './professionCatalog'
import type { JobSkillRow, SkillIndexEntry } from './wikiData'

const route: ProfessionRoute = {
  id: 'test-route',
  stages: [
    { professionId: 101, rank: 2, stageId: 'swordman' },
    { professionId: 101, rank: 3, stageId: 'knight' },
  ],
}

const rows: JobSkillRow[] = [
  { iID: 1, iJobLv: 1, iJobRank: 2, iProfessionID: 101, kDescData: [1100101] },
  { iID: 2, iJobLv: 5, iJobRank: 2, iProfessionID: 101, kDescData: [1100102, 1100201] },
  { iID: 3, iJobLv: 1, iJobRank: 3, iProfessionID: 101, kDescData: [1100101, 1100201, 1110101] },
]

const skills = new Map<number, SkillIndexEntry>([
  [11001, { iSkillID: 11001, iMaxLevel: 10, levels: [1100101] }],
  [11002, { iSkillID: 11002, iMaxLevel: 5, levels: [1100201] }],
  [11101, { iSkillID: 11101, iMaxLevel: 10, levels: [1110101] }],
])

describe('RO3 profession progression', () => {
  it('classifies newly available and inherited skills at each advancement stage', () => {
    const stages = buildProfessionStages(route, rows, skills)

    expect(stages[0].newSkillCount).toBe(2)
    expect(stages[0].skills.every((skill) => !skill.inherited)).toBe(true)
    expect(stages[1].newSkillCount).toBe(1)
    expect(stages[1].skills.find((skill) => skill.skillId === 11101)?.inherited).toBe(false)
    expect(stages[1].skills.find((skill) => skill.skillId === 11001)?.inherited).toBe(true)
    expect(stages[1].skills.find((skill) => skill.skillId === 11002)?.inherited).toBe(true)
  })

  it('uses the first job level that exposes a skill as its unlock level', () => {
    const [firstStage] = buildProfessionStages(route, rows, skills)

    expect(firstStage.skills.find((skill) => skill.skillId === 11001)?.unlockLevel).toBe(1)
    expect(firstStage.skills.find((skill) => skill.skillId === 11002)?.unlockLevel).toBe(5)
    expect(firstStage.skills.find((skill) => skill.skillId === 11001)?.skill?.iMaxLevel).toBe(10)
  })

  it('keeps cross-profession advancement routes in their package-derived order', () => {
    const swordman = PROFESSION_LINES.find((line) => line.id === 'swordman')
    const judgment = swordman?.routes.find((candidate) => candidate.id === 'judgment')

    expect(judgment?.stages).toEqual([
      { professionId: 101, rank: 2, stageId: 'swordman' },
      { professionId: 111, rank: 3, stageId: 'crusader' },
      { professionId: 111, rank: 4, stageId: 'paladin' },
      { professionId: 111, rank: 5, stageId: 'royalGuard' },
    ])
  })
})
