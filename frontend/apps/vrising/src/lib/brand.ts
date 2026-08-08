import { resolveArkiveHomeUrl } from '@gamemap/map-shell'

/** True in a Bilibili Toy build. */
export const IS_TOY = Boolean(import.meta.env.VITE_TOY)

export const ARKIVE_HOME_URL = resolveArkiveHomeUrl({
  envUrl: import.meta.env.VITE_HOME_URL,
  dev: import.meta.env.DEV,
  toy: IS_TOY,
})

export const ARKIVE_HOME_LINK_PROPS = IS_TOY
  ? ({ target: undefined, rel: undefined } as const)
  : ({ target: '_blank', rel: 'noopener noreferrer' } as const)
