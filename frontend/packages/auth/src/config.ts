import type { AuthTransport } from "./types"

export interface ResolveAuthConfigInput {
  /**
   * The API origin, e.g. `https://api.tc-imba.com`, from the host's own
   * environment. The module prefix is appended here rather than baked into the
   * variable, so the backend's routing layout stays a code concern.
   */
  apiBaseUrl?: string | null
  /**
   * True in a Bilibili Toy build. Toy pages run as a third-party iframe on
   * bilibili.com, where an httpOnly `.tc-imba.com` cookie is blocked by Safari
   * and Firefox and is being removed from Chrome — so the session has to be a
   * bearer token there instead.
   */
  isToy?: boolean
}

export interface ResolvedAuthConfig {
  baseUrl: string
  transport: AuthTransport
  /**
   * False when no API is configured. The host should then hide the account
   * control entirely: a "Sign in" button that cannot work is worse than none,
   * and every app builds today with no API configured at all.
   */
  enabled: boolean
}

/** Path prefix of the backend's `core` module. */
export const CORE_API_PREFIX = "/api/v1/core"

/**
 * The deployed backend origin.
 *
 * A default in code rather than a per-project build variable, for the same
 * reason the data and resource hosts have defaults (`VITE_DATA_BASE_URL ??
 * '/data'`): the hostname is public, stable, and identical for all six sites.
 * Six copies of it in a console are six chances to typo one and six places to
 * edit when it moves, none of them visible in review.
 *
 * VITE_API_BASE_URL still overrides it, which is what local development and any
 * future staging environment use.
 */
export const ARKIVE_PRODUCTION_API_URL = "https://api-arkive.tc-imba.com"

/**
 * Decides where the API is and how the session travels.
 *
 * Kept here rather than duplicated in six apps so the transport rule has one
 * definition and one set of tests; the host still reads its own environment,
 * because a shared package guessing at `import.meta.env` is what the workspace's
 * purity gates exist to prevent.
 */
export function resolveAuthConfig({
  apiBaseUrl,
  isToy = false,
}: ResolveAuthConfigInput): ResolvedAuthConfig {
  const origin = (apiBaseUrl ?? "").trim().replace(/\/+$/, "")

  return {
    baseUrl: origin ? `${origin}${CORE_API_PREFIX}` : "",
    transport: isToy ? "bearer" : "cookie",
    enabled: origin.length > 0,
  }
}
