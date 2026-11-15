// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
const viewport = vi.hoisted(() => ({ mobile: true }))
vi.mock('@gamemap/ui', () => ({ useIsMobile: () => viewport.mobile, cn: (...values: string[]) => values.join(' ') }))
import { useMobilePagination } from './MobilePagination'

afterEach(() => { cleanup(); sessionStorage.clear(); viewport.mobile = true })

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
