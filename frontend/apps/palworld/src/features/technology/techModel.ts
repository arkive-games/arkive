import type {
  TechEntry,
  ItemsBundle,
  BuildingsBundle,
  BuildingEntry,
  TechBundle,
} from '../../lib/catalog'

/** Lowest technology level that unlocks the building — the building's "level".
 *  Undefined when nothing unlocks it (or the tech bundle isn't loaded); the
 *  raw table's Rank field is a constant 1 across the whole game, so this is
 *  the only meaningful tier. */
export function buildingUnlockLevel(
  building: BuildingEntry,
  tech?: TechBundle,
): number | undefined {
  const levels = (building.unlockTech ?? [])
    .map((tid) => tech?.byId.get(tid)?.level)
    .filter((l): l is number => l != null)
  return levels.length ? Math.min(...levels) : undefined
}

/** A tech's derived kind, used for the tile's type badge (道具 / 建筑). */
export type TechType = 'item' | 'structure'

/** Reference to the entry whose icon represents a tech on its tile. */
export interface TechImageRef {
  kind: 'item' | 'building'
  id: string
}

/** A tech's tile/chip icon, resolved to a concrete icon texture id. */
export interface ResolvedTechImage {
  kind: TechImageRef['kind']
  icon: string
}

/** The slice of the pals bundle the resolvers need (structural, so tests and
 *  pages can pass the full `PalsBundle`). */
export interface PalsLike {
  byId: Map<string, { icon?: string }>
  text: Record<string, { name: string }>
}

/** A resolved pal reference (for the capture-requirement chip). */
export interface ResolvedPalRef {
  id: string
  name: string
  icon?: string
}

/** Lookups a tile/chip needs to render itself and its hover-card details. */
export interface TechResolvers {
  name: (tech: TechEntry) => string
  description: (tech: TechEntry) => string | undefined
  image: (tech: TechEntry) => ResolvedTechImage | null
  requireTechName: (tech: TechEntry) => string | undefined
  /** The prerequisite tech's full entry (`requireTech`), for a cross-link chip. */
  requireTechEntry: (tech: TechEntry) => TechEntry | undefined
  /** Localized tower name for `requireBoss` (falls back to the raw boss id). */
  requireBossName: (tech: TechEntry) => string | undefined
  /** Localized research name for `requireResearch` (falls back to the raw id). */
  requireResearchName: (tech: TechEntry) => string | undefined
  /** The pal to capture (`requirePal`), resolved to a name + icon. */
  requirePal: (tech: TechEntry) => ResolvedPalRef | undefined
  iname: (id: string) => string
  bname: (id: string) => string
  itemIcon: (id: string) => string | undefined
  buildingIcon: (id: string) => string | undefined
}

/**
 * Build the lookups a TechTile / TechChip needs from the loaded catalog
 * bundles. The tile has no icon of its own: it uses the first unlocked entry's
 * icon, falling back to the tools-stamped `tech.icon` basename.
 */
export function makeTechResolvers(
  items: ItemsBundle,
  buildings: BuildingsBundle,
  tech: TechBundle,
  pals: PalsLike,
): TechResolvers {
  return {
    name: (t) => tech.text[t.id]?.name ?? t.id,
    description: (t) => tech.text[t.id]?.description,
    image: (t) => {
      const ref = techImage(t)
      if (ref) {
        const icon =
          ref.kind === 'item' ? items.byId.get(ref.id)?.icon : buildings.byId.get(ref.id)?.icon
        if (icon) return { kind: ref.kind, icon }
      }
      if (t.icon) return { kind: 'item', icon: t.icon }
      return null
    },
    requireTechName: (t) =>
      t.requireTech ? (tech.text[t.requireTech]?.name ?? t.requireTech) : undefined,
    requireTechEntry: (t) => (t.requireTech ? tech.byId.get(t.requireTech) : undefined),
    requireBossName: (t) =>
      t.requireBoss ? (tech.text[t.id]?.requireBossName ?? t.requireBoss) : undefined,
    requireResearchName: (t) =>
      t.requireResearch ? (tech.text[t.id]?.requireResearchName ?? t.requireResearch) : undefined,
    requirePal: (t) =>
      t.requirePal
        ? {
            id: t.requirePal,
            name: pals.text[t.requirePal]?.name ?? t.requirePal,
            icon: pals.byId.get(t.requirePal)?.icon,
          }
        : undefined,
    iname: (id) => items.text[id]?.name ?? id,
    bname: (id) => buildings.text[id]?.name ?? id,
    itemIcon: (id) => items.byId.get(id)?.icon,
    buildingIcon: (id) => buildings.byId.get(id)?.icon,
  }
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
