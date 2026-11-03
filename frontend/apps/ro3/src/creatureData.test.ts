import { afterEach, expect, it, vi } from 'vitest'
import { loadDropPool } from './creatureData'

afterEach(() => vi.unstubAllGlobals())

it('restores default drop rolls omitted by the exporter and preserves explicit ranges', async () => {
  const request = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ shards: [{ path: 'drops/test.json', from: 1, to: 2 }] }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ pools: [{ id: 1, slots: [
      { slot: 1, chance: 1, items: [{ item: 7, weight: 1 }] },
      { slot: 2, chance: 0.5, rolls: [2, 4], items: [{ item: 8, weight: 1 }] },
    ] }] }) })
  vi.stubGlobal('fetch', request)
  const pool = await loadDropPool(1)
  expect(pool?.slots.map((slot) => slot.rolls)).toEqual([[1, 1], [2, 4]])
  expect(await loadDropPool(1)).toBe(pool)
  expect(request).toHaveBeenCalledTimes(2)
})
