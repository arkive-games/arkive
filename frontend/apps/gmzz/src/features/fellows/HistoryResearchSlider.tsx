import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { formatResearchAttribute, type HistoryResearchRank } from './data'
import { TipOn } from '../score/Tip'
import { TYPE } from '../../lib/typography'
import { THUMB_PX } from '../../components/RangeField'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const RANGE_CLASS = `h-6 w-full cursor-pointer accent-[color:var(--arkive-nav-accent)] ${FOCUS}`
/** Threshold labels take turns across three rows, so 21 fit a phone-width track without touching. */
const ROW = ['top-0', 'top-4', 'top-8'] as const
/** The end labels hang inward from their tick, so neither spills past the track. */
const anchor = (i: number, last: number) => (i === 0 ? '-translate-x-1' : i === last ? '-translate-x-[calc(100%-0.25rem)]' : '-translate-x-1/2')

/**
 * History research as a slider whose stops are the research ranks.
 *
 * The thresholds sit on the track itself, in three staggered rows so 21 of them
 * stay legible, and the rank under the thumb is spelled out below with its
 * attribute bonuses and what each gained over the rank before it. `allowNone`
 * adds a stop before the first rank for a player who has not reached one.
 */
export function HistoryResearchSlider({
  ranks,
  value,
  onChange,
  allowNone = false,
  readOnly = false,
  testId,
}: {
  ranks: HistoryResearchRank[]
  value: number | null
  onChange: (id: number | null) => void
  allowNone?: boolean
  /** Shows a rank worked out elsewhere: the thumb cannot be dragged. */
  readOnly?: boolean
  testId: string
}) {
  const { t, i18n } = useTranslation()
  const sorted = useMemo(() => [...ranks].sort((a, b) => a.score - b.score), [ranks])
  const stops: (HistoryResearchRank | null)[] = useMemo(() => (allowNone ? [null, ...sorted] : sorted), [allowNone, sorted])
  const found = stops.findIndex((stop) => (stop?.id ?? null) === value)
  const index = found >= 0 ? found : 0
  const current = stops[index] ?? null
  const previous = current ? sorted[sorted.indexOf(current) - 1] ?? null : null
  const last = Math.max(1, stops.length - 1)
  const left = (i: number) => `calc(${THUMB_PX / 2}px + ${i / last} * (100% - ${THUMB_PX}px))`
  const locale = i18n.language

  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="relative h-12" aria-hidden>
        {stops.map((stop, i) => (
          <span
            key={stop?.id ?? 'none'}
            className={`absolute whitespace-nowrap text-xs tabular-nums ${ROW[i % ROW.length]} ${anchor(i, last)} ${i === index ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
            style={{ left: left(i) }}
          >
            {/* Ungrouped on purpose: `1,440` is a character wider, and 22 stops must fit a phone. */}
            {stop ? stop.score : 0}
          </span>
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={stops.length - 1}
        step={1}
        value={index}
        disabled={readOnly || stops.length < 2}
        className={RANGE_CLASS}
        aria-label={t('fellows.researchRank')}
        aria-valuetext={current ? `${current.rank}-${current.subRank} ${current.name}` : t('fellows.researchNone')}
        data-testid={`${testId}-range`}
        onChange={(event) => onChange(stops[Number(event.target.value)]?.id ?? null)}
      />
      <div className="relative h-2" aria-hidden>
        {stops.map((stop, i) => (
          <span key={stop?.id ?? 'none'} className="absolute top-0 h-2 w-px -translate-x-1/2 bg-border" style={{ left: left(i) }} />
        ))}
      </div>

      {current ? (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className={TYPE.name} data-testid={`${testId}-name`}>
              {current.rank}-{current.subRank} · {current.name}
            </span>
            <span className={TYPE.valueMuted}>
              {t('fellows.researchScore')} {current.score.toLocaleString(locale)}
            </span>
            <span className={TYPE.valueMuted}>
              {t('fellows.researchRating')} {current.mark.toLocaleString(locale)}
            </span>
          </div>
          <h4 className={`mt-2 ${TYPE.label}`}>{t('fellows.researchAttributes')}</h4>
          <dl className="mt-1 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {current.attributes.map((attribute) => {
              const before = previous?.attributes.find((entry) => entry.key === attribute.key)?.value ?? 0
              const gain = attribute.value - before
              return (
                <div key={attribute.key} className="flex min-w-0 justify-between gap-3 border-b border-border/60 py-1.5 text-sm">
                  <dt className="min-w-0 break-words text-muted-foreground">{attribute.name}</dt>
                  <dd className="shrink-0 tabular-nums">
                    {formatResearchAttribute(attribute, locale)}
                    {previous && Math.abs(gain) > 1e-9 ? (
                      <TipOn content={t('fellows.researchGain')}>
                        <span className="ml-1.5 cursor-help text-xs text-emerald-700 underline decoration-dotted underline-offset-2 dark:text-emerald-300">
                          ({formatResearchAttribute({ ...attribute, value: gain }, locale)})
                        </span>
                      </TipOn>
                    ) : null}
                  </dd>
                </div>
              )
            })}
          </dl>
          {previous ? <p className={`mt-1 ${TYPE.body}`}>{t('fellows.researchGainNote')}</p> : null}
        </>
      ) : (
        <p className={`mt-2 ${TYPE.body}`}>{t('fellows.researchNone')}</p>
      )}
    </div>
  )
}
