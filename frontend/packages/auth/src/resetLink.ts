/**
 * Reads a password-reset token out of the landing URL.
 *
 * The emailed link lands on /user?reset=<token>. Two things matter here:
 *
 *  - The token is a credential. Left in the address bar it ends up in browser
 *    history, in any screenshot of the page, and in the Referer header of every
 *    subsequent request to a third party. It is removed from the URL as soon as
 *    it has been read.
 *  - Removing it must not reload the page or push a history entry, or the user
 *    lands somewhere unexpected when they press Back.
 */
export const RESET_QUERY_PARAM = "reset"

/** The path the emailed link points at. */
export const RESET_PATH = "/user"

export interface ResetLink {
  /** The token, when the current URL carries one. */
  token: string | null
  /** True when the URL is the reset landing page, with or without a token. */
  onResetPath: boolean
}

/**
 * Inspects a URL without touching browser state. Exported separately from
 * consumeResetToken so it can be tested against arbitrary URLs.
 */
export function readResetLink(href: string): ResetLink {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return { token: null, onResetPath: false }
  }

  // Toy builds use hash routing, so the path may live after the '#'.
  const hashPath = url.hash.startsWith("#/") ? url.hash.slice(1) : ""
  const hashQuery = hashPath.includes("?") ? hashPath.slice(hashPath.indexOf("?")) : ""

  const pathname = hashPath ? hashPath.split("?")[0] : url.pathname
  const params = hashQuery ? new URLSearchParams(hashQuery) : url.searchParams

  const onResetPath = pathname.replace(/\/+$/, "") === RESET_PATH
  const raw = params.get(RESET_QUERY_PARAM)
  const token = raw && raw.trim() !== "" ? raw : null

  return { token, onResetPath }
}

/**
 * Reads the token from the current location and strips it from the URL.
 *
 * Returns null in a non-browser environment, so callers can invoke it
 * unconditionally during render setup.
 */
export function consumeResetToken(): string | null {
  if (typeof window === "undefined" || !window.location) return null

  const { token } = readResetLink(window.location.href)
  if (!token) return null

  try {
    const url = new URL(window.location.href)
    url.searchParams.delete(RESET_QUERY_PARAM)

    if (url.hash.includes(`${RESET_QUERY_PARAM}=`)) {
      const [path, query = ""] = url.hash.slice(1).split("?")
      const params = new URLSearchParams(query)
      params.delete(RESET_QUERY_PARAM)
      const rest = params.toString()
      url.hash = rest ? `#${path}?${rest}` : `#${path}`
    }

    // replaceState, not pushState: the token-bearing URL should not become a
    // history entry the user can navigate back to.
    window.history.replaceState(window.history.state, "", url.toString())
  } catch {
    // A browser that refuses history manipulation still gets a working reset;
    // the token simply stays visible in the address bar.
  }

  return token
}
