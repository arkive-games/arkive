import { dataUrl, RES_BASE } from '@/lib/urls'

/**
 * 愚者棋局 — the auto-battler. `AutoChess` internally, which is why nothing in
 * the client answers to the name players see.
 *
 * Every field here is emitted by `tools/apps/gmzz/autochess.py`; see that module
 * for why bonds are grouped by `Priority` rather than `Type`, and why summons
 * are not pieces.
 */

export type AutoChessAttribute = {
  id: number
  /** Client-internal name (`maxHp`, `critDamage`). */
  prop: string
  name: string
  /** The client's own rendering, e.g. `%d`, `%d%%`, `*100|%d%%`, `%d格`. */
  format: string
  /** Whether the game shows it on a piece's own panel. */
  onDetail: boolean
  onExtraPanel: boolean
  /** Basename under `resource-gmzz/autochess/`, or '' when the client has none. */
  icon: string
}

export type AutoChessStar = {
  chessId: number
  starLevel: number
  attackRange: number
  maxMp: number
  initialMp: number
  recoverMp: number
  normalAttackRecoverMp: number
  lostHpRecoverMp: number
  skill: { name: string; description: string; valueDescription: string }
  attributes: { attributeId: number; value: number }[]
}

export type AutoChessPiece = {
  baseId: number
  name: string
  cost: number
  /** Combat role: 近战战士, 远程法师, … */
  role: string
  roleColor: number
  bondIds: number[]
  positionDescription: string
  positionSuggestion: string
  /**
   * Skill art, empty for the 44 of 53 whose icon the export cannot reach.
   * One per piece, not per star — the client stores it on the base row.
   */
  skillIcon: string
  stars: AutoChessStar[]
}

/** 职业 / 组织 / 特殊 — the three families the in-game help enumerates. */
export type AutoChessBondGroup = 'role' | 'faction' | 'special'

export type AutoChessBond = {
  id: number
  name: string
  description: string
  group: AutoChessBondGroup
  type: number
  priority: number
  tiers: { activateNum: number; rarity: number; description: string }[]
}

export type AutoChessItem = {
  id: number
  name: string
  rarity: number
  typeId: number
  /** 攻击 / 防御 / 共鸣 / 特殊, the client's own `EquipTypeData.Desc`. */
  typeName: string
  /** 1 装备, 2 宝匣, 3 共鸣徽章, 4 道具. */
  useType: number
  brief: string
  description: string
  attributes: { attributeId: number; value: number }[]
  icon: string
}

export type AutoChessTalent = {
  id: number
  name: string
  description: string
  handbookDescription: string
  rarity: number
  type: number
  inHandbook: boolean
}

/** 试炼 / 对弈 / 天赋 / 选将 — resolved from the client's own detail tables. */
export type AutoChessTurnKind = 'pve' | 'pvp' | 'insight' | 'carousel'

export type AutoChessTurn = { id: number; round: number; label: string; kind: AutoChessTurnKind }

/** A streak step: from this many wins (or losses) on, the bonus applies. */
export type AutoChessStreakStep = { fromStreak: number; bonus: number }

export type AutoChessEconomy = {
  baseIncomePerTurn: number
  maxInterest: number
  winStreak: AutoChessStreakStep[]
  loseStreak: AutoChessStreakStep[]
  experience: { price: number; gain: number }
  /**
   * The client's own explanation of gold income.
   *
   * Shown rather than parsed: the 10% interest rate and the +1 for winning a
   * duel appear in **no constant**, only in this sentence, so restating them as
   * our own numbers would present a reading of prose as data.
   */
  incomeDescription: string
}

export type AutoChessDamage = {
  /** Base damage a lost duel deals, one entry per stage. */
  baseByRound: number[]
  /** Extra damage per surviving enemy piece, indexed [cost - 1][star - 1]. */
  perSurvivingPieceByCostAndStar: number[][]
}

