/**
 * A StorageLike backed by cookies, so a record can be shared across ORIGINS.
 *
 * Web Storage is per-origin, and the Arkive games are separate origins
 * (aion2.tc-imba.com, palworld.tc-imba.com, ...). A cookie set on the registrable
 * domain is the only client-side transport all of them can read, which is why the
 * theme already used one. This generalises that so any `site`-scoped record gets
 * the same reach.
 *
 * Deliberately NOT a general storage: cookies are sent on every request to the
 * domain, so this is for a handful of small preferences and the caller is capped
 * accordingly (see SHARED_MAXIMUM_BYTES).
 */

export interface CookieEnvironment {
  hostname: string
  protocol: string
  readCookie: () => string
  writeCookie: (value: string) => void
}

/** Cookie jars are ~4 KB per cookie including name and attributes. */
export const SHARED_MAXIMUM_BYTES = 3_000

const ONE_YEAR_SECONDS = 31_536_000

/**
 * The parent domain shared by the portal and every game, or null when there
 * isn't one (localhost, an IP, a preview host) -- in which case the cookie stays
 * host-only and simply does not cross sites, which is correct rather than broken.
 *
 * A closed allowlist, not a label-count heuristic: guessing the registrable
 * domain from the label count over-shares on a public suffix.
 */
export function resolveSharedCookieDomain(hostname: string): string | null {
  const normalized = hostname.toLowerCase().replace(/^\.+|\.+$/g, "")
  for (const domain of ["tc-imba.com", "arkive.games"]) {
    if (normalized === domain || normalized.endsWith(`.${domain}`)) return `.${domain}`
  }
  return null
}

/**
 * Cookie names admit no separators, so the storage key is percent-encoded. The
 * `ark~` prefix is what makes enumeration (and therefore the clear-by-class
 * controls) possible without touching unrelated cookies.
 */
const NAME_PREFIX = "ark~"

function encodeName(key: string): string {
  return NAME_PREFIX + encodeURIComponent(key)
}

function decodeName(name: string): string | null {
  if (!name.startsWith(NAME_PREFIX)) return null
  try {
    return decodeURIComponent(name.slice(NAME_PREFIX.length))
  } catch {
    return null
  }
}

function parseJar(cookie: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=")
    if (separator < 0) continue
    const key = decodeName(part.slice(0, separator).trim())
    if (key === null) continue
    try {
      out.set(key, decodeURIComponent(part.slice(separator + 1).trim()))
    } catch {
      // A cookie we cannot decode is skipped rather than dropped: rewriting the
      // jar to "clean" it would delete a value a fixed build could still read.
    }
  }
  return out
}

export function createCookieStorage(environment: CookieEnvironment) {
  const attributes = (maxAgeSeconds: number) => {
    const parts = [`Path=/`, `Max-Age=${maxAgeSeconds}`, `SameSite=Lax`]
    const domain = resolveSharedCookieDomain(environment.hostname)
    if (domain) parts.push(`Domain=${domain}`)
    if (environment.protocol === "https:") parts.push("Secure")
    return parts.join("; ")
  }

  return {
    get length() {
      return parseJar(environment.readCookie()).size
    },
    key(index: number): string | null {
      return [...parseJar(environment.readCookie()).keys()][index] ?? null
    },
    getItem(key: string): string | null {
      return parseJar(environment.readCookie()).get(key) ?? null
    },
    setItem(key: string, value: string): void {
      const encoded = `${encodeName(key)}=${encodeURIComponent(value)}`
      // Refuse rather than silently write a cookie the browser will drop, which
      // would read back as "no value" and look like data loss.
      if (encoded.length > SHARED_MAXIMUM_BYTES) {
        throw new Error(
          `shared (cookie) storage refused ${key}: ${encoded.length} bytes exceeds ${SHARED_MAXIMUM_BYTES}`,
        )
      }
      environment.writeCookie(`${encoded}; ${attributes(ONE_YEAR_SECONDS)}`)
    },
    removeItem(key: string): void {
      environment.writeCookie(`${encodeName(key)}=; ${attributes(0)}`)
    },
  }
}

/** Browser-backed cookie environment, or null outside a document. */
export function browserCookieStorage() {
  if (typeof window === "undefined" || typeof document === "undefined") return null
  try {
    return createCookieStorage({
      hostname: window.location.hostname,
      protocol: window.location.protocol,
      readCookie: () => document.cookie,
      writeCookie: (value) => {
        document.cookie = value
      },
    })
  } catch {
    return null
  }
}
