// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteFooter } from './site-footer'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function environment(desktop: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
}

describe('footer voyage', () => {
  it('omits the voyage on mobile while retaining the footer', () => {
    environment(false)
    render(<SiteFooter />)
    expect(screen.getByTestId('footer-voyage').hidden).toBe(true)
    expect(screen.getByTestId('site-footer-home').textContent).toBe('Arkive')
  })

  it('uses a content scroll container instead of window progress', () => {
    environment(true)
    const scroller = document.createElement('div')
    scroller.setAttribute('data-content-scroll', '')
    Object.defineProperties(scroller, {
      clientWidth: { value: 800 }, clientHeight: { value: 400 },
      scrollHeight: { value: 1200 }, scrollTop: { value: 400 },
    })
    document.body.append(scroller)
    const view = render(<SiteFooter />, { container: scroller })
    const voyage = screen.getByTestId('footer-voyage')
    expect(voyage.hidden).toBe(false)
    expect(voyage.querySelector<SVGElement>('[data-done]')?.style.clipPath).toBe('inset(0 50% 0 0)')
    view.unmount()
    expect(screen.queryByTestId('footer-voyage')).toBeNull()
    scroller.remove()
  })
})
