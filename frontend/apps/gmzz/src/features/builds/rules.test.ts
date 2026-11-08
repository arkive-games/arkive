import { describe, expect, it } from 'vitest'
import type { Catalog, ConditionMeta } from './data'
import { buffOptions, conditionLimits, defaultCondition, validConditions } from './rules'
import type { Condition } from './model'

const metadata = (ID: number, ParamType: number[], Limit: number[][] = []): ConditionMeta => ({ ID, ParamType, Limit, ParamForEdit: [], HintText: [], bEnabled: true, EditDescStr: '' })
const catalog = {
  conditions: [metadata(1, [1, 8]), metadata(2, [1, 8]), metadata(5, [2, 5], [[0, 0], [1, 0]]), metadata(7, [2, 3]), metadata(8, [7, 3, 8]), { ...metadata(12, [9, 2, 3], [[0, 0], [0, 0], [3, 0]]), ProfessionUseLimit: [1200003] }],
  buffs: [{ id: 8, name: 'Sun', status: false, professions: [1200001] }, { id: 12, name: 'Fear', status: true, professions: [] }],
  resources: [{ professionId: 1200001, name: 'Sun', max: 5, supported: true }, { professionId: 1200002, name: '', max: 99999999, supported: false }],
} as Catalog
const valid = (condition: Condition, professionId = 1200001) => validConditions([{ ActionName: 2, ActionParam: 17 }, [[condition]]], catalog, professionId)

describe('shipped one-click condition conventions', () => {
  it('uses check type 2 for slots and 1 for skills; zero never checks a cooldown', () => {
    expect(defaultCondition(catalog, 8, 1200001)).toEqual([8, [17, 2, 1]])
    expect(valid([8, [17, 2, 0]])).toBe(true)
    expect(valid([8, [86011020, 1, 1]])).toBe(true)
    expect(valid([8, [86011020, 0, 1]])).toBe(false)
  })
  it('separates status checks from named buff checks as the client picker does', () => {
    expect(buffOptions(catalog, 1, 1200001).map((row) => row.id)).toEqual([12])
    expect(buffOptions(catalog, 2, 1200001).map((row) => row.id)).toEqual([8])
    expect(defaultCondition(catalog, 1, 1200001)).toEqual([1, [12, 1]])
  })
  it('uses the client blue=0/yellow=1 enum and gates it to the Fool pathway', () => {
    expect(defaultCondition(catalog, 12, 1200003)[1][0]).toBe(0)
    expect(valid([12, [1, 2, 3]], 1200003)).toBe(true)
    expect(valid([12, [2, 2, 3]], 1200003)).toBe(false)
    expect(valid([12, [0, 2, 3]], 1200001)).toBe(false)
  })
  it('uses fractions for health and the pathway-specific resource cap', () => {
    expect(valid([5, [0, 0.6]])).toBe(true)
    expect(valid([5, [0, 60]])).toBe(false)
    expect(conditionLimits(catalog.conditions[3], 1, catalog, 1200001)).toEqual([5, 0])
    expect(valid([7, [4, 6]])).toBe(false)
    expect(valid([7, [4, 3]], 1200002)).toBe(false)
  })
})
