import type { SoulRecord } from '../wikiData'

export interface MarkCount { markId: number; count: number }
export interface MarkStage { markId: number; threshold: number; stage: number; effects: number[]; icon?: string }

export function applicableMarkStages(stages: Array<MarkStage & { multiverses: number[] }>, variant: string): MarkStage[] {
  const multiverse = /^M\d+$/.test(variant) ? Number(variant.slice(1)) : 0
  return stages.filter(stage => !stage.multiverses.length || stage.multiverses.includes(0) || stage.multiverses.includes(multiverse))
}

export function markStages(souls: SoulRecord[]): MarkStage[] {
  const stages = new Map<string, MarkStage>()
  for (const soul of souls) for (const mark of soul.marks ?? []) {
    if (!mark.markId || !Number.isFinite(mark.threshold)) continue
    const row = { markId: mark.markId, threshold: mark.threshold!, stage: mark.stage ?? 0, effects: [...(mark.specialEffectIds ?? [])], icon: mark.icon }
    stages.set(`${row.markId}:${row.stage}:${row.threshold}`, row)
  }
  return [...stages.values()].sort((a, b) => a.markId - b.markId || a.threshold - b.threshold)
}

/** Mark effects follow equipped mark totals, never arbitrary effect checkboxes. */
export function sumMarks(souls: Array<{ id: number; markCounts?: MarkCount[] }>): Map<number, number> {
  const totals = new Map<number, number>()
  for (const soul of souls) {
    if (!soul.id) continue
    for (const mark of soul.markCounts ?? []) {
      if (!Number.isSafeInteger(mark.markId) || mark.markId <= 0 || !Number.isSafeInteger(mark.count) || mark.count <= 0) continue
      totals.set(mark.markId, (totals.get(mark.markId) ?? 0) + mark.count)
    }
  }
  return totals
}

export function activeMarkStages(stages: MarkStage[], totals: Map<number, number>): MarkStage[] {
  return stages.filter(s => (totals.get(s.markId) ?? 0) >= s.threshold)
}
