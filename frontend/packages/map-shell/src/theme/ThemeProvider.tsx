import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

export type Theme = "auto" | "light" | "dark"

/**
 * Persistence adapter injected by the app. Arkive surfaces should use
 * createArkiveThemeStorage; injection remains useful for tests and embeds.
 */
export type ThemeStorage = {
  /** The effective theme: this site's override if it has one, else the shared value. */
  get: () => Theme | null
  /** Whatever the host's top-bar control should write -- see ArkiveThemeWriteLayer. */
  set: (theme: Theme) => void
  /**
   * The layered operations, present when the adapter supports overrides. Optional
   * because tests and embeds inject two-line adapters, and because the provider
   * has to keep working for them; the settings panel is simply not offered a
   * theme section when they are absent.
   */
  readLayers?: () => { global: Theme | null; override: Theme | null }
  setGlobal?: (theme: Theme) => void
  setOverride?: (theme: Theme) => void
  clearOverride?: () => void
}

type ThemeContextValue = {
  theme: Theme
  realTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
  /** The shared value, or null when nothing has ever chosen one. */
  globalTheme: Theme | null
  /** This site's override, or null when it follows the shared value. */
  overrideTheme: Theme | null
  /** True when the injected adapter can express the two layers at all. */
  supportsThemeLayers: boolean
  /**
   * What an unset shared value resolves to. The settings panel shows it as the
   * General value, which `theme` cannot stand in for: with a site override and
   * no shared value yet, `theme` is the override.
   */
  defaultTheme: Theme
  setGlobalTheme: (theme: Theme) => void
  setThemeOverride: (theme: Theme) => void
  clearThemeOverride: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function systemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", theme === "dark")
}

export function ThemeProvider({
  children,
  defaultTheme = "auto",
  storage,
}: {
  children: ReactNode
  defaultTheme?: Theme
  storage?: ThemeStorage
}) {
  const [theme, setThemeState] = useState<Theme>(() => storage?.get() ?? defaultTheme)
  const [sys, setSys] = useState<"light" | "dark">(() => systemTheme())
  const [layers, setLayers] = useState<{ global: Theme | null; override: Theme | null }>(
    () => storage?.readLayers?.() ?? { global: null, override: null },
  )

  const realTheme = useMemo<"light" | "dark">(
    () => (theme === "auto" ? sys : theme),
    [theme, sys],
  )

  useEffect(() => {
    applyTheme(realTheme)
  }, [realTheme])

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => setSys(mq.matches ? "dark" : "light")
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  /**
   * Re-read both layers after any write, then take the effective value from the
   * adapter rather than assuming it.
   *
   * Assuming would be wrong in the two cases that matter: setting the shared
   * value while this site overrides it must NOT change what is on screen, and a
   * top-bar write may seed the shared layer as a side effect.
   */
  const commit = useCallback(
    (write: (() => void) | undefined) => {
      if (!write) return
      write()
      setLayers(storage?.readLayers?.() ?? { global: null, override: null })
      setThemeState(storage?.get() ?? defaultTheme)
    },
    [storage, defaultTheme],
  )

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t)
      storage?.set(t)
      setLayers(storage?.readLayers?.() ?? { global: null, override: null })
    },
    [storage],
  )

  const setGlobalTheme = useCallback(
    (t: Theme) => commit(storage?.setGlobal && (() => storage.setGlobal?.(t))),
    [commit, storage],
  )
  const setThemeOverride = useCallback(
    (t: Theme) => commit(storage?.setOverride && (() => storage.setOverride?.(t))),
    [commit, storage],
  )
  const clearThemeOverride = useCallback(
    () => commit(storage?.clearOverride && (() => storage.clearOverride?.())),
    [commit, storage],
  )

  const value = useMemo(
    () => ({
      theme,
      realTheme,
      setTheme,
      globalTheme: layers.global,
      overrideTheme: layers.override,
      supportsThemeLayers: Boolean(storage?.readLayers),
      defaultTheme,
      setGlobalTheme,
      setThemeOverride,
      clearThemeOverride,
    }),
    [
      theme,
      realTheme,
      setTheme,
      layers,
      storage,
      defaultTheme,
      setGlobalTheme,
      setThemeOverride,
      clearThemeOverride,
    ],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>")
  return ctx
}

/**
 * The theme context if there is one, `undefined` otherwise.
 *
 * For components that offer theme controls as one feature among several and
 * must still render without a provider -- the account control, whose tests
 * mount it bare.
 */
export function useOptionalTheme() {
  return useContext(ThemeContext)
}
