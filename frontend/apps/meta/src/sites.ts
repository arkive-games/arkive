export interface SiteCard {
  id: string
  /** Public URL of the game site (env-overridable, production subdomain default). */
  url: string
  /** Logo asset served from this app's public/ dir. */
  logo: string
  /** i18n keys under `translation`. */
  nameKey: string
  descKey: string
}

export const SITES: SiteCard[] = [
  {
    id: 'aion2',
    url: import.meta.env.VITE_AION2_URL ?? 'https://aion2.tc-imba.com',
    logo: '/aion2.webp',
    nameKey: 'site.aion2.name',
    descKey: 'site.aion2.desc',
  },
  {
    id: 'palworld',
    url: import.meta.env.VITE_PAL_URL ?? 'https://pal.tc-imba.com',
    logo: '/palworld-logo.webp',
    nameKey: 'site.palworld.name',
    descKey: 'site.palworld.desc',
  },
]
