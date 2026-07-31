// Which engine renders the main map, persisted across visits.
//
// Two engines ship side by side: the WebGL (three.js) one and the original
// Leaflet one. The shell owns the vocabulary (ids, labels, default) and the
// precedence, but not the storage: the app injects an adapter, so the shell
// stays storage-free (same contract as `mapViewMemory` and `ThemeStorage`) and
// each app keeps its own key namespace. Adapter errors are swallowed here, so
// apps may pass bare adapters and private mode / disabled storage degrades to
// "not persisted" instead of throwing.
//
// The choice is exposed as an external store rather than plain read/write
// helpers because controls at opposite ends of an app's tree set it — e.g. in
// palworld the desktop dropdown (in the top bar) and the mobile More sheet (in
// the bottom tab bar, which the ROOT route renders and which therefore cannot
// see the top bar's state). Same pattern as `cursorStore` in
// `@gamemap/map-engine`.

import { useSyncExternalStore } from "react"

export type MapEngineChoice = "gl" | "leaflet"

/** Engine used when nothing valid is stored: the WebGL (three.js) one. */
export const DEFAULT_MAP_ENGINE: MapEngineChoice = "gl"

/** Menu order, both in a desktop dropdown and in a mobile sheet row. */
export const MAP_ENGINE_CHOICES: readonly MapEngineChoice[] = ["gl", "leaflet"]

/**
 * Display labels. Both are proper nouns (a rendering API and a library), so they
 * are constants rather than i18n keys — translating them would duplicate an
 * untranslatable string across all locales. `short` is for the cramped mobile
 * row, where the label sits beside both pills at 390px.
 */
export const MAP_ENGINE_LABELS: Record<MapEngineChoice, { full: string; short: string }> = {
  gl: { full: "WebGL (three.js)", short: "WebGL" },
  leaflet: { full: "Leaflet", short: "Leaflet" },
}

/** Narrow an unknown value (URL param, stored string) to a known engine id. */
export function isMapEngineChoice(value: unknown): value is MapEngineChoice {
  return value === "gl" || value === "leaflet"
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
 * Persistence adapter injected by the app — the shell stays storage-free (same
 * contract as `MapViewStore`). It moves the raw stored string; the app owns the
 * storage key. Adapter errors are swallowed by the store, so apps may pass bare
 * adapters.
 */
export type MapEngineStorage = {
  read: () => string | null
  write: (value: string) => void
}

export type MapEngineStore = {
  /** The stored choice. Stable between updates, as `useSyncExternalStore` needs. */
  getSnapshot: () => MapEngineChoice
  /** Persist a choice and notify subscribers. */
  set: (choice: MapEngineChoice) => void
  subscribe: (fn: () => void) => () => void
  /** Subscribe a component to the stored engine choice. */
  useStoredMapEngine: () => MapEngineChoice
}

/**
 * One engine-choice store over an app-provided storage adapter. Create it once
 * at module scope in the app: the snapshot is cached per store, and every
 * control in the app must see the same instance.
 */
export function createMapEngineStore(storage: MapEngineStorage): MapEngineStore {
  // Read lazily (not at creation) so the first read happens as React mounts,
  // then cached: `getSnapshot` must be cheap and must keep returning the value
  // we last published even when storage itself is unwritable.
  let snapshot: MapEngineChoice | null = null
  const subscribers = new Set<() => void>()

  /** The persisted choice; the default when nothing valid is stored. */
  function readStored(): MapEngineChoice {
    try {
      const raw = storage.read()
      return isMapEngineChoice(raw) ? raw : DEFAULT_MAP_ENGINE
    } catch {
      return DEFAULT_MAP_ENGINE
    }
  }

  function getSnapshot(): MapEngineChoice {
    if (snapshot === null) snapshot = readStored()
    return snapshot
  }

  function subscribe(fn: () => void): () => void {
    subscribers.add(fn)
    return () => {
      subscribers.delete(fn)
    }
  }

  /**
   * A redundant set (same value) is dropped so it cannot cause a re-render. The
   * in-memory snapshot is updated BEFORE touching storage, so a storage failure
   * still moves the UI — the choice just won't outlive the session.
   */
  function set(choice: MapEngineChoice): void {
    if (getSnapshot() === choice) return
    snapshot = choice
    try {
      storage.write(choice)
    } catch { /* no storage — the choice degrades to non-persistent */ }
    subscribers.forEach((fn) => fn())
  }

  function useStoredMapEngine(): MapEngineChoice {
    return useSyncExternalStore(subscribe, getSnapshot)
  }

  return { getSnapshot, set, subscribe, useStoredMapEngine }
}
