// @vitest-environment jsdom
import { useRef } from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useContentScrollRestoration,
  type ContentScrollRestoration,
} from './useContentScrollRestoration'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup(memory: ContentScrollRestoration) {
  let resized = () => {}
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    callback()
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  function Page({ value }: { value: ContentScrollRestoration }) {
    const ref = useRef<HTMLDivElement>(null)
    useContentScrollRestoration(ref, value)
    return (
      <div ref={ref} data-testid="scroll">
        <main>Records</main>
      </div>
    )
  }
  const api = render(<Page value={memory} />)
  const node = api.getByTestId('scroll')
  let maximum = 0
  let top = 0
  Object.defineProperties(node, {
    clientHeight: { get: () => 500 },
    scrollHeight: { get: () => maximum + 500 },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, Math.min(maximum, value))
      },
    },
  })
  return {
    ...api,
    node,
    grow: (height: number) => {
      maximum = height
      act(() => resized())
    },
    rerenderMemory: (value: ContentScrollRestoration) =>
      api.rerender(<Page value={value} />),
  }
}

describe('content return position', () => {
  it('waits for data and sufficient list height instead of overwriting position with zero', () => {
    const memory = {
      key: 'monsters',
      ready: false,
      read: () => 900,
      write: vi.fn(),
    }
    const page = setup(memory)
    page.rerenderMemory({ ...memory, ready: true })
    expect(page.node.scrollTop).toBe(0)
    expect(memory.write).not.toHaveBeenCalled()
    page.grow(1400)
    expect(page.node.scrollTop).toBe(900)
    page.unmount()
    expect(memory.write).toHaveBeenLastCalledWith(900)
  })

  it('saves the last real scroll and restores each category independently', () => {
    const first = {
      key: 'monsters',
      ready: false,
      read: () => 600,
      write: vi.fn(),
    }
    const second = {
      key: 'cards',
      ready: true,
      read: () => 120,
      write: vi.fn(),
    }
    const page = setup(first)
    page.grow(1500)
    page.rerenderMemory({ ...first, ready: true })
    page.node.scrollTop = 850
    fireEvent.scroll(page.node)
    page.rerenderMemory(second)
    expect(first.write).toHaveBeenLastCalledWith(850)
    expect(page.node.scrollTop).toBe(120)
  })

  it('lets user input cancel a deferred restore before data is ready', () => {
    let saved = 900
    const memory = {
      key: 'cards',
      ready: false,
      read: () => saved,
      write: (top: number) => {
        saved = top
      },
    }
    const page = setup(memory)
    fireEvent.keyDown(page.node, { key: 'a' })
    page.grow(1500)
    page.rerenderMemory({ ...memory, ready: true })
    expect(page.node.scrollTop).toBe(0)
    expect(saved).toBe(0)
  })
})
