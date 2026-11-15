import { describe, expect, it } from 'vitest'
import { MemoryClient } from '@gamemap/state-memory'
import { createKnowledgeQueryRecord, createKnowledgeRevealRecord, createSectionRecord, expandedRecords, knowledgeQueryScope, knowledgeResultsScope, legacyQueryRecord, legacyRevealRecord, migrateKnowledgeContext } from './memory'

function memory() {
  const values = new Map<string, string>()
  return new MemoryClient({ sessionStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  } })
}

describe('knowledge subsection memory', () => {
  it('isolates searches, reveal depth and disclosure between result scopes', () => {
    const client = memory()
    const query = createKnowledgeQueryRecord('systems', 'passives', 'passives')
    client.write(query, 'Blood', { partition: knowledgeQueryScope('systems', 'passives') })
    expect(client.read(query, { partition: knowledgeQueryScope('systems', 'buildings') })).toBe('')
    const reveal = createKnowledgeRevealRecord('systems', 'passives', 'Blood', 'passives')
    client.write(reveal, 144, { partition: knowledgeResultsScope('systems', 'passives', 'Blood') })
    expect(client.read(reveal, { partition: knowledgeResultsScope('systems', 'passives', 'Frost') })).toBe(48)
    client.write(expandedRecords, ['SpellPassive_Blood_T01_BloodSpray'], { partition: knowledgeQueryScope('systems', 'passives') })
    expect(client.read(expandedRecords, { partition: knowledgeQueryScope('systems', 'buildings') })).toEqual([])
  })

  it('adopts legacy context once without copying it into a subsequently selected category', () => {
    const client = memory()
    client.write(legacyQueryRecord, 'Blood', { partition: 'systems' })
    client.write(legacyRevealRecord, 144, { partition: 'systems' })
    migrateKnowledgeContext('systems', 'passives', client)
    const query = createKnowledgeQueryRecord('systems', 'passives', 'passives')
    expect(client.read(query, { partition: knowledgeQueryScope('systems', 'passives') })).toBe('Blood')
    const reveal = createKnowledgeRevealRecord('systems', 'passives', 'Blood', 'passives')
    expect(client.read(reveal, { partition: knowledgeResultsScope('systems', 'passives', 'Blood') })).toBe(144)
    migrateKnowledgeContext('systems', 'buildings', client)
    expect(client.read(query, { partition: knowledgeQueryScope('systems', 'buildings') })).toBe('')
    expect(client.read(legacyQueryRecord, { partition: 'systems' })).toBe('Blood')
    expect(client.read(legacyRevealRecord, { partition: 'systems' })).toBe(144)
  })

  it('rejects malformed state and degrades safely when storage is unavailable', () => {
    expect(createSectionRecord('passives').validate(['passives'])).toBe(false)
    const reveal = createKnowledgeRevealRecord('systems', 'passives', '', 'passives')
    expect(reveal.validate(Number.NaN)).toBe(false)
    expect(reveal.validate(48.5)).toBe(false)
    expect(expandedRecords.validate([123])).toBe(false)
    expect(() => migrateKnowledgeContext('systems', 'passives', new MemoryClient({}))).not.toThrow()
  })

  it('does not replace newer subsection state if the migration marker is missing', () => {
    const client = memory()
    client.write(legacyQueryRecord, 'Blood', { partition: 'systems' })
    const query = createKnowledgeQueryRecord('systems', 'passives', 'passives')
    client.write(query, 'Frost', { partition: knowledgeQueryScope('systems', 'passives') })
    const reveal = createKnowledgeRevealRecord('systems', 'passives', 'Frost', 'passives')
    client.write(reveal, 192, { partition: knowledgeResultsScope('systems', 'passives', 'Frost') })
    migrateKnowledgeContext('systems', 'passives', client)
    expect(client.read(query, { partition: knowledgeQueryScope('systems', 'passives') })).toBe('Frost')
    expect(client.read(reveal, { partition: knowledgeResultsScope('systems', 'passives', 'Frost') })).toBe(192)
  })
})
