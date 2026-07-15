import { dataUrl } from './urls'

// --- data shapes (mirror dungeon-layouts.json, emitted by
// tools/palworld/dungeon_layouts.py) -------------------------------------
// One entry per World Partition data-layer variant of a random dungeon:
// `dungeon` is the SpawnAreaId (join key into dungeons.json), `variant` the
// layer suffix (page id). Points are world-space centimetres; the plot
// normalizes to the layout's own bounds (image convention, no Y flip).

export type LayoutPointKind = 'reward' | 'enemy' | 'chest' | 'exit' | 'bossDoor' | 'gather'

export interface LayoutPoint {
  kind: LayoutPointKind
  /** reward: easy|medium|hard|bonus · enemy: normal|floor2..4|midBoss|
   *  fishing|monster|human|boss|base · chest: normal|special · gather:
   *  coal|copper|sulfur|quartz|stone|mushroom|crystal|lotus|junk|fishing */
  sub: string | null
  x: number
  y: number
  z: number
}

export interface DungeonLayout {
  dungeon: string
  variant: string
  points: LayoutPoint[]
}

export interface DungeonLayoutsFile {
  layouts: DungeonLayout[]
}

let cached: Promise<DungeonLayoutsFile> | null = null

/** Load (and cache) the layout dataset — no locale dimension. */
export function loadDungeonLayouts(): Promise<DungeonLayoutsFile> {
  if (!cached) {
    cached = fetch(dataUrl('dungeon-layouts.json')).then((r) => {
      if (!r.ok) throw new Error(`dungeon-layouts.json: ${r.status}`)
      return r.json() as Promise<DungeonLayoutsFile>
    })
  }
  return cached
}

/** Layouts grouped per dungeon, variants in emitted (sorted) order. */
export function layoutsByDungeon(file: DungeonLayoutsFile): Map<string, DungeonLayout[]> {
  const out = new Map<string, DungeonLayout[]>()
  for (const lay of file.layouts) {
    let list = out.get(lay.dungeon)
    if (!list) out.set(lay.dungeon, (list = []))
    list.push(lay)
  }
  return out
}

export interface LayoutBounds {
  minX: number
  minY: number
  width: number
  height: number
}

/** XY bounding box with `pad` (fraction of the larger side) on every edge. */
export function layoutBounds(points: LayoutPoint[], pad = 0.05): LayoutBounds {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  if (minX > maxX) return { minX: 0, minY: 0, width: 1, height: 1 }
  const margin = Math.max(maxX - minX, maxY - minY, 1) * pad
  return {
    minX: minX - margin,
    minY: minY - margin,
    width: maxX - minX + 2 * margin,
    height: maxY - minY + 2 * margin,
  }
}

/** Point counts per (kind, sub) — legend and gallery-card chips. */
export function pointCounts(points: LayoutPoint[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of points) {
    const key = p.sub ? `${p.kind}.${p.sub}` : p.kind
    out.set(key, (out.get(key) ?? 0) + 1)
  }
  return out
}
