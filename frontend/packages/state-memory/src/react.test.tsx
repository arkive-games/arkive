// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryClient, defineMemoryRecord, memoryPolicy, type StorageLike } from './core'
import { useMemoryState } from './react'

const draft = defineMemoryRecord({
  id: 'react-draft', namespace: 'hook-test', surface: 'editor',
  ...memoryPolicy.taskDraft('discard-draft'),
  schemaVersion: '1.0.0', defaultValue: () => '',
  validate: (value: unknown): value is string => typeof value === 'string',
})

function storage(throws = false): StorageLike {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (throws) throw new DOMException('blocked')
      values.set(key, value)
    },
    removeItem: (key) => { values.delete(key) },
  }
}

afterEach(() => vi.useRealTimers())

describe('useMemoryState', () => {
  it('flushes a debounced draft on pagehide and reports a confirmed save', () => {
    vi.useFakeTimers()
    const client = new MemoryClient({ deviceStorage: storage() })
    const { result } = renderHook(() => useMemoryState(draft, { client, debounceMs: 5_000 }))

    act(() => result.current[1]('working'))
    expect(result.current[3]).toBe('idle')
    act(() => window.dispatchEvent(new Event('pagehide')))

    expect(result.current[3]).toBe('saved')
    expect(client.read(draft)).toBe('working')
  })

  it('reports a failed pagehide flush when storage rejects the write', () => {
    vi.useFakeTimers()
    const client = new MemoryClient({ deviceStorage: storage(true) })
    const { result } = renderHook(() => useMemoryState(draft, { client, debounceMs: 5_000 }))

    act(() => result.current[1]('working'))
    act(() => window.dispatchEvent(new Event('pagehide')))

    expect(result.current[3]).toBe('failed')
  })
})
