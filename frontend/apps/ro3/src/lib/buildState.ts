export const BUILD_STORAGE_KEY = 'ro3-build-planner'

/** A failed write must not discard the editable draft or masquerade as a data error. */
export function persistBuilds(builds: unknown, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const target = storage ?? window.localStorage
    target.setItem(BUILD_STORAGE_KEY, JSON.stringify(builds))
    return true
  } catch {
    return false
  }
}

export function updateSocket(cards: number[], index: number, value: number): number[] {
  const next = Array.from({ length: Math.max(cards.length, index + 1) }, (_, position) => cards[position] ?? 0)
  next[index] = value
  return next
}

export function resolveMarkEffects(ids: number[], marks: Array<{ markId?: number; specialEffectIds?: number[] }>): number[] {
  return [...new Set(ids.flatMap((id) => {
    const legacy = marks.filter((mark) => mark.markId === id)
    return legacy.length ? legacy.flatMap((mark) => mark.specialEffectIds ?? []) : [id]
  }))]
}

export function clampAttribute(value: number): number {
  return Number.isFinite(value) ? Math.min(999, Math.max(1, Math.trunc(value))) : 1
}
