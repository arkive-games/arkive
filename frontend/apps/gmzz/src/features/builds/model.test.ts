import { describe, expect, it } from 'vitest'
import { decodeShare, encodeShare, signBytes, fromBase62, toBase62 } from './codec'
import { emptyBuild, equipSkill, exportBuild, importBuild, isBuild, normalizeNodes, type BuildDraft } from './model'

const draft = (): BuildDraft => ({ ...emptyBuild(), name: 'Test', slots: { '1': 86011020, '17': 87001710, '20': 87303030 }, sealed: { '1': 2085001 },
  nodes: [[{ ActionName: 1, ActionParam: 86011020 }, [[[5, [0, 0.6]]], [[1, [12, 1]]]]], [{ ActionName: 2, ActionParam: 17 }, []]] })

describe('client one-click share codec', () => {
  it('matches the shipped SchemeUtils signing function including padding', () => {
    expect(signBytes(new TextEncoder().encode('abc'))).toBe('4W5I8J0000001mZPqy000000')
  })
  it('roundtrips uint32 words including high bits', () => {
    const bytes = new Uint8Array([255, 255, 255, 255, 128, 0, 0, 1])
    expect(fromBase62(toBase62(bytes))).toEqual(bytes)
    expect(() => fromBase62('zzzzzz000000')).toThrow()
  })
  it('accepts wrapped game messages with whitespace and keeps numeric map keys', () => {
    const code = exportBuild(draft())
    const imported = importBuild('Game message\n' + code.replace(/(.{30})/g, '$1\n') + '\nEnd', emptyBuild())
    expect(imported.nodes).toEqual(draft().nodes)
    expect(imported.slots).toEqual(draft().slots)
    const map = decodeShare(code)
    expect(map.get(3)).toBeInstanceOf(Map)
    expect((map.get(3) as Map<number, number>).get(86011020)).toBe(1)
    expect((map.get(4) as Map<number, number>).get(1)).toBe(2085001)
  })
  it('rejects modified, malformed and oversized codes without changing the draft', () => {
    const original = draft()
    const code = exportBuild(original)
    for (const bad of ['broken', code.replace(/[A-Za-z]/, '0'), 'a'.repeat(100001)]) expect(() => importBuild(bad, original)).toThrow()
    expect(original).toEqual(draft())
  })
  it('preserves unrelated imported equipment, talents, relations and season metadata', () => {
    const wire = decodeShare(exportBuild(draft()))
    wire.set(5, 101)
    wire.set(6, new Map([[10101, [3, 1]]]))
    wire.set(7, new Map([[1, 123]]))
    wire.set(13, 2)
    wire.set(14, new Map([[7, 5]]))
    const imported = importBuild(encodeShare(wire), emptyBuild())
    imported.name = 'Changed'
    const exported = decodeShare(exportBuild(imported))
    for (const key of [5, 6, 7, 13, 14]) expect(exported.get(key)).toEqual(wire.get(key))
  })
  it('imports a combo-only code without erasing the current same-pathway loadout', () => {
    const current = draft()
    const imported = importBuild(exportBuild(current, true), current)
    expect(imported.slots).toEqual(current.slots)
    expect(imported.sealed).toEqual(current.sealed)
    const wire = decodeShare(exportBuild(current, true))
    expect(wire.has(3)).toBe(false)
    expect(wire.has(4)).toBe(false)
  })
  it('merges combo-only imports into the retained full scheme metadata', () => {
    const wire = decodeShare(exportBuild(draft()))
    wire.set(5, 101)
    wire.set(7, new Map([[1, 123]]))
    wire.set(13, 2)
    wire.set(14, new Map([[7, 5]]))
    const current = importBuild(encodeShare(wire), emptyBuild())
    const next = importBuild(exportBuild(draft(), true), current)
    const result = decodeShare(exportBuild(next))
    for (const key of [5, 7, 13, 14]) expect(result.get(key)).toEqual(wire.get(key))
  })
  it('rejects a nonempty array masquerading as the skill dictionary', () => {
    const wire = decodeShare(exportBuild(draft()))
    wire.set(3, [86011020])
    expect(() => importBuild(encodeShare(wire), emptyBuild())).toThrow()
  })
  it('normalizes Lua empty tables and retains unknown action ids and condition values', () => {
    expect(normalizeNodes([[{ ActionName: 3, ActionParam: 4 }, {}]])).toEqual([[{ ActionName: 3, ActionParam: 4 }, []]])
    expect(() => normalizeNodes([[{ ActionName: 1, ActionParam: 1 }, [[[5, [Infinity]]]]]])).toThrow()
  })
  it('caps the action count and rejects invalid persisted drafts', () => {
    expect(isBuild(draft())).toBe(true)
    expect(isBuild({ ...draft(), nodes: Array(51).fill(draft().nodes[0]) })).toBe(false)
    expect(isBuild({ ...draft(), slots: { '1': NaN } })).toBe(false)
    expect(() => exportBuild(emptyBuild())).toThrow()
  })
  it('moves repeated skills and mutually exclusive branches rather than duplicating them', () => {
    const current = draft()
    const next = equipSkill(current, 2, 86011048, (id) => [86011020, 86011048].includes(id) ? 42 : id)
    expect(next.slots['1']).toBeUndefined()
    expect(next.slots['2']).toBe(86011048)
    expect(current.slots['1']).toBe(86011020)
  })
})
