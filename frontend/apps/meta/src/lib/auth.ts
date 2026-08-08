import { resolveAuthConfig } from '@gamemap/auth'

import { IS_TOY } from '../sites'

/**
 * Where the API is and how this build carries a session.
 *
 * The environment is read here rather than inside @gamemap/auth so the shared
 * package stays environment-agnostic, matching how ThemeProvider takes an
 * injected storage adapter instead of reaching for localStorage itself.
 *
 * With no VITE_API_BASE_URL set the result is disabled and the account control
 * stays hidden — which is the state every build is in until the API is
 * deployed, and a sign-in button that cannot work is worse than none.
 */
export const AUTH_CONFIG = resolveAuthConfig({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  isToy: IS_TOY,
})
