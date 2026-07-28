// Which engine renders the main map, persisted across visits.
//
// Two engines ship side by side: the WebGL (three.js) one and the original
// Leaflet one. The choice lives in localStorage under the app's existing
// `palworld.map.*` namespace, and every access is wrapped so private mode /
// disabled storage degrades to "not persisted" instead of throwing (same style
// as `completedMarkers.ts` and the `themeStorage` adapter in `main.tsx`).

export type MapEngineChoice = 'gl' | 'leaflet'

/** Engine used when nothing valid is stored: the WebGL (three.js) one. */
export const DEFAULT_MAP_ENGINE: MapEngineChoice = 'gl'

const MAP_ENGINE_KEY = 'palworld.map.engine'

/** Narrow an unknown value (URL param, stored string) to a known engine id. */
export function isMapEngineChoice(value: unknown): value is MapEngineChoice {
  return value === 'gl' || value === 'leaflet'
}

/**
 * The persisted engine choice, or {@link DEFAULT_MAP_ENGINE} when nothing is
 * stored — an unknown/corrupt value falls back to the default too.
 */
export function readMapEngine(): MapEngineChoice {
  try {
    const raw = localStorage.getItem(MAP_ENGINE_KEY)
    return isMapEngineChoice(raw) ? raw : DEFAULT_MAP_ENGINE
  } catch {
    return DEFAULT_MAP_ENGINE
  }
}

/** Persist the engine choice; a no-op when storage is unavailable. */
export function writeMapEngine(choice: MapEngineChoice): void {
  try {
    localStorage.setItem(MAP_ENGINE_KEY, choice)
  } catch { /* no storage — the choice degrades to non-persistent */ }
}

/**
 * Resolve the engine for THIS page view.
 *
 * Precedence:
 *  1. a valid `?engine=` search param — wins for this visit and is deliberately
 *     NOT written back to storage, so a shared link cannot silently change the
 *     recipient's saved preference (it also lets e2e specs pin an engine);
 *  2. the persisted choice;
 *  3. {@link DEFAULT_MAP_ENGINE}.
 */
export function resolveMapEngine(param: unknown): MapEngineChoice {
  return isMapEngineChoice(param) ? param : readMapEngine()
}
