import { describe, it, expect } from 'vitest'

import { makeEngine, type BreedingData } from './breeding'

/**
 * Rank-average tie-break regression.
 *
 * On an equal-distance tie the game takes the HIGHER CombiRank (round half up,
 * matching the +1 in `target`). Both scenarios below are genuine ties verified
 * against in-game hatches; each rules out a wrong rule we shipped earlier:
 *
 *   Case 1 — Relaxaurus (rank 1090) × Broncherry (1380), target 1235:
 *     Palumba  (No.106, 1240, idx 650)  ← higher rank + lower Paldeck (wins)
 *     Nitemary (No.148, 1230, idx 537)  ← lower idx  → the old idx tie-break trap
 *
 *   Case 2 — ElecPanda (1020) × Deer Ground (2580), target 1800:
 *     WhiteMoth (No.116, 1810, idx 434) ← higher rank (wins)
 *     QueenBee  (No.068, 1790, idx 453) ← lower Paldeck → the Paldeck tie-break trap
 *
 * Only "higher rank wins" satisfies both.
 *
 * The engine now reads the game's own tie-break column, CombiDuplicatePriority
 * (`dup`), DESCENDING — for every eligible pal it equals rank×100, so these two
 * in-game-verified cases still pin the behavior (fixtures omit `dup` and use the
 * rank×100 fallback). The last suite pins that `dup` beats rank when they diverge.
 */
const data: BreedingData = {
  pals: [
    { id: 'ElecPanda', zukanIndex: 185, zukanIndexSuffix: '', icon: '', rank: 1020, idx: 361, breedChild: true },
    { id: 'DeerGround', zukanIndex: 32, zukanIndexSuffix: 'B', icon: '', rank: 2580, idx: 358, breedChild: true },
    { id: 'Relaxaurus', zukanIndex: 94, zukanIndexSuffix: '', icon: '', rank: 1090, idx: 407, breedChild: true },
    { id: 'Broncherry', zukanIndex: 108, zukanIndexSuffix: '', icon: '', rank: 1380, idx: 426, breedChild: true },
    { id: 'QueenBee', zukanIndex: 68, zukanIndexSuffix: '', icon: '', rank: 1790, idx: 453, breedChild: true },
    { id: 'Palumba', zukanIndex: 106, zukanIndexSuffix: '', icon: '', rank: 1240, idx: 650, breedChild: true },
    { id: 'Nitemary', zukanIndex: 148, zukanIndexSuffix: '', icon: '', rank: 1230, idx: 537, breedChild: true },
    { id: 'WhiteMoth', zukanIndex: 116, zukanIndexSuffix: '', icon: '', rank: 1810, idx: 434, breedChild: true },
  ],
  combos: [],
}

describe('makeEngine rank-average tie-break (higher CombiRank wins)', () => {
  it('Case 1: picks Palumba over lower-idx Nitemary', () => {
    const engine = makeEngine(data)
    expect(engine.childOf('Relaxaurus', 'Broncherry').map((c) => c.c)).toEqual(['Palumba'])
  })

  it('Case 2: picks WhiteMoth over lower-Paldeck QueenBee', () => {
    const engine = makeEngine(data)
    expect(engine.childOf('ElecPanda', 'DeerGround').map((c) => c.c)).toEqual(['WhiteMoth'])
  })

  it('is order-independent', () => {
    const engine = makeEngine(data)
    expect(engine.childOf('Broncherry', 'Relaxaurus').map((c) => c.c)).toEqual(['Palumba'])
    expect(engine.childOf('DeerGround', 'ElecPanda').map((c) => c.c)).toEqual(['WhiteMoth'])
  })
})

describe('makeEngine tie-break follows CombiDuplicatePriority when it diverges from rank', () => {
  it('an explicit higher dup beats the higher rank', () => {
    // Same tie as Case 1 (target 1235, Palumba 1240 vs Nitemary 1230), but with
    // authored dup values inverting the rank order: Nitemary must win.
    const diverged: BreedingData = {
      pals: data.pals.map((p) =>
        p.id === 'Nitemary' ? { ...p, dup: 999999 } : p.id === 'Palumba' ? { ...p, dup: 1 } : p,
      ),
      combos: [],
    }
    const engine = makeEngine(diverged)
    expect(engine.childOf('Relaxaurus', 'Broncherry').map((c) => c.c)).toEqual(['Nitemary'])
  })
})
