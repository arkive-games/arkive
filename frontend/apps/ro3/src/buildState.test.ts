import { describe, expect, it, vi } from 'vitest'
import { MemoryClient } from '@gamemap/state-memory'
import { BUILD_STORAGE_KEY, clampStat, persistBuilds, readFavorites, resolveMarkEffects, updateSocket, writeFavorites } from './lib/buildState'

describe('build persistence', () => {
  it('preserves the existing storage key and serialized payload', () => {
    const setItem = vi.fn()
    const builds = [{ id: 'existing', equipment: [{ cardIds: [0, 42] }] }]
    expect(persistBuilds(builds, { setItem })).toBe(true)
    expect(setItem).toHaveBeenCalledWith(BUILD_STORAGE_KEY, JSON.stringify(builds))
    expect(BUILD_STORAGE_KEY).toBe('ro3-build-planner')
  })
  it('reports storage failures without throwing or mutating the draft', () => {
    const builds = [{ id: 'unsaved' }]
    expect(persistBuilds(builds, { setItem: () => { throw new Error('quota') } })).toBe(false)
    expect(builds).toEqual([{ id: 'unsaved' }])
  })
})

describe('socket assignments', () => {
  it('clears only the chosen socket and leaves the source untouched', () => {
    const cards = [10, 20, 30]
    expect(updateSocket(cards, 1, 0)).toEqual([10, 0, 30])
    expect(cards).toEqual([10, 20, 30])
  })
  it('fills preceding empty sockets rather than serializing holes', () => {
    expect(updateSocket([], 2, 42)).toEqual([0, 0, 42])
  })
})

it('expands legacy marks consistently and lets individual effects be removed', () => {
  const marks = [{ markId: 1001, specialEffectIds: [13400100, 13400200] }, { markId: 1001, specialEffectIds: [13200000] }]
  const expanded = resolveMarkEffects([1001, 13400100], marks)
  expect(expanded).toEqual([13400100, 13400200, 13200000])
  expect(resolveMarkEffects(expanded.filter((id) => id !== 13400100), marks)).toEqual([13400200, 13200000])
  expect(resolveMarkEffects([999], marks)).toEqual([999])
})

it('keeps manual stats whole numbers from 1 to 99', () => {
  expect([-2, 0, 1, 25.8, 99, 150, NaN, Infinity].map(clampStat)).toEqual([1, 1, 1, 25, 99, 99, 1, 1])
})

describe('favorites', () => {
  const memory = () => {
    const items = new Map<string, string>()
    return new MemoryClient({ deviceStorage: { getItem: k => items.get(k) ?? null, setItem: (k, v) => { items.set(k, v) }, removeItem: k => { items.delete(k) } } })
  }
  it('round-trips string ids and starts empty', () => {
    const client = memory()
    expect(readFavorites(client)).toEqual([])
    expect(writeFavorites(['a', 'b'], client)).toBe(true)
    expect(readFavorites(client)).toEqual(['a', 'b'])
  })
  it('reports a failed write', () => {
    const blocked = new MemoryClient({ deviceStorage: { getItem: () => null, setItem: () => { throw new Error('quota') }, removeItem: () => {} } })
    expect(writeFavorites(['a'], blocked)).toBe(false)
  })
})
