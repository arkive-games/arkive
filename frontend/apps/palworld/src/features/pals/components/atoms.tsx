import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { cn, Hint, TooltipProvider } from '@gamemap/ui'
import { elementIconUrl, hasElementIcon, workIconUrl } from '../../../lib/assets'
import type { CondenseEntry } from '../../../lib/condenser'
import type { ActiveSkill, Element, WorkType } from '../../../lib/pals'

/** An <img> that removes itself if the asset is missing (e.g. OilExtraction
 *  has no work icon), letting an adjacent text label stand in. */
export function IconImg({
  src,
  alt,
  size,
  className,
}: {
  src: string
  alt: string
  size: number
  className?: string
}) {
  const [ok, setOk] = useState(true)
  if (!ok) return null
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setOk(false)}
      className={cn('shrink-0 object-contain', className)}
    />
  )
}

/** Element icon + name pill. */
export function ElementBadge({
  element,
  label,
  size = 18,
}: {
  element: Element
  label: string
  size?: number
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      {hasElementIcon(element) ? <IconImg src={elementIconUrl(element)} alt="" size={size} /> : null}
      {label}
    </span>
  )
}

/** Work-suitability icon + localized name + level badge. Falls back to the
 *  label alone when the work type has no icon (OilExtraction). `highlight`
 *  marks the species' BestWorkSuitability (gold + ★ — the condenser upgrades
 *  it first). `condense` adds the max-condensed level (`Lv6 →8`) with a
 *  per-star breakdown tooltip titled `condenseTitle`. */
