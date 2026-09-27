import { expect, it } from 'vitest'
import { activeMarkStages, applicableMarkStages, markStages, sumMarks } from './lib/soulMarks'
import { emptyPlanner, migratePlanner } from './lib/plannerModel'

it('does not expose another multiverse mark definition', () => {
  const stages = [[], [0], [101], [102]].map((multiverses, i) => ({ markId: i + 1, threshold: 3, stage: 1, effects: [], multiverses }))
  expect(applicableMarkStages(stages, 'shared').map(s => s.markId)).toEqual([1, 2])
  expect(applicableMarkStages(stages, 'M101').map(s => s.markId)).toEqual([1, 2, 3])
  expect(applicableMarkStages(stages, 'M102').map(s => s.markId)).toEqual([1, 2, 4])
})

it('sums the same mark across equipped remnants only', () => {
  const totals = sumMarks([{ id: 1, markCounts: [{ markId: 1001, count: 2 }] }, { id: 2, markCounts: [{ markId: 1001, count: 1 }, { markId: 1002, count: 4 }] }, { id: 0, markCounts: [{ markId: 1001, count: 99 }] }])
  expect(totals.get(1001)).toBe(3)
  expect(totals.get(1002)).toBe(4)
  expect(activeMarkStages([{ markId: 1001, threshold: 3, stage: 1, effects: [5] }, { markId: 1001, threshold: 6, stage: 2, effects: [6] }], totals).map(s => s.stage)).toEqual([1])
})
it('deduplicates shared stage definitions and does not convert effect IDs to quantities', () => {
  const marks = [{ markId: 1001, threshold: 3, stage: 1, specialEffectIds: [44, 55] }]
  expect(markStages([{ iID: 1, marks }, { iID: 2, marks }])).toHaveLength(1)
  const old = { souls: [{ soulId: 1, markEffectIds: [44, 55] }] }
  const migrated = migratePlanner(old, [], [])
  expect(migrated.souls[0].marks).toEqual([44, 55])
  expect(migrated.souls[0].markCounts).toBeUndefined()
  expect(sumMarks(migrated.souls).size).toBe(0)
})
it('preserves explicitly configured counts across save normalization', () => {
  const build = emptyPlanner('marks')
  build.souls = [{ id: 1, sub: [], marks: [], markCounts: [{ markId: 1001, count: 6 }] }]
  expect(migratePlanner(build, [], []).souls).toEqual(build.souls)
})
