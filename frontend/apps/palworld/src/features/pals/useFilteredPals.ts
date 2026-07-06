import { useMemo } from 'react'
import type { Element, PalEntry, PalsBundle, WorkType } from '../../lib/pals'

/** Pals-list filter state. Elements & work are AND (a pal must match every
 *  selected one); reactions are OR (a pal has exactly one). */
export interface PalFilter {
  query: string
  elements: Element[]
  works: WorkType[]
  reactions: string[]
  nocturnal: boolean
  loot: string | null
}

export const EMPTY_FILTER: PalFilter = {
  query: '',
  elements: [],
  works: [],
  reactions: [],
  nocturnal: false,
  loot: null,
}

export function isFilterActive(f: PalFilter): boolean {
  return Boolean(
    f.query || f.elements.length || f.works.length || f.reactions.length || f.nocturnal || f.loot,
  )
}

/** Toggle a value in an array (add if absent, remove if present). */
export function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
}

/** Filter + sort the roster. When a work filter is active, results are sorted by
 *  the max suitability level among the selected work types (desc); otherwise by
 *  Paldeck order. */
export function useFilteredPals(bundle: PalsBundle | null, f: PalFilter): PalEntry[] {
  return useMemo(() => {
    if (!bundle) return []
    const q = f.query.trim().toLowerCase()
    const digits = q.replace(/^no\.?/, '').replace(/^0+/, '')
    const out = bundle.pals.filter((p) => {
      if (q) {
        const name = (bundle.text[p.id]?.name ?? p.id).toLowerCase()
        const idMatch = /^\d+$/.test(digits) && String(p.zukanIndex) === digits
        if (!name.includes(q) && !idMatch) return false
      }
      if (f.elements.length && !f.elements.every((e) => p.elements.includes(e))) return false
      if (f.works.length && !f.works.every((w) => p.work[w] != null)) return false
      if (f.reactions.length && !f.reactions.includes(p.reaction)) return false
      if (f.nocturnal && !p.nocturnal) return false
      if (f.loot && !p.drops.some((d) => d.item === f.loot)) return false
      return true
    })
    const byIndex = (a: PalEntry, b: PalEntry) =>
      a.zukanIndex - b.zukanIndex || a.zukanIndexSuffix.localeCompare(b.zukanIndexSuffix)
    if (f.works.length) {
      const maxLvl = (p: PalEntry) => Math.max(...f.works.map((w) => p.work[w] ?? 0))
      return [...out].sort((a, b) => maxLvl(b) - maxLvl(a) || byIndex(a, b))
    }
    return [...out].sort(byIndex)
  }, [bundle, f.query, f.elements, f.works, f.reactions, f.nocturnal, f.loot])
}
