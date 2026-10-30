import { SITES } from './sites'
import { UPCOMING_PBZ } from './upcoming'

/** Where a game's site lives and what to call it, for a link out of the inbox. */
export interface MarkerSite {
  url: string
  nameKey: string
}

/**
 * Resolves a game key to its site.
 *
 * PBZ is looked up separately because it is promoted on the homepage but is not a
 * `SiteCard` yet (see `upcoming.ts`); a marker comment there is the first thing
 * that needs to link to it from meta.
 */
export function markerSite(game: string): MarkerSite | null {
  if (game === UPCOMING_PBZ.key) return { url: UPCOMING_PBZ.url, nameKey: UPCOMING_PBZ.nameKey }
  const site = SITES.find((candidate) => candidate.id === game)
  // A card without a URL (a game listed but not yet live) has nowhere to link to.
  return site?.url ? { url: site.url, nameKey: site.nameKey } : null
}

/**
 * The URL that opens one marker on its game's map.
 *
 * Every game's map route is `/`, and a game reads `map` and `marker` from the
 * query string to select it, so the link is the site root plus those two. A
 * query parameter needs no rewrite rule in the game's `edgeone.json`.
 */
export function markerUrl(game: string, mapId: string, markerId: string): string | null {
  const site = markerSite(game)
  if (!site) return null
  const url = new URL('/', site.url)
  url.searchParams.set('map', mapId)
  url.searchParams.set('marker', markerId)
  return url.toString()
}
