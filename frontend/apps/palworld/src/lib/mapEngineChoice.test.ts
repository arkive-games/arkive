import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MAP_ENGINE,
  isMapEngineChoice,
  readMapEngine,
  resolveMapEngine,
  writeMapEngine,
} from './mapEngineChoice'

// vitest runs in a node environment (no DOM): back localStorage with a Map.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
})

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

describe('readMapEngine / writeMapEngine', () => {
  it('defaults to GL when nothing is stored', () => {
    expect(DEFAULT_MAP_ENGINE).toBe('gl')
    expect(readMapEngine()).toBe('gl')
  })

  it('round-trips a stored choice', () => {
    writeMapEngine('leaflet')
    expect(store.get('palworld.map.engine')).toBe('leaflet')
    expect(readMapEngine()).toBe('leaflet')
    writeMapEngine('gl')
    expect(readMapEngine()).toBe('gl')
  })

  it('falls back to the default on a corrupt stored value', () => {
    store.set('palworld.map.engine', 'webgpu')
    expect(readMapEngine()).toBe('gl')
  })

  it('survives storage that throws (private mode)', () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    } as unknown as Storage
    expect(readMapEngine()).toBe('gl')
    expect(() => writeMapEngine('leaflet')).not.toThrow()
  })
})

describe('resolveMapEngine', () => {
  it('lets a valid URL param win over storage', () => {
    writeMapEngine('gl')
    expect(resolveMapEngine('leaflet')).toBe('leaflet')
    writeMapEngine('leaflet')
    expect(resolveMapEngine('gl')).toBe('gl')
  })

  it('does not write the URL param back to storage', () => {
    writeMapEngine('gl')
    resolveMapEngine('leaflet')
    expect(store.get('palworld.map.engine')).toBe('gl')
  })

  it('falls back to storage, then to the default', () => {
    writeMapEngine('leaflet')
    expect(resolveMapEngine(undefined)).toBe('leaflet')
    expect(resolveMapEngine('nonsense')).toBe('leaflet')
    store.clear()
    expect(resolveMapEngine(undefined)).toBe('gl')
  })
})
