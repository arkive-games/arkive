import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { ContentPage } from '@/components/ContentPage'
import {
  loadAutoChessRules,
  type AutoChessStreakStep,
  type AutoChessTurn,
  type AutoChessTurnKind,
} from '@/features/autochess/data'
import { useRemoteData } from '@/lib/useRemoteData'

const KIND_CLASS: Record<AutoChessTurnKind, string> = {
  pve: 'border-emerald-400/60 bg-emerald-50/50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/25 dark:text-emerald-300',
  pvp: 'border-sky-400/60 bg-sky-50/50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/25 dark:text-sky-300',
  insight: 'border-violet-400/70 bg-violet-50/50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/25 dark:text-violet-300',
  carousel: 'border-amber-400/70 bg-amber-50/55 text-amber-800 dark:border-amber-700 dark:bg-amber-950/25 dark:text-amber-300',
}

const KINDS: AutoChessTurnKind[] = ['pve', 'pvp', 'insight', 'carousel']

/**
 * One type scale for the whole page, and every section drawn as the same card.
 * The earlier layout mixed seven size/weight pairs — income rows set at body
 * size among small-print notes, section headings larger than anything in them —
 * and stacked bare sections whose different heights left holes. Titles are
 * text-base, content text-sm, hints and table headers text-xs, nothing else.
 */
const SECTION = 'rounded-lg border border-border bg-card p-4'
const TITLE = 'text-base font-semibold'
const HINT = 'mt-0.5 mb-3 text-xs text-muted-foreground'
const NOTE = 'mt-2 text-xs text-muted-foreground'
const TH = 'py-1.5 pr-4 text-left text-xs font-medium text-muted-foreground'
const TD = 'py-1.5 pr-4 tabular-nums'

/** One numbered gold source: what it is, how much, and the condition. */
function IncomeRow({
  index,
  label,
  value,
  note,
}: {
  index: number
  label: string
  value: string
  note: string
}) {
  return (
    <li className="flex gap-2.5 border-b border-border/60 py-2 last:border-b-0">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-xs tabular-nums text-muted-foreground">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
          <span className="font-medium">{label}</span>
          <span className="font-semibold tabular-nums">{value}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
      </div>
    </li>
  )
}

/** The streak lengths one ladder step covers: "3–4", "5", or "6+" at the top. */
function streakBand(from: number, nextFrom: number | undefined): string {
  if (nextFrom === undefined) return `${from}+`
  return nextFrom - 1 === from ? String(from) : `${from}–${nextFrom - 1}`
}

/**
 * One row per streak length either ladder starts paying at, each side then
 * looked up by that threshold.
 *
 * Walking the win ladder and reading `loseSteps[index]` pairs the two by
 * position, which is right only when they are identical — and the loss column
 * is rendered precisely when they are not, so the wrong pairing would be the
 * only one ever shown. A loss ladder with more paying steps than the win ladder
 * would drop its surplus rows outright.
 */
function buildStreakRows(winSteps: AutoChessStreakStep[], loseSteps: AutoChessStreakStep[]) {
  const at = (steps: AutoChessStreakStep[], from: number) =>
    steps.find((step) => step.fromStreak === from)
  const thresholds = [...new Set([...winSteps, ...loseSteps].map((step) => step.fromStreak))]
    .sort((a, b) => a - b)
  return thresholds.map((from, index) => ({
    from,
    band: streakBand(from, thresholds[index + 1]),
    win: at(winSteps, from)?.bonus,
    lose: at(loseSteps, from)?.bonus,
  }))
}

/** "+1 ~ +3 金" — the span a streak can pay, for the summary row. */
function streakSummary(
  steps: AutoChessStreakStep[],
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!steps.length) return '—'
  const low = steps[0].bonus
  const high = steps[steps.length - 1].bonus
  return low === high
    ? `+${t('autochess.rules.gold', { count: high })}`
    : `+${low} ~ +${t('autochess.rules.gold', { count: high })}`
}

