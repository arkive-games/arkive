// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryClient } from '@gamemap/state-memory'
import { catalogField, useCatalogScroll, useCatalogState } from './catalogMemory'

afterEach(() => { cleanup(); sessionStorage.clear() })

describe('catalog return context', () => {
  it('restores fields on return and isolates categories and fields', () => {
    const first = renderHook(() => useCatalogState<string>('items', 'query', ''))
    act(() => first.result.current[1]('sphere'))
    first.unmount()
    const second = renderHook(() => useCatalogState<string>('buildings', 'query', ''))
    expect(second.result.current[0]).toBe('')
    const returned = renderHook(() => useCatalogState<string>('items', 'query', ''))
    expect(returned.result.current[0]).toBe('sphere')
    const category = renderHook(() => useCatalogState<string[]>('items', 'cats', []))
    expect(category.result.current[0]).toEqual([])
  })

  it('rejects malformed browsing fields and works without browser storage', () => {
    const values = new Map<string, string>()
    const client = new MemoryClient({ sessionStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } } })
    const record = catalogField<string[]>([])
    expect(client.write(record, [42] as unknown as string[])).toBe(false)
    expect(client.read(record)).toEqual([])
    expect(client.write(record, ['Blueprint'])).toBe(true)
    expect(client.read(record)).toEqual(['Blueprint'])
    const unavailable = new MemoryClient({})
    expect(unavailable.write(record, ['Blueprint'])).toBe(false)
    expect(unavailable.read(record)).toEqual([])
  })

  it('restores scroll only for the matching result set and waits for data', () => {
    const hook = renderHook(({ ready, resultsKey }) => useCatalogScroll({ section: 'items', ready, resultsKey }), {
      initialProps: { ready: true, resultsKey: 'spheres' },
    })
    hook.result.current!.write(800)
    hook.rerender({ ready: false, resultsKey: 'spheres' })
    expect(hook.result.current!.ready).toBe(false)
    expect(hook.result.current!.read()).toBe(800)
    hook.rerender({ ready: true, resultsKey: 'weapons' })
    expect(hook.result.current!.read()).toBe(0)
    hook.rerender({ ready: true, resultsKey: 'spheres' })
    expect(hook.result.current!.read()).toBe(800)
  })
})
