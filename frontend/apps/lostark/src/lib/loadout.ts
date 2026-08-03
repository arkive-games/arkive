import type { GemSlot, Loadout, Role, SupportClass } from '@/calc/types'

export const STORAGE_KEY = 'lostark.loadout.v1'
export const SCHEMA_VERSION = 1
/** The game caps a build at 11 gems. */
export const GEM_SLOTS = 11
/** Five accessories, three affix lines each. */
export const ACCESSORY_LINES = 15

export function defaultLoadout(): Loadout {
  return {
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
    chosenWeaponId: '',
    cardSetId: '',
    cardStage: 0,
    petRanchId: '',
    orbId: '',
    supportClass: 'bard',
  }
}

const ROLES: Role[] = ['dps', 'support']
const CLASSES: SupportClass[] = ['bard', 'paladin']

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
  if (raw.supportClass !== undefined) {
    if (CLASSES.includes(raw.supportClass as SupportClass)) {
      base.supportClass = raw.supportClass as SupportClass
    } else rejected.push(`supportClass: ${String(raw.supportClass)}`)
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
