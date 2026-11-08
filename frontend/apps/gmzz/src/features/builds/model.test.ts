import { describe, expect, it } from 'vitest'
import { decodeShare, encodeShare, signBytes, fromBase62, toBase62 } from './codec'
import { availableSkill, changeTalent, emptyBuild, equipSkill, exportBuild, importBuild, isBuild, normalizeNodes, rememberedTalentTreeId, type BuildDraft } from './model'
import type { TalentTree } from '../score/talents'
import type { Skill } from './data'

const draft = (): BuildDraft => ({ ...emptyBuild(), name: 'Test', slots: { '1': 86011020, '17': 87001710, '20': 87303030 }, sealed: { '1': 2085001 },
  nodes: [[{ ActionName: 1, ActionParam: 86011020 }, [[[5, [0, 0.6]]], [[1, [12, 1]]]]], [{ ActionName: 2, ActionParam: 17 }, []]] })

const gameShare = '[[2jxYtI0000002Wh1xk3NWgz73UsJBw0Kmyt12T3e8O2hjHtm05uJVY0NcYoy2homg205t30w0KDNGC2hYHoE05ovzo03QRbC008kPV3ltVIW2ggO2p3orRHg3hNh9Y3l6m6v1RcVtW4PPN9Y2jpIKs4FR0g91Raw0w3l6mC72ggCFD0HgIcI4QpqLM2xGY0f1qFibL2pUuux1CF3Pd22WEU525rsJw37JDFc1viAP81mcRWc2fDHCj1ovACd21FbdK1mcYWD0azEba1CF3Pd22WELp20Cskr2OMVM328AruQ1TGQz320fl7w2hbDRx1ovACd21F3XB1qgNHu38Rbls1viAPA1mdoWz3lusax1o1Zel28AruQ1Qzdbx01mPJT1CF3Pd22WEU525rsJt37JDFc1viAP81mcRWc2fDHCj1ovACd21FbdK1mcYWD0azHGk1CF3Pd22WELp20Cskr2OMVM328AruQ1TGQz320fl7w2hoxtZ1ovACd21F3XB1qgNHu38Rbls1viAPA1mdoWz3lusap49MCFn28AruQ1Qzdbx01mPJT1CF3Pd22WEU525rsMw05ovzo37JDFc1viAP81mcRWb2fDHCj1ovACd21FbdK1mcYWD0ayA0Y1CF3Pd22WELp20Csl721bVph23gqpU3UNoKV3PFF8g2NNfM12rQfjs000000]]'

describe('client one-click share codec', () => {
  it('imports a game scheme with omitted unconditional groups and one-based relic arrays', () => {
    const imported = importBuild('Game message\n' + gameShare + '\nEnd', emptyBuild())
    expect(imported.professionId).toBe(1200002)
    expect(imported.talentTreeId).toBe(202)
    expect(imported.name).toBe(decodeShare(gameShare).get(11))
    expect(imported.slots).toEqual({ '1': 86021070, '2': 86021010, '3': 86021020, '4': 86021050, '17': 87001310, '20': 87303040 })
    expect(imported.sealed).toEqual({ '1': 2085029, '2': 2085010, '3': 2085021 })
    expect(imported.nodes.map(([action]) => action.ActionParam)).toEqual([20, 86021010, 86021020, 86023010, 17, 86021050, 86021070, 86021090, 86021020, 86020010])
    expect(imported.nodes.every(([, groups]) => groups.length === 0)).toBe(true)
    const exported = exportBuild(imported)
    expect(importBuild(exported, emptyBuild())).toMatchObject({ ...imported, original: expect.any(String) })
    for (const key of [6, 13, 14]) expect(decodeShare(exported).get(key)).toEqual(decodeShare(gameShare).get(key))
  })
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
  it('exports the chosen full talent tree using the client special-list and normal-detail keys', () => {
    const tree = { id: 102, professionId: 1200001, nodes: [
      { key: 10200, type: 'normal', maxLevel: 15 }, { key: 10205, type: 'special', maxLevel: 0 },
    ] } as TalentTree
    const wire = decodeShare(exportBuild(draft(), false, tree))
    expect(wire.get(5)).toBe(102)
    expect(wire.get(6)).toEqual(new Map<number, unknown>([[1, [10205]], [2, [[10200, 15]]]]))
    const imported = importBuild(encodeShare(wire), emptyBuild())
    expect(imported.talentTreeId).toBe(102)
    expect(importBuild(exportBuild(draft(), true), imported).talentTreeId).toBe(102)
    const combo = decodeShare(exportBuild(imported, true, tree))
    expect(combo.has(5)).toBe(false)
    expect(combo.has(6)).toBe(false)
    expect(() => exportBuild(draft(), false, { ...tree, professionId: 1200002 })).toThrow()
  })
  it('retains old drafts and treats an explicitly unset imported tree as unselected', () => {
    expect(isBuild(draft())).toBe(true)
    expect(isBuild({ ...draft(), talentTreeId: -1 })).toBe(false)
    const wire = decodeShare(exportBuild(draft()))
    wire.set(5, 0)
    expect(importBuild(encodeShare(wire), emptyBuild()).talentTreeId).toBeUndefined()
    wire.set(5, 102)
    const legacy = { ...draft(), original: encodeShare(wire) }
    expect(rememberedTalentTreeId(legacy)).toBe(102)
    expect(rememberedTalentTreeId({ ...legacy, talentTreeId: 101 })).toBe(101)
    expect(rememberedTalentTreeId({ ...legacy, professionId: 1200002 })).toBeUndefined()
    expect(rememberedTalentTreeId({ ...legacy, original: 'damaged' })).toBeUndefined()
  })
  it('hides internal skills and gates playable branches to their talent tree', () => {
    const base = { id: 86011040, professionId: 1200001, order: 6, family: 86011040, requiredTalentTreeId: null } as Skill
    const branch = { ...base, id: 86011048, order: -1, requiredTalentTreeId: 101 }
    const internal = { ...base, id: 86011025, order: -1 }
    expect(availableSkill(base, 1200001, 102)).toBe(true)
    expect(availableSkill(branch, 1200001, 101)).toBe(true)
    expect(availableSkill(branch, 1200001, 102)).toBe(false)
    expect(availableSkill(internal, 1200001, 101)).toBe(false)
    expect(availableSkill(base, 1200002, 201)).toBe(false)
    const current = { ...draft(), slots: { '1': branch.id, '17': 87001710 } }
    expect(changeTalent(current, 102, [base, branch]).slots).toEqual({ '1': base.id, '17': 87001710 })
    expect(current.slots['1']).toBe(branch.id)
  })
})
