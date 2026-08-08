import { describe, expect, it } from 'vitest'
import {
  countCatalogCategories,
  filterCatalogEntries,
  paginateCatalogEntries,
  type CatalogEntry,
} from './gameCatalog'

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
