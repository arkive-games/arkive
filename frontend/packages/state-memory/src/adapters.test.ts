import { describe, expect, it } from 'vitest'
import {
  readHistoryMemory,
  readUrlMemory,
  restoreMemoryValue,
  writeHistoryMemory,
  writeUrlMemory,
  type HistoryMemoryEnvironment,
  type UrlMemoryEnvironment,
} from './adapters'

const isMode = (value: unknown): value is 'grid' | 'list' => value === 'grid' || value === 'list'

describe('state-memory adapters', () => {
  it('reads and writes validated URL state without touching other parameters', () => {
    let url = new URL('https://arkive.example/pals?q=lamball')
    const environment: UrlMemoryEnvironment = {
      getUrl: () => new URL(url),
      replaceUrl: (next) => { url = next },
    }

    writeUrlMemory(environment, 'view', 'list')
    expect(url.searchParams.get('q')).toBe('lamball')
    expect(readUrlMemory(environment, 'view', (raw) => raw, isMode)).toBe('list')
  })

  it('preserves router-owned history state', () => {
    let state: unknown = { router: { index: 2 } }
    const environment: HistoryMemoryEnvironment = {
      getState: () => state,
      replaceState: (next) => { state = next },
    }

    writeHistoryMemory(environment, 'catalog', { page: 3 })
    expect(state).toMatchObject({ router: { index: 2 } })
    expect(readHistoryMemory(
      environment,
      'catalog',
      (value): value is { page: number } => Boolean(value) && typeof value === 'object' && (value as { page?: unknown }).page === 3,
    )).toEqual({ page: 3 })
  })

  it('restores in URL, history, account, device, default order', async () => {
    const value = await restoreMemoryValue({
      url: { read: () => null },
      history: { read: () => 'list' },
      account: { read: () => 'grid' },
      device: { read: () => 'grid' },
      validate: isMode,
      defaultValue: () => 'grid',
    })
    expect(value).toBe('list')
  })
})
