// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCatalogFavorite } from './useCatalogFavorite'

const auth = vi.hoisted(() => ({ status: 'authenticated', user: { uid: 123 } }))
vi.mock('@gamemap/auth', () => ({ useAuth: () => auth }))

describe('confirmed catalog favorite writes', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    auth.status = 'authenticated'
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  async function mount(
    write: () => boolean | Promise<boolean>,
    login = vi.fn(),
  ) {
    function Harness() {
      const action = useCatalogFavorite(write, login)
      return (
        <button
          disabled={action.authLoading}
          onClick={() => void action.toggle('tool')}
          data-pending={action.pending.includes('tool')}
          data-failed={action.failed.includes('tool')}
        >
          Favorite
        </button>
      )
    }
    await act(async () => root.render(<Harness />))
    return host.querySelector('button')!
  }

  it('prevents duplicates while pending, retains failure and permits retry', async () => {
    let resolve!: (saved: boolean) => void
    const write = vi.fn(
      () =>
        new Promise<boolean>((done) => {
          resolve = done
        }),
    )
    const button = await mount(write)
    await act(async () => {
      button.click()
      button.click()
    })
    expect(write).toHaveBeenCalledTimes(1)
    expect(button.dataset.pending).toBe('true')
    await act(async () => resolve(false))
    expect(button.dataset.failed).toBe('true')
    await act(async () => button.click())
    await act(async () => resolve(true))
    expect(button.dataset.failed).toBe('false')
  })

  it('opens login for anonymous users without writing', async () => {
    auth.status = 'anonymous'
    const write = vi.fn(() => true)
    const login = vi.fn()
    const button = await mount(write, login)
    await act(async () => button.click())
    expect(login).toHaveBeenCalledOnce()
    expect(write).not.toHaveBeenCalled()
  })

  it('does not treat a loading auth session as anonymous', async () => {
    auth.status = 'loading'
    const write = vi.fn(() => true)
    const login = vi.fn()
    const button = await mount(write, login)
    expect(button.disabled).toBe(true)
    expect(login).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })
})
