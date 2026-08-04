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
      name: '', book: 0, stone: 0,
    })),
    avatars: ['无', '无', '无', '无'],
    roster: { crit: 0, spec: 0, swift: 0 },
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
        return {
          name: typeof e.name === 'string' ? e.name : '',
          book: clamp(e.book, 'book'),
          stone: clamp(e.stone, 'stone'),
        }
      })
    }
  }

  if (raw.avatars !== undefined) {
    const av = raw.avatars
    if (!Array.isArray(av)) rejected.push('avatars: not an array')
    else base.avatars = base.avatars.map((d, i) => (typeof av[i] === 'string' ? (av[i] as string) : d))
  }

  if (raw.roster !== undefined) {
    const r = raw.roster as Record<string, unknown> | undefined
    if (!r || typeof r !== 'object') {
      rejected.push('roster: not an object')
    } else {
      for (const key of ['crit', 'spec', 'swift'] as const) {
        const v = r[key]
        if (v === undefined) continue
        if (typeof v !== 'number' || v < 0 || v > 99999) rejected.push(`roster.${key}: ${String(v)}`)
        else base.roster[key] = v
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
