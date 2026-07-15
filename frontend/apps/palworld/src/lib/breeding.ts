import { dataUrl } from './urls'

export type Gender = 'M' | 'F'

export interface BreedingPal {
  id: string
  zukanIndex: number
  zukanIndexSuffix: string
  icon: string
  /** CombiRank (breeding power); lower = rarer. */
  rank: number
  /** DataTable (DT_PalMonsterParameter) row order. Present in the emitted data
   *  but no longer used for the tie-break — the game rounds ties up by rank. */
  idx: number
  /** Eligible as a rank-average child (not a combo-only child, not a legendary). */
  breedChild: boolean
  /** Legendary (self-bred only) — flagged for distinct styling. */
  legendary?: boolean
}

/** A + B = C. `ag`/`bg` mark a gender-specific parent (only two combos have them). */
export interface Combo {
  a: string
  b: string
  c: string
  ag?: Gender
  bg?: Gender
  /** True when this is a hand-authored unique combo (not a rank-average result). */
  unique?: boolean
}

export interface BreedingData {
  pals: BreedingPal[]
  combos: Combo[]
}

/** palId -> localized display name for the current language. */
export type NameMap = Record<string, string>

const j = async <T>(url: string): Promise<T> => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json() as Promise<T>
}

export async function loadBreeding(lng: string): Promise<{ data: BreedingData; names: NameMap }> {
  const [data, names] = await Promise.all([
    j<BreedingData>(dataUrl(`breeding.json`)),
    j<NameMap>(dataUrl(`locales/${lng}/breeding.json`)),
  ])
  return { data, names }
}

export { palIconUrl } from './assets'

export const comboKey = (f: Combo): string => `${f.a}|${f.b}|${f.c}|${f.ag ?? ''}|${f.bg ?? ''}`

/**
 * Order-independent identity for favouriting: A+B=C and B+A=C are the same
 * recipe. Gender travels with its parent, so the two gender-specific combos
 * (Katress♂×Wixen♀ vs Katress♀×Wixen♂) stay distinct — the one special case.
 */
