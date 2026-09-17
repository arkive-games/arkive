import { useEffect, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ContentPage } from '@/components/ContentPage'
import {
  loadAutoChessRules,
  type AutoChessTurn,
  type AutoChessTurnKind,
} from '@/features/autochess/data'
import { useAutoChess } from '@/features/autochess/useAutoChess'

const KIND_CLASS: Record<AutoChessTurnKind, string> = {
  pve: 'border-emerald-400/60 bg-emerald-50/50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/25 dark:text-emerald-300',
  pvp: 'border-sky-400/60 bg-sky-50/50 text-sky-800 dark:border-sky-700 dark:bg-sky-950/25 dark:text-sky-300',
  insight: 'border-violet-400/70 bg-violet-50/50 text-violet-800 dark:border-violet-700 dark:bg-violet-950/25 dark:text-violet-300',
  carousel: 'border-amber-400/70 bg-amber-50/55 text-amber-800 dark:border-amber-700 dark:bg-amber-950/25 dark:text-amber-300',
}

const KINDS: AutoChessTurnKind[] = ['pve', 'pvp', 'insight', 'carousel']

const SECTIONS = [
  { to: '/autochess/chess', titleKey: 'autochess.pieces.title', bodyKey: 'autochess.pieces.short' },
  { to: '/autochess/bonds', titleKey: 'autochess.bonds.title', bodyKey: 'autochess.bonds.short' },
  { to: '/autochess/items', titleKey: 'autochess.items.title', bodyKey: 'autochess.items.short' },
  { to: '/autochess/talents', titleKey: 'autochess.talents.title', bodyKey: 'autochess.talents.short' },
] as const

export default function AutoChessRulesPage() {
  const { t } = useTranslation()
  const rules = useAutoChess(loadAutoChessRules)

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

  const { levels, costs, poolSizeByCost } = rules.data

  return (
    <ContentPage active="/autochess" title={t('autochess.title')} heading wide>
      <p className="mb-6 text-sm text-muted-foreground">{t('autochess.description')}</p>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-primary/60"
          >
            <span className="font-semibold">{t(section.titleKey)}</span>
            <span className="text-sm text-muted-foreground">{t(section.bodyKey)}</span>
          </Link>
        ))}
      </div>

      <section className="mb-8">
        <h2 className="mb-2 text-xl font-semibold">{t('autochess.rules.turnsTitle')}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('autochess.rules.turnsHint')}</p>
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
              <span className="w-16 shrink-0 text-sm text-muted-foreground">
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

      <section className="mb-8">
        <h2 className="mb-2 text-xl font-semibold">{t('autochess.rules.levelsTitle')}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('autochess.rules.levelsHint')}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-medium">{t('autochess.rules.level')}</th>
                <th className="py-2 pr-3 font-medium">{t('autochess.rules.population')}</th>
                <th className="py-2 pr-3 font-medium">{t('autochess.rules.exp')}</th>
                {[1, 2, 3, 4, 5].map((cost) => (
                  <th key={cost} className="py-2 pr-3 font-medium tabular-nums">
                    {t('autochess.pieces.cost', { cost })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => (
                <tr key={level.level} className="border-b border-border/60">
                  <td className="py-1.5 pr-3 tabular-nums">{level.level}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{level.population}</td>
                  <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                    {level.exp || '—'}
                  </td>
                  {level.shopOdds.map((odds, index) => (
                    <td
                      key={index}
                      className={`py-1.5 pr-3 tabular-nums ${odds ? '' : 'text-muted-foreground/50'}`}
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

      <section>
        <h2 className="mb-2 text-xl font-semibold">{t('autochess.rules.costsTitle')}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('autochess.rules.costsHint')}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3 font-medium">{t('autochess.rules.costColumn')}</th>
                <th className="py-2 pr-3 font-medium">{t('autochess.rules.poolSize')}</th>
                {[1, 2, 3].map((star) => (
                  <th key={star} className="py-2 pr-3 font-medium">
                    {t('autochess.rules.sellAtStar', { star })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {costs.map((row, index) => (
                <tr key={row.cost} className="border-b border-border/60">
                  <td className="py-1.5 pr-3 tabular-nums">{t('autochess.pieces.cost', { cost: row.cost })}</td>
                  <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                    {poolSizeByCost[index] ?? '—'}
                  </td>
                  {row.sellPriceByStar.map((price, star) => (
                    <td key={star} className="py-1.5 pr-3 tabular-nums">{price}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ContentPage>
  )
}
