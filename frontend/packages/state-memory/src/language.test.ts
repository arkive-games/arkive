import { describe, expect, it } from 'vitest'
import { MemoryClient, type StorageLike } from './core'
import { detectLanguagePreference, languagePreferenceRecord, saveLanguagePreference } from './language'

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

describe('language memory', () => {
  // The language preference lives in the SHARED (cookie) transport, because the
  // games are separate origins and Web Storage cannot cross them. Tests therefore
  // provide sharedStorage; deviceStorage stays supplied so the legacy migration
  // path out of per-origin storage is still exercised.
  it('lets a URL override win without replacing the stored preference', () => {
    const deviceStorage = storage()
    const sharedStorage = storage()
    const memory = new MemoryClient({ deviceStorage, sharedStorage })
    expect(saveLanguagePreference('zh-CN', ['en-US', 'zh-CN'], memory)).toBe(true)
    expect(detectLanguagePreference(['en-US', 'zh-CN'], 'en-US', {
      memory,
      url: () => new URL('https://arkive.example/?lng=en-US'),
      navigatorLanguages: () => [],
      documentLanguage: () => null,
    })).toBe('en-US')
    expect(memory.read(languagePreferenceRecord)).toBe('zh-CN')
    // Cross-site is the whole point: the value must be in the shared transport,
    // not in this origin's device storage.
    expect(sharedStorage.length).toBe(1)
    expect(deviceStorage.length).toBe(0)
  })

  it('migrates and normalizes the legacy detector key', () => {
    const deviceStorage = storage({ i18nextLng: 'en' })
    const sharedStorage = storage()
    const memory = new MemoryClient({ deviceStorage, sharedStorage })
    expect(detectLanguagePreference(['en-US', 'zh-CN'], 'zh-CN', {
      memory,
      url: () => null,
      navigatorLanguages: () => [],
      documentLanguage: () => null,
    })).toBe('en-US')
    // Kept on purpose: the record now lives in the cookie transport, which browsers
    // cap at 400 days, while this localStorage value has no expiry. Deleting the
    // more durable copy to complete a migration into a less durable one is the
    // mistake that lost map filters elsewhere, so the tier guard applies here too.
    expect(deviceStorage.getItem('i18nextLng')).not.toBeNull()
    // The migrated value is what gets read, though -- normalized to a full tag.
    expect(memory.read(languagePreferenceRecord)).toBe('en-US')
  })
})
