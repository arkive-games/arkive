// Declared here rather than imported from @gamemap/map-shell: map-shell already
// depends on this package, so importing back would close a cycle. These are
// structurally identical to map-shell's `Theme`/`ThemeStorage`, which is all
// `<ThemeProvider storage={...}>` needs -- TypeScript matches them by shape.
import {
  MemoryClient,
  createLayeredPreference,
  defineMemoryRecord,
  memoryPolicy,
  type LayeredPreference,
  type StorageLike,
} from "@gamemap/state-memory"

type Theme = "auto" | "light" | "dark"

type ThemeStorage = {
  get: () => Theme | null
  set: (theme: Theme) => void
  readLayers?: () => { global: Theme | null; override: Theme | null }
  setGlobal?: (theme: Theme) => void
  setOverride?: (theme: Theme) => void
  clearOverride?: () => void
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

/**
 * Which layer a bare `set()` writes -- i.e. what the top-bar moon dropdown does.
 *
 * `"site"` for a game: it writes that game's override, seeding the shared value
 * while nothing has chosen one. `"global"` for meta, which is the portal and
 * has no override layer of its own.
 */
export type ArkiveThemeWriteLayer = "site" | "global"

export interface CreateArkiveThemeStorageOptions {
  legacyKeys?: readonly string[]
  environment?: ArkiveThemeStorageEnvironment
  layer?: ArkiveThemeWriteLayer
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

/**
 * This site's theme, overriding the shared cookie above.
 *
 * Device-scoped, therefore per-origin, which is the entire mechanism: each game
 * is its own origin, so no game identifier is needed to keep the overrides
 * apart. It is deliberately NOT cookie-backed -- a cookie would leak the
 * override to every other game, which is the opposite of the point.
 */
const themeOverrideRecord = defineMemoryRecord({
  id: "theme-override",
  namespace: "site",
  surface: "interface",
  ...memoryPolicy.userPreference("reset-theme"),
  schemaVersion: "1.0.0",
  defaultValue: () => null as Theme | null,
  validate: (value: unknown): value is Theme | null => value === null || isTheme(String(value)),
})

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
 * Both theme layers for one site.
 *
 * The shared layer is the cookie, which crosses local dev ports and approved
 * production subdomains, with a local-storage key as the fallback for
 * cookie-restricted contexts. The override layer is plain device storage.
 */
export function createArkiveThemePreference({
  legacyKeys = [],
  environment,
}: CreateArkiveThemeStorageOptions = {}): LayeredPreference<Theme> {
  const getEnvironment = () => environment ?? defaultEnvironment()
  const record = themeRecord(legacyKeys)
  const clientFor = (current: ArkiveThemeStorageEnvironment) =>
    new MemoryClient({ deviceStorage: current.localStorage })

  return createLayeredPreference<Theme>(
    {
      readGlobal: () => {
        const current = getEnvironment()
        if (!current) return null
        const client = clientFor(current)
        const theme = readCookieTheme(current.readCookie()) ?? client.read(record)
        // Re-persisting on read is what migrates a value written before the
        // cookie existed, and refreshes Max-Age for an active reader.
        if (theme) persistTheme(theme, current, client, record)
        return theme
      },
      writeGlobal: (theme) => {
        const current = getEnvironment()
        if (current) persistTheme(theme, current, clientFor(current), record)
      },
      readOverride: () => {
        const current = getEnvironment()
        return current ? clientFor(current).read(themeOverrideRecord) : null
      },
      writeOverride: (theme) => {
        const current = getEnvironment()
        if (current) clientFor(current).write(themeOverrideRecord, theme)
      },
      clearOverride: () => {
        const current = getEnvironment()
        if (current) clientFor(current).clear(themeOverrideRecord)
      },
    },
    // Never reached through `ThemeStorage.get`, which reports "nothing stored"
    // as null so ThemeProvider can apply its own defaultTheme.
    () => "auto",
  )
}

/**
 * The `ThemeProvider` adapter: effective value in, one write out, plus the
 * layered operations the settings panel needs.
 *
 * `set` writes whichever layer `layer` names, so a game's moon dropdown creates
 * that game's override while meta's writes the shared value.
 */
export function createArkiveThemeStorage(
  options: CreateArkiveThemeStorageOptions = {},
): ThemeStorage {
  const preference = createArkiveThemePreference(options)
  const writeFromControl = options.layer === "global"
    ? preference.setGlobal
    : preference.setFromSiteControl

  return {
    get: () => {
      const { global, override } = preference.read()
      return override ?? global
    },
    set: writeFromControl,
    readLayers: () => {
      const { global, override } = preference.read()
      return { global, override }
    },
    setGlobal: preference.setGlobal,
    setOverride: preference.setOverride,
    clearOverride: preference.clearOverride,
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
  // The override too, or "reset interface preferences" would restore the shared
  // theme and leave this site still overriding it.
  client.clear(themeOverrideRecord)
  for (const key of [LEGACY_THEME_STORAGE_KEY, ...legacyKeys]) {
    try { current.localStorage?.removeItem(key) } catch { /* restricted storage */ }
  }
  expireThemeCookie(current)
}
