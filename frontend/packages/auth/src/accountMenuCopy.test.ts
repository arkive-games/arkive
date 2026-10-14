import { describe, expect, it } from 'vitest'
import { accountMenuCopy, accountProfileHref } from './accountMenuCopy'

describe('account menu destinations', () => {
  it.each([
    ['', '#account/edit'],
    ['http://localhost:15172', 'http://localhost:15172#account/edit'],
    ['https://tc-imba.com/#games', 'https://tc-imba.com/#account/edit'],
    ['/toy/arkive/index.html', '/toy/arkive/index.html#account/edit'],
  ])('preserves the configured portal base %s', (base, expected) => {
    expect(accountProfileHref(base)).toBe(expected)
  })
  it('supplies distinct labels for profile and site settings', () => {
    for (const language of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
      const copy = accountMenuCopy(language)
      expect(copy.profile).not.toBe(copy.settings)
      expect(copy.profile).toBeTruthy()
      expect(copy.settings).toBeTruthy()
    }
  })
})
