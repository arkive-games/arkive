import { describe, expect, it } from 'vitest'
import {
  countCatalogCategories,
  filterCatalogEntries,
  getGameCategories,
  paginateCatalogEntries,
  type CatalogEntry,
} from './gameCatalog'
import { GAME_LOGOS, SITES } from './sites'

const entries: CatalogEntry[] = [
  { id: 'aion2', categories: ['mmorpg'], searchText: 'AION2' },
  { id: 'vrising', categories: ['singlePlayer', 'survivalAdventure'], searchText: 'V Rising 夜族崛起' },
  { id: 'sts2', categories: ['singlePlayer', 'cardStrategy'], searchText: 'Slay the Spire 2 杀戮尖塔2' },
]

describe('game catalog helpers', () => {
  it('filters by localized name and category together', () => {
    expect(filterCatalogEntries(entries, 'singlePlayer', '夜族')).toEqual([entries[1]])
    expect(filterCatalogEntries(entries, 'mmorpg', 'spire')).toEqual([])
  })

  it('counts every category without hiding uncategorized future games', () => {
    const withFutureGame = [
      ...entries,
      { id: 'future', categories: [], searchText: 'Future Game' },
    ] satisfies CatalogEntry[]

    expect(countCatalogCategories(withFutureGame)).toEqual({
      all: 4,
      mmorpg: 1,
      singlePlayer: 2,
      survivalAdventure: 1,
      cardStrategy: 1,
    })
  })

  it('paginates with safe page values', () => {
    expect(paginateCatalogEntries(entries, 2, 2)).toEqual([entries[2]])
    expect(paginateCatalogEntries(entries, 0, 2)).toEqual(entries.slice(0, 2))
  })
})

// The fixtures above exercise the helpers; this exercises the real list. Both
// lookups a card depends on are `Record<string, …>`, so a game missing from one
// is not a type error — it is a card that silently vanishes under any category
// filter, or an <img> with no src. That is invisible to `tsc` and to every test
// that builds its own entries, which is how ro3 shipped a card without either.
describe('every announced game is wired up', () => {
  it.each(SITES.map((site) => site.id))('%s has catalog categories', (id) => {
    expect(getGameCategories(id), `add ${id} to GAME_CATEGORY_MAP in gameCatalog.ts`).not.toHaveLength(0)
  })

  it.each(SITES.map((site) => site.id))('%s has a forum logo', (id) => {
    expect(GAME_LOGOS[id], `add ${id} to GAME_LOGOS in sites.ts`).toBeTruthy()
  })
})
