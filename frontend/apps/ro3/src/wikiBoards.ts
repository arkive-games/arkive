import type { MonsterRank, MonsterRecord } from './creatureData'
import type { EquipmentRecord, SoulRecord } from './wikiData'

// The tables leave rows the game never names for players: "no translation
// needed" and "to be decided" placeholders, written as escapes to keep the
// source English.
export const PLACEHOLDER_NAME = /\u65e0\u9700\u7ffb\u8bd1|\u5f85\u5b9a/
const PLACEHOLDER_MARK = /[\u3010[]\u65e0\u9700\u7ffb\u8bd1[\u3011\]]/g

export function stripPlaceholder(value: string): string {
  return value.replace(PLACEHOLDER_MARK, '').trim()
}

const zh = (text?: { 'zh-CN'?: string }) => text?.['zh-CN'] ?? ''

/* ---------- pages ---------- */

export type PageSlot = number | 'gap'

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size))
}

/** The page buttons to show: both ends, the pages either side of the current one, and gaps between. */
export function pageWindow(current: number, count: number): PageSlot[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index)
  const from = Math.max(1, Math.min(current - 1, count - 4))
  const to = Math.min(count - 2, Math.max(current + 1, 3))
  const slots: PageSlot[] = [0]
  if (from > 1) slots.push('gap')
  for (let page = from; page <= to; page += 1) slots.push(page)
  if (to < count - 2) slots.push('gap')
  slots.push(count - 1)
  return slots
}

/* ---------- monsters ---------- */

const RANK_ORDER: Record<MonsterRank, number> = { normal: 0, elite: 1, mvp: 2, boss: 3 }
const MAX_VARIANTS = 24

export interface MonsterGroup {
  name: string
  icon: string
  rank: MonsterRank
  race?: number
  element?: number
  size?: number
  /** One row per distinct level and stat line, lowest level first. */
  variants: MonsterRecord[]
  minLevel: number
  maxLevel: number
}

/**
 * The game places one creature many times over, a row per spawn. Players look
 * a creature up by name, so the rows sharing a name become one entry whose
 * levels the detail steps through.
 */
