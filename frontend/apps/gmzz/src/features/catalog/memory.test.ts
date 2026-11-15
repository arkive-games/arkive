import { describe, expect, it } from 'vitest'
import { MemoryClient } from '@gamemap/state-memory'
import { createContextField, EMPTY_PIECE_FILTERS, isPieceFilters, validContextValue } from './memory'

function memory() {
  const values = new Map<string, string>()
  return new MemoryClient({ sessionStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: key => { values.delete(key) },
  } })
}

describe('Lord of Mysteries reference context', () => {
  it('isolates category fields and individual entity reading choices', () => {
    const client = memory()
    const fields = createContextField('')
    const first = fields.at({ scope: JSON.stringify(['chess-items', 'query']) })
    const other = fields.at({ scope: JSON.stringify(['chess-talents', 'query']) })
    client.write(first.record, 'potion', first.scope)
    expect(client.read(first.record, first.scope)).toBe('potion')
    expect(client.read(other.record, other.scope)).toBe('')
    const levels = createContextField(0)
    const one = levels.at({ scope: JSON.stringify(['relation:1', 'grade']) })
    const two = levels.at({ scope: JSON.stringify(['relation:2', 'grade']) })
    client.write(one.record, 4, one.scope)
    expect(client.read(two.record, two.scope)).toBe(0)
  })

  it('validates saved filters without admitting tool or draft-shaped data', () => {
    expect(isPieceFilters({ ...EMPTY_PIECE_FILTERS, cost: 3, query: 'test' })).toBe(true)
    expect(isPieceFilters({ cost: -1, bondId: 0, role: '', query: '' })).toBe(false)
    expect(isPieceFilters({ loadout: [], dirty: true })).toBe(false)
    expect(validContextValue(Number.NaN, 1)).toBe(false)
    expect(validContextValue(-1, 1)).toBe(false)
    expect(validContextValue(1.5, 1)).toBe(false)
    expect(validContextValue({}, null)).toBe(false)
  })

  it('keeps browser-storage failures non-blocking', () => {
    const client = new MemoryClient({})
    const field = createContextField(1).at({ scope: 'traintrade:page' })
    expect(client.write(field.record, 2, field.scope)).toBe(false)
    expect(client.read(field.record, field.scope)).toBe(1)
  })
})
