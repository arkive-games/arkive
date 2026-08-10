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
  it('lets a URL override win without replacing the stored preference', () => {
    const deviceStorage = storage()
    const memory = new MemoryClient({ deviceStorage })
    expect(saveLanguagePreference('zh-CN', ['en-US', 'zh-CN'], memory)).toBe(true)
    expect(detectLanguagePreference(['en-US', 'zh-CN'], 'en-US', {
      memory,
      url: () => new URL('https://arkive.example/?lng=en-US'),
      navigatorLanguages: () => [],
      documentLanguage: () => null,
    })).toBe('en-US')
    expect(memory.read(languagePreferenceRecord)).toBe('zh-CN')
  })

  it('migrates and normalizes the legacy detector key', () => {
    const deviceStorage = storage({ i18nextLng: 'en' })
    const memory = new MemoryClient({ deviceStorage })
    expect(detectLanguagePreference(['en-US', 'zh-CN'], 'zh-CN', {
      memory,
      url: () => null,
      navigatorLanguages: () => [],
      documentLanguage: () => null,
    })).toBe('en-US')
    expect(deviceStorage.getItem('i18nextLng')).toBeNull()
  })
})
