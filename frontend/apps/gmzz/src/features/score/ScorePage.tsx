import { useEffect, useMemo, useState } from 'react'
import { IconDatabase, IconInfoCircle } from '@tabler/icons-react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { ContentPage } from '@/components/ContentPage'
import {
  clamp,
  evaluate,
  headroom,
  loadRating,
  materialsFor,
  type Rating,
  type SpeciesResult,
} from '@/features/score/data'

/** Band colours, keyed by the client's own thresholds (49 / 75 / 99 / 100). */
const BAND_CLASS: Record<number, string> = {
  49: 'text-rose-700 dark:text-rose-300',
  75: 'text-amber-700 dark:text-amber-300',
  99: 'text-sky-700 dark:text-sky-300',
  100: 'text-emerald-700 dark:text-emerald-300',
}

const BAND_BAR_CLASS: Record<number, string> = {
  49: 'bg-rose-500/70',
  75: 'bg-amber-500/70',
  99: 'bg-sky-500/70',
  100: 'bg-emerald-500/70',
}

export default function ScorePage() {
  const { t } = useTranslation()
  const [rating, setRating] = useState<Rating | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [roleLevel, setRoleLevel] = useState(70)
  const [divinityLevel, setDivinityLevel] = useState(0)
  const [scores, setScores] = useState<Record<number, number>>({})

  useEffect(() => {
    let live = true
    loadRating()
      .then((data) => {
        if (live) setRating(data)
      })
      .catch((cause) => {
        console.error(cause)
        if (live) setError(true)
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    document.title = `${t('score.title')} - ${t('siteTitle')}`
  }, [t])

  const result = useMemo(
    () => (rating ? evaluate(rating, roleLevel, divinityLevel, scores) : null),
    [rating, roleLevel, divinityLevel, scores],
  )
  const gaps = useMemo(() => (result ? headroom(result).slice(0, 5) : []), [result])

  if (loading) {
    return (
      <ContentPage active="/score" title={t('score.title')} wide>
        <div className="space-y-5" role="status" aria-label={t('common.loading')} data-testid="score-loading">
          <div className="h-28 animate-pulse rounded-md bg-muted" />
          <div className="h-24 animate-pulse rounded-md bg-muted" />
          <div className="h-96 animate-pulse rounded-md bg-muted" />
        </div>
      </ContentPage>
    )
  }

  if (error || !rating || !result) {
    return (
      <ContentPage active="/score" title={t('score.title')} wide>
        <p className="text-sm text-muted-foreground">{t('score.loadError')}</p>
      </ContentPage>
    )
  }

  const atCap = roleLevel >= rating.maxRoleLevel

  return (
    <ContentPage active="/score" title={t('score.title')} wide>
      <div data-testid="score-page" className="space-y-4">
        <header className="border-b border-border pb-4">
          <h1 className="text-3xl font-bold text-foreground">{t('score.title')}</h1>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{t('score.description')}</p>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">{t('score.sourceNote')}</p>
        </header>

        {/* Progression drives every benchmark on the page, so it sits above the
            items rather than beside them. */}
        <section
          aria-label={t('score.progression')}
          className="grid gap-4 rounded-md border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[repeat(2,minmax(0,14rem))_minmax(0,1fr)]"
        >
          <LevelField
            label={t('score.roleLevel')}
            hint={t('score.roleLevelHint')}
            value={roleLevel}
            min={1}
            max={rating.maxRoleLevel}
            onChange={setRoleLevel}
            testId="score-role-level"
          />
          <LevelField
            label={t('score.divinityLevel')}
            hint={atCap ? t('score.divinityHint') : t('score.divinityInactive', { level: rating.maxRoleLevel })}
            value={divinityLevel}
            min={0}
            max={rating.maxDivinityLevel}
            onChange={setDivinityLevel}
            disabled={!atCap}
            testId="score-divinity-level"
          />
          <Summary result={result} />
        </section>

        <div className="space-y-4" data-testid="score-groups">
          {result.groups.map((group) => (
            <section key={group.genus.id} aria-label={group.genus.name} data-testid={`score-genus-${group.genus.id}`}>
              <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-1.5">
                <span className="text-xl font-bold text-foreground">{group.genus.name}</span>
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                  {t('score.groupTotal', {
                    score: group.score.toLocaleString(),
                    expected: group.expected.toLocaleString(),
                    percent: Math.round(group.percent * 100),
                  })}
                </span>
              </h2>
              <div className="mt-2 space-y-2">
                {group.items.map((item) => (
                  <ItemRow
                    key={item.species.id}
                    item={item}
                    rating={rating}
                    onScore={(value) => setScores((prev) => ({ ...prev, [item.species.id]: value }))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {gaps.length > 0 ? (
          <section aria-label={t('score.headroom')} className="rounded-md border border-border bg-card p-3">
            <h2 className="text-sm font-bold text-foreground">{t('score.headroom')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('score.headroomHint')}</p>
            <ol className="mt-2 space-y-1" data-testid="score-headroom">
              {gaps.map((item, index) => (
                <li key={item.species.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="tabular-nums text-muted-foreground">{index + 1}.</span>
                  <span className="font-medium text-foreground">{item.species.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {t('score.gapToExpected', { points: item.toExpected.toLocaleString() })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {materialsFor(rating, item.species).map((m) => m.name).join(' · ')}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-2">
            <IconDatabase className="size-4" stroke={1.8} aria-hidden />
            {t('score.dataNote')}
          </p>
          <p className="flex items-center gap-2">
            <IconInfoCircle className="size-4" stroke={1.8} aria-hidden />
            {t('score.aggregateNote')}
          </p>
        </div>
      </div>
    </ContentPage>
  )
}

function Summary({ result }: { result: NonNullable<ReturnType<typeof evaluate>> }) {
  const { t } = useTranslation()
  const percent = Math.round(result.percent * 100)
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2" data-testid="score-summary">
      <div>
        <div className="text-xs font-semibold text-muted-foreground">{t('score.total')}</div>
        <div className="text-3xl font-bold tabular-nums text-foreground">{result.score.toLocaleString()}</div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground">{t('score.expectedTotal')}</div>
        <div className="text-lg font-semibold tabular-nums text-muted-foreground">
          {result.expected.toLocaleString()}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground">{t('score.maxTotal')}</div>
        <div className="text-lg font-semibold tabular-nums text-muted-foreground">{result.max.toLocaleString()}</div>
      </div>
      <div>
        <div className="text-xs font-semibold text-muted-foreground">{t('score.overall')}</div>
        <div className="text-lg font-semibold tabular-nums text-foreground">{percent}%</div>
      </div>
    </div>
  )
}

function ItemRow({
  item,
  rating,
  onScore,
}: {
  item: SpeciesResult
  rating: Rating
  onScore: (value: number) => void
}) {
  const { t } = useTranslation()
  // Guarded before it reaches a CSS width: a non-finite percentage would render
  // as `width: NaN%`, which the browser drops, leaving a bar stuck full-width
  // with no other symptom.
  const percent = Number.isFinite(item.percent) ? Math.round(clamp(item.percent, 0, 1) * 100) : 0
  const bandKey = item.band?.percentage ?? 49
  const materials = materialsFor(rating, item.species)

  return (
    <article
      className="grid gap-2 rounded-md border border-border bg-card p-2.5 md:grid-cols-[minmax(9rem,13rem)_minmax(7rem,9rem)_minmax(0,1fr)_minmax(8rem,11rem)] md:items-center"
      data-testid={`score-item-${item.species.id}`}
    >
      <div className="min-w-0">
        <div className="text-sm font-bold text-foreground">{item.species.name}</div>
        {materials.length > 0 ? (
          <div className="mt-0.5 truncate text-xs text-muted-foreground" title={materials.map((m) => `${m.name}: ${m.description}`).join('\n')}>
            {materials.map((m) => m.name).join(' · ')}
          </div>
        ) : null}
      </div>

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

      <div className="min-w-0">
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={item.species.name}
        >
          <div className={`h-full rounded-full transition-all ${BAND_BAR_CLASS[bandKey]}`} style={{ width: `${percent}%` }} />
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
        <span className={`text-lg font-bold tabular-nums ${BAND_CLASS[bandKey]}`}>{percent}%</span>
        <span className={`text-xs font-semibold ${BAND_CLASS[bandKey]}`}>{item.band?.label}</span>
      </div>
    </article>
  )
}

function LevelField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  disabled = false,
  testId,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
  testId: string
}) {
  return (
    <label className={`block ${disabled ? 'opacity-60' : ''}`}>
      <span className="block text-xs font-semibold text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(clamp(Math.trunc(Number(event.target.value)), min, max))}
        className="mt-0.5 h-9 border-border bg-background text-sm tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]"
        data-testid={testId}
      />
      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
    </label>
  )
}
