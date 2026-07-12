import { describe, it, expect } from 'vitest'

import {
  buildChildIndex,
  makeEngine,
  parseTreeParam,
  recipesToBreed,
  resolveNode,
  sanitizeTree,
  setSubtree,
  type BreedingData,
  type BreedTreeNode,
} from './breeding'

/**
 * Multi-layer breeding tree logic.
 *
 * Ranks are chosen so the rank-average fallback is predictable:
 *   P1 (100) + P2 (200) -> target 150 -> P3 (150)
 *   P3 (150) + P4 (400) -> target 275 -> P2 (200)? no: |200-275|=75, |400-275|=125,
 *     |150-275|=125, |100-275|=175 -> P2.
 * Unique combo: P1 + P4 = U1 (combo-only child).
 * Gendered combos: Kat♂ + Wix♀ = KatB, Kat♀ + Wix♂ = WixB.
 * Lgd is legendary (self-bred only, not an eligible rank-average child).
 */
const pal = (
  id: string,
  rank: number,
  zukanIndex: number,
  extra: Partial<BreedingData['pals'][number]> = {},
) => ({
  id,
  zukanIndex,
  zukanIndexSuffix: '',
  icon: '',
  rank,
  idx: zukanIndex,
  breedChild: true,
  ...extra,
})

const data: BreedingData = {
  pals: [
    pal('P1', 100, 1),
    pal('P2', 200, 2),
    pal('P3', 150, 3),
    pal('P4', 400, 4),
    pal('U1', 999, 5, { breedChild: false }),
    pal('Kat', 310, 6),
    pal('Wix', 330, 7),
    pal('KatB', 998, 8, { breedChild: false }),
    pal('WixB', 997, 9, { breedChild: false }),
    pal('Lgd', 10, 10, { breedChild: false, legendary: true }),
  ],
  combos: [
    { a: 'P1', b: 'P4', c: 'U1' },
    { a: 'Kat', b: 'Wix', c: 'KatB', ag: 'M', bg: 'F' },
    { a: 'Kat', b: 'Wix', c: 'WixB', ag: 'F', bg: 'M' },
  ],
}

const engine = makeEngine(data)
const ids = new Set(data.pals.map((p) => p.id))

describe('buildChildIndex', () => {
  const index = buildChildIndex(engine, data)

  it('collects every unordered pair producing a child', () => {
    const p3 = index.get('P3') ?? []
    expect(p3).toContainEqual({ a: 'P1', b: 'P2', c: 'P3' })
    // Self-pair is indexed too (filtering is recipesToBreed's job).
    expect(p3).toContainEqual({ a: 'P3', b: 'P3', c: 'P3' })
  })

  it('includes unique combos, tagged unique (plus the self-pair)', () => {
    expect(index.get('U1')).toEqual([
      { a: 'P1', b: 'P4', c: 'U1', unique: true },
      { a: 'U1', b: 'U1', c: 'U1' },
    ])
  })

  it('keeps both gender-specific combos under their own children', () => {
    expect(index.get('KatB')).toContainEqual({ a: 'Kat', b: 'Wix', c: 'KatB', ag: 'M', bg: 'F', unique: true })
    expect(index.get('WixB')).toContainEqual({ a: 'Kat', b: 'Wix', c: 'WixB', ag: 'F', bg: 'M', unique: true })
  })
})

describe('recipesToBreed', () => {
  const index = buildChildIndex(engine, data)

  it('excludes pairs that contain the child itself', () => {
    const list = recipesToBreed(index, 'P3')
    expect(list.length).toBeGreaterThan(0)
    for (const f of list) {
      expect(f.a).not.toBe('P3')
      expect(f.b).not.toBe('P3')
      expect(f.c).toBe('P3')
    }
  })

  it('is empty for a legendary (self-bred only)', () => {
    expect(recipesToBreed(index, 'Lgd')).toEqual([])
  })

  it('is empty for unknown pals', () => {
    expect(recipesToBreed(index, 'Nope')).toEqual([])
  })
})

describe('resolveNode', () => {
  it('resolves a rank-average recipe keeping the node orientation', () => {
    expect(resolveNode(engine, { a: 'P2', b: 'P1' })).toEqual({ a: 'P2', b: 'P1', c: 'P3' })
  })

  it('resolves gendered combos by matching genders, swapped orientation included', () => {
    expect(resolveNode(engine, { a: 'Kat', b: 'Wix', ag: 'M', bg: 'F' })).toMatchObject({
      c: 'KatB',
      a: 'Kat',
      ag: 'M',
    })
    // Same combo written from Wix's side: genders travel with their parent.
    expect(resolveNode(engine, { a: 'Wix', b: 'Kat', ag: 'F', bg: 'M' })).toMatchObject({
      c: 'KatB',
      a: 'Wix',
      ag: 'F',
      bg: 'M',
    })
  })

  it('returns null when the genders do not match any combo', () => {
    expect(resolveNode(engine, { a: 'Kat', b: 'Wix' })).toBeNull()
    expect(resolveNode(engine, { a: 'Kat', b: 'Wix', ag: 'M', bg: 'M' })).toBeNull()
  })

  it('returns null for unknown pals', () => {
    expect(resolveNode(engine, { a: 'P1', b: 'Nope' })).toBeNull()
  })
})

