import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryClient, getMemoryKey, type StorageLike } from '@gamemap/state-memory'
import { isPartnerLevel, partnerLevel } from './memory'

const values = new Map<string, string>()
const storage: StorageLike = {
  get length() { return values.size },
  key: (index) => [...values.keys()][index] ?? null,
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, value) },
  removeItem: (key) => { values.delete(key) },
}
beforeEach(() => values.clear())

describe('puppet level memory', () => {
  it.each([1, 10, 20, 30, 40, 50])('accepts level %s', (level) => {
    expect(isPartnerLevel(level)).toBe(true)
  })

  it.each([0, 51, -1, 1.5, NaN, Infinity, null, '10', {}, []])('rejects invalid level %s', (level) => {
    expect(isPartnerLevel(level)).toBe(false)
  })

  it('stores each puppet separately and restores through a new client', () => {
    const first = partnerLevel.at({ partner: '100' })
    const second = partnerLevel.at({ partner: '200' })
    const client = new MemoryClient({ deviceStorage: storage })
    expect(client.write(first.record, 30, first.scope)).toBe(true)
    expect(client.write(second.record, 10, second.scope)).toBe(true)
    const restored = new MemoryClient({ deviceStorage: storage })
    expect(restored.read(first.record, first.scope)).toBe(30)
    expect(restored.read(second.record, second.scope)).toBe(10)
    const envelope = JSON.parse(storage.getItem(getMemoryKey(first.record, first.scope))!)
    expect(envelope.value).toBe(30)
    expect(envelope.expiresAt).toBeUndefined()
    client.clear(first.record, first.scope)
    expect(restored.read(first.record, first.scope)).toBe(1)
    expect(restored.read(second.record, second.scope)).toBe(10)
  })

  it('ignores invalid and future-schema values without affecting other puppets', () => {
    const first = partnerLevel.at({ partner: '100' })
    const second = partnerLevel.at({ partner: '200' })
    const client = new MemoryClient({ deviceStorage: storage })
    client.write(second.record, 20, second.scope)
    const key = getMemoryKey(first.record, first.scope)
    for (const invalid of ['broken', JSON.stringify({ schemaVersion: '1.0.0', writtenAt: Date.now(), value: 51 }), JSON.stringify({ schemaVersion: '99.0.0', writtenAt: Date.now(), value: 10 })]) {
      storage.setItem(key, invalid)
      expect(client.read(first.record, first.scope)).toBe(1)
      expect(client.read(second.record, second.scope)).toBe(20)
    }
  })

  it('falls back to the default when browser storage is unavailable', () => {
    const bound = partnerLevel.at({ partner: '100' })
    const client = new MemoryClient({ deviceStorage: { ...storage, getItem: () => { throw new Error('Blocked') } } })
    expect(client.read(bound.record, bound.scope)).toBe(1)
  })
})
