import { describe, expect, it } from 'vitest'
import { filterMonsters, filterPets, findPetStar, petSkillIds } from './creatureCatalog'
import type { MonsterRecord, PetRecord, PetStarRecord } from './creatureData'

const pet = (id: number, name: string, quality: number, king = false): PetRecord => ({
  id,
  name: { 'zh-CN': name },
  starTableName: { 'zh-CN': name },
  quality,
  camp: 1,
  king,
  monsterId: id,
  followPetId: id,
  unlockStar: 5,
  sort: id,
  show: true,
  art: {
    head: '', starHead: '', handbook: '', fightList: '', fightField: '', encyclopedia: '',
    gacha: '', gachaAward: '', tips: '',
  },
})

describe('filterPets', () => {
  const pets = [pet(1, '波利', 3), pet(2, '艾斯恩魔女', 5, true)]

  it('filters by localized name, quality, and king status', () => {
    expect(filterPets(pets, '艾斯', 5, true).map((entry) => entry.id)).toEqual([2])
    expect(filterPets(pets, '', 3, false).map((entry) => entry.id)).toEqual([1])
  })
})

describe('filterMonsters', () => {
  const monsters: MonsterRecord[] = [
    { id: 1, name: { 'zh-CN': '波利' }, level: 5, race: 1, element: 3, size: 1 },
    { id: 2, name: { 'zh-CN': '黄金虫' }, level: 60, rank: 'mvp', race: 9, element: 4, size: 3 },
  ]

  it('combines text, rank, enum, and level filters', () => {
    expect(filterMonsters(monsters, '黄金', {
      rank: 'mvp', race: 9, element: 4, size: 3, levelMin: 31, levelMax: 60,
    }).map((entry) => entry.id)).toEqual([2])
  })

  it('keeps records without a level in the unfiltered roster', () => {
    expect(filterMonsters([{ id: 3 }], '', {
      rank: 'all', race: 0, element: 0, size: 0, levelMin: 0, levelMax: 100,
    })).toHaveLength(1)
  })
})

describe('pet star helpers', () => {
  const stars: PetStarRecord[] = [{
    id: 1,
    petId: 100,
    star: 2,
    stage: 0,
    baseAttr: 10000,
    starFightStrength: 1,
    starAssistStrength: 1,
    collectStrength: 1,
    fightAttributes: [],
    collectAttributes: [],
    activeSkills: [10, 11],
    passiveMain: 12,
    protectSkill: 13,
    corePassiveSkill: 12,
    assistSkill: [],
    stageSkill: [14],
  }]

  it('selects stage zero and de-duplicates its skills', () => {
    const row = findPetStar(stars, 100, 2)
    expect(row?.id).toBe(1)
    expect(petSkillIds(row)).toEqual([10, 11, 12, 13, 14])
  })
})
