import shelf from './homeGameShelf.json'
import type { SiteCard } from './sites'

export const MAX_HOME_GAME_TILES = 11

export function homeGameShortcuts(
  eligible: readonly SiteCard[],
  slots: readonly string[] = shelf.slots,
  ranked: readonly string[] = shelf.popularity.ranked,
): SiteCard[] {
  const byId = new Map<string, SiteCard>(eligible.map(site => [site.id, site]))
  const selected = new Set(slots)
  // A popularity result may reorder a slot, but cannot promote a new game.
  return [...new Set([...ranked, ...slots])].flatMap(id => {
    const site = byId.get(id)
    return site && selected.has(id) ? [site] : []
  }).slice(0, MAX_HOME_GAME_TILES)
}
