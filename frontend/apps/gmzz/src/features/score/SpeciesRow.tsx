import type { ReactNode } from 'react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

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
  children,
}: {
  item: SpeciesResult
  rating: Rating
  onScore?: (value: number) => void
  children?: ReactNode
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
    <article className="rounded-md border border-border bg-card p-2.5" data-testid={`score-item-${item.species.id}`}>
      <div className="grid gap-2 md:grid-cols-[minmax(9rem,13rem)_minmax(7rem,9rem)_minmax(0,1fr)_minmax(8rem,11rem)] md:items-center">
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
      </div>

      {children ? <div className="mt-2.5 border-t border-border/70 pt-2.5">{children}</div> : null}
    </article>
  )
}
