export interface WikiProfessionStage {
  id: string
  label: string
  sourceName: string
  tier: number
  skillIds: string[]
}

export interface WikiSkillEvidence {
  eventName: string
  source: string
  status: 'client-event-id'
}

export interface WikiSkillDetail {
  stage: WikiProfessionStage
  skillId: string
  evidence: WikiSkillEvidence
  fields: {
    name: 'unavailable'
    description: 'unavailable'
    values: 'unavailable'
  }
}

export interface WikiProfessionLine {
  id: string
  label: string
  baseStageId: string
  paths: string[][]
}

const stages: WikiProfessionStage[] = [
  {
    id: 'swordman', label: '剑士', sourceName: 'Swordman', tier: 1,
    skillIds: ['11001', '11002'],
  },
  {
    id: 'knight', label: '骑士', sourceName: 'Knight', tier: 2,
    skillIds: ['11104', '11105', '11106', '11108', '11109', '11110', '11120', '11122', '11125', '11126', '11127'],
  },
  {
    id: 'lord-knight', label: '骑士领主', sourceName: 'LordKnight', tier: 3,
    skillIds: ['11201', '11202', '11207', '11208', '11210', '11213', '11214', '11221'],
  },
  {
    id: 'rune-knight', label: '符文骑士', sourceName: 'RuneKnight', tier: 4,
    skillIds: ['11301', '11302', '11303', '11304', '11305', '11306', '11308', '11309', '11310', '11311', '11312', '11314', '11315', '11316'],
  },
  {
    id: 'crusader', label: '十字军', sourceName: 'Crusader', tier: 2,
    skillIds: ['11408', '11409', '11410', '11411', '11412', '11413', '11414', '11415', '11418', '11422', '11423', '11424', '11426'],
  },
  {
    id: 'paladin', label: '圣殿十字军', sourceName: 'Paladin', tier: 3,
    skillIds: ['11011', '11501', '11502', '11503', '11504'],
  },
  {
    id: 'royal-guard', label: '皇家卫士', sourceName: 'RoyalGuard', tier: 4,
    skillIds: ['11601', '11602', '11603', '11604', '11605', '11606', '11607', '11608', '11610', '11611', '11612', '11613', '11615', '11616', '11617', '11618', '11624', '11626', '11634', '11638', '11639', '11640', '11641'],
  },
  {
    id: 'magician', label: '魔法师', sourceName: 'Magician', tier: 1,
    skillIds: ['12002', '12004', '12005', '12006', '12008', '12010', '12011', '12012', '12013', '12014', '12015', '12016'],
  },
  {
    id: 'wizard', label: '巫师', sourceName: 'Wizard', tier: 2,
    skillIds: ['12100', '12101', '12102', '12103', '12104', '12105', '12106', '12107', '12108'],
  },
  {
    id: 'high-wizard', label: '超魔导士', sourceName: 'HighWizard', tier: 3,
    skillIds: ['12201', '12203', '12210', '12212', '12213'],
  },
  {
    id: 'warlock', label: '咒术士', sourceName: 'Warlock', tier: 4,
    skillIds: ['12301', '12302', '12303', '12304', '12305', '12307', '12308', '12309', '12310', '12311', '12312', '12313', '12314', '12315', '12316', '12342', '12345', '12403', '12404', '12423', '12432', '12433', '12442', '12443', '12452', '12462', '12482'],
  },
  {
    id: 'archer', label: '弓箭手', sourceName: 'Archer', tier: 1,
    skillIds: ['13003', '13004', '13005', '13006'],
  },
  {
    id: 'hunter', label: '猎人', sourceName: 'Hunter', tier: 2,
    skillIds: ['13102', '13103', '13106', '13107', '13108', '13109'],
  },
  {
    id: 'sniper', label: '神射手', sourceName: 'Sniper', tier: 3,
    skillIds: ['13201', '13202', '13203', '13204', '13210', '13211', '13213', '13214', '13215', '13216'],
  },
  {
    id: 'ranger', label: '游侠', sourceName: 'Ranger', tier: 4,
    skillIds: ['13302', '13303', '13305', '13306', '13307', '13308', '13309', '13312', '13313', '13314', '13315', '13320', '13325', '13326', '13327', '13328', '13329', '13330', '13400'],
  },
  {
    id: 'acolyte', label: '服事', sourceName: 'Acolyte', tier: 1,
    skillIds: ['14001', '14005', '14006', '14007', '14010', '14014', '14015', '14016', '14017'],
  },
  {
    id: 'priest', label: '牧师', sourceName: 'Priest', tier: 2,
    skillIds: ['14102', '14105', '14106', '14109', '14113', '14115', '14117', '14118', '14119', '14121', '14122', '14123'],
  },
  {
    id: 'high-priest', label: '神官', sourceName: 'HighPriest', tier: 3,
    skillIds: ['14201', '14206', '14208', '14211', '14212', '14213', '14214', '14215', '14216', '14217'],
  },
  {
    id: 'arch-bishop', label: '大主教', sourceName: 'ArchBishop', tier: 4,
    skillIds: ['14301', '14302', '14303', '14304', '14305', '14307', '14309', '14310', '14312', '14313', '14314'],
  },
  {
    id: 'merchant', label: '商人', sourceName: 'Merchant', tier: 1,
    skillIds: ['16006', '16007', '16008', '16009', '16010'],
  },
  {
    id: 'blacksmith', label: '铁匠', sourceName: 'Blacksmith', tier: 2,
    skillIds: ['16104', '16105', '16106', '16107', '16108'],
  },
  {
    id: 'whitesmith', label: '神工匠', sourceName: 'Whitesmith', tier: 3,
    skillIds: ['16201', '16202', '16203', '16204', '16205', '16206'],
  },
  {
    id: 'mechanic', label: '机匠', sourceName: 'Mechanic', tier: 4,
    skillIds: ['16304', '16305', '16306', '16307', '16308', '16311', '16312', '16313', '16314', '16315', '16316', '16317', '16318', '16320', '16350'],
  },
  {
    id: 'thief', label: '盗贼', sourceName: 'Thief', tier: 1,
    skillIds: ['15005', '15006', '15007'],
  },
  {
    id: 'assassin', label: '刺客', sourceName: 'Assassin', tier: 2,
    skillIds: ['15102', '15105', '15106', '15109', '15110', '15111'],
  },
  {
    id: 'assassin-cross', label: '十字刺客', sourceName: 'AssassinCross', tier: 3,
    skillIds: ['15231', '15232', '15235', '15236', '15237'],
  },
  {
    id: 'guillotine-cross', label: '十字切割者', sourceName: 'GuillotineCross', tier: 4,
    skillIds: ['15401', '15402', '15403', '15404', '15405', '15406', '15407', '15408', '15409', '15411', '15412', '15413', '15414', '15415', '15420', '15421', '15422', '15423', '15424', '15427', '15429'],
  },
]

