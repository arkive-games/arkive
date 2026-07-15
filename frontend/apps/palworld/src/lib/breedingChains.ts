import { orient, type BreedingData, type BreedingEngine, type Combo } from './breeding'

// ---------------------------------------------------------------------------
// Multi-generation planner: every breeding chain from an owned Parent A to a
// target Child C within a generation budget. One chain per *species path*;
// each step carries every usable partner option.

/**
 * One breeding step: `fixed` (the Pal carried from the previous step, or A)
 * paired with any of `partners` to produce `child`. Every partner Combo is
 * oriented with `fixed` in slot a (genders travel), partners in roster order.
 */
export interface ChainStep {
  fixed: string
  child: string
  partners: Combo[]
}

/** 1–6 linked steps: steps[i].child === steps[i+1].fixed; the last child is C. */
export interface BreedChain {
  steps: ChainStep[]
}

/**
 * Every child obtainable by pairing `palId` with the whole roster, mapped to
 * the combos producing it (oriented with `palId` in slot a). The Pal itself is
 * excluded — a step that produces its own input advances nothing.
 */
export function childrenOf(engine: BreedingEngine, data: BreedingData, palId: string): Map<string, Combo[]> {
  const out = new Map<string, Combo[]>()
  for (const p of data.pals) {
    for (const f of engine.childOf(palId, p.id)) {
      if (f.c === palId) continue
      const oriented = orient(f, palId, 'a')
      const list = out.get(f.c)
      if (list) list.push(oriented)
      else out.set(f.c, [oriented])
    }
  }
  return out
}

/**
 * Every parent that can produce `childId`, mapped to its partner combos
 * (each oriented with that parent in slot a). Full unordered-pair scan.
 */
export function parentsOf(engine: BreedingEngine, data: BreedingData, childId: string): Map<string, Combo[]> {
  const out = new Map<string, Combo[]>()
  const add = (parent: string, f: Combo) => {
    const oriented = orient(f, parent, 'a')
    const list = out.get(parent)
    if (list) list.push(oriented)
    else out.set(parent, [oriented])
  }
  const pals = data.pals
  for (let i = 0; i < pals.length; i++) {
    for (let k = i; k < pals.length; k++) {
      for (const f of engine.childOf(pals[i].id, pals[k].id)) {
        if (f.c !== childId) continue
        add(f.a, f)
        if (f.a !== f.b) add(f.b, f)
      }
    }
  }
  return out
}

/**
 * Backward BFS from `targetId`: dist[X] = minimum breeding steps from X to
 * reach targetId. Unreachable pals (legendaries, etc.) are absent from the map.
 */
export function bfsDistToTarget(
  engine: BreedingEngine,
  data: BreedingData,
  targetId: string,
): Map<string, number> {
  const dist = new Map<string, number>([[targetId, 0]])
  const queue: string[] = [targetId]
  while (queue.length) {
    const cur = queue.shift()!
    const d = dist.get(cur)!
    for (const p of data.pals) {
      if (dist.has(p.id)) continue
      if (childrenOf(engine, data, p.id).has(cur)) {
        dist.set(p.id, d + 1)
        queue.push(p.id)
      }
    }
  }
  return dist
}

/**
 * Forward BFS from `sourceId`: dist[X] = minimum breeding steps from
 * sourceId to reach X. Uses memoized childrenOf maps.
 */
function bfsDistFromSource(
  engine: BreedingEngine,
  data: BreedingData,
  sourceId: string,
): Map<string, number> {
  const dist = new Map<string, number>([[sourceId, 0]])
  const queue: string[] = [sourceId]
  while (queue.length) {
    const cur = queue.shift()!
    const d = dist.get(cur)!
    for (const [child] of childrenOf(engine, data, cur)) {
      if (!dist.has(child)) {
        dist.set(child, d + 1)
        queue.push(child)
      }
    }
  }
  return dist
}

/**
 * All chains from `aId` to `cId` within `maxGen` breeding steps, grouped by
 * length (shortest first), then intermediates in roster order.
 *
 * **Filter (exact-distance + dominance):** at depth k in a chain of exactly n
 * steps, an intermediate B is included only when:
 *   - distToC[B] == n - k - 1 (B is exactly on the optimal path for this length)
 *   - distFromA[B] >= k + 1   (no shorter chain shares the same prefix through B)
 *
 * This reproduces the current two-clause detour filter exactly for n=2,3, and
 * generalises it correctly to n=4–6. The two BFS precomputations add ~10 ms per
 * query on the real 286-pal roster (both O(n²), memoized).
 */
export function findChains(
  engine: BreedingEngine,
  data: BreedingData,
  aId: string,
  cId: string,
  maxGen: 1 | 2 | 3 | 4 | 5 | 6,
): BreedChain[] {
  const roster = new Map(data.pals.map((p, i) => [p.id, i]))
  const byRoster = (x: string, y: string) =>
    (roster.get(x) ?? Number.MAX_SAFE_INTEGER) - (roster.get(y) ?? Number.MAX_SAFE_INTEGER)

  const distToC = bfsDistToTarget(engine, data, cId)
  const distFromA = bfsDistFromSource(engine, data, aId)

  // Memoize childrenOf so each pal's children are computed at most once.
  const childCache = new Map<string, Map<string, Combo[]>>()
  const children = (id: string) => {
    if (childCache.has(id)) return childCache.get(id)!
    const c = childrenOf(engine, data, id)
    childCache.set(id, c)
    return c
  }

  const parC = parentsOf(engine, data, cId)
  const out: BreedChain[] = []
  const path: ChainStep[] = []
  const visited = new Set<string>([aId])

  function dfs(cur: string, depth: number, n: number): void {
    if (depth === n - 1) {
      const last = parC.get(cur)
      if (last) out.push({ steps: [...path, { fixed: cur, child: cId, partners: last }] })
      return
    }
    const kids = children(cur)
    const rem = n - depth - 1
    const mids = [...kids.keys()]
      .filter((b) => {
        if (b === cId || visited.has(b)) return false
        if ((distToC.get(b) ?? Infinity) !== rem) return false
        if ((distFromA.get(b) ?? Infinity) < depth + 1) return false
        return true
      })
      .sort(byRoster)
    for (const b of mids) {
      path.push({ fixed: cur, child: b, partners: kids.get(b)! })
      visited.add(b)
      dfs(b, depth + 1, n)
      visited.delete(b)
      path.pop()
    }
  }

  for (let n = 1; n <= maxGen; n++) {
    dfs(aId, 0, n)
  }

  return out
}