describe('sanitizeTree', () => {
  it('keeps a valid chain', () => {
    const node: BreedTreeNode = {
      a: 'P3',
      b: 'P4',
      l: { a: 'P1', b: 'P2' }, // P1+P2 = P3 ✓
    }
    expect(sanitizeTree(engine, ids, node)).toEqual(node)
  })

  it('drops the whole node on unknown parents or unresolvable combos', () => {
    expect(sanitizeTree(engine, ids, { a: 'Nope', b: 'P2' })).toBeUndefined()
    // Gendered pair without genders never resolves.
    expect(sanitizeTree(engine, ids, { a: 'Kat', b: 'Wix' })).toBeUndefined()
  })

  it('drops a subtree whose child does not match its parent slot', () => {
    const node: BreedTreeNode = {
      a: 'P3',
      b: 'P4',
      l: { a: 'P1', b: 'P4' }, // P1+P4 = U1, not P3 → pruned
      r: { a: 'P1', b: 'P2' }, // P1+P2 = P3, not P4 → pruned
    }
    expect(sanitizeTree(engine, ids, node)).toEqual({ a: 'P3', b: 'P4' })
  })

  it('enforces the expected child on the root when given', () => {
    expect(sanitizeTree(engine, ids, { a: 'P1', b: 'P2' }, 'P3')).toEqual({ a: 'P1', b: 'P2' })
    expect(sanitizeTree(engine, ids, { a: 'P1', b: 'P2' }, 'P4')).toBeUndefined()
  })
})

describe('setSubtree', () => {
  const root: BreedTreeNode = { a: 'P3', b: 'P4', l: { a: 'P1', b: 'P2' } }

  it('replaces the root on an empty path', () => {
    expect(setSubtree(root, [], { a: 'X', b: 'Y' })).toEqual({ a: 'X', b: 'Y' })
    expect(setSubtree(root, [], undefined)).toBeUndefined()
  })

  it('sets and clears nested slots immutably', () => {
    const next = setSubtree(root, ['l', 'r'], { a: 'Q', b: 'W' })
    expect(next).toEqual({
      a: 'P3',
      b: 'P4',
      l: { a: 'P1', b: 'P2', r: { a: 'Q', b: 'W' } },
    })
    expect(root.l?.r).toBeUndefined() // original untouched

    expect(setSubtree(root, ['l'], undefined)).toEqual({ a: 'P3', b: 'P4' })
  })

  it('ignores paths through missing nodes', () => {
    expect(setSubtree(root, ['r', 'l'], { a: 'Q', b: 'W' })).toEqual(root)
  })
})

describe('parseTreeParam', () => {
  it('accepts a valid nested tree and strips extras', () => {
    expect(
      parseTreeParam({
        a: 'Kat',
        b: 'Wix',
        ag: 'M',
        bg: 'F',
        junk: 1,
        l: { a: 'P1', b: 'P2' },
      }),
    ).toEqual({ a: 'Kat', b: 'Wix', ag: 'M', bg: 'F', l: { a: 'P1', b: 'P2' } })
  })

  it('rejects malformed values', () => {
    expect(parseTreeParam(null)).toBeUndefined()
    expect(parseTreeParam('x')).toBeUndefined()
    expect(parseTreeParam({ a: 'P1' })).toBeUndefined()
    expect(parseTreeParam({ a: 'P1', b: 2 })).toBeUndefined()
    // Invalid gender drops the node (not just the field): the URL was hand-edited.
    expect(parseTreeParam({ a: 'P1', b: 'P2', ag: 'X' })).toBeUndefined()
    // A malformed subtree prunes that branch only.
    expect(parseTreeParam({ a: 'P1', b: 'P2', l: { a: 'P1' } })).toEqual({ a: 'P1', b: 'P2' })
  })

  it('caps depth', () => {
    let node: Record<string, unknown> = { a: 'P1', b: 'P2' }
    for (let i = 0; i < 40; i++) node = { a: 'P1', b: 'P2', l: node }
    const parsed = parseTreeParam(node)
    expect(parsed).toBeDefined()
    let depth = 0
    for (let n = parsed; n; n = n.l) depth++
    expect(depth).toBeLessThanOrEqual(17) // 16 levels + root
  })
})
