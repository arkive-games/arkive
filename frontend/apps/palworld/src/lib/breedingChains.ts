import { orient, type BreedingData, type BreedingEngine, type Combo } from './breeding'

// ---------------------------------------------------------------------------
// Multi-generation planner: every breeding chain from an owned Parent A to a
// target Child C within a generation budget. One chain per *species path*;
// each step carries every usable partner option.

// Module-level cache keyed by engine instance (WeakMap so entries are GC'd
// automatically when a new engine is created after a data reload). Shared
// across all findChains / bfsDist calls — each pal's children are computed
// at most once per engine, reducing repeated O(n) engine.childOf scans.
const engineChildCache = new WeakMap<BreedingEngine, Map<string, Map<string, Combo[]>>>()

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

/**
 * 1–6 linked steps: steps[i].child === steps[i+1].fixed; the last child is C.
 *
 * Treat chains as immutable: partner arrays alias the engine-lifetime cache,
 * and sibling chains share their common-prefix step objects. Mutating either
 * would corrupt every other chain (and all future queries) for this engine.
 */
export interface BreedChain {
  steps: ChainStep[]
}

/**
 * Every child obtainable by pairing `palId` with the whole roster, mapped to
 * the combos producing it (oriented with `palId` in slot a). The Pal itself is
 * excluded — a step that produces its own input advances nothing.
 *
 * Results are memoized per engine instance so each pal is computed at most once
 * per session (WeakMap key → auto-cleared when a new engine is created).
 */
export function childrenOf(engine: BreedingEngine, data: BreedingData, palId: string): Map<string, Combo[]> {
  let byPal = engineChildCache.get(engine)
  if (!byPal) { byPal = new Map(); engineChildCache.set(engine, byPal) }
  let cached = byPal.get(palId)
  if (cached) return cached
  cached = new Map<string, Combo[]>()
  for (const p of data.pals) {
    for (const f of engine.childOf(palId, p.id)) {
      if (f.c === palId) continue
      const oriented = orient(f, palId, 'a')
      const list = cached.get(f.c)
      if (list) list.push(oriented)
      else cached.set(f.c, [oriented])
    }
  }
  byPal.set(palId, cached)
  return cached
}

/**
 * Every parent that can produce `childId`, mapped to its partner combos
 * (each oriented with that parent in slot a). Built from the memoized
 * childrenOf maps — O(n) instead of the O(n²) pair scan.
 *
 * The self-pair (A+A=A) is handled separately because childrenOf excludes
 * self-children (`f.c === palId`), but parentsOf(A) must include A itself.
 */
export function parentsOf(engine: BreedingEngine, data: BreedingData, childId: string): Map<string, Combo[]> {
  const out = new Map<string, Combo[]>()
  for (const p of data.pals) {
    const combos = childrenOf(engine, data, p.id).get(childId)
    if (combos) out.set(p.id, [...combos])
  }
  // Same-species self-pair: A+A=A. childrenOf excludes self-children (and keys
  // any pal-X-produces-childId combo under X), so childId has no entry yet.
  const selfCombos = engine.childOf(childId, childId).filter((f) => f.c === childId)
  if (selfCombos.length > 0) out.set(childId, selfCombos.map((f) => orient(f, childId, 'a')))
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
 * This reproduces the previous two-clause detour filter exactly for n=2,3, and
 * generalises it to n=4–6. Cost on the real 286-pal roster: ~100 ms for the
 * first query on a fresh engine (fills the childrenOf cache), single-digit ms
 * after that — including the worst known result set (~5.8k chains at gen 6).
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
    const kids = childrenOf(engine, data, cur)
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
