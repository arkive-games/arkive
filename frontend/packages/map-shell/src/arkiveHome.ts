export const ARKIVE_DEV_HOME_URL = "http://localhost:15172"
export const ARKIVE_PRODUCTION_HOME_URL = "https://tc-imba.com"
export const ARKIVE_TOY_HOME_URL = "/toy/arkive/index.html"

export interface ResolveArkiveHomeUrlOptions {
  envUrl?: string
  dev?: boolean
  toy?: boolean
}

/** Resolve the shared Arkive portal link without leaking app-specific routing into the shell. */
export function resolveArkiveHomeUrl({
  envUrl,
  dev = false,
  toy = false,
}: ResolveArkiveHomeUrlOptions = {}): string {
  if (envUrl !== undefined) return envUrl
  if (toy) return ARKIVE_TOY_HOME_URL
  return dev ? ARKIVE_DEV_HOME_URL : ARKIVE_PRODUCTION_HOME_URL
}
