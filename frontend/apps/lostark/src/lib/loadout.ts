import type { EngravingSlot, GemSlot, Loadout, Role } from '@/calc/types'

export const STORAGE_KEY = 'lostark.loadout.v1'
export const SCHEMA_VERSION = 1
/** The game caps a build at 11 gems. */
export const GEM_SLOTS = 11
/** Five accessories, three affix lines each. */
export const ACCESSORY_LINES = 15
/** Five engraving slots. */
export const ENGRAVING_SLOTS = 5
/** Three bracelet lines. */
export const BRACELET_LINES = 3
/** The four avatar slots the client gives a main-stat bonus: head, upper, lower, weapon. */
export const AVATAR_SLOTS = 4
/** Combat-trait indices the client defines (1 会心 … 6 异化), for import validation. */
export const COMBAT_STAT_INDICES = ['1', '2', '3', '4', '5', '6']

export function defaultLoadout(): Loadout {
  return {
    classId: 102,
    subclassIndex: 0,
    role: 'dps',
    combatLevel: 70,
    itemLevel: 1640,
    armourGroup: '',
    weaponId: '',
    weaponQuality: 0,
    arkEvolution: 0,
    arkEnlightenment: 0,
    arkLeap: 0,
    karmaEvolutionStage: 0,
    karmaLeapLevel: 0,
    cores: Array.from({ length: 6 }, () => ({ id: '', optionIndex: 0 })),
    gems: Array.from({ length: GEM_SLOTS }, () => ({ tier: '', level: 1 })),
    accessoryLines: Array.from({ length: ACCESSORY_LINES }, () => ''),
    braceletLines: Array.from({ length: BRACELET_LINES }, () => ''),
    engravings: Array.from({ length: ENGRAVING_SLOTS }, () => ({
      name: '', grade: 0, book: 0, stone: 0,
    })),
    avatars: Array.from({ length: AVATAR_SLOTS }, () => ''),
    // Empty rather than pre-filled: the client carries a per-point rate and no base
    // trait total, so there is no number here we could source. The user reads their
    // own totals off the game's 战斗特性 panel.
    combatStats: {},
    // Deprecated; here only so the engine and App still compile until they move to
    // combatStats. See Loadout.roster.
    chosenWeaponId: '',
    cardSetId: '',
    cardStage: 0,
    petRanchId: '',
    orbId: '',
  }
}

const ROLES: Role[] = ['dps', 'support']

/**
 * Coerce arbitrary parsed JSON into a Loadout, reporting what it rejected.
 *
 * Import validates before applying: silently merging a stale or hand-edited file
 * is how you end up with a score you cannot explain.
 */
