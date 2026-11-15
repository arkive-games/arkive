// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const viewport = vi.hoisted(() => ({ mobile: true }))
vi.mock('@gamemap/ui', () => ({ useIsMobile: () => viewport.mobile, cn: (...values: string[]) => values.join(' ') }))
import { useMobilePagination } from './MobilePagination'

afterEach(() => { cleanup(); sessionStorage.clear(); viewport.mobile = true })

it('paginates desktop results and resets the page when the search changes', () => {
  viewport.mobile = false
  const items = Array.from({ length: 61 }, (_, id) => id)
  const result = renderHook(({ query }) => useMobilePagination(items, { pageSize: 24, desktop: true, resetKey: query }), { initialProps: { query: '' } })
  expect(result.result.current.visibleItems).toHaveLength(24)
  expect(result.result.current.pageCount).toBe(3)
  act(() => result.result.current.goToPage(3))
  expect(result.result.current.visibleItems).toEqual(items.slice(48))
  result.rerender({ query: 'fire' })
  expect(result.result.current.page).toBe(1)
  expect(result.result.current.visibleItems[0]).toBe(0)
})

it('keeps the mobile page through loading and desktop visits, clamping only after data arrives', () => {
  const items = Array.from({ length: 100 }, (_, id) => id)
  const first = renderHook(({ list }) => useMobilePagination(list, { pageSize: 10 }), { initialProps: { list: items } })
  act(() => first.result.current.goToPage(4))
  viewport.mobile = false
  first.rerender({ list: items })
  expect(first.result.current.page).toBe(4)
  first.unmount()
  viewport.mobile = true
  const returned = renderHook(({ list }) => useMobilePagination(list, { pageSize: 10 }), { initialProps: { list: [] as number[] } })
  expect(returned.result.current.page).toBe(4)
  returned.rerender({ list: items })
  expect(returned.result.current.visibleItems[0]).toBe(30)
  returned.rerender({ list: items.slice(0, 15) })
  expect(returned.result.current.page).toBe(2)
})
