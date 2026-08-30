import type { JobSkillRow, SkillIndexEntry } from './wikiData'

export interface ProfessionStageSource {
  professionId: number
  rank: number
  stageId: string
}

export interface ProfessionRoute {
  id: string
  stages: ProfessionStageSource[]
}

export interface ProfessionLine {
  id: string
  routes: ProfessionRoute[]
}

export interface ProfessionSkillChoice {
  skillId: number
  skill?: SkillIndexEntry
  unlockLevel: number
  inherited: boolean
}

export interface ProfessionStageData extends ProfessionStageSource {
  skills: ProfessionSkillChoice[]
  newSkillCount: number
}

export const PROFESSION_LINES: ProfessionLine[] = [
  {
    id: 'swordman',
    routes: [
      { id: 'blade', stages: [2, 3, 4, 5].map((rank) => ({ professionId: 101, rank, stageId: ['swordman', 'knight', 'lordKnight', 'runeKnight'][rank - 2] })) },
      { id: 'spear', stages: [2, 3, 4, 5].map((rank) => ({ professionId: 103, rank, stageId: ['swordman', 'knight', 'lordKnight', 'runeKnight'][rank - 2] })) },
      { id: 'judgment', stages: [
        { professionId: 101, rank: 2, stageId: 'swordman' },
        { professionId: 111, rank: 3, stageId: 'crusader' },
        { professionId: 111, rank: 4, stageId: 'paladin' },
        { professionId: 111, rank: 5, stageId: 'royalGuard' },
      ] },
      { id: 'guardian', stages: [
        { professionId: 101, rank: 2, stageId: 'swordman' },
        { professionId: 112, rank: 3, stageId: 'crusader' },
        { professionId: 112, rank: 4, stageId: 'paladin' },
        { professionId: 112, rank: 5, stageId: 'royalGuard' },
      ] },
    ],
  },
  {
    id: 'magician',
    routes: [
      { id: 'fireEarth', stages: [
        { professionId: 201, rank: 2, stageId: 'magician' },
        { professionId: 201, rank: 3, stageId: 'wizard' },
        { professionId: 201, rank: 4, stageId: 'highWizard' },
        { professionId: 204, rank: 5, stageId: 'warlock' },
      ] },
      { id: 'iceLightning', stages: [
        { professionId: 202, rank: 2, stageId: 'magician' },
        { professionId: 202, rank: 3, stageId: 'wizard' },
        { professionId: 202, rank: 4, stageId: 'highWizard' },
        { professionId: 204, rank: 5, stageId: 'warlock' },
      ] },
      { id: 'psychic', stages: [2, 3, 4, 5].map((rank) => ({ professionId: 203, rank, stageId: ['magician', 'wizard', 'highWizard', 'warlock'][rank - 2] })) },
    ],
  },
  {
    id: 'archer',
    routes: [
      { id: 'marksman', stages: [2, 3, 4, 5].map((rank) => ({ professionId: 303, rank, stageId: ['archer', 'hunter', 'sniper', 'ranger'][rank - 2] })) },
      { id: 'wolf', stages: [2, 3, 4, 5].map((rank) => ({ professionId: 304, rank, stageId: ['archer', 'hunter', 'sniper', 'ranger'][rank - 2] })) },
    ],
  },
  {
    id: 'acolyte',
    routes: [
      { id: 'support', stages: [2, 3, 4, 5].map((rank) => ({ professionId: 401, rank, stageId: ['acolyte', 'priest', 'highPriest', 'archBishop'][rank - 2] })) },
      { id: 'exorcism', stages: [2, 3, 4, 5].map((rank) => ({ professionId: 402, rank, stageId: ['acolyte', 'priest', 'highPriest', 'archBishop'][rank - 2] })) },
    ],
  },
  {
    id: 'thief',
    routes: [
      { id: 'cross', stages: [2, 3, 4, 5].map((rank) => ({ professionId: 506, rank, stageId: ['thief', 'assassin', 'assassinCross', 'guillotineCross'][rank - 2] })) },
      { id: 'shadow', stages: [2, 3, 4, 5].map((rank) => ({ professionId: 507, rank, stageId: ['thief', 'assassin', 'assassinCross', 'guillotineCross'][rank - 2] })) },
    ],
  },
  {
    id: 'merchant',
    routes: [
      { id: 'artillery', stages: [2, 3, 4, 5].map((rank) => ({ professionId: 602, rank, stageId: ['merchant', 'blacksmith', 'whitesmith', 'mechanic'][rank - 2] })) },
      { id: 'axe', stages: [2, 3, 4, 5].map((rank) => ({ professionId: 603, rank, stageId: ['merchant', 'blacksmith', 'whitesmith', 'mechanic'][rank - 2] })) },
    ],
  },
]

function baseSkillId(levelSkillId: number): number {
  return Math.trunc(levelSkillId / 100)
}

function stageSkillLevels(source: ProfessionStageSource, rows: JobSkillRow[]): Map<number, number> {
  const result = new Map<number, number>()
  rows
    .filter((row) => row.iProfessionID === source.professionId && row.iJobRank === source.rank)
    .sort((left, right) => left.iJobLv - right.iJobLv)
    .forEach((row) => {
      row.kDescData?.forEach((levelSkillId) => {
        const skillId = baseSkillId(levelSkillId)
        if (skillId > 0 && !result.has(skillId)) result.set(skillId, row.iJobLv)
      })
    })
  return result
}

export function buildProfessionStages(
  route: ProfessionRoute,
  rows: JobSkillRow[],
  skillIndex: Map<number, SkillIndexEntry>,
): ProfessionStageData[] {
  let previousSkillIds = new Set<number>()
  return route.stages.map((source) => {
    const levels = stageSkillLevels(source, rows)
    const skills = [...levels.entries()]
      .map(([skillId, unlockLevel]) => ({
        skillId,
        skill: skillIndex.get(skillId),
        unlockLevel,
        inherited: previousSkillIds.has(skillId),
      }))
      .sort((left, right) => Number(left.inherited) - Number(right.inherited)
        || left.unlockLevel - right.unlockLevel
        || left.skillId - right.skillId)
    const result = {
      ...source,
      skills,
      newSkillCount: skills.filter((skill) => !skill.inherited).length,
    }
    previousSkillIds = new Set(skills.map((skill) => skill.skillId))
    return result
  })
}