export function parseLoadout(input: unknown): { loadout: Loadout; rejected: string[] } {
  const base = defaultLoadout()
  const rejected: string[] = []
  if (typeof input !== 'object' || input === null) {
    return { loadout: base, rejected: ['file is not a JSON object'] }
  }
  const raw = input as Record<string, unknown>

  const num = (key: keyof Loadout, min: number, max: number) => {
    const v = raw[key]
    if (v === undefined) return
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      rejected.push(`${key}: not a number`)
      return
    }
    if (v < min || v > max) {
      rejected.push(`${key}: ${v} outside ${min}..${max}`)
      return
    }
    ;(base[key] as number) = v
  }
  const str = (key: keyof Loadout) => {
    const v = raw[key]
    if (v === undefined) return
    if (typeof v !== 'string') {
      rejected.push(`${key}: not a string`)
      return
    }
    ;(base[key] as string) = v
  }

  if (raw.role !== undefined) {
    if (ROLES.includes(raw.role as Role)) base.role = raw.role as Role
    else rejected.push(`role: ${String(raw.role)}`)
  }

  num('combatLevel', 55, 70)
  num('itemLevel', 0, 9999)
  num('weaponQuality', 0, 100)
  num('arkEvolution', 0, 999)
  num('arkEnlightenment', 0, 999)
  num('arkLeap', 0, 999)
  num('karmaEvolutionStage', 0, 99)
  num('karmaLeapLevel', 0, 999)
  num('cardStage', 0, 6)
  num('classId', 0, 999)
  num('subclassIndex', 0, 1)
  str('armourGroup')
  str('weaponId')
  str('chosenWeaponId')
  str('cardSetId')
  str('petRanchId')
  str('orbId')

  if (raw.cores !== undefined) {
    const cores = raw.cores
    if (!Array.isArray(cores)) {
      rejected.push('cores: not an array')
    } else {
      base.cores = base.cores.map((slot, i) => {
        const c = cores[i] as Record<string, unknown> | undefined
        if (!c || typeof c !== 'object') return slot
        const id = typeof c.id === 'string' ? c.id : ''
        const idx =
          typeof c.optionIndex === 'number' && c.optionIndex >= 0 && c.optionIndex <= 6
            ? c.optionIndex
            : 0
        if (c.optionIndex !== undefined && idx !== c.optionIndex) {
          rejected.push(`cores[${i}].optionIndex: ${String(c.optionIndex)}`)
        }
        return { id, optionIndex: idx }
      })
    }
  }

  if (raw.braceletLines !== undefined) {
    const bl = raw.braceletLines
    if (!Array.isArray(bl)) rejected.push('braceletLines: not an array')
    else base.braceletLines = base.braceletLines.map((d, i) =>
      typeof bl[i] === 'string' ? (bl[i] as string) : d,
    )
  }

  if (raw.engravings !== undefined) {
    const eng = raw.engravings
    if (!Array.isArray(eng)) {
      rejected.push('engravings: not an array')
    } else {
      base.engravings = base.engravings.map((slot, i): EngravingSlot => {
        const e = eng[i] as Record<string, unknown> | undefined
        if (!e || typeof e !== 'object') return slot
        const clamp = (v: unknown, key: string) => {
          if (typeof v !== 'number' || v < 0 || v > 4) {
            if (v !== undefined) rejected.push(`engravings[${i}].${key}: ${String(v)}`)
            return 0
          }
          return v
        }
        /**
         * Grade must be on the growth ladder, not merely 0-4.
         *
         * The growth code is `20*stone + 1 + 4*(grade-2) + level`. Grade 1
         * (基本) is NOT on the ladder — the picker never offers it — and feeding
         * it in shifts the code down by four: with book 4 it lands on 21/41/61/81,
         * which are real cells the UI can never select, so the score comes out
         * WRONG rather than zero. Lower books go negative. Reject it here, at the
         * trust boundary, rather than letting an imported file compute from a
         * cell that belongs to a different loadout.
         */
        const gradeOf = (v: unknown) => {
          if (v === undefined) return 0
          if (typeof v !== 'number' || ![0, 2, 3, 4].includes(v)) {
            rejected.push(`engravings[${i}].grade: ${String(v)}`)
            return 0
          }
          return v
        }
        const grade = gradeOf(e.grade)
        return {
          name: typeof e.name === 'string' ? e.name : '',
          grade,
          // The code has no level 0 within a grade, so a graded slot needs at
          // least 1; an ungraded slot keeps 0.
          book: grade ? Math.max(1, clamp(e.book, 'book')) : clamp(e.book, 'book'),
          stone: clamp(e.stone, 'stone'),
        }
      })
    }
  }

  if (raw.avatars !== undefined) {
    const av = raw.avatars
    if (!Array.isArray(av)) {
      rejected.push('avatars: not an array')
    } else {
      base.avatars = base.avatars.map((d, i) => {
        const v = av[i]
        if (typeof v !== 'string') return d
        // Legacy files stored the fan site's tier NAME (无 / 稀有 / 英雄 / 传说).
        // An id is `<slot>-<grade>` now, so a bare name would look valid, resolve to
        // no option and quietly score zero. Named rather than dropped.
        if (v && !/^[a-z_]+-\d+$/.test(v)) {
          rejected.push(`avatars[${i}]: ${v} is not a slot-and-grade id`)
          return d
        }
        return v
      })
    }
  }

  /**
   * `combatStats` replaced `roster`, and the two are NOT interchangeable.
   *
   * A `roster` value was a delta on top of the fan site's assumed 2160 base; a
   * `combatStats` value is the character's whole total. Carrying the old numbers
   * across would silently understate the score by that base, so an exported file
   * from before the change has its three numbers rejected by name rather than
   * migrated — the user re-reads them off the game panel, which is where they were
   * always meant to come from.
   */
  if (raw.roster !== undefined) {
    rejected.push('roster: replaced by combatStats (totals, not roster-only deltas)')
  }

  if (raw.combatStats !== undefined) {
    const stats = raw.combatStats as Record<string, unknown> | undefined
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
      rejected.push('combatStats: not an object')
    } else {
      for (const [key, v] of Object.entries(stats)) {
        if (!COMBAT_STAT_INDICES.includes(key)) {
          rejected.push(`combatStats.${key}: not a combat-trait index`)
        } else if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 99999) {
          rejected.push(`combatStats.${key}: ${String(v)}`)
        } else {
          base.combatStats[key] = v
        }
      }
    }
  }

  if (raw.accessoryLines !== undefined) {
    const lines = raw.accessoryLines
    if (!Array.isArray(lines)) {
      rejected.push('accessoryLines: not an array')
    } else {
      base.accessoryLines = base.accessoryLines.map((slot, i) =>
        typeof lines[i] === 'string' ? (lines[i] as string) : slot,
      )
    }
  }

  if (raw.gems !== undefined) {
    const gems = raw.gems
    if (!Array.isArray(gems)) {
      rejected.push('gems: not an array')
    } else {
      base.gems = base.gems.map((slot, i): GemSlot => {
        const g = gems[i] as Record<string, unknown> | undefined
        if (!g || typeof g !== 'object') return slot
        const tier = g.tier === '3' || g.tier === '4' ? g.tier : ''
        if (g.tier !== undefined && g.tier !== '' && tier === '') {
          rejected.push(`gems[${i}].tier: ${String(g.tier)}`)
        }
        const level =
          typeof g.level === 'number' && g.level >= 1 && g.level <= 10 ? g.level : 1
        return { tier, level }
      })
    }
  }

  return { loadout: base, rejected }
}

export function restoreLoadout(): Loadout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultLoadout()
    return parseLoadout(JSON.parse(raw)).loadout
  } catch {
    return defaultLoadout()
  }
}

export function exportLoadout(loadout: Loadout): string {
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...loadout }, null, 2)
}
