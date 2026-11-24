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

  it('uses the chosen avatar, then the game thumbnail and cover on load failures', () => {
    const node = mount({ ...game, shortcutAvatar: '/game-avatar.png' })
    const image = () => node.querySelector('.home-quick-icon.is-game img')!
    expect(image().getAttribute('src')).toBe('/game-avatar.png')
    fireEvent.error(image())
    expect(image().getAttribute('src')).toBe(game.thumb)
    fireEvent.error(image())
    expect(image().getAttribute('src')).toBe(game.bg)
    fireEvent.error(image())
    expect(image()).toBeNull()
  })

  it('uses the app icon when no separate library avatar is needed', () => {
    const site = SITES.find(item => item.id === 'palworld')!
    expect(mount(site).querySelector('.home-quick-icon.is-game img')?.getAttribute('src')).toBe(site.icon)
  })

  it('does not retry an avatar that also serves as the thumbnail', () => {
    const node = mount({ ...game, shortcutAvatar: game.thumb })
    fireEvent.error(node.querySelector('.home-quick-icon.is-game img')!)
    expect(node.querySelector('.home-quick-icon.is-game img')?.getAttribute('src')).toBe(game.bg)
  })

  it('uses the game cover and its crop position when there is no avatar or thumbnail', () => {
    const image = mount({ ...game, shortcutAvatar: undefined, icon: undefined, thumb: undefined })
      .querySelector<HTMLImageElement>('.home-quick-icon.is-game img')!
    expect(image.getAttribute('src')).toBe(game.bg)
    expect(image.style.objectPosition).toBe(game.bgPosition)
  })
})