export const WIKI_CLIENT_VERSION = '0.0.1.13'

/**
 * Package evidence captured from the installed client. The Wwise manifest gives us a
 * stable, reviewable event key for each skill id even while the encrypted config table
 * keeps display names and numeric effects unavailable offline.
 */
export const WIKI_PACKAGE_SOURCE = {
  label: 'RO3 client package / Audio/wwisedefine.json',
  sha256: 'B6B6D36D96F6E2E6D422DCEFCF9304AF58ADE8FF6F3E5F765DB08143D8A40A13',
} as const

export const WIKI_PROFESSION_STAGES = stages

export const WIKI_PROFESSION_LINES: WikiProfessionLine[] = [
  {
    id: 'swordman', label: '剑士系', baseStageId: 'swordman',
    paths: [
      ['knight', 'lord-knight', 'rune-knight'],
      ['crusader', 'paladin', 'royal-guard'],
    ],
  },
  { id: 'magician', label: '魔法师系', baseStageId: 'magician', paths: [['wizard', 'high-wizard', 'warlock']] },
  { id: 'archer', label: '弓箭手系', baseStageId: 'archer', paths: [['hunter', 'sniper', 'ranger']] },
  { id: 'acolyte', label: '服事系', baseStageId: 'acolyte', paths: [['priest', 'high-priest', 'arch-bishop']] },
  { id: 'merchant', label: '商人系', baseStageId: 'merchant', paths: [['blacksmith', 'whitesmith', 'mechanic']] },
  { id: 'thief', label: '盗贼系', baseStageId: 'thief', paths: [['assassin', 'assassin-cross', 'guillotine-cross']] },
]

export const WIKI_STAGE_BY_ID = new Map(stages.map((stage) => [stage.id, stage]))

export const WIKI_SKILL_COUNT = stages.reduce((count, stage) => count + stage.skillIds.length, 0)

export function getWikiSkillEvidence(stage: WikiProfessionStage, skillId: string): WikiSkillEvidence {
  return {
    eventName: `Player_${stage.sourceName}_Skill_${skillId}`,
    source: WIKI_PACKAGE_SOURCE.label,
    status: 'client-event-id',
  }
}

/**
 * Return the complete set of facts the client currently exposes for one skill.
 * The explicit unavailable fields keep the UI honest while the encrypted config
 * tables remain absent from the shipped client.
 */
export function getWikiSkillDetail(stage: WikiProfessionStage, skillId: string): WikiSkillDetail {
  return {
    stage,
    skillId,
    evidence: getWikiSkillEvidence(stage, skillId),
    fields: {
      name: 'unavailable',
      description: 'unavailable',
      values: 'unavailable',
    },
  }
}

export function filterWikiSkillIds(lineId: string, stageId: string, query: string) {
  const line = WIKI_PROFESSION_LINES.find((candidate) => candidate.id === lineId)
  if (!line) return []

  const lineStageIds = new Set([line.baseStageId, ...line.paths.flat()])
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')

  return stages
    .filter((stage) => lineStageIds.has(stage.id) && (!stageId || stage.id === stageId))
    .flatMap((stage) => stage.skillIds.map((skillId) => ({
      stage,
      skillId,
      evidence: getWikiSkillEvidence(stage, skillId),
    })))
    .filter(({ stage, skillId }) => !normalizedQuery
      || skillId.includes(normalizedQuery)
      || stage.label.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
      || stage.sourceName.toLowerCase().includes(normalizedQuery))
}
