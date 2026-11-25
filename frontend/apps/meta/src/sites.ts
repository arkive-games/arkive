import type { CreatePostBody } from '@gamemap/api-core'

import aion2Bg from './assets/aion2-bg.jpg'
import palworldBg from './assets/palworld-bg.webp'
import gmzzBg from './assets/gmzz-bg.webp'
import gmzzThumb from './assets/gmzz-thumb.webp'
import ro3Bg from './assets/ro3-bg.webp'
import ro3Catalog from './assets/ro3-catalog.webp'
import aion2Logo from './assets/aion2-logo.webp'
import palworldLogo from './assets/palworld-logo.png'
import sts2Logo from './assets/sts2-logo.png'
import vrisingLogo from './assets/vrising-logo.png'
import glimmithAvatar from './assets/glimmith-library-avatar.png'
import pbzAvatar from './assets/pbz-library-avatar.png'
import aion2Banner from './assets/aion2-banner.webp'
import gmzzBanner from './assets/gmzz-banner.webp'
import palworldBanner from './assets/palworld-banner.webp'
import vrisingBanner from './assets/vrising-banner.webp'
import ro3Banner from './assets/ro3-banner.webp'
import aion2Icon from './assets/aion2-icon.webp'
import gmzzIcon from './assets/gmzz-icon.webp'
import palworldIcon from './assets/palworld-icon.webp'
import vrisingIcon from './assets/vrising-icon.webp'
import ro3Icon from './assets/ro3-icon.webp'
import glimmithCover from './assets/glimmith-steam-header.jpg'
import glimmithIcon from './assets/glimmith-launcher.png'
import ossIcon from './assets/oss-launcher.png'
import glimmithCatalog from './assets/glimmith-catalog.webp'
import ossCatalog from './assets/oss-catalog.webp'
import palworldCatalog from './assets/palworld-catalog.webp'
import gmzzCatalog from './assets/gmzz-catalog.webp'
import pbzCatalog from './assets/pbz-catalog.webp'
import { PBZ_ARTWORK } from './upcoming'

const STS2_BG = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2868840/library_600x900_2x.jpg'
const VRISING_BG = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1604030/library_600x900_2x.jpg'

export const IS_TOY = Boolean(import.meta.env.VITE_TOY)
export const GLIMMITH_MAP_PATH = '/#glimmith/tutorial'

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
  guideLanguage?: 'zh-CN'
  toySlug?: string
  bg: string
  /**
   * CSS `object-position` for `bg` wherever it is cropped (the homepage's 16:9
   * covers, the square tool thumbnails), so the crop keeps the characters'
   * faces. Omit for art that already centres them.
   */
  bgPosition?: string
  /**
   * A square close-up for small thumbnails (tool cards), for art whose `bg` is
   * a group shot that turns to noise at 4rem. Falls back to `bg`.
   */
  thumb?: string
  /** Wide 12:5 key art for the homepage carousel. A game without one is left out of it. */
  banner?: string
  /** CSS `object-position` for `banner`, chosen so the faces survive the narrower mobile crop. */
  bannerPosition?: string
  /** Art and focal point for the 4:3 and square All Games crops only. */
  catalogCover?: { src: string; position: string; squarePosition?: string; zoom?: number; squareZoom?: number }
  /** Optional homepage-specific avatar when the default app icon is not the best small picture. */
  shortcutAvatar?: string
  /** Square app-style artwork for game shortcuts and other surfaces, such as tool badges. */
  icon?: string
  /** Dominant colour of `banner`, used for the carousel glow. */
  color?: string
  /** Radix surface pair selected from the final catalog crop, independent of the carousel and menu. */
  catalogHover: { light: string; dark: string }
  /**
   * Which column of the top bar's game menu lists it: a live-service online
   * game, or one played alone or with friends.
   */
  kind: 'online' | 'offline'
  /** Softer hover tint for the game's row in that menu. */
  menuTint?: string
  nameKey: string
  descKey: string
  featureKey: string
  /** Announced but not open: kept out of `VISIBLE_SITES`, so the portal lists it nowhere. */
  comingSoon?: boolean
}

function resolveSiteUrl(envUrl: string | undefined, devUrl: string, productionUrl: string) {
  return envUrl ?? (import.meta.env.DEV ? devUrl : productionUrl)
}

