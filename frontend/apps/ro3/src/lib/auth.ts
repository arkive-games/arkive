import { ARKIVE_PRODUCTION_API_URL, resolveAuthConfig } from '@gamemap/auth'

/**
 * Where the API is and how this build carries a session -- the same resolution
 * every other game uses, so an Arkive account signed in on one subdomain is
 * signed in here too.
 *
 * Production builds fall back to the deployed backend, so no per-project build
 * variable is needed. A development build with nothing configured resolves to
 * disabled, and the account control hides itself rather than offering a
 * sign-in that cannot work.
 */
export const AUTH_CONFIG = resolveAuthConfig({
  apiBaseUrl:
    import.meta.env.VITE_API_BASE_URL ??
    (import.meta.env.PROD ? ARKIVE_PRODUCTION_API_URL : undefined),
  isToy: Boolean(import.meta.env.VITE_TOY),
})
