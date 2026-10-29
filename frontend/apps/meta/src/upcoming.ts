import pbzBanner from './assets/pbz-banner.webp'
import pbzBannerPhone from './assets/pbz-banner-phone.webp'
import pbzIcon from './assets/pbz-icon.webp'

/**
 * Phantom Blade Zero, promoted on the homepage. It is not a `SiteCard` yet: a
 * card's id must be a game key the backend knows (`GameId`, from the generated
 * client), and `pbz` has no backend key so far. Until it does, the carousel
 * slide and the shortcut tile both read from here and link straight to the
 * guide; adding the key is what moves it into `SITES` and the all-games page.
 */
export const UPCOMING_PBZ = {
  key: 'pbz',
  nameKey: 'landing.carousel.pbz.name',
  url: import.meta.env.VITE_PBZ_URL ?? (import.meta.env.DEV ? 'http://localhost:15180' : 'https://pbz.arkive.games'),
  banner: pbzBanner,
  phoneBanner: pbzBannerPhone,
  icon: pbzIcon,
  /** The dominant colour of the poster art, used for the carousel glow and the tile. */
  color: '#c98a3e',
} as const
