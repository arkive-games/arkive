import { describe, expect, it } from 'vitest'
import { homeGameShortcuts, MAX_HOME_GAME_TILES } from './homeGameShelf'
import shelf from './homeGameShelf.json'
import { SITES, type SiteCard } from './sites'

describe('homepage game shortcut policy', () => {
  it('keeps the current seven occupied slots replacement-only and within the hard ceiling', () => {
    expect(MAX_HOME_GAME_TILES).toBe(11)
    expect(shelf.slots).toHaveLength(7)
    expect(shelf.slots.length).toBeLessThanOrEqual(MAX_HOME_GAME_TILES)
    expect(new Set(shelf.slots).size).toBe(shelf.slots.length)
    expect(new Set(shelf.popularity.ranked).size).toBe(shelf.popularity.ranked.length)
    for (const id of shelf.slots) expect(SITES.some(site => site.id === id)).toBe(true)
    for (const id of shelf.popularity.ranked) expect(shelf.slots).toContain(id)
  })

  it('ranks eligible slots first, preserves unmeasured slot order and never promotes an outsider', () => {
    const selected = ['gmzz', 'pbz', 'vrising', 'palworld']
    const eligible = SITES.filter(site => site.id !== 'pbz')
    const order = homeGameShortcuts(eligible, selected, ['oss', 'pbz', 'palworld'])
    expect(order.map(site => site.id)).toEqual(['palworld', 'gmzz', 'vrising'])
  })

  it('never renders a twelfth game, even with an oversized roster', () => {
    const games = Array.from({ length: 12 }, (_, i) => ({ ...SITES[0], id: String(i) }) as SiteCard)
    const ids = games.map(game => game.id)
    expect(homeGameShortcuts(games, ids, [])).toEqual(games.slice(0, 11))
  })
})
