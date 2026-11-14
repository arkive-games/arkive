import { describe, expect, it } from 'vitest'
import { equipmentLines, normalAffixLimit, soulSubOptions, type ManualData } from './lib/buildView'
import { emptyPlanner, migratePlanner } from './lib/plannerModel'
import type { EquipmentRecord } from './wikiData'

const equipment: EquipmentRecord = { iID: 1, iEntries: 10, item: { iID: 1, iQuality: 5 } }
const data = {
  equipment: { attrs: {
    attributes: [{ iID: 1, name: { 'zh-CN': 'Strength' } }],
    entryGroups: [{ iID: 10, iGroup: 10, iAttriID: 1, iMin: 2, iMax: 2 }],
    entryCounts: [{ iID: 1, iQuality: 1 }, { iID: 2, iQuality: 5, iNum: 1 }, { iID: 3, iQuality: 5, iNum: 2 }],
    specialEffects: [],
  } },
  souls: { souls: { attributes: [{ iID: 209, name: { 'zh-CN': 'Critical damage' } }] } },
} as unknown as ManualData

describe('build affix data', () => {
  it('uses the maximum authored count without inventing a limit for missing quality', () => {
    expect(normalAffixLimit(data, equipment)).toBe(2)
    expect(normalAffixLimit(data, { ...equipment, item: { iID: 1, iQuality: 1 } })).toBe(0)
    expect(normalAffixLimit(data, { ...equipment, item: { iID: 1, iQuality: 99 } })).toBeUndefined()
    expect(normalAffixLimit(null, equipment)).toBeUndefined()
  })
  it('does not mislabel entry counts as attribute magnitudes and retains unknown entries', () => {
    const lines = equipmentLines(data, equipment, [10, 999], [888])
    expect(lines).toHaveLength(3)
    expect(lines[0].text).not.toMatch(/2/)
    expect(lines[1].text).toContain('#999')
    expect(lines[2].text).toContain('#888')
  })
  it('keeps roll identities and distinguishes known, zero and unknown values', () => {
    const rows = soulSubOptions(data, { iID: 2, subAttributes: [
      { iID: 10, attributeId: 209, iMin: 500, iMax: 500 },
      { iID: 11, attributeId: 209, iMin: 400, iMax: 450 },
      { iID: 12, attributeId: 209, iMin: 0, iMax: 0 },
      { iID: 13, attributeId: 209 },
    ] })
    expect(rows.map(row => row.id)).toEqual([10, 11, 12, 13])
    expect(new Set(rows.map(row => row.attributeId)).size).toBe(1)
    expect(rows[0].value).toContain('500')
    expect(rows[1].value).toContain('400–450')
    expect(rows[2].value).toContain('0')
    expect(rows[3].value).not.toBe(rows[2].value)
  })
  it('preserves repeated and unknown affixes and excess cards through reload', () => {
    const build = emptyPlanner('legacy-excess')
    build.equipment[0] = { ...build.equipment[0], id: 1, normal: [10, 10, 999], special: [888] }
    build.souls = [{ id: 2, sub: [10, 11, 10, 999], marks: [] }]
    build.cardSlots.main = [1, 2, 3, 4, 5]
    const loaded = migratePlanner(JSON.parse(JSON.stringify(build)), [equipment], [])
    expect(loaded.equipment).toEqual(build.equipment)
    expect(loaded.souls[0].sub).toEqual(build.souls[0].sub)
    expect(loaded.cardSlots.main).toEqual(build.cardSlots.main)
  })
})
