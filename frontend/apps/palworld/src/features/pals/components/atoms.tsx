import { useState } from 'react'
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@gamemap/ui'
import { elementIconUrl, workIconUrl } from '../../../lib/assets'
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
      <IconImg src={elementIconUrl(element)} alt="" size={size} />
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
}: {
  work: WorkType
  level: number
  label: string
  description?: string
  highlight?: boolean
  condense?: CondenseEntry
  condenseTitle?: string
}) {
  const upgraded = condense && condense.final > level
  const badge = (
    <span
      className={cn(
        'ml-auto shrink-0 rounded bg-background/70 px-1.5 py-0.5 text-xs font-semibold tabular-nums',
        upgraded && 'cursor-help',
      )}
    >
      Lv{level}
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
          <Tooltip>
            <TooltipTrigger asChild>{badge}</TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {condenseTitle ? <div className="mb-1 font-medium">{condenseTitle}</div> : null}
              <div className="space-y-0.5 tabular-nums">
                {condense.stars.map((s) => (
                  <div key={s.star} className="flex justify-between gap-4">
                    <span>★{s.star}</span>
                    <span>
                      Lv{s.from} → {s.to}
                    </span>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
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
export function formatSkillRange(minRange: number, maxRange: number): string {
  if (!maxRange || maxRange <= 0) return '—'
  const m = (u: number) => {
    const v = u / 100
    return Number.isInteger(v) ? `${v}` : v.toFixed(1)
  }
  return minRange > 0 ? `${m(minRange)}–${m(maxRange)} m` : `${m(maxRange)} m`
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
}: {
  skill: ActiveSkill
  name: string
  typeLabel: string
  description?: string
}) {
  const hasDesc = !!description
  const top = hasDesc ? 'pt-2' : 'py-2'
  return (
    <>
      <tr className="border-t border-border/60">
        <td
          rowSpan={hasDesc ? 2 : 1}
          className="px-1 pr-2 text-center align-middle tabular-nums text-muted-foreground"
        >
          {skill.level}
        </td>
        <td className={cn('pr-2 align-top', top)}>
          <div className="flex items-center gap-1.5 font-medium">
            <IconImg src={elementIconUrl(skill.element as Element)} alt="" size={16} />
            {name}
          </div>
        </td>
        <td className={cn('whitespace-nowrap pr-2 text-right align-top tabular-nums', top)}>{skill.power || '—'}</td>
        <td className={cn('whitespace-nowrap pr-2 text-right align-top tabular-nums text-muted-foreground', top)}>
          {skill.coolTime}s
        </td>
        <td className={cn('whitespace-nowrap pr-2 align-top text-muted-foreground', top)}>{typeLabel}</td>
        <td className={cn('whitespace-nowrap text-right align-top tabular-nums text-muted-foreground', top)}>
          {formatSkillRange(skill.minRange, skill.maxRange)}
        </td>
      </tr>
      {hasDesc ? (
        <tr>
          <td colSpan={5} className="pb-2 pr-2 text-xs text-muted-foreground">
            {description}
          </td>
        </tr>
      ) : null}
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
export function PassiveRarity({ rank, color }: { rank: number | undefined; color?: string }) {
  if (!rank) return null
  const count = Math.min(Math.abs(rank), 5)
  const url = `${import.meta.env.BASE_URL}images/passive-rank/arrow_${String(count).padStart(2, '0')}.webp`
  return (
    <span
      role="img"
      aria-label={`Rank ${rank}`}
      title={`Rank ${rank}`}
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
