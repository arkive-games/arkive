import { beforeEach, describe, expect, it } from 'vitest'
import { readCompleted, toggleCompletedId } from './completedMarkers'

// vitest runs in a node environment (no DOM): back localStorage with a Map.
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  } as Storage
})

describe('readCompleted', () => {
  it('returns an empty set when nothing is stored', () => {
    expect(readCompleted('MainWorld').size).toBe(0)
  })

  it('returns an empty set on corrupt JSON', () => {
    store.set('palworld.map.completed.MainWorld', '{not json')
    expect(readCompleted('MainWorld').size).toBe(0)
  })

  it('drops non-string entries', () => {
    store.set('palworld.map.completed.MainWorld', JSON.stringify(['a', 1, null]))
    expect([...readCompleted('MainWorld')]).toEqual(['a'])
  })
})

describe('toggleCompletedId', () => {
  it('adds an id, persists, and round-trips through readCompleted', () => {
    const next = toggleCompletedId('MainWorld', new Set(), 'MainWorld-fieldBoss-1')
    expect(next.has('MainWorld-fieldBoss-1')).toBe(true)
    expect(readCompleted('MainWorld').has('MainWorld-fieldBoss-1')).toBe(true)
  })

  it('removes an already-present id', () => {
    const once = toggleCompletedId('MainWorld', new Set(), 'x')
    const twice = toggleCompletedId('MainWorld', once, 'x')
    expect(twice.size).toBe(0)
    expect(readCompleted('MainWorld').size).toBe(0)
  })

  it('does not return the input set object (state-safe)', () => {
    const input = new Set<string>()
    expect(toggleCompletedId('MainWorld', input, 'x')).not.toBe(input)
    expect(input.size).toBe(0)
  })

  it('keeps maps isolated', () => {
    toggleCompletedId('MainWorld', new Set(), 'a')
    expect(readCompleted('WorldTree').size).toBe(0)
  })
})
