import pbzBanner from './assets/pbz-banner.webp'
import pbzBannerPhone from './assets/pbz-banner-phone.webp'
import pbzIcon from './assets/pbz-icon.webp'

/**
 * Phantom Blade Zero artwork used by the homepage carousel and game catalog.
 * The live guide is represented as a regular `SiteCard` in `sites.ts`; this
 * module keeps the dedicated phone banner and shared artwork together.
 */
export const PBZ_ARTWORK = {
  banner: pbzBanner,
  phoneBanner: pbzBannerPhone,
  icon: pbzIcon,
  /** The dominant colour of the poster art, used for the carousel glow and the tile. */
  color: '#c98a3e',
} as const
