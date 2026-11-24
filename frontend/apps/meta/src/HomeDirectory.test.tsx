// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomeDirectory } from './HomeDirectory'
import { SITES, type SiteCard } from './sites'

vi.mock('./HomeCarousel', () => ({ HomeCarousel: () => null }))
vi.mock('./platform-changelog.json', () => ({ default: { entries: [{ date: '2026-09-19' }] } }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en-US' }, t: (key: string) => key }),
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const game = SITES.find(site => site.id === 'gmzz')!

function mount(site: SiteCard = game) {
  return render(<HomeDirectory sites={[site]} updatedDates={{ [site.id]: '2026-09-19' }}
    recentlyUsed={[]} onOpenSite={() => {}} onOpenFeature={() => {}} />).container
}

describe('homepage shortcut tiles', () => {
  it.each([[26, true], [27, false]] as const)('checks both badges on September %i', (day, visible) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, day, 23, 59))
    const node = mount()
    for (const href of [game.url, '#updates']) {
      const link = node.querySelector(`.home-quick a[href="${href}"]`)!
      expect(link.querySelector('b') !== null).toBe(visible)
    }
  })

  it('switches from the logo to this game\'s thumbnail when loading fails', () => {
    const node = mount()
    const image = () => node.querySelector('.home-quick-icon.is-game img')!
    expect(image().getAttribute('src')).toBe(game.logo)
    fireEvent.error(image())
    expect(image().getAttribute('src')).toBe(game.thumb)
    expect(image().classList.contains('home-quick-logo')).toBe(false)
  })

  it('uses the game cover and its crop position when there is no logo or thumbnail', () => {
    const image = mount({ ...game, logo: undefined, thumb: undefined })
      .querySelector<HTMLImageElement>('.home-quick-icon.is-game img')!
    expect(image.getAttribute('src')).toBe(game.bg)
    expect(image.style.objectPosition).toBe(game.bgPosition)
  })
})
