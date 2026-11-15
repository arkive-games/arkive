import { describe, expect, it } from 'vitest'
import { getMemoryKey, MemoryClient, sessionScrollBinding, type StorageLike } from '@gamemap/state-memory'
import { cardQueryRecord, createCardFacetsRecord, isCardFilter, legacyFilterRecord, referenceScrollRecord } from './memory'
import { EMPTY_FILTER } from './useFilteredCards'

function storage(): StorageLike {
  const values = new Map<string, string>()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  }
}

describe('Slay the Spire 2 reference context', () => {
  it('adopts old facets without replacing newer session choices or rewriting the device seed', () => {
    const deviceStorage = storage()
    const sessionStorage = storage()
    const client = new MemoryClient({ deviceStorage, sessionStorage })
    client.write(legacyFilterRecord, { ...EMPTY_FILTER, pools: ['ironclad'], query: 'old search' })
    const original = deviceStorage.getItem(getMemoryKey(legacyFilterRecord))
    const facets = createCardFacetsRecord(client)
    expect(client.read(facets)).toEqual({ ...EMPTY_FILTER, pools: ['ironclad'] })
    client.write(facets, { ...EMPTY_FILTER, costs: [1] })
    client.write(cardQueryRecord, 'block')
    const reloaded = new MemoryClient({ deviceStorage, sessionStorage })
    expect(reloaded.read(facets)).toEqual({ ...EMPTY_FILTER, costs: [1] })
    expect(reloaded.read(cardQueryRecord)).toBe('block')
    client.write(facets, { ...EMPTY_FILTER })
    expect(reloaded.read(facets)).toEqual(EMPTY_FILTER)
    expect(deviceStorage.getItem(getMemoryKey(legacyFilterRecord))).toBe(original)
  })

  it('keeps positions independent by result set and detail entity', () => {
    const client = new MemoryClient({ sessionStorage: storage() })
    const bind = (scope: string, resultsKey = '') => sessionScrollBinding(referenceScrollRecord, { scope, resultsKey, ready: true }, client)
    bind('cards', 'block').write(1200)
    bind('card:STRIKE').write(300)
    expect(bind('cards', 'block').read()).toBe(1200)
    expect(bind('cards', 'poison').read()).toBe(0)
    expect(bind('character:IRONCLAD').read()).toBe(0)
    expect(bind('card:DEFEND').read()).toBe(0)
  })

  it('rejects malformed facets and tolerates unavailable storage', () => {
    expect(isCardFilter({ ...EMPTY_FILTER, costs: [Number.NaN] })).toBe(false)
    expect(isCardFilter({ ...EMPTY_FILTER, pools: [null] })).toBe(false)
    const client = new MemoryClient({})
    const facets = createCardFacetsRecord(client)
    expect(client.read(facets)).toEqual(EMPTY_FILTER)
    expect(client.write(facets, { ...EMPTY_FILTER, types: ['Attack'] })).toBe(false)
  })
})
