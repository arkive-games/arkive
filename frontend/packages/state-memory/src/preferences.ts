/**
 * Two-layer preferences: one value shared by every Arkive site, and an optional
 * override belonging to the site the reader is on.
 *
 * The override needs no game identifier. Each game is its own origin, so device
 * storage is already partitioned per game; "this site's override" is just this
 * origin's record. Only the shared layer needs the cookie transport, and it
 * already has one.
 *
 * The rule that is easy to get wrong, and is therefore defined once here rather
 * than in each app's switcher, is `setFromSiteControl`: a game's top-bar control
 * writes that game's override AND seeds the shared value when nothing has ever
 * chosen one. Without the seeding half, a first-time visitor picking a language
 * on Palworld would leave AION2 in English -- exactly the regression
 * `languagePreferenceRecord` was made cookie-backed to prevent.
 */

export interface PreferenceLayers<T> {
  /** Shared by every Arkive site. `null` when nothing has ever chosen one. */
  global: T | null
  /** This site only. `null` when the site follows the shared value. */
  override: T | null
  /** What this site actually uses: override, else global, else the fallback. */
  effective: T
  /**
   * What this site would use if it did NOT override -- an app default, or a
   * detection chain that may itself consult `global`.
   *
   * Carried separately because `global ?? inherited` is what a settings panel
   * shows as General, and `effective` cannot stand in for it: with an override
   * and no shared value yet, `effective` IS the override, so a panel reading it
   * would present the override as the value the other sites inherit, then
   * switch to something else the moment "follow general" cleared it.
   */
  inherited: T
}

/** Persistence for one preference, split by layer. Injected so this stays testable. */
export interface PreferenceLayerStore<T> {
  readGlobal: () => T | null
  writeGlobal: (value: T) => void
  readOverride: () => T | null
  writeOverride: (value: T) => void
  clearOverride: () => void
}

export interface LayeredPreference<T> {
  read: () => PreferenceLayers<T>
  /** The panel's General row, and every control on meta. */
  setGlobal: (value: T) => void
  /** The panel's per-game row. */
  setOverride: (value: T) => void
  /** The panel's "follow general" reset. */
  clearOverride: () => void
  /** A game's top-bar control: this site, plus the shared value while it is unset. */
  setFromSiteControl: (value: T) => void
}

export function resolvePreferenceLayers<T>(
  global: T | null,
  override: T | null,
  fallback: T,
): PreferenceLayers<T> {
  return { global, override, effective: override ?? global ?? fallback, inherited: fallback }
}

export function createLayeredPreference<T>(
  store: PreferenceLayerStore<T>,
  fallback: () => T,
): LayeredPreference<T> {
  return {
    read: () => resolvePreferenceLayers(store.readGlobal(), store.readOverride(), fallback()),
    setGlobal: (value) => store.writeGlobal(value),
    setOverride: (value) => store.writeOverride(value),
    clearOverride: () => store.clearOverride(),
    setFromSiteControl: (value) => {
      // Read before writing: the two layers are separate records, but reading
      // first makes the ordering irrelevant to anyone reasoning about this.
      const hadGlobal = store.readGlobal() !== null
      store.writeOverride(value)
      if (!hadGlobal) store.writeGlobal(value)
    },
  }
}
