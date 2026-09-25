import { describe, expect, it } from 'vitest'
import { FEATURES, featureHref, featuresOf, localize, searchCatalog, type GameFeature } from './featureCatalog'
import { SITES, VISIBLE_SITES, type SiteCard } from './sites'

interface EdgeOneConfig {
  rewrites?: { source: string }[]
}

// Every app's deploy rewrites, keyed by app directory. The rewrites are what
// EdgeOne serves a client-side route from, so a path missing here is a link
// that works on the portal's dev server and 404s in production.
const EDGEONE = Object.fromEntries(
  Object.entries(import.meta.glob<EdgeOneConfig>('../../*/edgeone.json', { eager: true, import: 'default' }))
    .map(([file, config]) => [file.split('/').at(-2)!, config]),
)

/** The same match EdgeOne makes: an exact source, or a `*`-suffixed prefix. */
function isServed(gameId: string, path: string): boolean {
  const pathname = new URL(path, 'https://example.test').pathname
  if (pathname === '/') return true
  const sources = (EDGEONE[gameId]?.rewrites ?? []).map((rule) => rule.source)
  return sources.some((source) => source.endsWith('*')
    ? pathname.startsWith(source.slice(0, -1))
    : source === pathname)
}

const names = (site: SiteCard) => ({
  aion2: ['永恒之塔 2', 'AION 2'],
  palworld: ['幻兽帕鲁', 'Palworld'],
  gmzz: ['诡秘之主', 'Lord of Mysteries'],
  ro3: ['仙境传说3', 'Ragnarok Online 3'],
  vrising: ['夜族崛起', 'V Rising'],
  sts2: ['杀戮尖塔2'],
}[site.id] ?? [])

describe('feature catalog', () => {
  it('has unique ids', () => {
    const ids = FEATURES.map((feature) => feature.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(FEATURES.map((feature) => [feature.id, feature] as const))('%s is served by its app', (_, feature) => {
    expect(EDGEONE[feature.gameId], `apps/${feature.gameId}/edgeone.json is missing`).toBeDefined()
    expect(isServed(feature.gameId, feature.path), `add ${feature.path} to apps/${feature.gameId}/edgeone.json`).toBe(true)
  })

  it.each(FEATURES.map((feature) => [feature.id, feature] as const))('%s belongs to a listed game', (_, feature) => {
    expect(SITES.some((site) => site.id === feature.gameId)).toBe(true)
  })

  it('gives every tool a description', () => {
    for (const tool of FEATURES.filter((feature) => feature.kind === 'tool')) {
      expect(tool.description, tool.id).toBeDefined()
    }
  })

  // The homepage shows a module line under every game card; a game with no
  // entries here would render a bare cover and read as an empty site.
  it.each(VISIBLE_SITES.map((site) => site.id))('%s lists at least one feature', (id) => {
    expect(featuresOf(id).length, `add ${id}'s pages to FEATURES`).toBeGreaterThan(0)
  })

  it('keeps unlaunched games off the portal', () => {
    expect(VISIBLE_SITES.some((site) => site.comingSoon)).toBe(false)
  })
})

describe('localize', () => {
  const value = { 'en-US': 'Map', 'zh-CN': '地图', 'zh-TW': '地圖' }
  it('reads Chinese directly and falls back to English otherwise', () => {
    expect(localize(value, 'zh-TW')).toBe('地圖')
    expect(localize(value, 'ja-JP')).toBe('Map')
  })
})

describe('featureHref', () => {
  const site = { ...SITES[0], url: 'https://game.example' } as SiteCard
  const feature = { path: '/?view=wiki&wiki=cards' } as GameFeature

  it('resolves the path, query included, against the site root', () => {
    expect(featureHref(feature, site)).toBe('https://game.example/?view=wiki&wiki=cards')
  })

  it('has no link for a game that is not open', () => {
    expect(featureHref(feature, { ...site, comingSoon: true })).toBeUndefined()
    expect(featureHref(feature, undefined)).toBeUndefined()
  })
})

describe('searchCatalog', () => {
  const ids = (query: string) => searchCatalog(query, SITES, names)
    .map((hit) => hit.type === 'game' ? `game:${hit.site.id}` : hit.feature.id)

  it('finds a tool from any locale', () => {
    expect(ids('配种')).toEqual(['palworld-breeding'])
    expect(ids('配種')).toEqual(['palworld-breeding'])
    expect(ids('breeding')).toEqual(['palworld-breeding'])
  })

  it('puts the game first, then lists every page it has', () => {
    const hits = ids('帕鲁')
    expect(hits[0]).toBe('game:palworld')
    expect(hits).toHaveLength(1 + featuresOf('palworld').length)
    // Pages matched only through the game's name keep tools ahead of wiki.
    expect(hits.indexOf('palworld-stat-simulator')).toBeLessThan(hits.indexOf('palworld-fishing'))
  })

  it('ranks a feature matched by name above one matched only by its game', () => {
    const hits = ids('帕鲁图鉴')
    expect(hits[0]).toBe('palworld-pals')
  })

  it('ignores case and spacing', () => {
    expect(ids('v rising')[0]).toBe('game:vrising')
    expect(ids('V型血')).toContain('vrising-vblood')
  })

  it('never offers an unlaunched game', () => {
    expect(ids('杀戮尖塔')).toEqual([])
  })

  it('returns nothing for a blank query', () => {
    expect(ids('  ')).toEqual([])
  })
})
