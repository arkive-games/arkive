import { describe, expect, it } from 'vitest'
import { compareVersions, validateChangelog, type ChangelogFile } from '@gamemap/ui'

import raw from './changelog.json'

const file = raw as ChangelogFile

describe('palworld changelog.json', () => {
  it('is structurally valid', () => {
    expect(validateChangelog(file)).toEqual([])
  })

  // Asserted as a floor, not an equality: every future release bumps this, and a
  // pinned literal would turn each bump into a test edit.
  it('is at or beyond the backfilled state', () => {
    expect(compareVersions(file.entries[0].version, '1.17.1')).toBeGreaterThanOrEqual(0)
    expect(file.entries.length).toBeGreaterThanOrEqual(56)
  })

  it('covers the whole history back to launch', () => {
    expect(file.entries.at(-1)).toMatchObject({ version: '0.1.0', date: '2026-07-02' })
  })

  it('pins every version to a real commit in this repo', () => {
    for (const entry of file.entries) {
      expect(entry.commit, entry.version).toMatch(/^[0-9a-f]{40}$/)
    }
    expect(new Set(file.entries.map((e) => e.commit)).size).toBe(file.entries.length)
  })
})
