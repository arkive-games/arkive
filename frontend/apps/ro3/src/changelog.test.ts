import { describe, expect, it } from 'vitest'
import { validateChangelog, type ChangelogFile } from '@gamemap/ui'
import raw from './changelog.json'

const file = raw as ChangelogFile

describe('ro3 changelog.json', () => {
  it('is structurally valid', () => {
    expect(validateChangelog(file)).toEqual([])
  })

  it('pins every version to a distinct real commit', () => {
    for (const entry of file.entries) {
      expect(entry.commit, entry.version).toMatch(/^[0-9a-f]{40}$/)
    }
    expect(new Set(file.entries.map((e) => e.commit)).size).toBe(file.entries.length)
  })

  it('starts at the launch entry', () => {
    expect(file.entries.at(-1)).toMatchObject({ version: '0.1.0' })
  })
})
