import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { elementIconUrl, itemIconUrl, workIconUrl } from '../../../lib/assets'
import type { ActiveSkill, Element, WorkType } from '../../../lib/pals'

/** An <img> that removes itself if the asset is missing (e.g. OilExtraction
 *  has no work icon), letting an adjacent text label stand in. */
function IconImg({
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
 *  label alone when the work type has no icon (OilExtraction). */
export function WorkSuitability({
  work,
  level,
  label,
  description,
  highlight,
}: {
  work: WorkType
  level: number
  label: string
  description?: string
  highlight?: boolean
}) {
  return (
    <div
      title={description}
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm',
        highlight
          ? 'border-primary/60 bg-primary/10'
          : 'border-border bg-secondary/40',
      )}
    >
      <IconImg src={workIconUrl(work)} alt="" size={22} />
      <span className="min-w-0 truncate">{label}</span>
      <span className="ml-auto shrink-0 rounded bg-background/70 px-1.5 py-0.5 text-xs font-semibold tabular-nums">
        Lv{level}
      </span>
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

/** One row of the active-skill table. Render inside a <tbody>. */
export function ActiveSkillRow({
  skill,
  name,
  description,
  categoryLabel,
}: {
  skill: ActiveSkill
  name: string
  description?: string
  categoryLabel?: string
}) {
  return (
    <tr className="border-t border-border/60 align-top">
      <td className="py-2 pr-2 text-center tabular-nums text-muted-foreground">{skill.level}</td>
      <td className="py-2 pr-2">
        <div className="flex items-center gap-1.5 font-medium">
          <IconImg src={elementIconUrl(skill.element as Element)} alt="" size={16} />
          {name}
        </div>
        {description ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        ) : null}
        {categoryLabel ? (
          <div className="mt-0.5 text-xs text-muted-foreground/80">{categoryLabel}</div>
        ) : null}
      </td>
      <td className="py-2 pr-2 text-right tabular-nums">{skill.power || '—'}</td>
      <td className="py-2 pr-2 text-right tabular-nums text-muted-foreground">
        {formatSkillRange(skill.minRange, skill.maxRange)}
      </td>
      <td className="py-2 text-right tabular-nums text-muted-foreground">{skill.coolTime}s</td>
    </tr>
  )
}

/** 1–3 arrow tier for a passive `Rank`, by magnitude. */
export function passiveRarityTier(rank: number): number {
  const m = Math.abs(rank)
  return m >= 4 ? 3 : m >= 2 ? 2 : 1
}

/** A passive's rarity/tier, derived from its game `Rank`: positive ranks are
 *  beneficial (gold up-arrows), negative are detrimental (red down-arrows), with
 *  1–3 arrows by magnitude. Rank 0 (no tier) renders nothing. */
export function PassiveRarity({ rank }: { rank: number | undefined }) {
  if (!rank) return null
  const good = rank > 0
  const tier = passiveRarityTier(rank)
  const Icon = good ? ChevronUp : ChevronDown
  return (
    <span
      className={cn('inline-flex shrink-0', good ? 'text-amber-500' : 'text-destructive')}
      title={`Rank ${rank}`}
      aria-label={`Rank ${rank}`}
    >
      {Array.from({ length: tier }).map((_, i) => (
        <Icon key={i} className={cn('size-3.5', i > 0 && '-ml-1.5')} strokeWidth={2.5} />
      ))}
    </span>
  )
}

// The game's passive text styles fragments with pseudo-tags: `<NumBlue_13>` for
// a positive (blue) value, `<NumRed_13>` for a negative (red) value, and
// `<Status_Up>` for a buff word (e.g. "Immune"). Each is closed by `</>`.
const PASSIVE_TAG_CLASS: Record<string, string> = {
  NumBlue_13: 'font-semibold text-sky-500',
  NumRed_13: 'font-semibold text-destructive',
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
  // The game often tags only the "%" (or sign), leaving the number plain — e.g.
  // "Work Speed -20<NumRed_13>%</>". Pull a trailing number/sign off the plain
  // segment into the adjacent coloured one so the whole value is coloured.
  for (let i = 1; i < segs.length; i++) {
    const prev = segs[i - 1]
    const cur = segs[i]
    if (!cur.cls || prev.cls) continue
    const m = /([+-]?[\d.,]*\d[\d.,]*|[+-])$/.exec(prev.text)
    if (!m) continue
    prev.text = prev.text.slice(0, m.index)
    cur.text = m[0] + cur.text
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

/** A kill-drop item: icon + name + drop rate + quantity range. */
export function DropRow({
  id,
  name,
  rate,
  min,
  max,
  icon,
}: {
  id?: string
  name: string
  rate: number
  min: number
  max: number
  icon?: string
}) {
  const qty = min === max ? `${min}` : `${min}–${max}`
  const label = id ? (
    <Link to="/items/$id" params={{ id }} className="flex min-w-0 flex-1 items-center gap-2 hover:text-primary">
      {icon ? <IconImg src={itemIconUrl(icon)} alt="" size={20} /> : null}
      <span className="truncate">{name}</span>
    </Link>
  ) : (
    <span className="min-w-0 flex-1 truncate">{name}</span>
  )
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm first:pt-0 last:pb-0">
      {label}
      <span className="shrink-0 tabular-nums text-muted-foreground">×{qty}</span>
      <span className="w-14 shrink-0 text-right tabular-nums">{rate}%</span>
    </div>
  )
}

/** A summon-altar material: icon + name + required quantity. */
export function SummonMaterialRow({
  id,
  name,
  count,
  icon,
}: {
  id?: string
  name: string
  count: number
  icon?: string
}) {
  const label = id ? (
    <Link to="/items/$id" params={{ id }} className="flex min-w-0 flex-1 items-center gap-2 hover:text-primary">
      {icon ? <IconImg src={itemIconUrl(icon)} alt="" size={20} /> : null}
      <span className="truncate">{name}</span>
    </Link>
  ) : (
    <span className="min-w-0 flex-1 truncate">{name}</span>
  )
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm first:pt-0 last:pb-0">
      {label}
      <span className="shrink-0 tabular-nums text-muted-foreground">×{count}</span>
    </div>
  )
}
