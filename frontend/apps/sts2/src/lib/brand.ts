import { resolveArkiveHomeUrl } from '@gamemap/map-shell'

export const ARKIVE_HOME_URL = resolveArkiveHomeUrl({
  envUrl: import.meta.env.VITE_HOME_URL,
  dev: import.meta.env.DEV,
  toy: Boolean(import.meta.env.VITE_TOY),
})
