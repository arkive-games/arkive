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
 *
 * Two limits worth knowing, both inherent to cookies rather than to this code:
 *
 * - It cannot bridge two DIFFERENT registrable domains. A value written on
 *   `*.tc-imba.com` is invisible on `*.arkive.games`; the allowlist holds both so
 *   each family works internally, not so they interoperate. Bridging them needs a
 *   server round-trip.
 * - Cookie changes fire no `storage` event, so another open tab (or another site)
 *   will not live-update; it picks the new value up on its next mount.
 */

export interface CookieEnvironment {
  hostname: string
  protocol: string
  readCookie: () => string
  writeCookie: (value: string) => void
}

/**
 * Cookie jars are ~4 KB per cookie including name and attributes, and this is
 * measured on the PERCENT-ENCODED cookie, which is what the browser stores.
 * Callers are held to a much smaller raw budget -- see SHARED_MAXIMUM_RAW_BYTES.
 */
export const SHARED_MAXIMUM_BYTES = 3_000

/**
 * The raw (pre-encoding) budget a record may declare.
 *
 * Percent-encoding inflates by up to 3x: one UTF-8 byte becomes `%XX`. A CJK
 * string of 2,700 bytes therefore becomes ~8,100 characters, which the browser
 * would drop. Holding records to a third of the cookie budget makes the declared
 * cap honest for every input rather than only for ASCII.
 */
export const SHARED_MAXIMUM_RAW_BYTES = 1_000

/** Browsers cap cookie lifetime at 400 days, so this is the longest life available. */
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60

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
  const domain = resolveSharedCookieDomain(environment.hostname)

  const attributes = (maxAgeSeconds: number, withDomain: boolean) => {
    const parts = [`Path=/`, `Max-Age=${maxAgeSeconds}`, `SameSite=Lax`]
    if (withDomain && domain) parts.push(`Domain=${domain}`)
    if (environment.protocol === "https:") parts.push("Secure")
    return parts.join("; ")
  }

  const put = (key: string, value: string, maxAge: number) => {
    environment.writeCookie(`${encodeName(key)}=${encodeURIComponent(value)}; ${attributes(maxAge, true)}`)
  }

  return {
    get length() {
      return parseJar(environment.readCookie()).size
    },
    key(index: number): string | null {
      return [...parseJar(environment.readCookie()).keys()][index] ?? null
    },
    getItem(key: string): string | null {
      const value = parseJar(environment.readCookie()).get(key) ?? null
      if (value !== null) {
        // Slide the expiry forward. A `sharedPreference` declares indefinite
        // retention, but a cookie cannot: without this, a language chosen once
        // and never changed would vanish at the browser's 400-day ceiling.
        try {
          put(key, value, MAX_AGE_SECONDS)
        } catch {
          // Refresh is best-effort; failing to extend must not fail the read.
        }
      }
      return value
    },
    setItem(key: string, value: string): void {
      const encoded = `${encodeName(key)}=${encodeURIComponent(value)}`
      // Refuse rather than silently write a cookie the browser will drop, which
      // would read back as "no value" and look like data loss.
      if (encoded.length > SHARED_MAXIMUM_BYTES) {
        throw new Error(
          `shared (cookie) storage refused ${key}: ${encoded.length} encoded bytes exceeds ${SHARED_MAXIMUM_BYTES}`,
        )
      }
      // A host-only cookie of the same name shadows the domain one, and whichever
      // the browser lists last wins the parse. Expire any host-only twin first, or
      // a stale value reappears the moment the domain cookie is removed.
      if (domain) environment.writeCookie(`${encodeName(key)}=; ${attributes(0, false)}`)
      put(key, value, MAX_AGE_SECONDS)
      // Cookies can be silently rejected -- blocked by policy, or the domain jar is
      // full. Without a read-back the caller is told the write succeeded and the
      // value quietly is not there after a reload.
      if (parseJar(environment.readCookie()).get(key) !== value) {
        throw new Error(`shared (cookie) storage did not retain ${key}; cookies may be blocked or the jar full`)
      }
    },
    removeItem(key: string): void {
      environment.writeCookie(`${encodeName(key)}=; ${attributes(0, true)}`)
      // ...and the host-only twin, which would otherwise resurrect on next read.
      if (domain) environment.writeCookie(`${encodeName(key)}=; ${attributes(0, false)}`)
    },
  }
}

/** Browser-backed cookie environment, or null when cookies are not usable here. */
export function browserCookieStorage() {
  if (typeof window === "undefined" || typeof document === "undefined") return null
  try {
    // Touch the accessor rather than only building closures: in a sandboxed frame
    // the `document.cookie` getter itself throws SecurityError, and returning a
    // storage object that throws on first use is worse than returning null.
    void document.cookie
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
