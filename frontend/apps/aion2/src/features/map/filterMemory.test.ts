import { describe, expect, it } from 'vitest'
import { MemoryClient, type StorageLike } from '@gamemap/state-memory'
import { legacyMapFilters, readAionFilters, writeAionFilters } from './filterMemory'

function storage(): StorageLike {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
describe('one-time AION2 filter adoption', () => {
  it('adopts once, retains explicit empty filters and starts a new tab with defaults', () => {
    const deviceStorage = storage()
    const sessionStorage = storage()
    const client = new MemoryClient({ deviceStorage, sessionStorage })
    const map = { id: 'world', name: 'World' }
    const valid = new Set(['boss', 'town'])
    const legacy = legacyMapFilters('subtypes', 'old-filter')
    client.write(legacy, ['boss', 'retired'], { partition: map.name })
    expect(readAionFilters('subtypes', map, 'old-filter', valid, client)).toEqual(new Set(['boss']))
    writeAionFilters('subtypes', map.id, new Set(), client)
    const reloaded = new MemoryClient({ deviceStorage, sessionStorage })
    expect(readAionFilters('subtypes', map, 'old-filter', valid, reloaded)).toEqual(new Set())
    const newTab = new MemoryClient({ deviceStorage, sessionStorage: storage() })
    expect(readAionFilters('subtypes', map, 'old-filter', valid, newTab)).toBeNull()
    expect(client.read(legacy, { partition: map.name })).toEqual(['boss', 'retired'])
  })
  it('preserves newer context and isolates maps and regions', () => {
    const client = new MemoryClient({ deviceStorage: storage(), sessionStorage: storage() })
    const map = { id: 'world', name: 'World' }
    writeAionFilters('subtypes', map.id, new Set(['town']), client)
    client.write(legacyMapFilters('subtypes', 'old-filter'), ['boss'], { partition: map.name })
    expect(readAionFilters('subtypes', map, 'old-filter', new Set(['town', 'boss']), client)).toEqual(new Set(['town']))
    expect(readAionFilters('regions', map, 'old-regions', new Set(['town']), client)).toBeNull()
    expect(readAionFilters('subtypes', { id: 'cave', name: 'Cave' }, 'old-cave', new Set(['town']), client)).toBeNull()
  })
})