export function groupMonsters(monsters: MonsterRecord[]): MonsterGroup[] {
  const groups = new Map<string, MonsterGroup>()
  for (const monster of monsters) {
    const name = zh(monster.name)
    if (!name || PLACEHOLDER_NAME.test(name) || !monster.headIcon || !monster.stats || monster.stats.matk == null) continue
    const rank = monster.rank ?? 'normal'
    let group = groups.get(name)
    if (!group) {
      group = { name, icon: monster.headIcon, rank, race: monster.race, element: monster.element, size: monster.size, variants: [], minLevel: 0, maxLevel: 0 }
      groups.set(name, group)
    }
    if (RANK_ORDER[rank] > RANK_ORDER[group.rank]) group.rank = rank
    group.variants.push(monster)
  }
  for (const group of groups.values()) {
    const seen = new Set<string>()
    group.variants = group.variants
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))
      .filter((variant) => {
        const key = `${variant.level}|${Object.entries(variant.stats ?? {}).sort().join()}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, MAX_VARIANTS)
    group.minLevel = group.variants[0].level ?? 0
    group.maxLevel = group.variants[group.variants.length - 1].level ?? 0
  }
  return [...groups.values()].sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank] || a.minLevel - b.minLevel)
}

/** The row a detail opens on: the first one the game places or drops loot from, else the strongest. */
export function defaultVariant(group: MonsterGroup): number {
  const placed = group.variants.findIndex((variant) => (variant.maps?.length ?? 0) > 0 || variant.dropPool || (variant.normalDropPools?.length ?? 0) > 0)
  return placed >= 0 ? placed : group.variants.length - 1
}

export interface MonsterFilter {
  rank: MonsterRank | 'all'
  band: [number, number] | null
  element: number | null
  race: number | null
  size: number | null
  query: string
}

export function filterMonsterGroups(groups: MonsterGroup[], filter: MonsterFilter): MonsterGroup[] {
  const query = filter.query.trim().toLowerCase()
  return groups.filter((group) =>
    (filter.rank === 'all' || group.rank === filter.rank)
    && (!filter.band || group.variants.some((variant) => (variant.level ?? 0) >= filter.band![0] && (variant.level ?? 0) <= filter.band![1]))
    && (filter.element === null || group.element === filter.element)
    && (filter.race === null || group.race === filter.race)
    && (filter.size === null || group.size === filter.size)
    && (!query || group.name.toLowerCase().includes(query)))
}

/** A drop chance as players read it: a sure drop, or a percentage to one decimal. */
export function dropChance(chance: number): number | 'sure' {
  return chance >= 1 ? 'sure' : Math.round(chance * 1000) / 10
}

/* ---------- attributes ---------- */

export interface AttributeName {
  iID: number
  iCalculateType?: number
  name?: { 'zh-CN'?: string }
  nameEquip?: { 'zh-CN'?: string }
  kVariable?: string
}

/**
 * A percentage attribute is named with a trailing "%" (or flagged by its
 * calculation type) and stored in hundredths: 500 is 5%.
 */
export function attributeFormat(attribute: AttributeName | undefined): { label: string; percent: boolean } {
  const name = zh(attribute?.nameEquip) || zh(attribute?.name) || attribute?.kVariable || ''
  const percent = name.endsWith('%') || attribute?.iCalculateType === 2
  return { label: name.replace(/%$/, ''), percent }
}

export function attributeValue(value: number, percent: boolean): string {
  if (!percent) return value.toLocaleString('zh-CN')
  return `${Number((value / 100).toFixed(2))}%`
}

/* ---------- equipment ---------- */

export const EQUIPMENT_SLOTS = ['weapon', 'offhand', 'armor', 'cloak', 'shoes', 'accessory'] as const
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number]
/** The level the game sets on gear that has no level of its own: event and special pieces. */
export const SPECIAL_LEVEL = 999

export interface EquipmentGroup {
  key: string
  name: string
  slot: EquipmentSlot
  icon: string
  level: number
  /** One row per quality, lowest first. */
  variants: EquipmentRecord[]
  qualities: number[]
}

const EMPTY_ICON = 'icons/equipment/item_null.webp'

/** A piece of gear comes in a row per quality; they become one entry per name and slot. */
export function groupEquipment(rows: EquipmentRecord[]): EquipmentGroup[] {
  const groups = new Map<string, EquipmentGroup>()
  for (const row of rows) {
    const name = zh(row.name)
    if (!row.item || !name || PLACEHOLDER_NAME.test(name) || !row.icon || row.icon === EMPTY_ICON) continue
    if (!EQUIPMENT_SLOTS.includes(row.slot as EquipmentSlot)) continue
    const key = `${name}|${row.slot}`
    let group = groups.get(key)
    if (!group) {
      group = { key, name, slot: row.slot as EquipmentSlot, icon: row.icon, level: row.item.iLevelNeed ?? 0, variants: [], qualities: [] }
      groups.set(key, group)
    }
    group.variants.push(row)
  }
  for (const group of groups.values()) {
    const seen = new Set<number>()
    group.variants = group.variants
      .sort((a, b) => (a.item?.iQuality ?? 1) - (b.item?.iQuality ?? 1))
      .filter((row) => {
        const quality = row.item?.iQuality ?? 1
        if (seen.has(quality)) return false
        seen.add(quality)
        return true
      })
    group.qualities = group.variants.map((row) => row.item?.iQuality ?? 1)
  }
  return [...groups.values()]
}

export interface EquipmentFilter {
  slot: EquipmentSlot | 'all'
  level: number | null
  quality: number | null
  query: string
}

export function filterEquipmentGroups(groups: EquipmentGroup[], filter: EquipmentFilter): EquipmentGroup[] {
  const query = filter.query.trim().toLowerCase()
  return groups.filter((group) =>
    (filter.slot === 'all' || group.slot === filter.slot)
    && (filter.level === null || group.level === filter.level)
    && (filter.quality === null || group.qualities.includes(filter.quality))
    && (!query || group.name.toLowerCase().includes(query)))
}

/* ---------- souls ---------- */

/** The top level of a soul of each quality, from the level table; 10 when the table has none. */
export function soulLevelCaps(levels: Array<{ iLv?: number; iQuality?: number }>): Map<number, number> {
  const caps = new Map<number, number>()
  for (const row of levels) {
    if (row.iQuality === undefined || !row.iLv) continue
    caps.set(row.iQuality, Math.max(caps.get(row.iQuality) ?? 0, row.iLv))
  }
  return caps
}

export const DEFAULT_SOUL_CAP = 10

/** Each primary attribute at `level`: the base plus one step per level past the first. */
export function soulPrimaryAt(soul: SoulRecord, level: number): Array<{ id: number; value: number; step: number }> {
  const steps = new Map((soul.primaryAttributeLevelUp ?? []).map((row) => [row.attributeId, row.min ?? 0]))
  return (soul.primaryAttributes ?? []).flatMap((row) => {
    if (row.attributeId === undefined) return []
    const step = steps.get(row.attributeId) ?? 0
    return [{ id: row.attributeId, value: (row.min ?? 0) + step * (level - 1), step }]
  })
}

/** The secondary pool by attribute, each with the widest range a roll can land in. */
export function soulSubPool(soul: SoulRecord): Array<{ id: number; min?: number; max?: number }> {
  const pool = new Map<number, { id: number; min?: number; max?: number }>()
  for (const row of soul.subAttributes ?? []) {
    const id = row.attributeId ?? row.iSubAttriID
    if (id === undefined) continue
    const kept = pool.get(id)
    if (!kept) {
      pool.set(id, { id, min: row.iMin, max: row.iMax })
      continue
    }
    if (row.iMin !== undefined) kept.min = kept.min === undefined ? row.iMin : Math.min(kept.min, row.iMin)
    if (row.iMax !== undefined) kept.max = kept.max === undefined ? row.iMax : Math.max(kept.max, row.iMax)
  }
  return [...pool.values()]
}
