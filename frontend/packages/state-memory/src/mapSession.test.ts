import { describe, expect, it } from 'vitest'
import { MemoryClient } from './core'
import { createMapSessionRecords } from './mapSession'

describe('map browsing records', () => {
  it('isolates filters, search and sidebar state without writing to durable storage', () => {
    const values = new Map<string, string>()
    const sessionStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
    const client = new MemoryClient({ sessionStorage })
    const records = createMapSessionRecords('test-map', { categories: () => ['legacy'], visibility: () => [] })
    const first = { partition: 'first' }; const second = { partition: 'second' }
    expect(client.read(records.visibility, first)).toEqual([])
    client.write(records.visibility, ['boss'], first)
    client.write(records.query, 'village', first)
    client.write(records.sidebarCollapsed, true, first)
    client.write(records.sidebarScroll, 600, first)
    client.write(records.categories, ['resource'], first)
    expect(client.read(records.visibility, second)).toEqual([])
    expect(client.read(records.query, second)).toBe('')
    expect(client.read(records.sidebarCollapsed, second)).toBe(false)
    expect(client.read(records.sidebarScroll, second)).toBe(0)
    expect(client.read(records.categories, second)).toEqual(['legacy'])
    expect(client.read(records.query, first)).toBe('village')
    expect([...values.keys()].every(key => key.includes('map-context'))).toBe(true)
  })
})
