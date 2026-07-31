// Artwork is imported (not read from public/) so Vite hashes it and rewrites the
// URL against the build's base. A toy is served from
// https://www.bilibili.com/toy/<slug>/, where a root-absolute "/palworld-bg.webp"
// 404s — and the package self-check only greps HTML, so such a reference would
// fail silently at runtime. An import is verified at build time instead.
import aion2Bg from './assets/aion2-bg.jpg'
import palworldBg from './assets/palworld-bg.webp'

/**
 * True in a Bilibili Toy build (`VITE_TOY=1`, set by scripts/toy-build.mjs).
 * A toy is a sealed same-origin directory under /toy/<slug>/: it can reach its
 * sibling toys by path, but the public web is another world.
 */
const IS_TOY = Boolean(import.meta.env.VITE_TOY)

export interface SiteCard {
  id: string
  /** Public URL of the game site (env-overridable, production subdomain default). */
  url: string
  /**
   * Slug of this game's own toy, when it has one. Toys live side by side under
   * /toy/, so inside a toy build the card links there instead of to `url`.
   * Games without a published toy are dropped from the grid (see VISIBLE_SITES)
   * rather than shipping a link that cannot work.
   */
  toySlug?: string
  /** Card background, bundled and hashed by Vite. */
  bg: string
  /** i18n keys under `translation`. */
  nameKey: string
  descKey: string
}

export const SITES: SiteCard[] = [
  {
    id: 'aion2',
    url: import.meta.env.VITE_AION2_URL ?? 'https://aion2.tc-imba.com',
    // No aion2 toy yet — add its slug here when one is published.
    bg: aion2Bg,
    nameKey: 'site.aion2.name',
    descKey: 'site.aion2.desc',
  },
  {
    id: 'palworld',
    url: import.meta.env.VITE_PAL_URL ?? 'https://palworld.tc-imba.com',
    toySlug: 'arkive-palworld',
    bg: palworldBg,
    nameKey: 'site.palworld.name',
    descKey: 'site.palworld.desc',
  },
]

/** Cards to render for the current target: every site on the web, only the ones with a toy inside a toy. */
export const VISIBLE_SITES: SiteCard[] = IS_TOY ? SITES.filter((site) => site.toySlug) : SITES

/**
 * Where a card points. `index.html` is spelled out because a toy directory has
 * no index redirect — /toy/<slug>/ alone 404s on the platform.
 */
export function siteHref(site: SiteCard): string {
  return IS_TOY && site.toySlug ? `/toy/${site.toySlug}/index.html` : site.url
}
