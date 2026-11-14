import { describe, expect, it } from 'vitest'
import { compatibleWikiValue, validMonsterFilter } from './wikiMemory'
import { wikiContextRecord } from './wikiMemory'
import { MemoryClient } from '@gamemap/state-memory'

describe('wiki context validation', () => {
  it('round-trips category paging independently without putting browsing state in durable storage', () => {
    const values = new Map<string, string>()
    const sessionStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value)
      },
      removeItem: (key: string) => {
        values.delete(key)
      },
    }
    const client = new MemoryClient({ sessionStorage })
    const monsters = wikiContextRecord('monsters.paging', { key: '', page: 0 })
    const cards = wikiContextRecord('cards.paging', { key: '', page: 0 })
    expect(client.write(monsters, { key: 'mvp', page: 2 })).toBe(true)
    expect(client.read(monsters)).toEqual({ key: 'mvp', page: 2 })
    expect(client.read(cards)).toEqual({ key: '', page: 0 })
  })
  it('accepts an actual level band and rejects malformed filters without touching other memory', () => {
    const filter = {
      rank: 'mvp',
      band: [20, 40],
      element: null,
      race: 2,
      size: null,
      query: 'Maya',
    }
    expect(validMonsterFilter(filter)).toBe(true)
    expect(validMonsterFilter({ ...filter, band: '20-40' })).toBe(false)
    expect(validMonsterFilter({ ...filter, rank: 'obsolete' })).toBe(false)
    expect(validMonsterFilter({ ...filter, query: {} })).toBe(false)
  })

  it('rejects corrupt paging, selection levels and facet arrays', () => {
    expect(
      compatibleWikiValue({ key: 'mvp', page: 2 }, { key: '', page: 0 }),
    ).toBe(true)
    expect(
      compatibleWikiValue({ key: 'mvp', page: '2' }, { key: '', page: 0 }),
    ).toBe(false)
    expect(compatibleWikiValue({ '12': 3 }, {})).toBe(true)
    expect(compatibleWikiValue({ '12': '3' }, {})).toBe(false)
    expect(compatibleWikiValue(['broken'], [])).toBe(false)
  })
})
