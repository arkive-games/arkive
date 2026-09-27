import { describe, expect, it, vi } from 'vitest'
import { BUILD_STORAGE_KEY, clampAttribute, persistBuilds, resolveMarkEffects, updateSocket } from './lib/buildState'

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

it('enforces the advertised attribute range and integer values', () => {
  expect([-2, 0, 1, 25.8, 999, 1500, NaN, Infinity].map(clampAttribute)).toEqual([1, 1, 1, 25, 999, 999, 1, 1])
})
