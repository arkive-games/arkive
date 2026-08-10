import { browserMemory, defineMemoryRecord, memoryPolicy, type MemoryClient } from './core'

const LEGACY_LANGUAGE_TAGS: Readonly<Record<string, string>> = Object.freeze({
  en: 'en-US',
  zh: 'zh-CN',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  ko: 'ko-KR',
})

export const languagePreferenceRecord = defineMemoryRecord({
  id: 'language',
  namespace: 'site',
  surface: 'interface',
  ...memoryPolicy.userPreference('reset-interface-preferences'),
  schemaVersion: '1.0.0',
  defaultValue: () => '',
  validate: (value): value is string => typeof value === 'string' && value.length <= 35,
  legacyKeys: ['i18nextLng'],
  migrateLegacy: (raw) => LEGACY_LANGUAGE_TAGS[raw] ?? raw,
})

export interface LanguageMemoryEnvironment {
  memory?: MemoryClient
  url?: () => URL | null
  navigatorLanguages?: () => readonly string[]
  documentLanguage?: () => string | null
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
  const stored = normalizeLanguage(memory.read(languagePreferenceRecord), supported)
  if (stored) return stored

  const navigatorLanguages = (environment.navigatorLanguages ?? browserNavigatorLanguages)()
  for (const candidate of navigatorLanguages) {
    const detected = normalizeLanguage(candidate, supported)
    if (detected) return detected
  }
  return normalizeLanguage((environment.documentLanguage ?? browserDocumentLanguage)(), supported) ?? fallback
}

/** Persists only an explicit language choice made through an application control. */
export function saveLanguagePreference<T extends string>(
  language: string,
  supported: readonly T[],
  memory: MemoryClient = browserMemory,
): boolean {
  const normalized = normalizeLanguage(language, supported)
  return normalized ? memory.write(languagePreferenceRecord, normalized) : false
}
