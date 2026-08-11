import { browserMemory, defineMemoryRecord, memoryPolicy, type MemoryClient } from './core'
import {
  createLayeredPreference,
  type LayeredPreference,
  type PreferenceLayers,
} from './preferences'

const LEGACY_LANGUAGE_TAGS: Readonly<Record<string, string>> = Object.freeze({
  en: 'en-US',
  zh: 'zh-CN',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  ko: 'ko-KR',
})

/**
 * `sharedPreference`, not `userPreference`: the reader's language has to be the
 * same on the portal and on every game, and those are separate origins, so Web
 * Storage cannot carry it. It was declared `namespace: 'site'` before, which
 * named the intent but stored it per-origin -- choosing 简体中文 on Palworld left
 * AION2 in English. The cookie transport is what actually delivers it.
 *
 * Existing readers are not disturbed: `readLegacy` also scans device storage for
 * the canonical key, so a value written by the previous build migrates into the
 * cookie on first read, and `i18nextLng` still migrates for anyone older than that.
 */
export const languagePreferenceRecord = defineMemoryRecord({
  id: 'language',
  namespace: 'site',
  surface: 'interface',
  ...memoryPolicy.sharedPreference('reset-interface-preferences'),
  schemaVersion: '1.0.0',
  defaultValue: () => '',
  validate: (value): value is string => typeof value === 'string' && value.length <= 35,
  legacyKeys: ['i18nextLng'],
  migrateLegacy: (raw) => LEGACY_LANGUAGE_TAGS[raw] ?? raw,
})

/**
 * This site's language, overriding the shared one above.
 *
 * `userPreference`, so device-scoped and therefore per-origin -- which is the
 * whole mechanism. A reader who wants Palworld in Japanese and everything else
 * in their own language writes this record on palworld's origin and nowhere
 * else. "Reset interface preferences" clears the whole `user_preference` class,
 * so it takes this with it and the site falls back to shared.
 */
export const languageOverrideRecord = defineMemoryRecord({
  id: 'language-override',
  namespace: 'site',
  surface: 'interface',
  ...memoryPolicy.userPreference('reset-interface-preferences'),
  schemaVersion: '1.0.0',
  defaultValue: () => '',
  validate: (value): value is string => typeof value === 'string' && value.length <= 35,
})

export interface LanguageMemoryEnvironment {
  memory?: MemoryClient
  url?: () => URL | null
  navigatorLanguages?: () => readonly string[]
  documentLanguage?: () => string | null
  /**
   * Skip this site's override, answering "what would this site show if it did
   * not override?" -- which is what the settings panel labels as General.
   *
   * A flag rather than a second detector: two copies of a five-step precedence
   * chain is two things to keep in step.
   */
  ignoreSiteOverride?: boolean
}

function browserUrl(): URL | null {
  if (typeof window === 'undefined') return null
  try { return new URL(window.location.href) } catch { return null }
}

function browserNavigatorLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : []
}

function browserDocumentLanguage(): string | null {
  if (typeof document === 'undefined') return null
  return document.documentElement.lang || null
}

function normalizeLanguage<T extends string>(candidate: string | null | undefined, supported: readonly T[]): T | null {
  if (!candidate) return null
  const normalized = LEGACY_LANGUAGE_TAGS[candidate] ?? candidate
  const exact = supported.find((language) => language.toLowerCase() === normalized.toLowerCase())
  if (exact) return exact
  const base = normalized.split('-')[0]?.toLowerCase()
  return supported.find((language) => language.split('-')[0]?.toLowerCase() === base) ?? null
}

/** Detects language without persisting visit-only URL overrides. */
export function detectLanguagePreference<T extends string>(
  supported: readonly T[],
  fallback: T,
  environment: LanguageMemoryEnvironment = {},
): T {
  const url = (environment.url ?? browserUrl)()
  const fromUrl = normalizeLanguage(url?.searchParams.get('lng'), supported)
  if (fromUrl) return fromUrl

  const memory = environment.memory ?? browserMemory
  // This site's override outranks the shared value, and both outrank the browser.
  // Handled here rather than in a parallel "detectWithOverride" so there is one
  // precedence chain: a second copy is a second thing to keep in step.
  if (!environment.ignoreSiteOverride) {
    const overridden = normalizeLanguage(memory.read(languageOverrideRecord), supported)
    if (overridden) return overridden
  }

  const stored = normalizeLanguage(memory.read(languagePreferenceRecord), supported)
  if (stored) return stored

  const navigatorLanguages = (environment.navigatorLanguages ?? browserNavigatorLanguages)()
  for (const candidate of navigatorLanguages) {
    const detected = normalizeLanguage(candidate, supported)
    if (detected) return detected
  }
  return normalizeLanguage((environment.documentLanguage ?? browserDocumentLanguage)(), supported) ?? fallback
}

/**
 * Persists an explicit language choice as the SHARED value, for every site.
 *
 * This is what meta's switcher and the settings panel's General row call. A
 * game's own switcher calls `createLanguagePreference(...).setFromSiteControl`
 * instead, so that it writes the game's override.
 */
export function saveLanguagePreference<T extends string>(
  language: string,
  supported: readonly T[],
  memory: MemoryClient = browserMemory,
): boolean {
  const normalized = normalizeLanguage(language, supported)
  return normalized ? memory.write(languagePreferenceRecord, normalized) : false
}

/**
 * Both language layers for one site, sharing the precedence and seeding rules
 * with the theme controller in `@gamemap/ui`.
 *
 * `fallback` here is the detected language rather than a constant, so
 * `read().effective` matches what i18next actually initialised to when neither
 * layer has a value.
 */
export function createLanguagePreference<T extends string>(
  supported: readonly T[],
  fallback: T,
  environment: LanguageMemoryEnvironment = {},
): LayeredPreference<T> {
  const memory = environment.memory ?? browserMemory
  const readLayer = (record: typeof languagePreferenceRecord) =>
    normalizeLanguage(memory.read(record), supported)

  return createLayeredPreference<T>(
    {
      readGlobal: () => readLayer(languagePreferenceRecord),
      writeGlobal: (value) => { memory.write(languagePreferenceRecord, value) },
      readOverride: () => readLayer(languageOverrideRecord),
      writeOverride: (value) => { memory.write(languageOverrideRecord, value) },
      clearOverride: () => { memory.clear(languageOverrideRecord) },
    },
    // Ignoring the override, or the fallback would echo it back: `effective`
    // resolves override first anyway, and `global ?? fallback` is what the panel
    // shows as General.
    () => detectLanguagePreference(supported, fallback, { ...environment, ignoreSiteOverride: true }),
  )
}

export type LanguagePreferenceLayers<T extends string> = PreferenceLayers<T>
