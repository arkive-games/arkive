import type { CreatePostBody } from '@gamemap/api-core'

import aion2Bg from './assets/aion2-bg.jpg'
import palworldBg from './assets/palworld-bg.webp'
import gmzzBg from './assets/gmzz-bg.webp'

const STS2_BG = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2868840/library_600x900_2x.jpg'
const VRISING_BG = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1604030/library_600x900_2x.jpg'

export const IS_TOY = Boolean(import.meta.env.VITE_TOY)

export const TRAIN_TRADE_STATION_TOOL_URL = import.meta.env.VITE_GMZZ_TRAIN_TRADE_TOOL_URL
  ?? (import.meta.env.DEV
    ? 'http://localhost:15173/tools/traintrade-station'
    : 'https://aion2.tc-imba.com/tools/traintrade-station')

/**
 * The games the backend knows, taken from the generated client rather than
 * restated here.
 *
 * A game id is a permanent key shared by this list, the backend's registry, a
 * data pipeline, two artifact repositories and a DNS name. Deriving the type from
 * the API contract means adding a game to the portal without adding it to the
 * server — or misspelling one — fails `tsc` instead of failing at request time,
 * which is how the two lists were previously free to disagree.
 *
 * The ordering consequence is worth knowing: this couples *every* card to the server
 * registry, including a `comingSoon` one that links nowhere and has no server-side
 * content by definition. Announcing a game here therefore needs its key added to
 * `core.game_keys()` first — one migration, ahead of the card. That is a real cost and
 * it buys the guarantee that a card and a forum tag can never mean different things.
 */
export type GameId = NonNullable<CreatePostBody['gameIds']>[number]

export interface SiteCard {
  id: GameId
  /**
   * Absent while `comingSoon` is set: an announced game has nothing to link to
   * yet, so the hub cannot accidentally render a href for it.
   */
  url?: string
  toySlug?: string
  bg: string
  nameKey: string
  descKey: string
  featureKey: string
  /** Listed and searchable, but not linked and never featured. */
  comingSoon?: boolean
  /**
   * The curated hero pick, used when the visitor has no recent game of their
   * own. Editorial policy, so it lives with the site list rather than as a game
   * id spelled out in the page.
   */
  featured?: boolean
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
    id: 'gmzz',
    url: resolveSiteUrl(
      import.meta.env.VITE_GMZZ_URL,
      'http://localhost:15173/wiki/utopian-theater',
      // The first GMZZ dataset currently ships from the existing AION2 host;
      // VITE_GMZZ_URL can switch this to the dedicated app when it deploys.
      'https://aion2.tc-imba.com/wiki/utopian-theater',
    ),
    bg: gmzzBg,
    nameKey: 'site.gmzz.name',
    descKey: 'site.gmzz.desc',
    featureKey: 'site.gmzz.feature',
  },
  {
    id: 'palworld',
    url: resolveSiteUrl(
      import.meta.env.VITE_PAL_URL,
      'http://localhost:15174',
      'https://palworld.tc-imba.com',
    ),
    toySlug: 'arkive-palworld',
    featured: true,
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
    comingSoon: true,
    bg: STS2_BG,
    nameKey: 'site.sts2.name',
    descKey: 'site.sts2.desc',
    featureKey: 'site.sts2.feature',
  },
]

export const VISIBLE_SITES: SiteCard[] = IS_TOY ? SITES.filter((site) => site.toySlug) : SITES

/** `undefined` for an announced game, so callers render an inert card instead of a link. */
export function siteHref(site: SiteCard): string | undefined {
  if (site.comingSoon) return undefined
  return IS_TOY && site.toySlug ? `/toy/${site.toySlug}/index.html` : site.url
}

/** The hero slot must never advertise a game nobody can open yet. */
export function firstPlayableSite(sites: readonly SiteCard[]): SiteCard | undefined {
  return sites.find((site) => !site.comingSoon)
}

/** The curated pick, falling back to whichever playable game ranks first. */
export function curatedFeaturedSite(sites: readonly SiteCard[]): SiteCard | undefined {
  return sites.find((site) => site.featured && !site.comingSoon) ?? firstPlayableSite(sites)
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
