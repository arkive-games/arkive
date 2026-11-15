import { describe, expect, it, vi } from 'vitest'
import { guardedHistory } from './lib/guardedHistory'

function fixture() {
  const entries: Array<{ state: unknown; url: string }> = [{ state: null, url: '/builds?build=old' }]
  let cursor = 0
  const listeners = new Set<() => void>()
  const history = {
    get state() { return entries[cursor].state },
    replaceState(state: unknown, _unused: string, url?: string | URL | null) { entries[cursor] = { state, url: url == null ? entries[cursor].url : String(url) } },
    pushState: vi.fn((state: unknown, _unused: string, url?: string | URL | null) => { entries.splice(cursor + 1); entries.push({ state, url: String(url) }); cursor++ }),
    go: vi.fn((delta: number) => { cursor += delta; listeners.forEach(listener => listener()) }),
  }
  const target = { history, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) }
  return { entries, history, target: target as unknown as Parameters<typeof guardedHistory>[0], current: () => entries[cursor] }
}

describe('guarded history', () => {
  it('returns to the actual previous entry on refused forward navigation without rewriting its URL', () => {
    const f = fixture()
    const allow = vi.fn(() => true)
    const adopt = vi.fn()
    const navigation = guardedHistory(f.target, allow, adopt)
    navigation.push('/equipment')
    f.history.go(-1)
    f.history.replaceState(f.history.state, '', '/builds')
    const visits = adopt.mock.calls.length
    allow.mockReturnValue(false)
    f.history.go(1)
    expect(f.current().url).toBe('/builds')
    expect(f.entries.map(entry => entry.url)).toEqual(['/builds', '/equipment'])
    expect(f.history.pushState).toHaveBeenCalledTimes(1)
    expect(adopt).toHaveBeenCalledTimes(visits)
    allow.mockReturnValue(true)
    f.history.go(1)
    expect(f.current().url).toBe('/equipment')
    navigation.dispose()
  })
  it('restores a refused back traversal and still allows a later back navigation', () => {
    const f = fixture()
    const allow = vi.fn(() => false)
    const navigation = guardedHistory(f.target, allow, vi.fn())
    navigation.push('/builds')
    f.history.go(-1)
    expect(f.current().url).toBe('/builds')
    expect(f.history.go).toHaveBeenLastCalledWith(1)
    allow.mockReturnValue(true)
    f.history.go(-1)
    expect(f.current().url).toBe('/builds?build=old')
    navigation.dispose()
  })
})
