// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useIncrementalList } from './useIncrementalList'

afterEach(() => { cleanup(); sessionStorage.clear() })
const items = Array.from({ length: 700 }, (_, id) => id)

describe('catalog reveal restoration', () => {
  it('adopts the existing unfiltered reveal depth without discarding it', () => {
    sessionStorage.setItem('palworld.reveal.test-items', '480')
    const hook = renderHook(() => useIncrementalList(items, 'test-items'))
    expect(hook.result.current.shown).toHaveLength(480)
  })

  it('retains reveal depth through empty loading, hydration and identity changes', () => {
    const first = renderHook(() => useIncrementalList(items, 'test-items', 'all'))
    act(() => first.result.current.showMore())
    act(() => first.result.current.showMore())
    first.unmount()
    const returned = renderHook(({ list }) => useIncrementalList(list, 'test-items', 'all'), { initialProps: { list: [] as number[] } })
    expect(returned.result.current.shown).toEqual([])
    returned.rerender({ list: items })
    expect(returned.result.current.shown).toHaveLength(480)
    returned.rerender({ list: [...items] })
    expect(returned.result.current.shown).toHaveLength(480)
  })

  it('isolates filtered depth, including transitions through empty results', () => {
    const hook = renderHook(({ key, list }) => useIncrementalList(list, 'test-items', key), {
      initialProps: { key: 'all', list: items },
    })
    act(() => hook.result.current.showMore())
    hook.rerender({ key: 'missing', list: [] })
    hook.rerender({ key: 'weapons', list: items })
    expect(hook.result.current.shown).toHaveLength(160)
    hook.rerender({ key: 'all', list: items })
    expect(hook.result.current.shown).toHaveLength(320)
  })
})
