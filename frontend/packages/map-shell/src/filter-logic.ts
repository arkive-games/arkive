export type EyeState = "all" | "some" | "none"

export function deriveEyeState(subtypes: { active: boolean }[]): EyeState {
  if (subtypes.length === 0) return "none"
  const activeCount = subtypes.filter((s) => s.active).length
  if (activeCount === subtypes.length) return "all"
  return activeCount > 0 ? "some" : "none"
}

const NO_COLLAPSED: ReadonlySet<string> = new Set()

/**
 * Keep the expanded-category set in sync as categories load in asynchronously.
 * New categories are auto-expanded so users see them, EXCEPT any listed in
 * `collapsedByDefault` — those stay closed until the user opens them (used for
 * large categories like palworld's "pal"). User-driven collapses of other
 * categories are still re-added when they reappear (donor bug-compatible).
 */
export function syncExpanded(
  prev: string[],
  categoryIds: string[],
  collapsedByDefault: ReadonlySet<string> = NO_COLLAPSED,
): string[] {
  const known = new Set(prev)
  const next = [...prev]
  for (const id of categoryIds) {
    if (!known.has(id) && !collapsedByDefault.has(id)) next.push(id)
  }
  return next.length === prev.length ? prev : next
}
