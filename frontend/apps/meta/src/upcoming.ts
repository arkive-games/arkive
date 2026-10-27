import pbzBanner from './assets/pbz-banner.webp'
import pbzBannerPhone from './assets/pbz-banner-phone.webp'
import pbzIcon from './assets/pbz-icon.webp'

/**
 * Phantom Blade Zero, promoted on the homepage before its guide opens. It is
 * not a `SiteCard`: listing it in `SITES` would also put it on the all-games
 * page and in the games menu. The carousel slide and the shortcut tile both
 * read from here, so launching the guide means changing one place.
 */
export const UPCOMING_PBZ = {
  key: 'pbz',
  nameKey: 'landing.carousel.pbz.name',
  banner: pbzBanner,
  phoneBanner: pbzBannerPhone,
  icon: pbzIcon,
  /** The dominant colour of the poster art, used for the carousel glow and the tile. */
  color: '#c98a3e',
} as const
