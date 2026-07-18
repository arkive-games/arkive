import { describe, expect, it } from 'vitest'
import type { ResearchProject } from './catalog'
import { buildResearchTrees } from './researchTree'

const p = (id: string, category: string, requires?: string): ResearchProject => ({
  id,
  category,
  work: 100,
  materials: [],
  ...(requires ? { requires } : {}),
})

describe('buildResearchTrees', () => {
  it('groups categories in first-seen order, one root tree each', () => {
    const trees = buildResearchTrees([
      p('A1', 'Handcraft'),
      p('B1', 'Mining'),
      p('A2', 'Handcraft', 'A1'),
      p('B2', 'Mining', 'B1'),
    ])
    expect(trees.map((t) => t.category)).toEqual(['Handcraft', 'Mining'])
    expect(trees[0].roots.map((r) => r.project.id)).toEqual(['A1'])
    expect(trees[0].roots[0].children.map((c) => c.project.id)).toEqual(['A2'])
  })

  it('keeps sibling order from file order', () => {
    const trees = buildResearchTrees([
      p('A1', 'Handcraft'),
      p('A1_2', 'Handcraft', 'A1'),
      p('A2', 'Handcraft', 'A1'),
      p('A3', 'Handcraft', 'A1'),
      p('A5', 'Handcraft', 'A1_2'),
      p('A4', 'Handcraft', 'A1_2'),
    ])
    const root = trees[0].roots[0]
    expect(root.children.map((c) => c.project.id)).toEqual(['A1_2', 'A2', 'A3'])
    expect(root.children[0].children.map((c) => c.project.id)).toEqual(['A5', 'A4'])
  })

  it('treats nodes with a missing prerequisite as extra roots', () => {
    const trees = buildResearchTrees([p('A1', 'Handcraft'), p('AX', 'Handcraft', 'Gone')])
    expect(trees[0].roots.map((r) => r.project.id)).toEqual(['A1', 'AX'])
  })

  it('computes leaf counts for layout spans', () => {
    const trees = buildResearchTrees([
      p('A1', 'Handcraft'),
      p('A2', 'Handcraft', 'A1'),
      p('A3', 'Handcraft', 'A1'),
      p('A4', 'Handcraft', 'A2'),
    ])
    const root = trees[0].roots[0]
    expect(root.leaves).toBe(2)
    expect(root.children.map((c) => c.leaves)).toEqual([1, 1])
  })
})
