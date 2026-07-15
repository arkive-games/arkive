import { orient, type BreedingData, type BreedingEngine, type Combo } from './breeding'

// ---------------------------------------------------------------------------
// Multi-generation planner: every breeding chain from an owned Parent A to a
// target Child C within a generation budget. One chain per *species path*
// (A → B → C, A → B → D → C); each step carries every usable partner option,
// since enumerating concrete partner pairs explodes combinatorially
// (~10k for a mid-rank target at 3 generations).

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

/** 1–3 linked steps: steps[i].child === steps[i+1].fixed; the last child is C. */
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
 * (each oriented with that parent in slot a). Full unordered-pair scan, same
 * cost shape as `buildChildIndex` (~n²/2 resolutions, built per query).
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
 * All chains from `aId` to `cId` within `maxGen` breeding steps, shortest
 * first (then roster order of the intermediates, mirroring the recipe list).
 *
 * Intermediates must be distinct from A, C and each other (no cycles, no
 * self-steps); partners are unrestricted. 3-step chains apply a detour filter:
 * a path `A → B → D → C` is dropped when B can make C directly, or when D is a
 * direct child of A — either way a strictly shorter listed chain covers it.
 * Measured on the real roster this cuts mid-rank noise ~100× (10 317 → 108)
 * while keeping every path to shortcut-free targets.
 */
export function findChains(
  engine: BreedingEngine,
  data: BreedingData,
  aId: string,
  cId: string,
  maxGen: 1 | 2 | 3,
): BreedChain[] {
  const roster = new Map(data.pals.map((p, i) => [p.id, i]))
  const byRoster = (x: string, y: string) =>
    (roster.get(x) ?? Number.MAX_SAFE_INTEGER) - (roster.get(y) ?? Number.MAX_SAFE_INTEGER)

  const parents = parentsOf(engine, data, cId)
  const out: BreedChain[] = []

  const direct = parents.get(aId)
  if (direct) out.push({ steps: [{ fixed: aId, child: cId, partners: direct }] })
  if (maxGen < 2) return out

  const childrenA = childrenOf(engine, data, aId)
  const mids = [...childrenA.keys()].filter((b) => b !== aId && b !== cId).sort(byRoster)

  for (const b of mids) {
    const last = parents.get(b)
    if (!last) continue
    out.push({
      steps: [
        { fixed: aId, child: b, partners: childrenA.get(b)! },
        { fixed: b, child: cId, partners: last },
      ],
    })
  }
  if (maxGen < 3) return out

  for (const b of mids) {
    // Detour: B already breeds C directly, so any longer path through B is
    // dominated by the 2-step chain above.
    if (parents.has(b)) continue
    const childrenB = childrenOf(engine, data, b)
    const seconds = [...childrenB.keys()]
      // Detour: D reachable from A in one step is covered by A → D → C.
      .filter((d) => d !== aId && d !== b && d !== cId && !childrenA.has(d))
      .sort(byRoster)
    for (const d of seconds) {
      const last = parents.get(d)
      if (!last) continue
      out.push({
        steps: [
          { fixed: aId, child: b, partners: childrenA.get(b)! },
          { fixed: b, child: d, partners: childrenB.get(d)! },
          { fixed: d, child: cId, partners: last },
        ],
      })
    }
  }
  return out
}