export const favKey = (f: Combo): string => {
  const pa = `${f.a}:${f.ag ?? ''}`
  const pb = `${f.b}:${f.bg ?? ''}`
  const [lo, hi] = pa <= pb ? [pa, pb] : [pb, pa]
  return `${lo}|${hi}=${f.c}`
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * Reorder a recipe so the fixed parent sits in the chosen slot (breeding is
 * order-independent, but the display should keep the parent the user picked on
 * its side). Genders travel with their parent when swapped.
 */
export function orient(f: Combo, fixedId: string, slot: 'a' | 'b'): Combo {
  if (f.a === f.b) return f
  const needSwap = slot === 'a' ? f.a !== fixedId : f.b !== fixedId
  return needSwap ? { ...f, a: f.b, b: f.a, ag: f.bg, bg: f.ag } : f
}

/**
 * Breeding resolver mirroring the game (per tylercamp/palcalc):
 *   1. same species  -> that species
 *   2. unique combo  -> its child (order-independent; two rows are gender-specific)
 *   3. rank-average  -> childRank = floor((rankA + rankB + 1) / 2); the eligible Pal
 *      with the nearest CombiRank, equal-distance ties broken toward the HIGHER
 *      CombiRank (round half up — matching the +1 above and verified in-game).
 * Fallback candidates exclude combo-only children and legendaries (`breedChild`),
 * so you can never breed something rarer than your rarest parent.
 */
export interface BreedingEngine {
  childOf: (aId: string, bId: string) => Combo[]
}

export function makeEngine(data: BreedingData): BreedingEngine {
  const byId = new Map(data.pals.map((p) => [p.id, p]))
  const comboIndex = new Map<string, Combo[]>()
  for (const c of data.combos) {
    const k = pairKey(c.a, c.b)
    const list = comboIndex.get(k)
    if (list) list.push(c)
    else comboIndex.set(k, [c])
  }
  const pool = data.pals.filter((p) => p.breedChild)
  // A recipe is "unique" only when it's a hand-authored combo with two *different*
  // parents — a same-species self-pairing (A+A=A) is never unique, even if the
  // unique table redundantly lists it.
  const uniqueKeys = new Set(data.combos.filter((c) => c.a !== c.b).map(comboKey))
  const tag = (f: Combo): Combo => (f.a !== f.b && uniqueKeys.has(comboKey(f)) ? { ...f, unique: true } : f)

  const childOf = (aId: string, bId: string): Combo[] => {
    let out: Combo[]
    if (aId === bId) {
      out = [{ a: aId, b: bId, c: aId }]
    } else {
      const combo = comboIndex.get(pairKey(aId, bId))
      if (combo) {
        out = combo
      } else {
        const a = byId.get(aId)
        const b = byId.get(bId)
        if (!a || !b) return []
        const target = Math.floor((a.rank + b.rank + 1) / 2)
        // Tie-break: on an equal-distance tie the game takes the HIGHER CombiRank
        // (round half up — the same bias as the +1 in `target`). Verified against
        // in-game hatches. This is NOT DataTable row order (`idx`) nor Paldeck
        // order — both mispredict some ties. Same-rank ties fall back to Paldeck
        // order (ZukanIndex, base form before variant) for determinism.
        const better = (p: BreedingPal, q: BreedingPal): boolean =>
          p.rank !== q.rank
            ? p.rank > q.rank
            : p.zukanIndex !== q.zukanIndex
              ? p.zukanIndex < q.zukanIndex
              : p.zukanIndexSuffix !== q.zukanIndexSuffix
                ? p.zukanIndexSuffix < q.zukanIndexSuffix
                : p.id < q.id
        let best: BreedingPal | null = null
        let bestDist = Infinity
        for (const p of pool) {
          const d = Math.abs(p.rank - target)
          if (d < bestDist || (d === bestDist && best !== null && better(p, best))) {
            bestDist = d
            best = p
          }
        }
        out = best ? [{ a: aId, b: bId, c: best.id }] : []
      }
    }
    return out.map(tag)
  }

  return { childOf }
}

export interface Selection {
  a: string | null
  b: string | null
  c: string | null
}

/**
 * The recipe list for the current selection:
 *  - both parents  -> the resulting child (1, or 2 for the gendered combo)
 *  - one parent    -> that parent paired with every Pal
 *  - child only    -> every parent pair that yields it
 *  - nothing       -> the special (unique) combos, browsable
 * `total` is the full match count; the caller may render a capped slice.
 */
export function queryFormulas(
  engine: BreedingEngine,
  data: BreedingData,
  sel: Selection,
): { list: Combo[]; total: number; browsingSpecial: boolean } {
  const { a, b, c } = sel

  const seen = new Set<string>()
  const out: Combo[] = []
  const add = (f: Combo) => {
    const k = comboKey(f)
    if (seen.has(k)) return
    seen.add(k)
    out.push(f)
  }
  const push = (x: string, y: string) => {
    for (const raw of engine.childOf(x, y)) {
      if (c && raw.c !== c) continue
      // Keep the fixed parent on its own side (A first when A is set, else B).
      const f = a ? orient(raw, a, 'a') : b ? orient(raw, b, 'b') : raw
      add(f)
    }
  }

  let browsingSpecial = false
  if (a && b) {
    push(a, b)
  } else if (a || b) {
    const one = (a ?? b)!
    for (const p of data.pals) push(one, p.id)
  } else if (c) {
    // child only: scan every unordered pair.
    const pals = data.pals
    for (let i = 0; i < pals.length; i++) {
      for (let k = i; k < pals.length; k++) push(pals[i].id, pals[k].id)
    }
  } else {
    // Nothing selected: show only the hand-authored unique recipes (excluding
    // redundant same-species self-pairings).
    browsingSpecial = true
    for (const combo of data.combos) {
      if (combo.a !== combo.b) add({ ...combo, unique: true })
    }
  }

  const rank = new Map(data.pals.map((p, i) => [p.id, i]))
  const r = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER
  out.sort((x, y) => r(x.c) - r(y.c) || r(x.a) - r(y.a) || r(x.b) - r(y.b))
  return { list: out, total: out.length, browsingSpecial }
}

// ---------------------------------------------------------------------------
// Multi-layer breeding tree (drill down into how to breed each parent)

/**
 * One focused recipe in the drill-down tree: parents `a`/`b` (genders only for
 * the two gender-specific combos), plus the recipe chosen for breeding each
 * parent (`l` for `a`, `r` for `b`). The child is never stored — it is
 * re-derived through the engine, which also invalidates stale URLs.
 */
export interface BreedTreeNode {
  a: string
  b: string
  ag?: Gender
  bg?: Gender
  l?: BreedTreeNode
  r?: BreedTreeNode
}

/** Position of a node in the tree: the l/r turns taken from the root. */
export type TreePath = ('l' | 'r')[]

/**
 * child id -> every combo (over all unordered pairs) producing it. Full scan of
 * ~n²/2 pairs — built once and memoized by the caller (only in tree mode).
 * Lists keep the main view's sort (roster order of parent A, then B).
 */
export function buildChildIndex(engine: BreedingEngine, data: BreedingData): Map<string, Combo[]> {
  const index = new Map<string, Combo[]>()
  const pals = data.pals
  for (let i = 0; i < pals.length; i++) {
    for (let k = i; k < pals.length; k++) {
      for (const f of engine.childOf(pals[i].id, pals[k].id)) {
        const list = index.get(f.c)
        if (list) list.push(f)
        else index.set(f.c, [f])
      }
    }
  }
  return index
}

/**
 * Recipes usable to *obtain* `palId`: every pair producing it minus pairs that
 * contain the Pal itself (breeding A from A is no way to get your first A).
 * Legendaries come out empty — they are self-bred only.
 */
export function recipesToBreed(index: Map<string, Combo[]>, palId: string): Combo[] {
  return (index.get(palId) ?? []).filter((f) => f.a !== palId && f.b !== palId)
}

/**
 * The combo a tree node stands for, oriented so `node.a` stays in slot A
 * (genders travel with their parent), or null when the node matches no real
 * recipe — unknown ids, or genders that don't match (the gendered pairs only
 * resolve per gender, so a node for them must carry `ag`/`bg`).
 */
export function resolveNode(engine: BreedingEngine, node: BreedTreeNode): Combo | null {
  for (const f of engine.childOf(node.a, node.b)) {
    if (f.a === node.a && f.b === node.b && f.ag === node.ag && f.bg === node.bg) return f
    if (node.a !== node.b && f.a === node.b && f.b === node.a && f.ag === node.bg && f.bg === node.ag)
      return { ...f, a: f.b, b: f.a, ag: f.bg, bg: f.ag }
  }
  return null
}

/**
 * Deep-validate a tree against loaded data: parents must be real roster ids,
 * every node must resolve to a recipe, and a subtree must produce the parent it
 * hangs under (`l` -> `a`, `r` -> `b`; `expectedChild` applies the same rule to
 * the root when the caller pins it). Invalid subtrees are pruned; an invalid
 * node drops itself (and thus everything below).
 */
export function sanitizeTree(
  engine: BreedingEngine,
  ids: Set<string>,
  node: BreedTreeNode,
  expectedChild?: string,
): BreedTreeNode | undefined {
  if (!ids.has(node.a) || !ids.has(node.b)) return undefined
  const combo = resolveNode(engine, node)
  if (!combo) return undefined
  if (expectedChild !== undefined && combo.c !== expectedChild) return undefined
  const out: BreedTreeNode = { a: node.a, b: node.b }
  if (node.ag) out.ag = node.ag
  if (node.bg) out.bg = node.bg
  const l = node.l ? sanitizeTree(engine, ids, node.l, node.a) : undefined
  const r = node.r ? sanitizeTree(engine, ids, node.r, node.b) : undefined
  if (l) out.l = l
  if (r) out.r = r
  return out
}

/**
 * Immutable subtree replacement at `path`; `sub` undefined clears the slot.
 * A path through a missing node is a no-op (stale click).
 */
export function setSubtree(
  root: BreedTreeNode | undefined,
  path: TreePath,
  sub: BreedTreeNode | undefined,
): BreedTreeNode | undefined {
  if (path.length === 0) return sub
  if (!root) return root
  const [head, ...rest] = path
  if (rest.length > 0 && !root[head]) return root
  const next = rest.length === 0 ? sub : setSubtree(root[head], rest, sub)
  const out = { ...root }
  if (next) out[head] = next
  else delete out[head]
  return out
}

const MAX_TREE_DEPTH = 16

/**
 * Structural parse of the `?tree=` search param (route-level, data-independent;
 * `sanitizeTree` does the data-aware pass once the roster is loaded). A node
 * with bad parents/genders is dropped wholesale; malformed or too-deep subtrees
 * are pruned.
 */
export function parseTreeParam(v: unknown, depth = 0): BreedTreeNode | undefined {
  if (depth >= MAX_TREE_DEPTH) return undefined
  if (typeof v !== 'object' || v === null) return undefined
  const o = v as Record<string, unknown>
  if (typeof o.a !== 'string' || typeof o.b !== 'string') return undefined
  const gender = (x: unknown): Gender | undefined => (x === 'M' || x === 'F' ? x : undefined)
  if ((o.ag !== undefined && !gender(o.ag)) || (o.bg !== undefined && !gender(o.bg))) return undefined
  const out: BreedTreeNode = { a: o.a, b: o.b }
  const ag = gender(o.ag)
  const bg = gender(o.bg)
  if (ag) out.ag = ag
  if (bg) out.bg = bg
  const l = parseTreeParam(o.l, depth + 1)
  const r = parseTreeParam(o.r, depth + 1)
  if (l) out.l = l
  if (r) out.r = r
  return out
}
