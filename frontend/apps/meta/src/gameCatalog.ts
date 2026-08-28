export const GAME_CATEGORIES = [
  'all',
  'mmorpg',
  'singlePlayer',
  'survivalAdventure',
  'cardStrategy',
] as const

export type GameCategory = (typeof GAME_CATEGORIES)[number]
export type SpecificGameCategory = Exclude<GameCategory, 'all'>

const GAME_CATEGORY_MAP: Record<string, readonly SpecificGameCategory[]> = {
  aion2: ['mmorpg'],
  gmzz: ['mmorpg'],
  palworld: ['survivalAdventure'],
  vrising: ['singlePlayer', 'survivalAdventure'],
  sts2: ['singlePlayer', 'cardStrategy'],
}

export interface CatalogEntry {
  id: string
  categories: readonly SpecificGameCategory[]
  searchText: string
}

export function getGameCategories(siteId: string): readonly SpecificGameCategory[] {
  return GAME_CATEGORY_MAP[siteId] ?? []
}

export function filterCatalogEntries<T extends CatalogEntry>(
  entries: readonly T[],
  category: GameCategory,
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  return entries.filter((entry) => {
    const matchesCategory = category === 'all' || entry.categories.includes(category)
    const matchesQuery = !normalizedQuery || entry.searchText.toLocaleLowerCase().includes(normalizedQuery)
    return matchesCategory && matchesQuery
  })
}

export function countCatalogCategories(entries: readonly CatalogEntry[]): Record<GameCategory, number> {
  return Object.fromEntries(
    GAME_CATEGORIES.map((category) => [
      category,
      category === 'all'
        ? entries.length
        : entries.filter((entry) => entry.categories.includes(category)).length,
    ]),
  ) as Record<GameCategory, number>
}

export function paginateCatalogEntries<T>(entries: readonly T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.max(1, Math.floor(pageSize))
  const start = (safePage - 1) * safePageSize
  return entries.slice(start, start + safePageSize)
}
