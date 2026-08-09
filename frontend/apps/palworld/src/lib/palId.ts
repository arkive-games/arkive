import type { IdLabelValue } from '@gamemap/map-shell'

/**
 * A pal's Paldeck id as structured parts: "No.037" with an optional variant
 * suffix ("B") kept separate so the shell can style it distinctly. Returns
 * undefined for uncatalogued pals (zukanIndex <= 0 or absent).
 */
export function formatPalId(zukanIndex?: number, suffix?: string): IdLabelValue | undefined {
  if (typeof zukanIndex !== 'number' || zukanIndex <= 0) return undefined
  return { text: `No.${String(zukanIndex).padStart(3, '0')}`, accent: suffix || undefined }
}

/** Flatten a formatted pal id to a plain string, e.g. for search indexing. */
export function palIdText(id?: IdLabelValue): string | undefined {
  return id ? `${id.text}${id.accent ?? ''}` : undefined
}

/**
 * Sortable Paldeck position: uncatalogued pals (zukanIndex <= 0, e.g. the
 * Terraria-collab creatures) sort after every numbered pal instead of first.
 * Ties keep the dataset's emitted order (Array.prototype.sort is stable).
 */
export function zukanOrder(zukanIndex: number): number {
  return zukanIndex <= 0 ? Number.MAX_SAFE_INTEGER : zukanIndex
}

export type ZukanSortDirection = 'ascending' | 'descending'

type ZukanSortable = {
  id: string
  zukanIndex: number
  zukanIndexSuffix?: string
}

/**
 * Order numbered pals by Paldeck number while always keeping uncatalogued
 * entries at the end, regardless of the selected direction.
 */
export function compareZukan(
  a: ZukanSortable,
  b: ZukanSortable,
  direction: ZukanSortDirection,
): number {
  const aOrder = zukanOrder(a.zukanIndex)
  const bOrder = zukanOrder(b.zukanIndex)
  const aUncatalogued = aOrder === Number.MAX_SAFE_INTEGER
  const bUncatalogued = bOrder === Number.MAX_SAFE_INTEGER

  if (aUncatalogued !== bUncatalogued) return aUncatalogued ? 1 : -1
  if (aUncatalogued) return a.id.localeCompare(b.id)

  const numberedOrder =
    aOrder - bOrder ||
    (a.zukanIndexSuffix ?? '').localeCompare(b.zukanIndexSuffix ?? '') ||
    a.id.localeCompare(b.id)

  return direction === 'ascending' ? numberedOrder : -numberedOrder
}
