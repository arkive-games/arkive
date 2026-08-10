// Declared here rather than imported from @gamemap/map-shell: map-shell already
// depends on this package, so importing back would close a cycle. These are
// structurally identical to map-shell's `Theme`/`ThemeStorage`, which is all
// `<ThemeProvider storage={...}>` needs -- TypeScript matches them by shape.
import {
  MemoryClient,
  defineMemoryRecord,
  memoryPolicy,
  type StorageLike,
} from "@gamemap/state-memory"

type Theme = "auto" | "light" | "dark"

type ThemeStorage = {
  get: () => Theme | null
  set: (theme: Theme) => void
}

export const ARKIVE_THEME_STORAGE_KEY = "arkive.memory.site.interface.theme"
export const ARKIVE_THEME_COOKIE_NAME = "arkive.theme"
const LEGACY_THEME_STORAGE_KEY = "arkive.theme"

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

function themeRecord(legacyKeys: readonly string[]) {
  return defineMemoryRecord({
    id: "theme",
    namespace: "site",
    surface: "interface",
    ...memoryPolicy.userPreference("reset-theme"),
    schemaVersion: "1.0.0",
    defaultValue: () => null as Theme | null,
    validate: (value: unknown): value is Theme | null => value === null || isTheme(String(value)),
    legacyKeys: [LEGACY_THEME_STORAGE_KEY, ...legacyKeys],
    migrateLegacy: (raw: string) => raw,
  })
}

function persistTheme(
  theme: Theme,
  environment: ArkiveThemeStorageEnvironment,
  client: MemoryClient,
  record: ReturnType<typeof themeRecord>,
) {
  client.write(record, theme)

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

function expireThemeCookie(environment: ArkiveThemeStorageEnvironment) {
  const attributes = [
    `${ARKIVE_THEME_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "SameSite=Lax",
  ]
  if (environment.protocol === "https:") attributes.push("Secure")
  try {
    environment.writeCookie(attributes.join("; "))
    const domain = resolveArkiveThemeCookieDomain(environment.hostname)
    if (domain) environment.writeCookie([...attributes, `Domain=${domain}`].join("; "))
  } catch {
    // The shared memory record is still removed when cookies are unavailable.
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
  const record = themeRecord(legacyKeys)

  return {
    get: () => {
      const current = getEnvironment()
      if (!current) return null

      const client = new MemoryClient({ deviceStorage: current.localStorage })
      const theme = readCookieTheme(current.readCookie()) ?? client.read(record)

      if (theme) persistTheme(theme, current, client, record)
      return theme
    },
    set: (theme) => {
      const current = getEnvironment()
      if (current) {
        persistTheme(theme, current, new MemoryClient({ deviceStorage: current.localStorage }), record)
      }
    },
  }
}

export function clearArkiveThemePreference({
  legacyKeys = [],
  environment,
}: CreateArkiveThemeStorageOptions = {}): void {
  const current = environment ?? defaultEnvironment()
  if (!current) return
  const client = new MemoryClient({ deviceStorage: current.localStorage })
  client.clear(themeRecord(legacyKeys))
  for (const key of [LEGACY_THEME_STORAGE_KEY, ...legacyKeys]) {
    try { current.localStorage?.removeItem(key) } catch { /* restricted storage */ }
  }
  expireThemeCookie(current)
}
