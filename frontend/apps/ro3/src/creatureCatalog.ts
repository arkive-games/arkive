import { localizedText } from './cardCatalog'
import type { MonsterRank, MonsterRecord, PetRecord, PetStarRecord } from './creatureData'

export interface MonsterFilters {
  rank: MonsterRank | 'all'
  race: number
  element: number
  size: number
  levelMin: number
  levelMax: number
}

export function filterPets(
  pets: PetRecord[],
  query: string,
  quality: number,
  kingOnly: boolean,
): PetRecord[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  return pets
    .filter((pet) => !quality || pet.quality === quality)
    .filter((pet) => !kingOnly || pet.king)
    .filter((pet) => !normalized || [pet.id, localizedText(pet.name)]
      .some((value) => String(value).toLocaleLowerCase('zh-CN').includes(normalized)))
    .sort((left, right) => right.quality - left.quality || left.sort - right.sort)
}

export function filterMonsters(
  monsters: MonsterRecord[],
  query: string,
  filters: MonsterFilters,
): MonsterRecord[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  return monsters.filter((monster) => {
    const rank = monster.rank ?? 'normal'
    if (filters.rank !== 'all' && rank !== filters.rank) return false
    if (filters.race && monster.race !== filters.race) return false
    if (filters.element && monster.element !== filters.element) return false
    if (filters.size && monster.size !== filters.size) return false
    if (monster.level === undefined && filters.levelMin > 0) return false
    if (monster.level !== undefined && (monster.level < filters.levelMin || monster.level > filters.levelMax)) return false
    if (!normalized) return true
    return [monster.id, localizedText(monster.name)]
      .some((value) => String(value).toLocaleLowerCase('zh-CN').includes(normalized))
  }).sort((left, right) => {
    const score = (monster: MonsterRecord) => (
      (monster.headIcon ? 8 : 0)
      + (monster.stats ? 4 : 0)
      + (localizedText(monster.name) ? 2 : 0)
      + (monster.skills?.length ? 1 : 0)
    )
    const rankOrder = { boss: 0, mvp: 1, elite: 2, normal: 3 }
    return score(right) - score(left)
      || rankOrder[left.rank ?? 'normal'] - rankOrder[right.rank ?? 'normal']
      || (left.level ?? 999) - (right.level ?? 999)
      || left.id - right.id
  })
}

export function findPetStar(stars: PetStarRecord[], petId: number, star: number): PetStarRecord | null {
  return stars.find((row) => row.petId === petId && row.star === star && row.stage === 0) ?? null
}

export function petSkillIds(row: PetStarRecord | null): number[] {
  if (!row) return []
  return [...new Set([
    ...row.activeSkills,
    row.passiveMain,
    row.protectSkill,
    row.corePassiveSkill,
    ...row.assistSkill,
    ...row.stageSkill,
  ].filter((value): value is number => Boolean(value)))]
}
