// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContentPage } from './ContentPage'

vi.mock('./TopNav', () => ({ TopNav: () => <nav /> }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en-US' } }),
}))
vi.mock('@gamemap/auth', () => ({ ArkiveAccountControl: () => null }))
vi.mock('@gamemap/map-shell', () => ({
  ArkiveMobileHeader: () => <header />,
  getArkiveBrandName: () => 'Arkive',
  resolveArkiveHomeUrl: () => 'http://localhost:15172',
}))
vi.mock('@gamemap/ui', () => ({
  cn: (...values: string[]) => values.filter(Boolean).join(' '),
  FilterDisclosure: ({ children }: { children: ReactNode }) => <>{children}</>,
  SiteFooter: () => <footer />,
}))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }))

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('ContentPage catalogue toolbar', () => {
  it('keeps controls and a single heading outside the results scroller', () => {
    act(() => root.render(<ContentPage active="/secretpartners" title="Puppets" heading wide toolbar={<input aria-label="Search" />}><article>Result</article></ContentPage>))
    const scroller = container.querySelector('[data-content-scroll]')!
    const toolbar = container.querySelector('[data-content-toolbar]')!
    expect(scroller.contains(container.querySelector('input'))).toBe(false)
    expect(toolbar.contains(container.querySelector('input'))).toBe(true)
    expect(toolbar.contains(container.querySelector('h1'))).toBe(true)
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(scroller.contains(container.querySelector('article'))).toBe(true)
    expect(toolbar.parentElement).toBe(scroller.parentElement)
    expect(toolbar.className).toContain('max-h-[50%]')
    expect(toolbar.className).toContain('overflow-y-auto')
  })

  it('preserves the scrolling heading for pages without filters', () => {
    act(() => root.render(<ContentPage active="/changelog" title="History" heading><p>Release</p></ContentPage>))
    expect(container.querySelector('[data-content-toolbar]')).toBeNull()
    expect(container.querySelector('[data-content-scroll]')!.contains(container.querySelector('h1'))).toBe(true)
  })

  it('resets on a changed result scope but preserves reading position for card edits', () => {
    const view = (key: string, level: number) => <ContentPage active="/secretpartners" title="Puppets" resultsKey={key} toolbar={<input aria-label="Search" />}><article>Level {level}</article></ContentPage>
    act(() => root.render(view('all', 1)))
    const scroller = container.querySelector<HTMLDivElement>('[data-content-scroll]')!
    scroller.scrollTop = 200
    act(() => root.render(view('all', 30)))
    expect(scroller.scrollTop).toBe(200)
    act(() => root.render(view('red', 30)))
    expect(scroller.scrollTop).toBe(0)
  })
})