export function WorkSuitability({
  work,
  level,
  label,
  description,
  highlight,
  condense,
  condenseTitle,
  levelLabel = 'Lv',
}: {
  work: WorkType
  level: number
  label: string
  description?: string
  highlight?: boolean
  condense?: CondenseEntry
  condenseTitle?: string
  levelLabel?: string
}) {
  const upgraded = condense && condense.final > level
  const badge = (
    <span
      className={cn(
        'ml-auto shrink-0 rounded bg-background/70 px-1.5 py-0.5 text-xs font-semibold tabular-nums',
        upgraded && 'cursor-help',
      )}
    >
      {levelLabel}{levelLabel === 'Lv' ? '' : ' '}{level}
      {upgraded ? (
        <span className="text-emerald-600 dark:text-emerald-400"> →{condense.final}</span>
      ) : null}
    </span>
  )
  return (
    <div
      title={description}
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm',
        highlight
          ? 'border-amber-500/60 bg-amber-500/10'
          : 'border-border bg-secondary/40',
      )}
    >
      <IconImg src={workIconUrl(work)} alt="" size={22} />
      <span className="min-w-0 truncate">
        {label}
        {highlight ? <span className="text-amber-500 dark:text-amber-400"> ★</span> : null}
      </span>
      {upgraded ? (
        <TooltipProvider delayDuration={200}>
          {/* `srTitle` rather than `title`: the breakdown already carries its own
              heading line, so the mobile sheet names itself for screen readers
              without printing the same words twice. */}
          <Hint
            srTitle={condenseTitle}
            contentClassName="max-w-xs"
            content={
              <>
                {condenseTitle ? <div className="mb-1 font-medium">{condenseTitle}</div> : null}
                <div className="space-y-0.5 tabular-nums">
                  {condense.stars.map((s) => (
                    <div key={s.star} className="flex justify-between gap-4">
                      <span>★{s.star}</span>
                      <span>
                        {levelLabel}{levelLabel === 'Lv' ? '' : ' '}{s.from} → {s.to}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            }
          >
            {badge}
          </Hint>
        </TooltipProvider>
      ) : (
        badge
      )}
    </div>
  )
}

/** Format an active-skill range (raw world units → metres). Returns '—' when
 * the skill has no meaningful reach. Shows `min–max m` when a minimum exists,
 * otherwise just the maximum reach. */
export function formatSkillRange(minRange: number, maxRange: number, locale = 'en-US'): string {
  if (!maxRange || maxRange <= 0) return '—'
  const m = (u: number) => {
    const v = u / 100
    return Number.isInteger(v) ? `${v}` : v.toFixed(1)
  }
  const unit = locale.startsWith('zh') ? '米' : 'm'
  return minRange > 0 ? `${m(minRange)}–${m(maxRange)} ${unit}` : `${m(maxRange)} ${unit}`
}

const ZH_SKILL_EFFECTS: Record<string, string> = {
  Burn: '燃烧',
  Darkness: '黑暗',
  Electrical: '触电',
  Freeze: '冻结',
  IvyCling: '缠绕',
  Muddy: '泥泞',
  Poison: '中毒',
  Wetness: '潮湿',
}

function activeSkillEffectLabel(type: string, locale: string): string {
  return locale.startsWith('zh') ? ZH_SKILL_EFFECTS[type] ?? '' : type
}

/** One active skill, rendered as two rows inside a <tbody>: the first row holds
 *  the stat columns (name, melee/ranged type, power, range, cooldown); the
 *  second is a single merged cell with the skill description. The level cell
 *  spans both rows (rowspan) and is vertically centred. */
export function ActiveSkillRow({
  skill,
  name,
  typeLabel,
  description,
  locale = 'en-US',
  labels,
}: {
  skill: ActiveSkill
  name: string
  typeLabel: string
  description?: string
  locale?: string
  labels?: { level: string; power: string; cooldown: string; type: string; range: string }
}) {
  const hasDesc = !!description
  const effectLabel = skill.effect ? activeSkillEffectLabel(skill.effect.type, locale) : ''
  const hasDetail = hasDesc || !!effectLabel
  const top = hasDetail ? 'pt-2' : 'py-2'
  const cooldown = locale.startsWith('zh') ? `${skill.coolTime} 秒` : `${skill.coolTime}s`
  const range = formatSkillRange(skill.minRange, skill.maxRange, locale)
  return (
    <>
      <tr className="hidden border-t border-border/60 sm:table-row">
        <td
          rowSpan={hasDetail ? 2 : 1}
          className="px-1 pr-2 text-center align-middle tabular-nums text-muted-foreground"
        >
          {skill.level}
        </td>
        <td className={cn('pr-2 align-top', top)}>
          <div className="flex items-center gap-1.5 font-medium">
            {hasElementIcon(skill.element) ? (
              <IconImg src={elementIconUrl(skill.element as Element)} alt="" size={16} />
            ) : (
              <span className="size-4 shrink-0" aria-hidden />
            )}
            <Link
              to="/active-skills/$id"
              params={{ id: skill.wazaId }}
              className="hover:text-primary hover:underline"
            >
              {name}
            </Link>
          </div>
        </td>
        <td className={cn('whitespace-nowrap pr-2 text-right align-top tabular-nums', top)}>{skill.power || '—'}</td>
        <td className={cn('whitespace-nowrap pr-2 text-right align-top tabular-nums text-muted-foreground', top)}>
          {cooldown}
        </td>
        <td className={cn('whitespace-nowrap pr-2 align-top text-muted-foreground', top)}>{typeLabel}</td>
        <td className={cn('whitespace-nowrap text-right align-top tabular-nums text-muted-foreground', top)}>
          {range}
        </td>
      </tr>
      {hasDetail ? (
        <tr className="hidden sm:table-row">
          <td colSpan={5} className="pb-2 pr-2 text-xs text-muted-foreground">
            {description}
            {skill.effect && effectLabel ? (
              <span
                className={cn(
                  'inline-flex items-center rounded bg-sky-500/10 px-1.5 py-0.5 font-medium text-sky-500',
                  description ? 'ml-2' : '',
                )}
              >
                {effectLabel} +{skill.effect.value}
              </span>
            ) : null}
          </td>
        </tr>
      ) : null}
      <tr className="border-t border-border/60 sm:hidden">
        <td colSpan={6} className="py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
              {labels?.level ?? 'Lv'} {skill.level}
            </span>
            {hasElementIcon(skill.element) ? (
              <IconImg src={elementIconUrl(skill.element as Element)} alt="" size={18} />
            ) : null}
            <Link
              to="/active-skills/$id"
              params={{ id: skill.wazaId }}
              className="min-w-0 truncate text-sm font-semibold hover:text-primary hover:underline"
            >
              {name}
            </Link>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-secondary/55 px-2.5 py-2 text-xs">
            {[
              [labels?.power ?? 'Power', skill.power || '—'],
              [labels?.cooldown ?? 'Cooldown', cooldown],
              [labels?.type ?? 'Type', typeLabel],
              [labels?.range ?? 'Range', range],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex min-w-0 justify-between gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="truncate font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {description || effectLabel ? (
            <div className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {description}
              {skill.effect && effectLabel ? (
                <span className={cn('inline-flex rounded bg-sky-500/10 px-1.5 py-0.5 font-medium text-sky-600 dark:text-sky-400', description && 'ml-2')}>
                  {effectLabel} +{skill.effect.value}
                </span>
              ) : null}
            </div>
          ) : null}
        </td>
      </tr>
    </>
  )
}

/** 1–3 colour tier for a passive `Rank`, by magnitude: 1 white, 2 gold, 3 blue.
 *  Only picks the tint / title-bar treatment — the in-game arrow *count* is
 *  abs(Rank) itself (1–5, verified against the game's Abs→switch over the
 *  arrow_01–05 textures in WBP_MainMenu_Pal_Skill_Passive). */
export function passiveRarityTier(rank: number): number {
  const m = Math.abs(rank)
  return m >= 4 ? 3 : m >= 2 ? 2 : 1
}

// Rarity colours, matching the in-game skill-status arrows. Reused by the
// description value tags so numbers and rarity read consistently.
export const RANK_BLUE = '#9FF9D8' // tier 3 (rank 4+)
export const RANK_RED = '#D85143' // negatives
const RANK_GOLD = '#F5E159' // tier 2 (rank 2–3)
const RANK_WHITE = '#FFFFFF' // tier 1 (rank 1)

const TIER_COLOR: Record<number, string> = { 1: RANK_WHITE, 2: RANK_GOLD, 3: RANK_BLUE }

/** A passive's rarity, from its game `Rank`, rendered as the in-game arrow icon
 *  (abs(rank) chevrons, from public/images/passive-rank/arrow_01–05) recoloured
 *  (via a CSS mask) and flipped for debuffs. `color` overrides the rank tint
 *  (e.g. to stay visible on a same-coloured title bar). Rank 0 renders
 *  nothing. */
export function PassiveRarity({ rank, color, label = 'Rank' }: { rank: number | undefined; color?: string; label?: string }) {
  if (!rank) return null
  const count = Math.min(Math.abs(rank), 5)
  const url = `${import.meta.env.BASE_URL}images/passive-rank/arrow_${String(count).padStart(2, '0')}.webp`
  return (
    <span
      role="img"
      aria-label={`${label} ${rank}`}
      title={`${label} ${rank}`}
      className="inline-block size-4 shrink-0"
      style={{
        backgroundColor: color ?? (rank < 0 ? RANK_RED : TIER_COLOR[passiveRarityTier(rank)]),
        WebkitMaskImage: `url("${url}")`,
        maskImage: `url("${url}")`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        transform: rank < 0 ? 'scaleY(-1)' : undefined,
        // Keep light tints (white/mint/gold) visible on light card backgrounds.
        filter: 'drop-shadow(0 0 0.5px rgba(0,0,0,0.45))',
      }}
    />
  )
}

// Flat bar background for the "normal" (+1 / unranked) and "red" (detrimental)
// tiers — these don't get a faceted figure, just the game's dark bar colour.
const TITLE_BG_FLAT = '#1F2428'

// Per signed rarity tier: +3 and +2 use a pre-coloured faceted figure (generated
// from the game's grayscale skill-bar strip by tools/apps/palworld/skill_bar);
// the rest use the flat dark bar. `fg`/`arrow` are chosen to read on each.
type TitleBarStyle = { figure?: string; bg: string; fg: string; arrow: string }
function titleBarStyle(rank: number): TitleBarStyle {
  const tier = passiveRarityTier(rank)
  if (rank > 0 && tier === 3)
    return { figure: 'skill_base_02_blue', bg: RANK_BLUE, fg: '#FFFFFF', arrow: RANK_BLUE }
  if (rank > 0 && tier === 2)
    return { figure: 'skill_base_02_gold', bg: RANK_GOLD, fg: '#0E2A3C', arrow: RANK_GOLD }
  if (rank < 0) return { bg: TITLE_BG_FLAT, fg: '#FFFFFF', arrow: RANK_RED }
  return { bg: TITLE_BG_FLAT, fg: '#FFFFFF', arrow: '#FFFFFF' } // +1 / unranked
}

/** A passive's title row styled like the in-game skill bar: a faceted figure
 *  (blue / gold rarities) or a flat dark bar (normal / detrimental), with the
 *  name on the left and the rarity arrows on the right. */
export function PassiveTitleBar({ name, rank }: { name: string; rank: number }) {
  const st = titleBarStyle(rank)
  const bgImage = st.figure
    ? `url("${import.meta.env.BASE_URL}images/passive-rank/${st.figure}.webp")`
    : undefined
  const light = st.fg === '#FFFFFF'
  return (
    <div
      className="flex items-center justify-between gap-2 overflow-hidden rounded px-2 py-1"
      style={{
        backgroundColor: st.bg,
        backgroundImage: bgImage,
        backgroundSize: '100% 100%', // stretch the figure to fill the bar (no tiling)
        backgroundRepeat: 'no-repeat',
      }}
    >
      <span
        className="truncate text-sm font-semibold"
        style={{ color: st.fg, textShadow: light ? '0 1px 1px rgba(0,0,0,0.35)' : 'none' }}
      >
        {name}
      </span>
      <PassiveRarity rank={rank} color={st.arrow} />
    </div>
  )
}

// The game's passive text styles fragments with pseudo-tags: `<NumBlue_13>` for
// a positive (blue) value, `<NumRed_13>` for a negative (red) value, and
// `<Status_Up>` for a buff word (e.g. "Immune"). Each is closed by `</>`. Blue
// and red match the rarity colours (RANK_BLUE / RANK_RED).
const PASSIVE_TAG_CLASS: Record<string, string> = {
  NumBlue_13: 'font-semibold text-[#5591BD]',
  NumRed_13: 'font-semibold text-[#B4493E]',
  Status_Up: 'font-semibold text-emerald-500',
}

/** Split tagged passive text into styled segments (module-scope so the running
 *  class state isn't a render-time reassignment). */
function parsePassiveText(text: string): { text: string; cls: string | null }[] {
  const segs: { text: string; cls: string | null }[] = []
  let cls: string | null = null
  for (const part of text.split(/(<\/>|<[A-Za-z0-9_]+>)/)) {
    if (!part) continue
    if (part === '</>') {
      cls = null
      continue
    }
    const open = /^<([A-Za-z0-9_]+)>$/.exec(part)
    if (open) {
      cls = PASSIVE_TAG_CLASS[open[1]] ?? null
      continue
    }
    segs.push({ text: part, cls })
  }
  // The game often tags only part of a value, leaving the rest plain. Coalesce so
  // the whole "+50%" / "-20%" is coloured:
  //  (A) plain ending in a number/sign before a coloured seg — "Work Speed -20" + "%".
  //  (B) coloured sign/number fragment before a plain number — "+" + "50%".
  for (let i = 1; i < segs.length; i++) {
    const prev = segs[i - 1]
    const cur = segs[i]
    if (!cur.cls || prev.cls) continue
    const m = /([+-]?[\d.,]*\d[\d.,]*|[+-])$/.exec(prev.text)
    if (!m) continue
    prev.text = prev.text.slice(0, m.index)
    cur.text = m[0] + cur.text
  }
  for (let i = 0; i < segs.length - 1; i++) {
    const cur = segs[i]
    const next = segs[i + 1]
    if (!cur.cls || next.cls) continue
    if (!/[+\-\d]$/.test(cur.text)) continue
    const m = /^([\d.,]*\d[\d.,]*%?)/.exec(next.text)
    if (!m) continue
    cur.text += m[0]
    next.text = next.text.slice(m[0].length)
  }
  return segs.filter((s) => s.text)
}

/** Render a passive description string, styling the game's colour/status tags.
 *  Plain text (no tags, e.g. a synthesized description) passes through as-is. */
export function PassiveText({ text }: { text: string }) {
  return (
    <>
      {parsePassiveText(text).map((s, i) =>
        s.cls ? (
          <span key={i} className={s.cls}>
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  )
}

/** Innate passive skill: name (+ rarity tier) + effect description. */
export function PassiveRow({
  name,
  description,
  rank,
}: {
  name: string
  description?: string
  rank?: number
}) {
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{name}</span>
        <PassiveRarity rank={rank} />
      </div>
      {description ? (
        <div className="mt-0.5 text-xs whitespace-pre-line text-muted-foreground">
          <PassiveText text={description} />
        </div>
      ) : null}
    </div>
  )
}
