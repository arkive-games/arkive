import { beforeEach, describe, expect, it } from 'vitest'
import { clearCompletedIds, readCompleted, toggleCompletedId } from './completedMarkers'

// No DOM here: back localStorage with a Map.
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

describe('completed markers', () => {
  it('starts empty', () => {
    expect(readCompleted('XiGu').size).toBe(0)
  })

  it('toggles an id on and off, persisting each step', () => {
    const on = toggleCompletedId('XiGu', new Set(), 'bell-0123456789')
    expect(readCompleted('XiGu').has('bell-0123456789')).toBe(true)
    toggleCompletedId('XiGu', on, 'bell-0123456789')
    expect(readCompleted('XiGu').size).toBe(0)
  })

  it('keeps each map apart', () => {
    toggleCompletedId('XiGu', new Set(), 'bell-0123456789')
    expect(readCompleted('PangZhen').size).toBe(0)
    clearCompletedIds('PangZhen')
    expect(readCompleted('XiGu').has('bell-0123456789')).toBe(true)
  })

  it('clears one map', () => {
    toggleCompletedId('XiGu', new Set(), 'bell-0123456789')
    clearCompletedIds('XiGu')
    expect(readCompleted('XiGu').size).toBe(0)
  })
})
