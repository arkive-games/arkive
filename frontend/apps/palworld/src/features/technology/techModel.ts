import type { TechEntry } from '../../lib/catalog'

/** A tech's derived kind, used for the tile's type badge (道具 / 建筑). */
export type TechType = 'item' | 'structure'

/** Reference to the entry whose icon represents a tech on its tile. */
export interface TechImageRef {
  kind: 'item' | 'building'
  id: string
}

/** One level's worth of techs within a region. */
export interface LevelGroup {
  level: number
  techs: TechEntry[]
}

/** The two-region split shown on the page (normal left, ancient right). */
export interface Regions {
  normal: LevelGroup[]
  ancient: LevelGroup[]
}

/**
 * Derived type badge. A tech that unlocks any item is an "item" tech; otherwise
 * (buildings only, or nothing) it gates a structure. Item unlocks take
 * precedence for the rare tech that unlocks both.
 */
export function techType(tech: TechEntry): TechType {
  return tech.unlockItems.length > 0 ? 'item' : 'structure'
}

/**
 * The entry whose icon represents the tech on its tile — the first unlocked
 * item, else the first unlocked building, else null (no icon available).
 */
export function techImage(tech: TechEntry): TechImageRef | null {
  if (tech.unlockItems.length > 0) return { kind: 'item', id: tech.unlockItems[0] }
  if (tech.unlockBuildings.length > 0) return { kind: 'building', id: tech.unlockBuildings[0] }
  return null
}

/** Case-insensitive substring match; an empty/blank query matches everything. */
export function matchesQuery(name: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return name.toLowerCase().includes(q)
}

/**
 * Group techs by level (ascending), preserving the input order within each
 * level. `technology.json` is emitted in the game's tech-tree order, so keeping
 * that order makes the page match the game and stay identical across languages
 * (never sort by localized name here).
 */
export function groupByLevel(techs: TechEntry[]): LevelGroup[] {
  const byLevel = new Map<number, TechEntry[]>()
  for (const tech of techs) {
    const arr = byLevel.get(tech.level)
    if (arr) arr.push(tech)
    else byLevel.set(tech.level, [tech])
  }
  return [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, list]) => ({ level, techs: list }))
}

/**
 * Split techs into normal (`isBoss: false`) and ancient (`isBoss: true`)
 * regions, filter by the search query on localized name, and group each region
 * by level.
 */
export function buildRegions(
  techs: TechEntry[],
  nameOf: (tech: TechEntry) => string,
  query = '',
): Regions {
  const normal: TechEntry[] = []
  const ancient: TechEntry[] = []
  for (const tech of techs) {
    if (!matchesQuery(nameOf(tech), query)) continue
    if (tech.isBoss) ancient.push(tech)
    else normal.push(tech)
  }
  return {
    normal: groupByLevel(normal),
    ancient: groupByLevel(ancient),
  }
}
