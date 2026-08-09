import { ARKIVE_PRODUCTION_API_URL, resolveAuthConfig } from '@gamemap/auth'

import { IS_TOY } from '../sites'

/**
 * Where the API is and how this build carries a session.
 *
 * The environment is read here rather than inside @gamemap/auth so the shared
 * package stays environment-agnostic, matching how ThemeProvider takes an
 * injected storage adapter instead of reaching for localStorage itself.
 *
 * Production builds fall back to the deployed backend, so no per-project build
 * variable is needed. A build with neither the variable nor that fallback —
 * a development build with nothing configured — resolves to disabled, and the
 * account control hides itself rather than offering a sign-in that cannot work.
 */
const resolvedAuthConfig = resolveAuthConfig({
  // Falls back to the deployed backend in production builds so the six sites
  // need no per-project build variable; VITE_API_BASE_URL still wins when set.
  apiBaseUrl:
    import.meta.env.VITE_API_BASE_URL ??
    (import.meta.env.PROD ? ARKIVE_PRODUCTION_API_URL : undefined),
  isToy: IS_TOY,
})

export const AUTH_CONFIG = {
  ...resolvedAuthConfig,
  transport: import.meta.env.VITE_AUTH_TRANSPORT === 'bearer'
    ? 'bearer' as const
    : resolvedAuthConfig.transport,
}
