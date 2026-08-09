import { resolveAuthConfig } from '@gamemap/auth'

/**
 * Where the API is and how this build carries a session.
 *
 * The environment is read here rather than inside @gamemap/auth so the shared
 * package stays environment-agnostic, matching how ThemeProvider takes an
 * injected storage adapter instead of reaching for localStorage itself.
 *
 * A Toy build uses a bearer token: it runs as a third-party iframe on
 * bilibili.com, where the httpOnly cookie that gives SSO across the game
 * subdomains is blocked outright by Safari and Firefox.
 *
 * With no VITE_API_BASE_URL set the result is disabled and the account control
 * hides itself, which is the state every build is in until the API is deployed.
 */
export const AUTH_CONFIG = resolveAuthConfig({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
  isToy: Boolean(import.meta.env.VITE_TOY),
})
