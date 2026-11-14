import { describe, expect, it } from 'vitest'
import { MemoryClient } from '@gamemap/state-memory'
import { hubFactionRecord, resolveWikiGroup, wikiScrollBinding } from './wikiMemory'

function client() {
  const values = new Map<string, string>()
  return new MemoryClient({ sessionStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  } })
}

describe('AION2 encyclopedia return memory', () => {
  it('resumes matching result scopes without leaking positions or factions', () => {
    const memory = client()
    const first = wikiScrollBinding('quest:main:light', 'first', '', undefined, memory)
    first.write(1200)
    expect(wikiScrollBinding('quest:main:light', 'return', '', undefined, memory).read()).toBe(1200)
    expect(wikiScrollBinding('quest:main:dark', 'return', '', undefined, memory).read()).toBe(0)
    memory.write(hubFactionRecord, 'light', { partition: 'quest:main' })
    expect(memory.read(hubFactionRecord, { partition: 'quest:side' })).toBe('all')
    expect(memory.write(hubFactionRecord, 'invalid' as 'all')).toBe(false)
    expect(memory.write(hubFactionRecord, ['all'] as unknown as 'all')).toBe(false)
  })

  it('prioritizes a fresh anchor while Back and reload resume its visited position', () => {
    const memory = client()
    const ordinary = wikiScrollBinding('quest:main', 'ordinary', '', undefined, memory)
    ordinary.write(1800)
    const linked = wikiScrollBinding('quest:main', 'link-one', 'prologue', () => 400, memory)
    expect(linked.read()).toBe(400)
    linked.write(850)
    expect(wikiScrollBinding('quest:main', 'link-one', 'prologue', () => 400, memory).read()).toBe(850)
    expect(wikiScrollBinding('quest:main', 'link-two', 'prologue', () => 400, memory).read()).toBe(400)
    expect(ordinary.read()).toBe(1800)
  })

  it('falls back safely for unavailable groups, anchors or browser storage', () => {
    const groups = [{ slug: 'main' }, { slug: 'side' }]
    expect(resolveWikiGroup(groups, 'side', 'main')?.slug).toBe('side')
    expect(resolveWikiGroup(groups, 'removed', 'side')?.slug).toBe('side')
    expect(resolveWikiGroup(groups, 'removed', 'removed')?.slug).toBe('main')
    expect(resolveWikiGroup([], '', '')).toBeUndefined()
    const binding = wikiScrollBinding('quest', 'entry', 'missing', () => null, new MemoryClient({}))
    expect(binding.read()).toBe(0)
    expect(() => binding.write(800)).not.toThrow()
  })
})
