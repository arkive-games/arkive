import type { Theme, ThemeStorage, MapViewStore } from '@gamemap/map-shell'

const THEME_KEY = 'vrising.theme'
const VISIBLE_KEY = 'vrising.map.visibleSubtypes'
const VIEW_KEY = 'vrising.map.view'

/** Theme persistence, injected into ThemeProvider (map-shell owns no storage). */
export const themeStorage: ThemeStorage = {
  get: () => {
    try {
      const v = localStorage.getItem(THEME_KEY)
      return v === 'light' || v === 'dark' || v === 'auto' ? (v as Theme) : null
    } catch {
      return null
    }
  },
  set: (t) => {
    try { localStorage.setItem(THEME_KEY, t) } catch { /* no storage */ }
  },
}

/** Per-map camera + selection persistence, injected into useMapViewMemory. */
export const mapViewStore: MapViewStore = {
  get: () => {
    try { return localStorage.getItem(VIEW_KEY) } catch { return null }
  },
  set: (raw) => {
    try { localStorage.setItem(VIEW_KEY, raw) } catch { /* no storage */ }
  },
}

/** Visible marker subtypes; null when the user has never chosen (use defaults). */
export function readVisibleSubtypes(): Set<string> | null {
  try {
    const raw = localStorage.getItem(VISIBLE_KEY)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr as string[]) : null
  } catch {
    return null
  }
}

export function writeVisibleSubtypes(ids: Set<string>): void {
  try { localStorage.setItem(VISIBLE_KEY, JSON.stringify([...ids])) } catch { /* no storage */ }
}
