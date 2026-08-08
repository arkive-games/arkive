import aion2Bg from './assets/aion2-bg.jpg'
import palworldBg from './assets/palworld-bg.webp'

const STS2_BG = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2868840/library_600x900_2x.jpg'
const VRISING_BG = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1604030/library_600x900_2x.jpg'

export const IS_TOY = Boolean(import.meta.env.VITE_TOY)

export interface SiteCard {
  id: string
  url: string
  toySlug?: string
  bg: string
  nameKey: string
  descKey: string
  featureKey: string
}

export type SiteClickCounts = Record<string, number>

function resolveSiteUrl(envUrl: string | undefined, devUrl: string, productionUrl: string) {
  return envUrl ?? (import.meta.env.DEV ? devUrl : productionUrl)
}

export const SITES: SiteCard[] = [
  {
    id: 'aion2',
    url: resolveSiteUrl(
      import.meta.env.VITE_AION2_URL,
      'http://localhost:15173',
      'https://aion2.tc-imba.com',
    ),
    toySlug: 'arkive-aion2',
    bg: aion2Bg,
    nameKey: 'site.aion2.name',
    descKey: 'site.aion2.desc',
    featureKey: 'site.aion2.feature',
  },
  {
    id: 'palworld',
    url: resolveSiteUrl(
      import.meta.env.VITE_PAL_URL,
      'http://localhost:15174',
      'https://palworld.tc-imba.com',
    ),
    toySlug: 'arkive-palworld',
    bg: palworldBg,
    nameKey: 'site.palworld.name',
    descKey: 'site.palworld.desc',
    featureKey: 'site.palworld.feature',
  },
  {
    id: 'vrising',
    url: resolveSiteUrl(
      import.meta.env.VITE_VRISING_URL,
      'http://localhost:15176',
      'https://vrising.tc-imba.com',
    ),
    bg: VRISING_BG,
    nameKey: 'site.vrising.name',
    descKey: 'site.vrising.desc',
    featureKey: 'site.vrising.feature',
  },
  {
    id: 'sts2',
    url: resolveSiteUrl(
      import.meta.env.VITE_STS2_URL,
      'http://localhost:15175',
      'https://sts2.tc-imba.com',
    ),
    bg: STS2_BG,
    nameKey: 'site.sts2.name',
    descKey: 'site.sts2.desc',
    featureKey: 'site.sts2.feature',
  },
]

export const VISIBLE_SITES: SiteCard[] = IS_TOY ? SITES.filter((site) => site.toySlug) : SITES

export function siteHref(site: SiteCard): string {
  return IS_TOY && site.toySlug ? `/toy/${site.toySlug}/index.html` : site.url
}

/**
 * Keep popularity ordering independent from the page so a future analytics
 * source can replace the current adapter without changing the visual layer.
 * Ties preserve the curated SITES order.
 */
export function rankSitesByClicks(sites: SiteCard[], counts: SiteClickCounts): SiteCard[] {
  return sites
    .map((site, index) => ({ site, index }))
    .sort((left, right) => {
      const difference = (counts[right.site.id] ?? 0) - (counts[left.site.id] ?? 0)
      return difference || left.index - right.index
    })
    .map(({ site }) => site)
}

/**
 * Optional response shape: `{ "aion2": 120, "palworld": 98 }`.
 * Without a configured endpoint the homepage uses a deterministic zero-count
 * fallback. No traffic numbers are invented in the client.
 */
export async function loadSiteClickCounts(signal?: AbortSignal): Promise<SiteClickCounts> {
  const endpoint = import.meta.env.VITE_GAME_POPULARITY_URL
  if (!endpoint || IS_TOY) return {}

  try {
    const response = await fetch(endpoint, { signal, credentials: 'same-origin' })
    if (!response.ok) return {}
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, number] => {
        const count = entry[1]
        return typeof count === 'number' && Number.isFinite(count) && count >= 0
      }),
    )
  } catch {
    return {}
  }
}
