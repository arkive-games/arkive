/**
 * The three panels that used to be fan-site sourced, and now are not.
 *
 * `avatars/options.json`, `combat/stats.json` and `esther/weapons.json` are new
 * files in data-lostark, emitted by `tools/apps/lostark/{avatars,combatstats,esther}.py`.
 * They live here rather than in `data.ts` only because that module is being edited
 * elsewhere; the intent is for `loadDataset` to fold `loadStatPanels` into
 * `Dataset` and for these three interfaces to be its own.
 *
 * `dataUrl` is imported from `data.ts` so the files are cache-busted by the same
 * artifact stamp as everything else. That stamp is set by `loadDataset`, so call
 * this *after* it (or in the same `Promise.all`, which is what the handoff does).
 */

import { dataUrl } from '@/lib/data'

async function json<T>(path: string): Promise<T> {
  const r = await fetch(dataUrl(path))
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`)
  return (await r.json()) as T
}

/** One of the four stat-bearing avatar slots. */
export interface AvatarSlot {
  key: 'head' | 'upper_body' | 'lower_body' | 'weapon'
  /** `tip.name.enum_equipslot_avatar_*` — "头部外观" / "머리 아바타". */
  name_key: string
}

export interface AvatarGrade {
  /** `Item.Grade`: 2 rare, 3 epic, 4 legend. No avatar ships above legend. */
  grade: number
  key: 'rare' | 'epic' | 'legend'
  name_key: string
}

/**
 * One `(slot, grade)` a player can equip.
 *
 * `amp` is a fraction of the character's MAIN STAT, not of combat power: the
 * client's avatar bonus is an `ItemGradeOptionStatic` addon on stat 7/8/9, which
 * are the percentage variants of Str/Agi/Int. It is 0.005 / 0.01 / 0.02 by grade
 * in every slot — the same three numbers the fan site published, now read out of
 * the client instead of copied.
 */
export interface AvatarOption {
  /** `<slot key>-<grade>`, e.g. `head-4`. */
  id: string
  slot_key: string
  grade: number
  grade_key: string
  amp: number
  /** How many avatar items land in this group; the smallest is 4, the largest 8,502. */
  items: number
  /** The main-stat percentage ids seen: a subset of 7 (Str) / 8 (Agi) / 9 (Int). */
  stats: number[]
}

export interface AvatarMeta {
  uiKeys: Record<string, string>
  slots: AvatarSlot[]
  grades: AvatarGrade[]
  options: AvatarOption[]
  /**
   * The 上下装 garment, which fills the upper AND lower slot at once.
   *
   * It has no slot of its own because its amp is exactly `equivalent_to`'s sum —
   * an epic dress is an epic top plus an epic bottom — so offering it would only
   * let a user count the same 2% twice. Kept in the contract because it is the one
   * avatar the fan site's four-slot model cannot express at all.
   */
  combinedSlot: {
    category: number
    grade: number
    amp: number
    items: number
    equivalent_to: string[]
  }
  mainStatPercentStats: Record<string, string>
}

/** One of the six combat traits (战斗特性 / 전투 특성). */
export interface CombatStat {
  /** BattlePoint Type 26's `ValueA`, and the `ArkPassive` node sub-index. */
  index: number
  /** The global stat id the matching ark-passive node grants (15-20). */
  stat: number
  key: string
  name_key: string
}

export interface CombatStatMeta {
  uiKeys: Record<string, string>
  stats: CombatStat[]
}

export interface EstherWeapon {
  item_id: string
  name_key: string
  /** `Item.For<Class>` suffix; kept for traceability, not for display. */
  internal_name: string
}

export interface EstherStage {
  /** Evolution stage as the client displays it: 6 or 8. */
  stage: number
  /** The `chosenWeaponId` this option selects — BattlePoint Type 23's `ValueB`. */
  esther_option_id: string
  evolution_common_id: string
  amp: { dps: number; support: number }
}

/**
 * One generation of Esther weapon: 29 class-specific items and its scored stages.
 *
 * Generations 3 and 4 carry the SAME `esther_option_id`s, because the client routes
 * generation 4's stages 100-109 through generation 3's evolution track. Two
 * generations therefore share a `chosenWeaponId`, and a stored id cannot say which
 * of the two the user meant — the amp is identical either way.
 */
export interface EstherGeneration {
  key: string
  index: number
  quality_option_id: string
  /** Class id -> that class's weapon for this generation. */
  weapons: Record<string, EstherWeapon>
  stages: EstherStage[]
}

export interface EstherMeta {
  uiKeys: Record<string, string>
  generations: EstherGeneration[]
  /**
   * Esther options the client defines but nothing can reach (`4100106`/`4100108`).
   *
   * They are the concrete form of the fan site's own note that its higher Esther
   * values are estimates: the content is stubbed in the tables and not wired up.
   */
  unscoredOptionIds: string[]
}

export interface StatPanels {
  avatars: AvatarMeta
  combatStats: CombatStatMeta
  esther: EstherMeta
}

export async function loadStatPanels(): Promise<StatPanels> {
  const [avatars, combatStats, esther] = await Promise.all([
    json<AvatarMeta>('avatars/options.json'),
    json<CombatStatMeta>('combat/stats.json'),
    json<EstherMeta>('esther/weapons.json'),
  ])
  return { avatars, combatStats, esther }
}

/** Avatar option id -> amp, ready for `totalAvatarAmp`. */
export function avatarAmpById(meta: AvatarMeta): Map<string, number> {
  return new Map(meta.options.map((o) => [o.id, o.amp]))
}
