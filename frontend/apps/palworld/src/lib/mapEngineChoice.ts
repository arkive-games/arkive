// Which engine renders the main map, persisted across visits.
//
// Two engines ship side by side: the WebGL (three.js) one and the original
// Leaflet one. The choice lives in localStorage under the app's existing
// `palworld.map.*` namespace, and every access is wrapped so private mode /
// disabled storage degrades to "not persisted" instead of throwing (same style
// as `completedMarkers.ts` and the `themeStorage` adapter in `main.tsx`).
//
// It is exposed as an external store rather than plain read/write helpers
// because two controls set it from opposite ends of the tree: the desktop
// dropdown (in `App`'s top bar) and the mobile More sheet (in `BottomTabBar`,
// which the ROOT route renders and which therefore cannot see `App`'s state).
// Same pattern as `cursorStore` in `@gamemap/map-engine`.

import { useCallback, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'

export type MapEngineChoice = 'gl' | 'leaflet'

/** Engine used when nothing valid is stored: the WebGL (three.js) one. */
export const DEFAULT_MAP_ENGINE: MapEngineChoice = 'gl'

/** Menu order, both in the desktop dropdown and in the mobile More sheet. */
export const MAP_ENGINE_CHOICES: readonly MapEngineChoice[] = ['gl', 'leaflet']

/**
 * Display labels. Both are proper nouns (a rendering API and a library), so they
 * are constants rather than i18n keys — translating them would duplicate an
 * untranslatable string across all 17 locales. `short` is for the cramped mobile
 * row, where the label sits beside both pills at 390px.
 */
export const MAP_ENGINE_LABELS: Record<MapEngineChoice, { full: string; short: string }> = {
  gl: { full: 'WebGL (three.js)', short: 'WebGL' },
  leaflet: { full: 'Leaflet', short: 'Leaflet' },
}

const MAP_ENGINE_KEY = 'palworld.map.engine'

/** Narrow an unknown value (URL param, stored string) to a known engine id. */
export function isMapEngineChoice(value: unknown): value is MapEngineChoice {
  return value === 'gl' || value === 'leaflet'
}

/** The persisted choice; the default when nothing valid is stored. */
function readStored(): MapEngineChoice {
  try {
    const raw = localStorage.getItem(MAP_ENGINE_KEY)
    return isMapEngineChoice(raw) ? raw : DEFAULT_MAP_ENGINE
  } catch {
    return DEFAULT_MAP_ENGINE
  }
}

// Read lazily (not at module load) so the first read happens as React mounts,
// then cached: `getSnapshot` must be cheap and must keep returning the value we
// last published even when storage itself is unwritable.
let snapshot: MapEngineChoice | null = null
const subscribers = new Set<() => void>()

export const mapEngineStore = {
  /** The stored choice. Stable between updates, as `useSyncExternalStore` needs. */
  getSnapshot(): MapEngineChoice {
    if (snapshot === null) snapshot = readStored()
    return snapshot
  },
  /**
   * Persist a choice and notify subscribers. A redundant set (same value) is
   * dropped so it cannot cause a re-render. The in-memory snapshot is updated
   * BEFORE touching storage, so a storage failure still moves the UI — the
   * choice just won't outlive the session.
   */
  set(choice: MapEngineChoice): void {
    if (mapEngineStore.getSnapshot() === choice) return
    snapshot = choice
    try {
      localStorage.setItem(MAP_ENGINE_KEY, choice)
    } catch { /* no storage — the choice degrades to non-persistent */ }
    subscribers.forEach((fn) => fn())
  },
  subscribe(fn: () => void): () => void {
    subscribers.add(fn)
    return () => {
      subscribers.delete(fn)
    }
  },
}

/** Subscribe a component to the stored engine choice. */
export function useStoredMapEngine(): MapEngineChoice {
  return useSyncExternalStore(mapEngineStore.subscribe, mapEngineStore.getSnapshot)
}

/**
 * The engine to render, given the `?engine=` search param and the stored choice.
 *
 * Precedence:
 *  1. a valid `?engine=` param — wins for this visit and is deliberately never
 *     written back to storage, so a shared link cannot silently change the
 *     recipient's saved preference (it also lets e2e specs pin an engine);
 *  2. the stored choice (itself defaulting to {@link DEFAULT_MAP_ENGINE}).
 *
 * Kept pure — the caller passes the subscribed store value in — so this single
 * expression is the only place the precedence lives.
 */
export function resolveMapEngine(param: unknown, stored: MapEngineChoice): MapEngineChoice {
  return isMapEngineChoice(param) ? param : stored
}

/**
 * The one action every engine switcher calls: persist the pick, and drag an
 * explicit `?engine=` along with it so the URL can never contradict the map.
 *
 * The URL half is driven by the pick EVENT rather than by a store change on
 * purpose. A pick can legitimately leave the store untouched — stored `leaflet`
 * plus a shared `?engine=gl` link renders GL, so picking "Leaflet" is a no-op for
 * the store — and reacting to the store would then drop the pick on the floor and
 * make the click do nothing. Verified by hand before this shape was settled on.
 *
 * Never ADDS a param (the stored choice already covers the param-free case), and
 * `replace`s so switching engines doesn't pile up history entries. Owns no
 * precedence logic — that lives in {@link resolveMapEngine}.
 */
export function useChooseMapEngine(): (choice: MapEngineChoice) => void {
  const navigate = useNavigate()
  const { search } = useLocation()
  const hasParam = isMapEngineChoice((search as { engine?: unknown }).engine)
  return useCallback(
    (choice: MapEngineChoice) => {
      mapEngineStore.set(choice)
      if (!hasParam) return
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({ ...prev, engine: choice }),
        replace: true,
      })
    },
    [hasParam, navigate],
  )
}
