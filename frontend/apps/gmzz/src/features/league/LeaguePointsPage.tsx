import { useEffect, useMemo, useState } from 'react'
import { IconArrowRight, IconInfoCircle, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react'
import { Button, Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '@/components/ContentPage'
import {
  calculateScenario,
  DEFAULT_GUILDS,
  DEFAULT_RULES,
  enumerateScenarios,
  isValidRoster,
  type LeagueGuild,
  type LeagueRules,
  type LeagueScenario,
} from './league'

const numberValue = (value: string, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function ScenarioLine({ scenario, targetId, t }: { scenario: LeagueScenario; targetId: string; t: (key: string, options?: Record<string, unknown>) => string }) {
  const target = scenario.results.find((result) => result.id === targetId)
  if (!target) return null
  const winner = scenario.results.filter((result) => result.group === 'winner').sort((a, b) => a.globalRank - b.globalRank).map((result) => result.name).join('、')
  const loser = scenario.results.filter((result) => result.group === 'loser').sort((a, b) => a.globalRank - b.globalRank).map((result) => result.name).join('、')
  return (
    <div className="rounded-md border border-border bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 font-medium">
        <span className={target.overallRank <= 4 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}>
          {t('league.rankValue', { rank: target.overallRank })}
        </span>
        <span>{target.name}</span>
        <span className="text-muted-foreground">{target.finalPoints} {t('league.points')}</span>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('league.winnerOrder')}: {winner}</p>
      <p className="text-xs leading-5 text-muted-foreground">{t('league.loserOrder')}: {loser}</p>
    </div>
  )
}

export default function LeaguePointsPage() {
  const { t } = useTranslation()
  const [guilds, setGuilds] = useState<LeagueGuild[]>(DEFAULT_GUILDS)
  const [rules, setRules] = useState<LeagueRules>(DEFAULT_RULES)
  const [targetId, setTargetId] = useState(DEFAULT_GUILDS[1].id)

  useEffect(() => { document.title = `${t('league.title')} - ${t('siteTitle')}` }, [t])

  const valid = isValidRoster(guilds)
  const scenarios = useMemo(() => valid ? enumerateScenarios(guilds, rules) : [], [guilds, rules, valid])
  const fixed = guilds.every((guild) => guild.groupRank !== null)
  const currentScenario = useMemo(() => fixed && valid ? calculateScenario(guilds, rules) : null, [fixed, guilds, rules, valid])
  const targetScenarios = scenarios.filter((scenario) => (scenario.results.find((result) => result.id === targetId)?.overallRank ?? Number.POSITIVE_INFINITY) <= rules.qualificationCount)
  const targetRanks = [...new Set(scenarios.map((scenario) => scenario.results.find((result) => result.id === targetId)?.overallRank).filter((rank): rank is number => Boolean(rank)))].sort((a, b) => a - b)
  const target = currentScenario?.results.find((result) => result.id === targetId)

  const updateGuild = (id: string, patch: Partial<LeagueGuild>) => setGuilds((items) => items.map((guild) => guild.id === id ? { ...guild, ...patch } : guild))
  const updateRule = (key: 'matchPoints' | 'roundBonuses', index: number, value: string) => setRules((current) => ({ ...current, [key]: current[key].map((item, itemIndex) => itemIndex === index ? numberValue(value) : item) }))
  const reset = () => { setGuilds(DEFAULT_GUILDS.map((guild) => ({ ...guild }))); setRules({ matchPoints: [...DEFAULT_RULES.matchPoints], roundBonuses: [...DEFAULT_RULES.roundBonuses], qualificationCount: 4 }); setTargetId(DEFAULT_GUILDS[1].id) }

  return (
    <ContentPage active="/tools/league-points" title={t('league.title')} wide>
      <div className="space-y-5" data-testid="league-points-page">
        <header className="border-b border-border pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t('league.eyebrow')}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{t('league.title')}</h1>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{t('league.description')}</p>
        </header>

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{t('league.rulesTitle')}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t('league.rulesHint')}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}><IconRefresh size={16} />{t('league.reset')}</Button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium">{t('league.matchPoints')}</h3>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {rules.matchPoints.map((value, index) => <label key={index} className="text-xs text-muted-foreground">{t('league.place', { rank: index + 1 })}<Input type="number" min={0} value={value} onChange={(event) => updateRule('matchPoints', index, event.target.value)} className="mt-1 h-9" /></label>)}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium">{t('league.roundBonuses')}</h3>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {rules.roundBonuses.map((value, index) => <label key={index} className="text-xs text-muted-foreground">{t('league.place', { rank: index + 1 })}<Input type="number" min={0} value={value} onChange={(event) => updateRule('roundBonuses', index, event.target.value)} className="mt-1 h-9" /></label>)}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="font-semibold">{t('league.rosterTitle')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('league.rosterHint')}</p></div>
            <label className="flex items-center gap-2 text-sm"><span>{t('league.target')}</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="h-9 rounded-md border border-border bg-background px-2"><option value="">{t('league.chooseTarget')}</option>{guilds.map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}</select></label>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="px-2 py-2">{t('league.guild')}</th><th className="px-2 py-2">{t('league.currentPoints')}</th><th className="px-2 py-2">{t('league.group')}</th><th className="px-2 py-2">{t('league.groupRank')}</th><th className="px-2 py-2" /></tr></thead>
              <tbody>
                {guilds.map((guild) => <tr key={guild.id} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-2"><Input aria-label={t('league.guild')} value={guild.name} onChange={(event) => updateGuild(guild.id, { name: event.target.value })} className="h-9 min-w-40" /></td>
                  <td className="px-2 py-2"><Input aria-label={t('league.currentPoints')} type="number" min={0} value={guild.currentPoints} onChange={(event) => updateGuild(guild.id, { currentPoints: numberValue(event.target.value) })} className="h-9 w-28" /></td>
                  <td className="px-2 py-2"><select value={guild.group} onChange={(event) => updateGuild(guild.id, { group: event.target.value as LeagueGuild['group'], groupRank: null })} className="h-9 rounded-md border border-border bg-background px-2"><option value="winner">{t('league.winner')}</option><option value="loser">{t('league.loser')}</option></select></td>
                  <td className="px-2 py-2"><select value={guild.groupRank ?? ''} onChange={(event) => updateGuild(guild.id, { groupRank: event.target.value === '' ? null : Number(event.target.value) })} className="h-9 rounded-md border border-border bg-background px-2"><option value="">{t('league.unknown')}</option>{[1, 2, 3, 4].map((rank) => <option key={rank} value={rank}>{t('league.place', { rank })}</option>)}</select></td>
                  <td className="px-2 py-2 text-right"><button type="button" aria-label={t('league.remove')} className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setGuilds((items) => items.filter((item) => item.id !== guild.id))}><IconTrash size={16} /></button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" disabled={guilds.length >= 8} onClick={() => setGuilds((items) => [...items, { id: `guild-${Date.now()}`, name: t('league.newGuild'), currentPoints: 0, group: items.filter((item) => item.group === 'winner').length < 4 ? 'winner' : 'loser', groupRank: null }])}><IconPlus size={16} />{t('league.addGuild')}</Button>
            {!valid ? <span className="text-xs text-amber-700 dark:text-amber-300"><IconInfoCircle size={14} className="mr-1 inline" />{t('league.rosterInvalid')}</span> : <span className="text-xs text-muted-foreground">{t('league.unknownHint')}</span>}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <h2 className="font-semibold">{t('league.summaryTitle')}</h2>
            {!valid ? <p className="mt-3 text-sm text-muted-foreground">{t('league.completeRoster')}</p> : <>
              <div className="mt-3 rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{t('league.possibleRanks')}</p><p className="mt-1 text-2xl font-semibold">{targetRanks.length ? targetRanks.map((rank) => t('league.rankValue', { rank })).join('、') : '—'}</p><p className="mt-1 text-xs text-muted-foreground">{t('league.scenarioCount', { count: scenarios.length })}</p></div>
              {targetScenarios.length > 0 ? <div className="mt-3 rounded-md border border-emerald-300/60 bg-emerald-50 p-3 dark:bg-emerald-950/20"><p className="font-medium text-emerald-800 dark:text-emerald-200">{t('league.canQualify')}</p><p className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-200/80">{t('league.qualifyCount', { count: targetScenarios.length })}</p></div> : <div className="mt-3 rounded-md border border-rose-300/60 bg-rose-50 p-3 dark:bg-rose-950/20"><p className="font-medium text-rose-800 dark:text-rose-200">{t('league.cannotQualify')}</p></div>}
              {target ? <div className="mt-3 flex items-center gap-2 text-sm"><span>{t('league.fixedResult')}:</span><strong>{target.finalPoints} {t('league.points')}</strong><span className="text-muted-foreground">·</span><strong>{t('league.rankValue', { rank: target.overallRank })}</strong></div> : null}
            </>}
          </div>
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{t('league.pathsTitle')}</h2><IconArrowRight size={18} className="text-muted-foreground" /></div>
            {!valid ? <p className="mt-3 text-sm text-muted-foreground">{t('league.completeRoster')}</p> : targetScenarios.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t('league.noPath')}</p> : <div className="mt-3 space-y-2">{targetScenarios.slice(0, 8).map((scenario, index) => <ScenarioLine key={index} scenario={scenario} targetId={targetId} t={t} />)}{targetScenarios.length > 8 ? <p className="pt-1 text-xs text-muted-foreground">{t('league.morePaths', { count: targetScenarios.length - 8 })}</p> : null}</div>}
          </div>
        </section>

        {currentScenario ? <section className="rounded-lg border border-border bg-card p-4 shadow-sm"><h2 className="font-semibold">{t('league.currentTitle')}</h2><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{currentScenario.results.map((result) => <div key={result.id} className={`rounded-md border p-3 ${result.id === targetId ? 'border-[color:var(--arkive-nav-accent)]' : 'border-border'}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{result.name}</span><span className="text-xs text-muted-foreground">#{result.overallRank}</span></div><p className="mt-1 text-lg font-semibold">{result.finalPoints} <span className="text-xs font-normal text-muted-foreground">{t('league.points')}</span></p><p className="text-xs text-muted-foreground">{result.group === 'winner' ? t('league.winner') : t('league.loser')} · {t('league.place', { rank: result.groupRank })}</p></div>)}</div></section> : null}
      </div>
    </ContentPage>
  )
}