export default function AutoChessRulesPage() {
  const { t } = useTranslation()
  const rules = useRemoteData(loadAutoChessRules)

  useEffect(() => {
    document.title = `${t('autochess.title')} - ${t('siteTitle')}`
  }, [t])

  /** Turns grouped by their round, so the ladder reads the way it is played. */
  const rounds = useMemo(() => {
    const turns = rules.data?.turns ?? []
    const map = new Map<number, AutoChessTurn[]>()
    for (const turn of turns) {
      map.set(turn.round, [...(map.get(turn.round) ?? []), turn])
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [rules.data])

  if (rules.error) {
    return (
      <ContentPage active="/autochess" title={t('autochess.title')} heading wide>
        <p className="text-sm text-muted-foreground">{t('autochess.loadError')}</p>
      </ContentPage>
    )
  }
  if (rules.loading || !rules.data) {
    return (
      <ContentPage active="/autochess" title={t('autochess.title')} heading wide>
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </ContentPage>
    )
  }

  const { levels, costs, poolSizeByCost, economy, damage } = rules.data
  // Only the steps that actually grant something; the ladder's leading 0 row is
  // the "no streak" case and says nothing a reader needs.
  const winSteps = economy?.winStreak.filter((step) => step.bonus > 0) ?? []
  const loseSteps = economy?.loseStreak.filter((step) => step.bonus > 0) ?? []
  const sameLadder =
    JSON.stringify(economy?.winStreak) === JSON.stringify(economy?.loseStreak)

  const streakRows = buildStreakRows(winSteps, loseSteps)

  return (
    <ContentPage active="/autochess" title={t('autochess.title')} heading wide>
      <p className="mb-4 text-sm text-muted-foreground">{t('autochess.description')}</p>

      {/* A two-column grid, so the cards side by side share a top and a bottom
          edge. Flowing columns packed tighter but staggered every edge across
          the gap, which read as misaligned. The four cards that used to sit
          above this linked to the other pages, which the nav's own 愚者棋局
          menu now does. */}
      <div className="grid gap-4 xl:grid-cols-2">
      <section className={SECTION}>
        <h2 className={TITLE}>{t('autochess.rules.turnsTitle')}</h2>
        <p className={HINT}>{t('autochess.rules.turnsHint')}</p>
        <ul className="mb-3 flex flex-wrap gap-2">
          {KINDS.map((kind) => (
            <li key={kind} className={`rounded border px-2 py-0.5 text-xs ${KIND_CLASS[kind]}`}>
              {t(`autochess.rules.kind.${kind}`)}
            </li>
          ))}
        </ul>
        <div className="space-y-1.5">
          {rounds.map(([round, turns]) => (
            <div key={round} className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 text-xs text-muted-foreground">
                {t('autochess.rules.round', { round })}
              </span>
              {turns.map((turn) => (
                <span
                  key={turn.id}
                  title={t(`autochess.rules.kind.${turn.kind}`)}
                  className={`rounded border px-1.5 py-0.5 text-xs tabular-nums ${KIND_CLASS[turn.kind]}`}
                >
                  {turn.label}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {economy ? (
      <section className={SECTION}>
        <h2 className={TITLE}>{t('autochess.rules.economyTitle')}</h2>

        <p className={HINT}>{t('autochess.rules.economyHint')}</p>

        {/* One row per source, each with its own figure. The earlier version
            quoted the client's paragraph and listed the constants separately,
            which left the reader to work out which number went with which
            sentence — and the paragraph names no figure for the base income at
            all. */}
        <ol className="mb-3">
          <IncomeRow
            index={1}
            label={t('autochess.rules.incomeBase')}
            value={t('autochess.rules.gold', { count: economy.baseIncomePerTurn })}
            note={t('autochess.rules.incomeBaseNote')}
          />
          <IncomeRow
            index={2}
            label={t('autochess.rules.incomeInterest')}
            value={t('autochess.rules.interestValue', { max: economy.maxInterest })}
            note={t('autochess.rules.incomeInterestNote', { max: economy.maxInterest * 10 })}
          />
          <IncomeRow
            index={3}
            label={t('autochess.rules.incomeWin')}
            value={t('autochess.rules.gold', { count: 1 })}
            note={t('autochess.rules.incomeWinNote')}
          />
          <IncomeRow
            index={4}
            label={t('autochess.rules.incomeStreak')}
            value={streakSummary(winSteps, t)}
            note={t('autochess.rules.incomeStreakNote')}
          />
        </ol>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[16rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className={TH}>{t('autochess.rules.streak')}</th>
                <th className={TH}>{t('autochess.rules.streakWin')}</th>
                {!sameLadder ? (
                  <th className={TH}>{t('autochess.rules.streakLose')}</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {streakRows.map((row) => (
                <tr key={row.from} className="border-b border-border/60">
                  {/* Built from numbers rather than a translated template:
                      "3–4" and "6+" read the same in every locale the site
                      speaks, and the ladder's open top row has no separate
                      wording to get wrong. A band one wide prints as a single
                      number — "5–5" is noise. */}
                  <td className={TD}>{row.band}</td>
                  <td className={TD}>
                    {row.win === undefined ? '—' : `+${t('autochess.rules.gold', { count: row.win })}`}
                  </td>
                  {!sameLadder ? (
                    <td className={TD}>
                      {row.lose === undefined ? '—' : `+${t('autochess.rules.gold', { count: row.lose })}`}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={NOTE}>
          {sameLadder ? `${t('autochess.rules.streakSame')} ` : ''}
          {t('autochess.rules.streakExcluded')}
        </p>

        {/* One key rather than a label, a literal separator and a value: the
            separator is punctuation, and punctuation belongs to the locale —
            written here as `：` it followed the English build too. */}
        <p className={NOTE}>
          {t('autochess.rules.buyExpLine', {
            price: economy.experience.price,
            gain: economy.experience.gain,
          })}
        </p>
      </section>
      ) : null}

      {damage ? (
        <section className={SECTION}>
          <h2 className={TITLE}>{t('autochess.rules.damageTitle')}</h2>
          <p className={HINT}>{t('autochess.rules.damageHint')}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className={TH}>{t('autochess.rules.stage')}</th>
                  {damage.baseByRound.map((_, index) => (
                    <th key={index} className={TH}>
                      {index + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/60">
                  <td className={`${TD} text-muted-foreground`}>{t('autochess.rules.baseDamage')}</td>
                  {damage.baseByRound.map((value, index) => (
                    <td key={index} className={TD}>{value}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <p className={`${NOTE} mb-2`}>{t('autochess.rules.perPieceHint')}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[16rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className={TH}>{t('autochess.rules.costColumn')}</th>
                  {[1, 2, 3].map((star) => (
                    <th key={star} className={TH}>
                      {t('autochess.pieces.star', { star })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {damage.perSurvivingPieceByCostAndStar.map((row, costIndex) => (
                  <tr key={costIndex} className="border-b border-border/60">
                    <td className={TD}>
                      {t('autochess.pieces.cost', { cost: costIndex + 1 })}
                    </td>
                    {row.map((value, starIndex) => (
                      <td key={starIndex} className={TD}>{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className={SECTION}>
        <h2 className={TITLE}>{t('autochess.rules.levelsTitle')}</h2>
        <p className={HINT}>{t('autochess.rules.levelsHint')}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className={TH}>{t('autochess.rules.level')}</th>
                <th className={TH}>{t('autochess.rules.population')}</th>
                <th className={TH}>{t('autochess.rules.exp')}</th>
                {[1, 2, 3, 4, 5].map((cost) => (
                  <th key={cost} className={TH}>
                    {t('autochess.pieces.cost', { cost })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => (
                <tr key={level.level} className="border-b border-border/60">
                  <td className={TD}>{level.level}</td>
                  <td className={TD}>{level.population}</td>
                  <td className={`${TD} text-muted-foreground`}>
                    {level.exp || '—'}
                  </td>
                  {level.shopOdds.map((odds, index) => (
                    <td
                      key={index}
                      className={`${TD} ${odds ? '' : 'text-muted-foreground/50'}`}
                    >
                      {odds}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={TITLE}>{t('autochess.rules.costsTitle')}</h2>
        <p className={HINT}>{t('autochess.rules.costsHint')}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className={TH}>{t('autochess.rules.costColumn')}</th>
                <th className={TH}>{t('autochess.rules.poolSize')}</th>
                {[1, 2, 3].map((star) => (
                  <th key={star} className={TH}>
                    {t('autochess.rules.sellAtStar', { star })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {costs.map((row, index) => (
                <tr key={row.cost} className="border-b border-border/60">
                  <td className={TD}>{t('autochess.pieces.cost', { cost: row.cost })}</td>
                  <td className={`${TD} text-muted-foreground`}>
                    {poolSizeByCost[index] ?? '—'}
                  </td>
                  {row.sellPriceByStar.map((price, star) => (
                    <td key={star} className={TD}>{price}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </div>
    </ContentPage>
  )
}
