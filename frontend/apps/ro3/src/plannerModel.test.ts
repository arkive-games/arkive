import { describe, expect, it } from 'vitest'
import { emptyPlanner, migratePlanner, readPlannerStorage, savePlannerBuilds } from './lib/plannerModel'
import { BUILD_SLOTS, equipmentAllowed, slotAllows, type BuildJob } from './lib/buildRules'
import { BUILD_STORAGE_KEY } from './lib/buildState'
import type { EquipmentRecord } from './wikiData'

const records: EquipmentRecord[] = Array.from({ length: 7 }, (_, i) => ({ iID: i + 10, item: { iID: i + 10, iEquipPart: i + 1, iSubType: 1, kJobNeed: [1400] } }))
const keys = ['a', 'b', 'c', 'd', 'e', 'f']
const job: BuildJob = { id: 1400, name: '', rank: 5, parentId: 1300, branchIds: [131], subtypes: [1], weaponForms: [1, 2] }

it('creates distinct identities for builds created in the same clock tick', () => {
  const builds = Array.from({ length: 100 }, () => emptyPlanner())
  expect(new Set(builds.map(b => b.id)).size).toBe(100)
})

describe('canonical build mappings', () => {
  it('uses one accessory item/card category for two distinct grids', () => {
    expect(BUILD_SLOTS.slice(-2).map(s => [s.grid, [...s.positions], s.cardPart])).toEqual([[6, [7], 6], [7, [7], 6]])
    expect(slotAllows(records[1], 'main', job)).toBe(true)
    expect(slotAllows(records[1], 'off', job)).toBe(false)
    expect(slotAllows(records[1], 'off', { ...job, weaponForms: [3] })).toBe(true)
    expect(equipmentAllowed(records[1], job)).toBe(true)
    expect(equipmentAllowed(records[1], { ...job, id: 3400 })).toBe(false)
  })
})

describe('non-destructive migration', () => {
  it('retains competing main-hand records and excess skills for recovery', () => {
    const old = { id: 'saved', skillIds: [1, 2, 3, 4, 5, 6, 7], equipment: [{ slotKey: 'weapon', equipmentId: 10, cardIds: [0, 42] }, { slotKey: 'offhand', equipmentId: 11 }, { slotKey: 'shield', equipmentId: 12 }, { slotKey: 'shoes', equipmentId: 14 }, { slotKey: 'accessory-1', equipmentId: 15 }, { slotKey: 'accessory-2', equipmentId: 16 }] }
    const next = migratePlanner(old, records, keys)
    expect(next.equipment.find(e => e.slot === 'main')?.id).toBe(10)
    expect(next.equipment.find(e => e.slot === 'off')?.id).toBe(12)
    expect(next.equipment.find(e => e.slot === 'cloak')?.id).toBe(14)
    expect(next.equipment.find(e => e.slot === 'shoes')?.id).toBe(15)
    expect(next.equipment.find(e => e.slot === 'main')?.cards).toEqual([0, 42])
    expect(next.skills).toEqual([1, 2, 3, 4, 5, 6])
    expect(next.recovery).toContainEqual(old.equipment[1])
    expect(next.original).toEqual(old)
    expect(migratePlanner(next, records, keys)).toEqual(next)
  })
  it('migrates cards without equipment and retains independent assignments', () => {
    const build = emptyPlanner('cards')
    build.equipment[1].cards = [77]
    const legacy = { ...build, cardSlots: undefined }
    const migrated = migratePlanner(legacy, records, keys)
    expect(migrated.cardSlots.off).toEqual([77])
    migrated.cardSlots.off = [0, 88]
    expect(migratePlanner(migrated, records, keys).cardSlots.off).toEqual([0, 88])
    expect(migrated.equipment[1].id).toBe(0)
  })
  it('preserves empty modern skill and pet positions across reload', () => {
    const build = emptyPlanner('positions')
    build.skills = [0, 22, 0, 44, 0, 66]
    build.combat = [0, 9, 0, 10]
    build.assist = [0, 8]
    const next = migratePlanner(build, records, keys)
    expect(next.skills).toEqual(build.skills)
    expect(next.combat).toEqual(build.combat)
    expect(next.assist).toEqual(build.assist)
  })
  it('keeps duplicate accessories independent and preserves missing records', () => {
    const next = migratePlanner({ equipment: [{ equipmentId: 16 }, { equipmentId: 16 }, { equipmentId: 999 }] }, records, keys)
    expect(next.equipment.slice(-2).map(e => e.id)).toEqual([16, 16])
    expect(next.recovery).toContainEqual({ equipmentId: 999 })
  })
  it('does not reseed edited defaults or lose valid siblings beside malformed records', () => {
    const stored = readPlannerStorage({ getItem: () => JSON.stringify([null, { id: 'local-default', title: 'Custom', attributes: { a: 500 } }]) })
    const migrated = stored.records.map(v => migratePlanner(v, records, keys))
    expect(migrated[0].recovery).toEqual([null])
    expect(migrated[1].title).toBe('Custom')
    expect(migrated[1].attributes[0]).toBe(500)
  })
})

it('backs up the exact original before explicitly saving and never overwrites that backup', () => {
  const values = new Map([[BUILD_STORAGE_KEY, '[ { "id": "old" } ]']])
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
  expect(savePlannerBuilds([emptyPlanner('new')], storage)).toBe(true)
  expect(values.get(`${BUILD_STORAGE_KEY}:before-v2`)).toBe('[ { "id": "old" } ]')
  expect(savePlannerBuilds([emptyPlanner('next')], storage)).toBe(true)
  expect(values.get(`${BUILD_STORAGE_KEY}:before-v2`)).toBe('[ { "id": "old" } ]')
})
it('aborts a save when backup writing fails', () => {
  const writes: string[] = []
  expect(savePlannerBuilds([], { getItem: k => k === BUILD_STORAGE_KEY ? 'old' : null, setItem: k => { writes.push(k); throw Error('quota') } })).toBe(false)
  expect(writes).toEqual([`${BUILD_STORAGE_KEY}:before-v2`])
})
