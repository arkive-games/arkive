// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { defineMemoryRecord, MemoryClient, memoryPolicy } from './core'
import { isFiniteNumber } from './validators'
import { sessionScrollBinding, useSessionScroll } from './sessionScroll'

const record = (namespace: string) => defineMemoryRecord({
  id: 'scroll', namespace, surface: 'catalog-context',
  ...memoryPolicy.sessionContext('clear-catalog-context'),
  schemaVersion: '1.0.0', defaultValue: () => 0,
  validate: (value: unknown): value is number => isFiniteNumber(value) && value >= 0,
})
afterEach(() => { cleanup(); sessionStorage.clear() })

describe('session scroll binding', () => {
  it('keeps a saved position while data loads and exposes readiness separately', () => {
    const scroll = record('test-catalog')
    const hook = renderHook(({ ready }) => useSessionScroll(scroll, { scope: 'items', ready }), { initialProps: { ready: true } })
    hook.result.current!.write(900)
    const read = hook.result.current!.read
    hook.rerender({ ready: false })
    expect(hook.result.current!.ready).toBe(false)
    expect(hook.result.current!.read).toBe(read)
    expect(hook.result.current!.read()).toBe(900)
    hook.rerender({ ready: true })
    expect(hook.result.current!.ready).toBe(true)
    expect(hook.result.current!.read()).toBe(900)
  })

  it('isolates games, categories and result sets without delimiter collisions', () => {
    const first = record('test-first'); const second = record('test-second')
    const binding = sessionScrollBinding(first, { scope: 'items:a', resultsKey: 'b', ready: true })
    binding.write(1200)
    expect(sessionScrollBinding(first, { scope: 'items', resultsKey: 'a:b', ready: true }).read()).toBe(0)
    expect(sessionScrollBinding(second, { scope: 'items:a', resultsKey: 'b', ready: true }).read()).toBe(0)
    expect(sessionScrollBinding(first, { scope: 'items:a', resultsKey: 'b', ready: true }).read()).toBe(1200)
  })

  it('rejects invalid positions and remains usable without storage', () => {
    const scroll = record('test-unavailable')
    const memory = new MemoryClient({})
    const binding = sessionScrollBinding(scroll, { scope: 'items', ready: true }, memory)
    expect(scroll.validate(-1)).toBe(false)
    expect(scroll.validate(Number.NaN)).toBe(false)
    expect(() => binding.write(500)).not.toThrow()
    expect(binding.read()).toBe(0)
  })
})
