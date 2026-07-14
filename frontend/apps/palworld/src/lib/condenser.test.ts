import { describe, expect, it } from 'vitest'
import { simulateCondense } from './condenser'

/** Shorthand: stars that fed a work type, e.g. [1, 4]. */
function stars(res: ReturnType<typeof simulateCondense>, w: string) {
  return res.get(w as never)?.stars.map((s) => s.star) ?? []
}

describe('simulateCondense', () => {
  it('single suitability gets every star (+4 total), matching in-game test', () => {
    const res = simulateCondense({ MonsterFarm: 1 }, 'MonsterFarm')
    const e = res.get('MonsterFarm')!
    expect(e.base).toBe(1)
    expect(e.final).toBe(5)
    expect(stars(res, 'MonsterFarm')).toEqual([1, 2, 3, 4])
  })

  it('Anubis: stars walk down the top three levels, then +1 all', () => {
    const res = simulateCondense(
      { Handcraft: 6, Mining: 3, Transport: 2 },
      'Handcraft',
    )
    expect(res.get('Handcraft')).toMatchObject({ base: 6, final: 8 })
    expect(res.get('Mining')).toMatchObject({ base: 3, final: 5 })
    expect(res.get('Transport')).toMatchObject({ base: 2, final: 4 })
    expect(stars(res, 'Handcraft')).toEqual([1, 4])
    expect(stars(res, 'Mining')).toEqual([2, 4])
    expect(stars(res, 'Transport')).toEqual([3, 4])
    // per-star from/to bookkeeping
    expect(res.get('Handcraft')!.stars).toEqual([
      { star: 1, from: 6, to: 7 },
      { star: 4, from: 7, to: 8 },
    ])
  })

  it('two suitabilities: best gets stars 1 and 3, the other star 2', () => {
    // Bastet: Collection 1, MonsterFarm 1 (best)
    const res = simulateCondense({ Collection: 1, MonsterFarm: 1 }, 'MonsterFarm')
    expect(stars(res, 'MonsterFarm')).toEqual([1, 3, 4])
    expect(stars(res, 'Collection')).toEqual([2, 4])
    expect(res.get('MonsterFarm')!.final).toBe(4)
    expect(res.get('Collection')!.final).toBe(3)
  })

  it('best below another level (Serpent): star 2 falls back to best when levels tie', () => {
    // Serpent: Watering 3, MonsterFarm 2 (best). After star 1 both sit at 3,
    // so there is no 2nd distinct level and star 2 falls back to best too.
    const res = simulateCondense({ Watering: 3, MonsterFarm: 2 }, 'MonsterFarm')
    expect(stars(res, 'MonsterFarm')).toEqual([1, 2, 3, 4])
    expect(stars(res, 'Watering')).toEqual([4])
    expect(res.get('MonsterFarm')!.final).toBe(6)
    expect(res.get('Watering')!.final).toBe(4)
  })

  it('ties resolve by the fixed priority order (enum order)', () => {
    // Three suits all level 1, best = MonsterFarm (last in priority order).
    // Star 2 targets the 2nd-highest distinct level (1) — first in priority
    // order among {Handcraft, Transport} is Handcraft. Star 3 (3 suits,
    // distinct levels [2, 1], k=2 misses → k=1 → level 1) → Transport.
    const res = simulateCondense(
      { Handcraft: 1, Transport: 1, MonsterFarm: 1 },
      'MonsterFarm',
    )
    expect(stars(res, 'MonsterFarm')).toEqual([1, 4])
    expect(stars(res, 'Handcraft')).toEqual([2, 4])
    expect(stars(res, 'Transport')).toEqual([3, 4])
  })

  it('OilExtraction is never star-targeted but still gets the star-4 +1', () => {
    // Oil's level joins the distinct-value list (level 2 here) but the
    // candidate scan skips it: star 2 picks the *priority-order* holder of
    // the 2nd-highest distinct level. After star 1 (EmitFlame 3→4), distinct
    // levels are [4, 2, 1]; level 2 is held only by OilExtraction, so no
    // candidate matches and the pick falls back to best.
    const res = simulateCondense(
      { EmitFlame: 3, OilExtraction: 2, Watering: 1 },
      'EmitFlame',
    )
    expect(stars(res, 'OilExtraction')).toEqual([4])
    expect(stars(res, 'EmitFlame')).toEqual([1, 2, 4])
    // star 3: distinct [5, 2, 1], k=2 → level 1 → Watering
    expect(stars(res, 'Watering')).toEqual([3, 4])
  })

  it('ignores zero/absent levels and returns an empty map for workless pals', () => {
    expect(simulateCondense({}, 'Handcraft').size).toBe(0)
    const res = simulateCondense({ Handcraft: 2, Mining: 0 }, 'Handcraft')
    expect(res.has('Mining')).toBe(false)
  })

  it('falls back to the highest-priority top-level suitability when bestWork is absent', () => {
    // Defensive: bestWork not among the pal's suitabilities (unreachable with
    // current data). The binary's DB fallback picks the highest level.
    const res = simulateCondense({ Mining: 2, Cool: 2 }, 'Watering')
    expect(stars(res, 'Mining')).toEqual([1, 3, 4])
    expect(stars(res, 'Cool')).toEqual([2, 4])
  })
})