export type AutoChessRules = {
  turns: AutoChessTurn[]
  levels: { level: number; exp: number; population: number; shopOdds: number[] }[]
  costs: { cost: number; buyPriceByStar: number[]; sellPriceByStar: number[] }[]
  poolSizeByCost: number[]
  /**
   * Optional on purpose. `data-gmzz` is a separate repository served over HTTP
   * and deployed on its own schedule, so the site can be newer than the dataset
   * it reads. A required field would turn that ordinary skew into a blank page
   * for the whole route; this way the section simply does not render until the
   * data catches up.
   */
  economy?: AutoChessEconomy
  /** Optional for the same deploy-skew reason as `economy`. */
  damage?: AutoChessDamage
}

async function load<T>(file: string, what: string): Promise<T> {
  const response = await fetch(dataUrl(`autochess/${file}.json`))
  if (!response.ok) throw new Error(`Unable to load ${what} (${response.status})`)
  return (await response.json()) as T
}

export const loadAutoChessAttributes = () => load<AutoChessAttribute[]>('attributes', 'attributes')
export const loadAutoChessPieces = () => load<AutoChessPiece[]>('chess', 'pieces')
export const loadAutoChessBonds = () => load<AutoChessBond[]>('bonds', 'bonds')
export const loadAutoChessItems = () => load<AutoChessItem[]>('items', 'items')
export const loadAutoChessTalents = () => load<AutoChessTalent[]>('talents', 'talents')
export const loadAutoChessRules = () => load<AutoChessRules>('rules', 'rules')

/** Attribute icon, for the twelve the client ships under `Property/`. */
export function autoChessIconUrl(icon: string): string {
  return `${RES_BASE}/autochess/${icon}.webp`
}

/**
 * Equipment art, for the 77 of 107 rows that have any.
 *
 * The pipeline blanks `icon` on a row whose image it could not produce, so an
 * empty string here means "no art exists for this one" rather than "not loaded
 * yet" — the card then renders without a frame instead of with a broken one.
 */
export function autoChessItemIconUrl(icon: string): string {
  return `${RES_BASE}/autochess/items/${icon}.webp`
}

/** Skill art, for the 9 of 53 pieces that borrow an existing game icon. */
export function autoChessSkillIconUrl(icon: string): string {
  return `${RES_BASE}/autochess/skills/${icon}.webp`
}

/**
 * Render a stored value the way the client does.
 *
 * The format is the client's own `DataFormat`, and it has to be applied rather
 * than guessed at: 暴击伤害 is stored as `1.5` with `*100|%d%%`, so a page that
 * printed the raw number would claim a 1.5% crit bonus where the game shows
 * 150%. The optional `*N|` prefix scales; the rest is a printf spec with any
 * literal suffix the client attached (`%d格`).
 */
export function formatAttributeValue(value: number, format: string): string {
  let scaled = value
  let spec = format

  const bar = format.indexOf('|')
  if (bar >= 0) {
    const scale = /^\*(\d+(?:\.\d+)?)$/.exec(format.slice(0, bar))
    spec = format.slice(bar + 1)
    if (scale) scaled = value * Number(scale[1])
  }

  return spec
    .replace(/%(?:\.(\d+))?[dfi]/, (_match, digits?: string) =>
      digits === undefined ? String(Math.round(scaled)) : scaled.toFixed(Number(digits)),
    )
    .replace(/%%/g, '%')
}

/** Attributes indexed by id, for joining a piece's or an item's values. */
export function attributeMap(attributes: AutoChessAttribute[]): Map<number, AutoChessAttribute> {
  return new Map(attributes.map((attribute) => [attribute.id, attribute]))
}

/**
 * Strip the client's own markup from a description.
 *
 * Two things are removed. `<HighLight>`, `<img .../>` and friends are the
 * game's UI vocabulary rather than HTML, so they are dropped instead of
 * injected. Damage placeholders — `{*d,F1690001,atkMin,30}` — name a server
 * formula by id, and **the formula itself is in no table the export carries**;
 * the coefficient alone does not determine the number. So the placeholder
 * becomes a dash rather than a figure we computed from one corroborating
 * sample. The multiplier a player actually wants is stated by the client in the
 * skill's own `valueDescription` (「总伤害：攻击 × 3000%」), which the piece card
 * shows beside this text.
 */
export function plainText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, '')
    .replace(/\{\*d,[^}]*\}/g, '—')
    .replace(/\s+/g, ' ')
    .trim()
}
