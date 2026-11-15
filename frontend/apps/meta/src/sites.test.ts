import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function loadSites(dev: boolean, override?: string, toy?: string) {
  vi.resetModules()
  vi.stubEnv('DEV', dev)
  vi.stubEnv('PROD', !dev)
  vi.stubEnv('VITE_OSS_URL', override)
  vi.stubEnv('VITE_TOY', toy)
  return import('./sites')
}

describe('Order of the Sinking Star launch', () => {
  it('lists the live site in the production directory', async () => {
    const { VISIBLE_SITES } = await loadSites(false)
    expect(VISIBLE_SITES.find(site => site.id === 'oss')).toMatchObject({
      url: 'https://oss.arkive.games',
      kind: 'offline',
    })
  })

  it('keeps the fixed local app port in development', async () => {
    const { VISIBLE_SITES } = await loadSites(true)
    expect(VISIBLE_SITES.find(site => site.id === 'oss')?.url).toBe('http://localhost:15181')
  })

  it('lets the environment override the production URL', async () => {
    const { VISIBLE_SITES } = await loadSites(false, 'https://oss.example.test')
    expect(VISIBLE_SITES.find(site => site.id === 'oss')?.url).toBe('https://oss.example.test')
  })

  it('does not advertise an unavailable Toy build', async () => {
    const { VISIBLE_SITES } = await loadSites(false, undefined, '1')
    expect(VISIBLE_SITES.some(site => site.id === 'oss')).toBe(false)
  })
})
