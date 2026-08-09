// Declared here rather than imported from @gamemap/map-shell: map-shell already
// depends on this package, so importing back would close a cycle. These are
// structurally identical to map-shell's `Theme`/`ThemeStorage`, which is all
// `<ThemeProvider storage={...}>` needs -- TypeScript matches them by shape.
type Theme = "auto" | "light" | "dark"

type ThemeStorage = {
  get: () => Theme | null
  set: (theme: Theme) => void
}

export const ARKIVE_THEME_STORAGE_KEY = "arkive.theme"
export const ARKIVE_THEME_COOKIE_NAME = "arkive.theme"

type StorageLike = Pick<Storage, "getItem" | "setItem">

export interface ArkiveThemeStorageEnvironment {
  hostname: string
  protocol: string
  localStorage?: StorageLike
  readCookie: () => string
  writeCookie: (value: string) => void
}

export interface CreateArkiveThemeStorageOptions {
  legacyKeys?: readonly string[]
  environment?: ArkiveThemeStorageEnvironment
}

function isTheme(value: string | null): value is Theme {
  return value === "auto" || value === "light" || value === "dark"
}

function defaultEnvironment(): ArkiveThemeStorageEnvironment | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null

  let storage: StorageLike | undefined
  try {
    storage = window.localStorage
  } catch {
    storage = undefined
  }

  return {
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    localStorage: storage,
    readCookie: () => document.cookie,
    writeCookie: (value) => {
      document.cookie = value
    },
  }
}

/** Return the parent domain shared by Arkive's portal and game subdomains. */
export function resolveArkiveThemeCookieDomain(hostname: string): string | null {
  const normalized = hostname.toLowerCase().replace(/^\.+|\.+$/g, "")
  if (normalized === "tc-imba.com" || normalized.endsWith(".tc-imba.com")) {
    return ".tc-imba.com"
  }
  if (normalized === "arkive.games" || normalized.endsWith(".arkive.games")) {
    return ".arkive.games"
  }
  return null
}

function readCookieTheme(cookie: string): Theme | null {
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=")
    if (separator < 0) continue
    const name = part.slice(0, separator).trim()
    if (name !== ARKIVE_THEME_COOKIE_NAME) continue
    try {
      const value = decodeURIComponent(part.slice(separator + 1).trim())
      return isTheme(value) ? value : null
    } catch {
      return null
    }
  }
  return null
}

function readStoredTheme(storage: StorageLike | undefined, key: string): Theme | null {
  if (!storage) return null
  try {
    const value = storage.getItem(key)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

function persistTheme(theme: Theme, environment: ArkiveThemeStorageEnvironment) {
  try {
    environment.localStorage?.setItem(ARKIVE_THEME_STORAGE_KEY, theme)
  } catch {
    // Cookies still preserve the cross-site preference when local storage is unavailable.
  }

  const cookie = [
    `${ARKIVE_THEME_COOKIE_NAME}=${encodeURIComponent(theme)}`,
    "Path=/",
    "Max-Age=31536000",
    "SameSite=Lax",
  ]
  const domain = resolveArkiveThemeCookieDomain(environment.hostname)
  if (domain) cookie.push(`Domain=${domain}`)
  if (environment.protocol === "https:") cookie.push("Secure")

  try {
    environment.writeCookie(cookie.join("; "))
  } catch {
    // Local storage remains a same-origin fallback when cookies are unavailable.
  }
}

/**
 * Persist one Arkive theme preference across the portal and every game.
 * The shared cookie crosses local dev ports and approved production subdomains;
 * the shared local-storage key is a fallback for cookie-restricted contexts.
 */
export function createArkiveThemeStorage({
  legacyKeys = [],
  environment,
}: CreateArkiveThemeStorageOptions = {}): ThemeStorage {
  const getEnvironment = () => environment ?? defaultEnvironment()

  return {
    get: () => {
      const current = getEnvironment()
      if (!current) return null

      const theme =
        readCookieTheme(current.readCookie()) ??
        readStoredTheme(current.localStorage, ARKIVE_THEME_STORAGE_KEY) ??
        legacyKeys.reduce<Theme | null>(
          (found, key) => found ?? readStoredTheme(current.localStorage, key),
          null,
        )

      if (theme) persistTheme(theme, current)
      return theme
    },
    set: (theme) => {
      const current = getEnvironment()
      if (current) persistTheme(theme, current)
    },
  }
}
