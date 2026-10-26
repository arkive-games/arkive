import type { ReactNode } from 'react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { DetailsBody, DetailsToggle, useDetailsOpen } from '@/features/score/Details'
import { clamp, materialsFor, type Rating, type SpeciesResult } from '@/features/score/data'
import { TYPE } from '@/lib/typography'

/**
 * Band colours, worst to best.
 *
 * Indexed by the band's *position* in the sorted list rather than keyed by its
 * threshold. Keying on the threshold looks tidier but couples the palette to
 * the client's current numbers: re-tune 99 to 98 and the lookup misses, the bar
 * renders with no background class at all, and an invisible fill over the muted
 * track reads as a styling glitch rather than a stale palette. A position that
 * runs off the end falls back to the last colour, which is wrong but visible.
 */
export const BAND_CLASS = [
  'text-rose-700 dark:text-rose-300',
  'text-amber-700 dark:text-amber-300',
  'text-sky-700 dark:text-sky-300',
  'text-emerald-700 dark:text-emerald-300',
]

export const BAND_BAR_CLASS = [
  'bg-rose-500/70',
  'bg-amber-500/70',
  'bg-sky-500/70',
  'bg-emerald-500/70',
]

export function bandStyle(palette: string[], index: number): string {
  return palette[Math.min(Math.max(index, 0), palette.length - 1)]
}

/**
 * One of the panel's items: name and materials, the score, its bar against the
 * benchmarks, and the band.
 *
 * With `onScore` the score is a box the player types the panel's figure into;
 * without it the score is shown as a figure the page derived, and `children`
 * is the calculator that derived it, drawn under the row inside the same card
 * so the number and what produced it cannot be read as two things.
 */
export function ItemRow({
  item,
  rating,
  onScore,
  toggle,
}: {
  item: SpeciesResult
  rating: Rating
  onScore?: (value: number) => void
  /** The card's fold control, drawn in this line's last column. */
  toggle?: ReactNode
}) {
  const { t } = useTranslation()
  // Resolved here rather than passed in: the only valid producer is this one
  // expression, and it belongs next to the bandStyle calls that consume it.
  const bandIndex = rating.bands.findIndex((band) => band.id === item.band?.id)
  // Guarded before it reaches a CSS width: a non-finite percentage would render
  // as `width: NaN%`, which the browser drops, leaving a bar stuck full-width
  // with no other symptom.
  const percent = Number.isFinite(item.percent) ? Math.round(clamp(item.percent, 0, 1) * 100) : 0
  const materials = materialsFor(rating, item.species)

  return (
      <div data-testid={`score-item-${item.species.id}`} className="grid gap-2 md:grid-cols-[minmax(9rem,13rem)_minmax(7rem,9rem)_minmax(0,1fr)_minmax(8rem,11rem)_6.5rem] md:items-center">
        <div className="min-w-0">
          <div className={TYPE.name}>{item.species.name}</div>
          {materials.length > 0 ? (
            <div className="mt-0.5 truncate text-xs text-muted-foreground" title={materials.map((m) => `${m.name}: ${m.description}`).join('\n')}>
              {materials.map((m) => m.name).join(' · ')}
            </div>
          ) : null}
        </div>

        {onScore ? (
          <label className="block">
            <span className="mb-0.5 block text-xs text-muted-foreground md:sr-only">{t('score.yourScore')}</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={item.score === 0 ? '' : item.score}
              placeholder="0"
              onChange={(event) => onScore(Math.max(0, Number(event.target.value) || 0))}
              className="h-9 border-border bg-background text-sm tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]"
              data-testid={`score-input-${item.species.id}`}
              aria-label={t('score.yourScoreFor', { name: item.species.name })}
            />
          </label>
        ) : (
          <div className="flex items-baseline gap-2 md:block">
            <span className="block text-xs text-muted-foreground">{t('score.derivedScore')}</span>
            <span className="text-lg font-bold tabular-nums text-foreground" data-testid={`score-derived-${item.species.id}`}>
              {item.score.toLocaleString()}
            </span>
          </div>
        )}

        <div className="min-w-0">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={item.species.name}
          >
            <div className={`h-full rounded-full transition-all ${bandStyle(BAND_BAR_CLASS, bandIndex)}`} style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-xs tabular-nums text-muted-foreground">
            <span>{t('score.expectedValue', { value: item.expected.toLocaleString() })}</span>
            <span>{t('score.maxValue', { value: item.max.toLocaleString() })}</span>
            {item.toExpected > 0 ? (
              <span className="text-foreground/80">{t('score.gapToExpected', { points: item.toExpected.toLocaleString() })}</span>
            ) : item.toMax > 0 ? (
              <span>{t('score.gapToMax', { points: item.toMax.toLocaleString() })}</span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-300">{t('score.atMax')}</span>
            )}
          </div>
        </div>

        <div className="flex items-baseline gap-2 md:justify-end">
          <span className={`text-lg font-bold tabular-nums ${bandStyle(BAND_CLASS, bandIndex)}`}>{percent}%</span>
          <span className={`text-xs font-semibold ${bandStyle(BAND_CLASS, bandIndex)}`}>{item.band?.label}</span>
        </div>

        {/* The fold control's own column, kept on rows without a detail too so every row's columns line up. */}
        <div className="flex md:justify-end">
          {toggle}
        </div>
      </div>
  )
}

/**
 * One card on the score page: the line of every item it holds and, when it
 * has one, the single detail that computes them, behind one fold control.
 * A card holds one item or several that share a calculator, in the same
 * frame either way, so there is no second kind of details box.
 */
export function ItemCard({ id, items, rating, onScore, details }: {
  id: string
  items: SpeciesResult[]
  rating: Rating
  /** For typed items: where the player's own figure goes. */
  onScore?: (item: SpeciesResult) => ((value: number) => void) | undefined
  details?: ReactNode
}) {
  const [open, toggle] = useDetailsOpen(id)
  const bodyId = `score-details-${id}`
  return (
    <article className="space-y-2 rounded-md border border-border bg-card p-2.5" data-testid={`score-card-${id}`}>
      {items.map((item, index) => (
        <ItemRow key={item.species.id} item={item} rating={rating} onScore={onScore?.(item)}
          toggle={details && index === 0
            ? <DetailsToggle open={open} onToggle={toggle} controls={bodyId} testId={`score-details-toggle-${id}`} />
            : null} />
      ))}
      {details ? <DetailsBody id={bodyId} open={open}>{details}</DetailsBody> : null}
    </article>
  )
}
