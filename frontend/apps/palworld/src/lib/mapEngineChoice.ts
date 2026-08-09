// palworld's wiring for the shared map-engine switcher.
//
// The vocabulary (engine ids, labels, default), the precedence and the store
// itself live in `@gamemap/map-shell`; this module only supplies what is
// app-specific: the storage key inside the app's existing `palworld.map.*`
// namespace, and the router URL sync. Every access is wrapped so private mode /
// disabled storage degrades to "not persisted" instead of throwing (same style
// as `completedMarkers.ts` and the `themeStorage` adapter in `main.tsx`).

import { useCallback } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import {
  createMapEngineStore,
  isMapEngineChoice,
  type MapEngineChoice,
} from '@gamemap/map-shell'
import { browserMemory, defineMemoryRecord, isString } from '@gamemap/state-memory'

export {
  DEFAULT_MAP_ENGINE,
  MAP_ENGINE_CHOICES,
  MAP_ENGINE_LABELS,
  isMapEngineChoice,
  resolveMapEngine,
  type MapEngineChoice,
} from '@gamemap/map-shell'

const MAP_ENGINE_KEY = 'palworld.map.engine'
const engineRecord = defineMemoryRecord({
  id: 'engine',
  namespace: 'palworld',
  surface: 'map',
  stateClass: 'device_preference',
  schemaVersion: '1.0.0',
  defaultValue: () => '',
  validate: isString,
  legacyKeys: [MAP_ENGINE_KEY],
  migrateLegacy: (raw: string) => raw,
})

/**
 * The one store for this app, created at module scope: two controls set it from
 * opposite ends of the tree — the desktop dropdown (in `App`'s top bar) and the
 * mobile More sheet (in `BottomTabBar`, which the ROOT route renders and which
 * therefore cannot see `App`'s state).
 */
export const mapEngineStore = createMapEngineStore({
  read: () => browserMemory.read(engineRecord) || null,
  write: (value) => { browserMemory.write(engineRecord, value) },
})

/** Subscribe a component to the stored engine choice. */
export const useStoredMapEngine = mapEngineStore.useStoredMapEngine

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
 * precedence logic — that lives in `resolveMapEngine`.
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
