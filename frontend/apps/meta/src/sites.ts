export interface SiteCard {
  id: string
  /** Public URL of the game site (env-overridable, production subdomain default). */
  url: string
  /** Background image served from this app's public/ dir. */
  bg: string
  /** i18n keys under `translation`. */
  nameKey: string
  descKey: string
}

export const SITES: SiteCard[] = [
  {
    id: 'aion2',
    url: import.meta.env.VITE_AION2_URL ?? 'https://aion2.tc-imba.com',
    bg: '/aion2-bg.jpg',
    nameKey: 'site.aion2.name',
    descKey: 'site.aion2.desc',
  },
  {
    id: 'palworld',
    url: import.meta.env.VITE_PAL_URL ?? 'https://palworld.tc-imba.com',
    bg: '/palworld-bg.webp',
    nameKey: 'site.palworld.name',
    descKey: 'site.palworld.desc',
  },
]