export const SITES: SiteCard[] = [
  {
    id: 'glimmith',
    guideLanguage: 'zh-CN',
    catalogHover: { light: '#d6f1e3', dark: '#0b3b2c' },
    kind: 'offline',
    url: GLIMMITH_MAP_PATH,
    bg: glimmithCover,
    shortcutAvatar: glimmithAvatar,
    catalogCover: { src: glimmithCatalog, position: '70% 50%' },
    icon: glimmithIcon,
    nameKey: 'site.glimmith.name',
    descKey: 'site.glimmith.desc',
    featureKey: 'site.glimmith.feature',
  },
  {
    id: 'oss',
    guideLanguage: 'zh-CN',
    catalogHover: { light: '#ffee9c', dark: '#3f2700' },
    kind: 'offline',
    url: resolveSiteUrl(import.meta.env.VITE_OSS_URL, 'http://localhost:15181', 'https://oss.arkive.games'),
    bg: '/oss-preview.svg',
    catalogCover: { src: ossCatalog, position: '50% 58%', squarePosition: '50% 87%' },
    icon: ossIcon,
    nameKey: 'site.oss.name',
    descKey: 'site.oss.desc',
    featureKey: 'site.oss.feature',
  },
  {
    id: 'aion2',
    catalogHover: { light: '#eae6db', dark: '#2d2b26' },
    kind: 'online',
    menuTint: '#638bc8',
    url: resolveSiteUrl(
      import.meta.env.VITE_AION2_URL,
      'http://localhost:15173',
      'https://aion2.arkive.games',
    ),
    toySlug: 'arkive-aion2',
    bg: aion2Bg,
    banner: aion2Banner,
    bannerPosition: '22% 50%',
    icon: aion2Icon,
    color: '#5a7fb8',
    nameKey: 'site.aion2.name',
    descKey: 'site.aion2.desc',
    featureKey: 'site.aion2.feature',
  },
  {
    id: 'palworld',
    catalogHover: { light: '#caf1f6', dark: '#003848' },
    kind: 'offline',
    menuTint: '#58ab9b',
    url: resolveSiteUrl(
      import.meta.env.VITE_PAL_URL,
      'http://localhost:15174',
      'https://palworld.arkive.games',
    ),
    toySlug: 'arkive-palworld',
    bg: palworldBg,
    banner: palworldBanner,
    catalogCover: { src: palworldCatalog, position: '53% 50%' },
    icon: palworldIcon,
    color: '#4a9ad0',
    nameKey: 'site.palworld.name',
    descKey: 'site.palworld.desc',
    featureKey: 'site.palworld.feature',
  },
  {
    id: 'gmzz',
    catalogHover: { light: '#f7def8', dark: '#451d47' },
    kind: 'online',
    menuTint: '#ac8455',
    url: resolveSiteUrl(
      import.meta.env.VITE_GMZZ_URL,
      'http://localhost:15179',
      'https://gmzz.arkive.games',
    ),
    bg: gmzzBg,
    // The lead character stands right of centre.
    bgPosition: '65% center',
    thumb: gmzzThumb,
    banner: gmzzBanner,
    catalogCover: { src: gmzzCatalog, position: '66% 50%', squarePosition: '65% 50%' },
    bannerPosition: '58% 22%',
    icon: gmzzIcon,
    color: '#8a6a3a',
    nameKey: 'site.gmzz.name',
    descKey: 'site.gmzz.desc',
    featureKey: 'site.gmzz.feature',
  },
  {
    id: 'ro3',
    guideLanguage: 'zh-CN',
    catalogHover: { light: '#d1f0fa', dark: '#113555' },
    kind: 'online',
    menuTint: '#6d9d59',
    url: resolveSiteUrl(
      import.meta.env.VITE_RO3_URL,
      'http://localhost:15178',
      'https://ro3.arkive.games',
    ),
    bg: ro3Bg,
    banner: ro3Banner,
    catalogCover: { src: ro3Catalog, position: '100% 8%', zoom: 1.5, squareZoom: 1.13 },
    bannerPosition: '28% 18%',
    icon: ro3Icon,
    color: '#6aa8d8',
    nameKey: 'site.ro3.name',
    descKey: 'site.ro3.desc',
    featureKey: 'site.ro3.feature',
  },
  {
    id: 'vrising',
    catalogHover: { light: '#ebe4ff', dark: '#33255b' },
    kind: 'offline',
    menuTint: '#b45f6b',
    url: resolveSiteUrl(
      import.meta.env.VITE_VRISING_URL,
      'http://localhost:15176',
      'https://vrising.arkive.games',
    ),
    bg: VRISING_BG,
    // A portrait poster whose two faces sit in its top third; a centred
    // landscape crop cuts through their chests instead.
    bgPosition: 'center 15%',
    banner: vrisingBanner,
    bannerPosition: '50% 25%',
    icon: vrisingIcon,
    color: '#9a2a3a',
    nameKey: 'site.vrising.name',
    descKey: 'site.vrising.desc',
    featureKey: 'site.vrising.feature',
  },
  {
    id: 'sts2',
    catalogHover: { light: '#ffdbdc', dark: '#500f1c' },
    kind: 'offline',
    comingSoon: true,
    bg: STS2_BG,
    nameKey: 'site.sts2.name',
    descKey: 'site.sts2.desc',
    featureKey: 'site.sts2.feature',
  },
  {
    id: 'pbz',
    catalogHover: { light: '#ffdfb5', dark: '#462100' },
    kind: 'offline',
    menuTint: '#c98a3e',
    url: resolveSiteUrl(
      import.meta.env.VITE_PBZ_URL,
      'http://localhost:15180',
      'https://pbz.arkive.games',
    ),
    bg: PBZ_ARTWORK.banner,
    shortcutAvatar: pbzAvatar,
    banner: PBZ_ARTWORK.banner,
    catalogCover: { src: pbzCatalog, position: '55% 50%', squarePosition: '57% 50%' },
    icon: PBZ_ARTWORK.icon,
    color: '#c98a3e',
    nameKey: 'site.pbz.name',
    descKey: 'site.pbz.desc',
    featureKey: 'site.pbz.feature',
  },
]

