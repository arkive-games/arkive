import { describe, expect, it } from 'vitest'
import {
  resolvePlatformChangelog,
  validatePlatformChangelog,
  type PlatformChangelogFile,
} from '@gamemap/ui'
import raw from './platform-changelog.json'

const changelog = raw as PlatformChangelogFile

describe('platform-changelog.json', () => {
  it('has valid dates, commits, targets, ordering, and required locales', () => {
    expect(validatePlatformChangelog(raw)).toEqual([])
  })

  it('resolves unsupported locales through the English fallback', () => {
    const entries = resolvePlatformChangelog(changelog, 'ja-JP')
    expect(entries[0].changes[0].text).toBe(changelog.entries[0].changes[0].text['en-US'])
  })

  it('rejects unknown target games', () => {
    const invalid = structuredClone(changelog)
    ;(invalid.entries[0].targets as string[]).push('lostark')

    expect(validatePlatformChangelog(invalid)).toContain(
      'entries[0]: unknown targets lostark',
    )
  })

  it('rejects entries that are not newest first', () => {
    const invalid = structuredClone(changelog)
    invalid.entries[1].date = '9999-12-31'

    expect(validatePlatformChangelog(invalid)).toContain(
      `entries[1]: date 9999-12-31 is newer than entries[0] (${invalid.entries[0].date})`,
    )
  })
})
