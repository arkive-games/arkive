import { describe, expect, it } from 'vitest'

import {
  envelopeOf,
  readSection,
  readSections,
  SCHEMA_VERSION,
  SECTION_KEYS,
  upgrade,
  withSection,
} from './envelope'

describe('the character document', () => {
  it('holds every section and nothing derived', () => {
    const sections = readSections({ schemaVersion: 1 })
    const envelope = envelopeOf(sections)
    expect(envelope.schemaVersion).toBe(SCHEMA_VERSION)
    expect(Object.keys(envelope).sort()).toEqual(['schemaVersion', ...SECTION_KEYS].sort())
    expect(JSON.stringify(envelope)).not.toMatch(/"(score|scores|mark|total)"/)
  })

  it('reads a missing or malformed section as its default', () => {
    const sections = readSections({ schemaVersion: 1, character: 'nonsense', relics: { slots: 'x' } })
    expect(sections.character).toEqual({ roleLevel: 70, divinityLevel: 0, professionId: null })
    expect(sections.relics).toEqual({ knowledgeLevel: null, slots: [] })
  })

  it('drops the retired fields: typed scores, the picked history rank, the stat-keyed relic shapes', () => {
    expect(readSection('character', { roleLevel: 80, divinityLevel: 1, professionId: 3, scores: { 7: 1200 } }))
      .toEqual({ roleLevel: 80, divinityLevel: 1, professionId: 3 })
    expect(readSection('bonds', { puppets: [], dominateSlots: 2, historyRankId: 4 }))
      .toEqual({ puppets: [], dominateSlots: 2 })
    expect(readSection('relics', {
      knowledgeLevel: 2,
      server: 'cross',
      slots: [
        { groupId: 1, artifactId: 7, grade: 3, affixes: [{ stat: 'Atk', value: 1, mark: 1 }], materialId: 9 },
        { groupId: 2, artifactId: 8, grade: 2, materials: [[{ stat: 'Def', value: 1, mark: 1, affixId: 55, scaled: true }, { stat: 'Hp', value: 2, mark: 2 }], [{ affixId: null }]] },
      ],
    })).toEqual({
      knowledgeLevel: 2,
      server: 'cross',
      slots: [
        { groupId: 1, artifactId: 7, grade: 3, materials: [] },
        { groupId: 2, artifactId: 8, grade: 2, materials: [[{ affixId: 55 }], [{ affixId: null }]] },
      ],
    })
  })

  it('carries what it does not know: a section added later, a field added to a section', () => {
    const stored = {
      schemaVersion: 1,
      character: { roleLevel: 70, divinityLevel: 0, professionId: 2, title: 'kept' },
      futureSection: { kept: true },
    }
    const { envelope } = upgrade(stored)
    const character = readSection('character', envelope.character)
    expect((character as Record<string, unknown>).title).toBe('kept')
    const next = withSection(envelope, 'character', { ...character, roleLevel: 75 })
    expect(next.futureSection).toEqual({ kept: true })
    expect(next.character).toEqual({ roleLevel: 75, divinityLevel: 0, professionId: 2, title: 'kept' })
  })

  it('marks a document from a newer page, and never rewrites its version', () => {
    const result = upgrade({ schemaVersion: SCHEMA_VERSION + 1, character: {} })
    expect(result.newer).toBe(true)
    expect(result.envelope.schemaVersion).toBe(SCHEMA_VERSION + 1)
    expect(upgrade({ schemaVersion: SCHEMA_VERSION }).newer).toBe(false)
  })

  it('reads a document that is not one as empty', () => {
    expect(upgrade(null)).toEqual({ envelope: { schemaVersion: SCHEMA_VERSION }, newer: false })
    expect(upgrade({ character: {} }).envelope.schemaVersion).toBe(1)
  })
})
