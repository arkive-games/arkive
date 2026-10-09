import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatResearchAttribute, loadHistoryResearch, loadFellowRelations, plainText } from './data'

afterEach(() => vi.unstubAllGlobals())

describe('history research data', () => {
  it('formats game display types without inferring units from the property suffix', () => {
    expect(formatResearchAttribute({ key: 'CritHurt_N', name: 'Critical damage', value: 0.176, format: 'percent' }, 'en-US')).toBe('+17.6%')
    expect(formatResearchAttribute({ key: 'DeltaHurt_N', name: 'Damage', value: 204, format: 'number' }, 'en-US')).toBe('+204')
    expect(formatResearchAttribute({ key: 'Atk_P', name: 'Attack', value: 0.073, format: 'percent' }, 'zh-CN')).toBe('+7.3%')
  })

  it('loads the research artifact', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 21, score: 1440 }] })
    vi.stubGlobal('fetch', fetcher)
    await expect(loadHistoryResearch()).resolves.toEqual([{ id: 21, score: 1440 }])
    expect(fetcher).toHaveBeenCalledWith('/data/fellows/history-research.json')
  })

  it('keeps per-member effects and per-tier rewards in relation data', async () => {
    const relation = { id: 4, members: [{ fellowId: 7, effectId: 6 }, { fellowId: 8, effectId: null }], researchRewards: [{ grade: 5, gradeName: 'Last', value: 40 }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [relation] }))
    await expect(loadFellowRelations()).resolves.toEqual([relation])
  })

  it('reports an unavailable artifact instead of treating it as an empty ladder', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(loadHistoryResearch()).rejects.toThrow('Unable to load history research (404)')
  })

  it('strips client markup without dropping story line breaks', () => {
    expect(plainText('<b>First</>\nSecond')).toBe('First\nSecond')
  })
})
