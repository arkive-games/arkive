import { useMemo } from 'react'
import type { Bundle, Card } from '../../lib/data'
import { cardTextToPlain } from '../../lib/cardText'

/**
 * Facets are OR within a group and AND across groups: a card has exactly one
 * deck, type, rarity and cost, so selecting two rarities means "either".
 */
export interface CardFilter {
  query: string
  pools: string[]
  types: string[]
  rarities: string[]
  costs: number[]
}

export const EMPTY_FILTER: CardFilter = { query: '', pools: [], types: [], rarities: [], costs: [] }

export function isFilterActive(f: CardFilter): boolean {
  return Boolean(f.query || f.pools.length || f.types.length || f.rarities.length || f.costs.length)
}

export function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

/**
 * Search matches the localized name and the rendered description, so a player
 * can find a card by an effect they remember rather than only by its title.
 */
export function filterCards(bundle: Pick<Bundle, 'cards' | 'cardText'>, f: CardFilter): Card[] {
  const q = f.query.trim().toLowerCase()

  const out = bundle.cards.filter((c) => {
    if (f.pools.length && !(c.pool && f.pools.includes(c.pool))) return false
    if (f.types.length && !f.types.includes(c.type)) return false
    if (f.rarities.length && !f.rarities.includes(c.rarity)) return false
    if (f.costs.length && !f.costs.includes(c.cost)) return false

    if (q) {
      const text = bundle.cardText[c.id]
      const name = (text?.name ?? c.id).toLowerCase()
      if (name.includes(q)) return true
      const description = text?.description
        ? cardTextToPlain(text.description, c.vars).toLowerCase()
        : ''
      return description.includes(q) || c.id.toLowerCase().includes(q)
    }

    return true
  })

  const name = (c: Card) => bundle.cardText[c.id]?.name ?? c.id
  return [...out].sort((a, b) => name(a).localeCompare(name(b)))
}

export function useFilteredCards(bundle: Bundle | null, f: CardFilter): Card[] {
  return useMemo(() => (bundle ? filterCards(bundle, f) : []), [bundle, f])
}
