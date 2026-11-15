import { describe, expect, it } from 'vitest'
import { createMapViewStore } from './mapViewStore'
import { MemoryClient, type StorageLike } from './core'

function storage(): StorageLike {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}
describe('map camera and selection lifetimes', () => {
  it('keeps cameras across tabs while selections stay in their owning tab', () => {
    const deviceStorage = storage()
    const sessionStorage = storage()
    const first = createMapViewStore('test-view', { client: new MemoryClient({ deviceStorage, sessionStorage }) })
    first.set(JSON.stringify({ world: { x: 10, y: 20, zoom: 3, marker: 'target' }, cave: { x: 1, y: 2, zoom: 4, marker: null } }))
    const reloaded = createMapViewStore('test-view', { client: new MemoryClient({ deviceStorage, sessionStorage }) })
    expect(JSON.parse(reloaded.get()!).world.marker).toBe('target')
    const newTab = createMapViewStore('test-view', { client: new MemoryClient({ deviceStorage, sessionStorage: storage() }) })
    expect(JSON.parse(newTab.get()!).world).toEqual({ x: 10, y: 20, zoom: 3 })
    expect(deviceStorage.getItem('arkive.memory.test-view.map.view')).not.toContain('target')
  })
  it('preserves legacy cameras without rehydrating a durable marker', () => {
    const deviceStorage = storage()
    deviceStorage.setItem('old-view', JSON.stringify({ world: { x: 5, y: 6, zoom: 2, marker: 'stale' } }))
    const store = createMapViewStore('test-legacy-view', { legacyKeys: ['old-view'], client: new MemoryClient({ deviceStorage, sessionStorage: storage() }) })
    expect(JSON.parse(store.get()!)).toEqual({ world: { x: 5, y: 6, zoom: 2 } })
    store.set(JSON.stringify({ world: { x: 5, y: 6, zoom: 2, marker: null } }))
    expect(deviceStorage.getItem('arkive.memory.test-legacy-view.map.view')).not.toContain('marker')
  })
  it('ignores corrupt entries and degrades without storage', () => {
    const store = createMapViewStore('test-bad-view', { client: new MemoryClient({ deviceStorage: storage(), sessionStorage: storage() }) })
    store.set('{broken')
    expect(store.get()).toBeNull()
    store.set(JSON.stringify({ world: { x: 'bad', y: 1, zoom: 2, marker: 'valid-selection' } }))
    expect(JSON.parse(store.get()!)).toEqual({ world: { marker: 'valid-selection' } })
    const unavailable = createMapViewStore('test-no-view', { client: new MemoryClient({}) })
    expect(() => unavailable.set('{}')).not.toThrow()
    expect(unavailable.get()).toBeNull()
  })
})