/**
 * Square-ish art for the forum's cabin lists, keyed by game.
 *
 * Lives here rather than in ForumPage because it is per-game presentation data
 * like `bg`, and because a component module is not importable from a test
 * without dragging React in.
 *
 * `Record<string, string>` rather than `Record<GameId, string>`: a missing game
 * is therefore not a type error but an `undefined` src on a live `<img>`. Every
 * id in `SITES` needs an entry, `comingSoon` ones included, so that one is
 * ready the day it opens. Games with no dedicated logo reuse their square
 * `thumb` (gmzz) or their card art (ro3). gameCatalog.test.ts asserts the
 * coverage.
 */
export const GAME_LOGOS: Record<string, string> = {
  aion2: aion2Logo,
  gmzz: gmzzThumb,
  palworld: palworldLogo,
  vrising: vrisingLogo,
  sts2: sts2Logo,
  ro3: ro3Bg,
  pbz: PBZ_ARTWORK.icon,
  oss: ossIcon,
  glimmith: glimmithIcon,
}

/**
 * What the portal lists: the homepage, the top-bar game menu, the all-games
 * page and the forum's game cabins. An announced game stays out of all of them
 * until it opens -- a card that leads nowhere reads as a broken site, not as a
 * promise. It remains in `SITES`, so a post or favourite that already names it
 * still resolves.
 */
export const VISIBLE_SITES: SiteCard[] = SITES.filter((site) =>
  !site.comingSoon && (!IS_TOY || site.toySlug))

const RECENT_UPDATE_DAYS = 7

/**
 * Whole calendar days since `date` (a changelog's YYYY-MM-DD) in the visitor's
 * time zone, or `undefined` when there is no date, it is malformed, in the
 * future, or older than the badge window.
 */
export function recentUpdateDays(date: string | undefined, now: Date): number | undefined {
  const match = date && /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return undefined
  const then = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // Rounded, not floored: a daylight-saving change makes one day 23 or 25 hours.
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000)
  return days >= 0 && days <= RECENT_UPDATE_DAYS ? days : undefined
}

/** `undefined` for an announced game, so callers render an inert card instead of a link. */
export function siteHref(site: SiteCard): string | undefined {
  if (site.comingSoon) return undefined
  return IS_TOY && site.toySlug ? `/toy/${site.toySlug}/index.html` : site.url
}
