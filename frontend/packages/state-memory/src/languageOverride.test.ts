import { describe, expect, it } from 'vitest'
import { MemoryClient, type StorageLike } from './core'
import {
  createLanguagePreference,
  detectLanguagePreference,
  languageOverrideRecord,
  languagePreferenceRecord,
} from './language'

function storage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial))
  return {
    get length() { return values.size },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
}

const SUPPORTED = ['en-US', 'zh-CN', 'ja-JP', 'ko-KR'] as const

function environment() {
  const deviceStorage = storage()
  const sharedStorage = storage()
  const memory = new MemoryClient({ deviceStorage, sharedStorage })
  return {
    deviceStorage,
    sharedStorage,
    memory,
    detect: (ignoreSiteOverride = false) =>
      detectLanguagePreference(SUPPORTED, 'en-US', {
        memory,
        url: () => null,
        navigatorLanguages: () => [],
        documentLanguage: () => null,
        ignoreSiteOverride,
      }),
    preference: () =>
      createLanguagePreference(SUPPORTED, 'en-US', {
        memory,
        url: () => null,
        navigatorLanguages: () => [],
        documentLanguage: () => null,
      }),
  }
}

describe('site language override', () => {
  it('outranks the shared value during detection', () => {
    const env = environment()
    env.memory.write(languagePreferenceRecord, 'zh-CN')
    env.memory.write(languageOverrideRecord, 'ja-JP')

    expect(env.detect()).toBe('ja-JP')
    // The same chain, asked what this site would show without its override --
    // which is what the panel labels General.
    expect(env.detect(true)).toBe('zh-CN')
  })

  it('stays in this origin rather than the cross-site transport', () => {
    const env = environment()
    env.preference().setOverride('ja-JP')

    // A cookie-backed override would leak to every other game, which is the
    // opposite of what an override is for.
    expect(env.deviceStorage.length).toBe(1)
    expect(env.sharedStorage.length).toBe(0)
  })

  it("seeds the shared value from a game's own switcher, once", () => {
    const env = environment()
    const preference = env.preference()

    preference.setFromSiteControl('zh-CN')
    expect(env.memory.read(languagePreferenceRecord)).toBe('zh-CN')

    // A later change on the same game is local: the other games keep zh-CN.
    preference.setFromSiteControl('ja-JP')
    expect(env.memory.read(languagePreferenceRecord)).toBe('zh-CN')
    expect(env.detect()).toBe('ja-JP')
  })

  it('follows the shared value again once the override is cleared', () => {
    const env = environment()
    const preference = env.preference()
    preference.setFromSiteControl('zh-CN')
    preference.setOverride('ko-KR')
    expect(env.detect()).toBe('ko-KR')

    preference.clearOverride()
    expect(env.detect()).toBe('zh-CN')
  })

  it('leaves detection unchanged when no override exists', () => {
    const env = environment()
    env.memory.write(languagePreferenceRecord, 'ko-KR')

    expect(env.detect()).toBe('ko-KR')
    expect(env.preference().read()).toEqual({
      global: 'ko-KR',
      override: null,
      effective: 'ko-KR',
      // Detection consults the shared record too, so what this site inherits
      // without an override is that same value.
      inherited: 'ko-KR',
    })
  })
})
