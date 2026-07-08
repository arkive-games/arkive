import { describe, it, expect } from 'vitest'

import { makeEngine, type BreedingData } from './breeding'

/**
 * Rank-average tie-break regression.
 *
 * Relaxaurus (No.094, rank 1090) × Broncherry (No.108, rank 1380):
 *   target = floor((1090 + 1380 + 1) / 2) = 1235
 * Two candidates are exactly 5 away — a genuine tie:
 *   Palumba  (No.106, rank 1240)  ← lower Paldeck index
 *   Nitemary (No.148, rank 1230)  ← lower DataTable row (`idx`)
 * The game breaks ties by Paldeck order (earlier index wins), so the child is
 * Palumba. Verified against an in-game hatch. The old code broke ties by `idx`
 * (DataTable row order), which diverges from Paldeck order for Pals added out
 * of order in later patches, and wrongly picked Nitemary.
 */
const data: BreedingData = {
  pals: [
    { id: 'Relaxaurus', zukanIndex: 94, zukanIndexSuffix: '', icon: '', rank: 1090, idx: 407, breedChild: true },
    { id: 'Palumba', zukanIndex: 106, zukanIndexSuffix: '', icon: '', rank: 1240, idx: 650, breedChild: true },
    { id: 'Broncherry', zukanIndex: 108, zukanIndexSuffix: '', icon: '', rank: 1380, idx: 426, breedChild: true },
    // Lower `idx` than Palumba but higher Paldeck index — the old tie-break trap.
    { id: 'Nitemary', zukanIndex: 148, zukanIndexSuffix: '', icon: '', rank: 1230, idx: 537, breedChild: true },
  ],
  combos: [],
}

describe('makeEngine rank-average tie-break', () => {
  it('breaks a distance tie toward the lower Paldeck index, not the lower DataTable row', () => {
    const engine = makeEngine(data)
    const out = engine.childOf('Relaxaurus', 'Broncherry')
    expect(out.map((c) => c.c)).toEqual(['Palumba'])
  })

  it('is order-independent', () => {
    const engine = makeEngine(data)
    expect(engine.childOf('Broncherry', 'Relaxaurus').map((c) => c.c)).toEqual(['Palumba'])
  })
})
