import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_MAP_ENGINE,
  MAP_ENGINE_CHOICES,
  MAP_ENGINE_LABELS,
  isMapEngineChoice,
  resolveMapEngine,
} from './mapEngineChoice'

const KEY = 'palworld.map.engine'

/**
 * A fresh module instance plus a fake `localStorage`.
 *
 * The store caches its snapshot on first read (module state), so tests that seed
 * storage differently must re-import it — otherwise the first test to touch the
 * store would pin the value for all the others.
 */
async function freshStore(seed?: string, opts: { throws?: boolean } = {}) {
  const backing = new Map<string, string>()
  if (seed !== undefined) backing.set(KEY, seed)
  globalThis.localStorage = (opts.throws
    ? {
        getItem: () => { throw new Error('storage denied') },
        setItem: () => { throw new Error('storage denied') },
      }
    : {
        getItem: (k: string) => backing.get(k) ?? null,
        setItem: (k: string, v: string) => { backing.set(k, v) },
        removeItem: (k: string) => { backing.delete(k) },
        clear: () => { backing.clear() },
        key: (i: number) => [...backing.keys()][i] ?? null,
        get length() { return backing.size },
      }) as unknown as Storage
  vi.resetModules()
  const mod = await import('./mapEngineChoice')
  return { ...mod, raw: () => backing.get(KEY) ?? null }
}

describe('isMapEngineChoice', () => {
  it('accepts only the two engine ids', () => {
    expect(isMapEngineChoice('gl')).toBe(true)
    expect(isMapEngineChoice('leaflet')).toBe(true)
    expect(isMapEngineChoice('GL')).toBe(false)
    expect(isMapEngineChoice('canvas')).toBe(false)
    expect(isMapEngineChoice(null)).toBe(false)
    expect(isMapEngineChoice(undefined)).toBe(false)
    expect(isMapEngineChoice(1)).toBe(false)
  })
})

describe('resolveMapEngine', () => {
  it('lets a valid param win over the stored choice', () => {
    expect(resolveMapEngine('leaflet', 'gl')).toBe('leaflet')
    expect(resolveMapEngine('gl', 'leaflet')).toBe('gl')
  })

  it('falls back to the stored choice for a missing or bogus param', () => {
    expect(resolveMapEngine(undefined, 'leaflet')).toBe('leaflet')
    expect(resolveMapEngine(null, 'gl')).toBe('gl')
    expect(resolveMapEngine('nonsense', 'leaflet')).toBe('leaflet')
    expect(resolveMapEngine(7, 'gl')).toBe('gl')
  })
})

describe('labels and order', () => {
  it('lists GL first and keeps a short label for every choice', () => {
    expect([...MAP_ENGINE_CHOICES]).toEqual(['gl', 'leaflet'])
    for (const choice of MAP_ENGINE_CHOICES) {
      expect(MAP_ENGINE_LABELS[choice].full.length).toBeGreaterThan(0)
      expect(MAP_ENGINE_LABELS[choice].short.length).toBeGreaterThan(0)
      // The mobile row is tight: the short form must never be the longer one.
      expect(MAP_ENGINE_LABELS[choice].short.length)
        .toBeLessThanOrEqual(MAP_ENGINE_LABELS[choice].full.length)
    }
  })
})

describe('mapEngineStore', () => {
  it('defaults to GL when nothing is stored', async () => {
    const { mapEngineStore } = await freshStore()
    expect(DEFAULT_MAP_ENGINE).toBe('gl')
    expect(mapEngineStore.getSnapshot()).toBe('gl')
  })

  it('reads a stored choice', async () => {
    const { mapEngineStore } = await freshStore('leaflet')
    expect(mapEngineStore.getSnapshot()).toBe('leaflet')
  })

  it('falls back to the default on a corrupt stored value', async () => {
    const { mapEngineStore } = await freshStore('webgpu')
    expect(mapEngineStore.getSnapshot()).toBe('gl')
  })

  it('persists a set and notifies subscribers', async () => {
    const { mapEngineStore, raw } = await freshStore()
    const seen: string[] = []
    mapEngineStore.subscribe(() => seen.push(mapEngineStore.getSnapshot()))
    mapEngineStore.set('leaflet')
    expect(mapEngineStore.getSnapshot()).toBe('leaflet')
    expect(raw()).toBe('leaflet')
    expect(seen).toEqual(['leaflet'])
  })

  it('notifies every subscriber', async () => {
    const { mapEngineStore } = await freshStore()
    const a = vi.fn()
    const b = vi.fn()
    mapEngineStore.subscribe(a)
    mapEngineStore.subscribe(b)
    mapEngineStore.set('leaflet')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('drops a redundant set (same value) without notifying', async () => {
    const { mapEngineStore, raw } = await freshStore()
    const fn = vi.fn()
    mapEngineStore.subscribe(fn)
    // Same as the default, so nothing changes — not even a storage write.
    mapEngineStore.set('gl')
    expect(fn).not.toHaveBeenCalled()
    expect(raw()).toBeNull()

    mapEngineStore.set('leaflet')
    expect(fn).toHaveBeenCalledTimes(1)
    mapEngineStore.set('leaflet')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', async () => {
    const { mapEngineStore } = await freshStore()
    const fn = vi.fn()
    const unsubscribe = mapEngineStore.subscribe(fn)
    mapEngineStore.set('leaflet')
    expect(fn).toHaveBeenCalledTimes(1)
    unsubscribe()
    mapEngineStore.set('gl')
    expect(fn).toHaveBeenCalledTimes(1)
    // The store itself still moved — only the listener went away.
    expect(mapEngineStore.getSnapshot()).toBe('gl')
  })

  it('keeps the in-memory snapshot moving when storage throws', async () => {
    const { mapEngineStore } = await freshStore(undefined, { throws: true })
    // A throwing read still yields the default rather than blowing up.
    expect(mapEngineStore.getSnapshot()).toBe('gl')
    const fn = vi.fn()
    mapEngineStore.subscribe(fn)
    expect(() => mapEngineStore.set('leaflet')).not.toThrow()
    // The UI must stay consistent even though nothing was persisted.
    expect(mapEngineStore.getSnapshot()).toBe('leaflet')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('returns a snapshot stable enough for useSyncExternalStore', async () => {
    const { mapEngineStore } = await freshStore('leaflet')
    expect(mapEngineStore.getSnapshot()).toBe(mapEngineStore.getSnapshot())
  })
})
