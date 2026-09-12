import { useEffect, useMemo, useState } from 'react'
import { IconInfoCircle, IconRefresh } from '@tabler/icons-react'
import { Button, Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '@/components/ContentPage'
import { calculateScenario, DEFAULT_GUILDS, DEFAULT_RULES, enumerateScenarios, groupFromMatchRank, isValidRoster, type LeagueGuild, type LeagueGroup, type LeagueRules, type LeagueScenario, type WeekNumber } from './league'

const ranks = [1, 2, 3, 4]
const numberValue = (value: string) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }

function WeekRankSelect({ guild, week, started, t, points, onChange }: { guild: LeagueGuild; week: WeekNumber; started: boolean; points: number[]; t: (key: string, options?: Record<string, unknown>) => string; onChange: (rank: number | null, group?: LeagueGroup | null) => void }) {
  const groupAware = week === 2 || week === 4
  if (groupAware) return <span className="inline-flex items-center gap-1"><select disabled={!started} aria-label={`${guild.name} ${t('league.weekShort', { week })} ${t('league.group')}`} value={guild.weeks[week].group ?? ''} onChange={(event) => onChange(guild.weeks[week].rank, event.target.value ? event.target.value as LeagueGroup : null)} className="h-9 w-24 rounded-md border border-border bg-background px-1 text-sm"><option value="">—</option><option value="winner">{t('league.winner')}</option><option value="loser">{t('league.loser')}</option></select><select disabled={!started} aria-label={`${guild.name} ${t('league.weekShort', { week })} ${t('league.groupRank')}`} value={guild.weeks[week].rank ?? ''} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null, guild.weeks[week].group)} className="h-9 w-16 rounded-md border border-border bg-background px-1 text-sm"><option value="">—</option>{ranks.map((rank) => <option key={rank} value={rank}>{rank}</option>)}</select>{started && guild.weeks[week].rank !== null ? <span className="whitespace-nowrap text-xs font-medium text-emerald-700 dark:text-emerald-300">+{points[guild.weeks[week].rank - 1] ?? 0}</span> : null}</span>
  return <span className="inline-flex items-center gap-1"><select disabled={!started} aria-label={`${guild.name} ${t('league.weekShort', { week })}`} value={guild.weeks[week].rank ?? ''} onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)} className="h-9 w-16 rounded-md border border-border bg-background px-1 text-sm"><option value="">—</option>{ranks.map((rank) => <option key={rank} value={rank}>{rank}</option>)}</select>{started && guild.weeks[week].rank !== null ? <span className="whitespace-nowrap text-xs font-medium text-emerald-700 dark:text-emerald-300">+{points[guild.weeks[week].rank - 1] ?? 0}</span> : null}</span>
}

function ScenarioLine({ scenario, targetId, t }: { scenario: LeagueScenario; targetId: string; t: (key: string, options?: Record<string, unknown>) => string }) {
  const target = scenario.results.find((result) => result.id === targetId)
  if (!target) return null
  return <div className="rounded-md border border-border bg-background p-3 text-sm"><div className="flex flex-wrap items-center gap-2 font-medium"><span className={target.finalRank <= 4 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}>{t('league.rankValue', { rank: target.finalRank })}</span><span>{target.name}</span><span className="text-muted-foreground">{target.finalPoints} {t('league.points')}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{t('league.weekPath')}: {([1, 2, 3, 4] as WeekNumber[]).map((week) => `${t('league.weekShort', { week })}#${scenario.assignments[targetId]?.[week] ?? '—'}`).join(' · ')}</p></div>
}

export default function LeaguePointsPage() {
  const { t } = useTranslation()
  const [guilds, setGuilds] = useState<LeagueGuild[]>(DEFAULT_GUILDS.map((guild) => ({ ...guild, weeks: { ...guild.weeks } })))
  const rules: LeagueRules = DEFAULT_RULES
  const [targetId, setTargetId] = useState(DEFAULT_GUILDS[0].id)
  const [weekStarted, setWeekStarted] = useState<Record<WeekNumber, boolean>>({ 1: true, 2: true, 3: true, 4: false })
  useEffect(() => { document.title = `${t('league.title')} - ${t('siteTitle')}` }, [t])
  const valid = isValidRoster(guilds)
  const simulationGuilds = useMemo(() => guilds.map((guild) => ({ ...guild, weeks: Object.fromEntries(([1, 2, 3, 4] as WeekNumber[]).map((week) => [week, { ...guild.weeks[week], status: weekStarted[week] ? guild.weeks[week].status : 'absent' }])) as LeagueGuild['weeks'] })), [guilds, weekStarted])
  const enumeration = useMemo(() => valid ? enumerateScenarios(simulationGuilds, rules, 7, weekStarted) : { scenarios: [], truncated: false }, [simulationGuilds, rules, valid, weekStarted])
  const current = valid ? calculateScenario(simulationGuilds, rules) : null
  const preview = calculateScenario(simulationGuilds, rules)
  const targetTotal = guilds.find((guild) => guild.id === targetId)?.targetTotal
  const matching = targetTotal === null || targetTotal === undefined ? enumeration.scenarios : enumeration.scenarios.filter((scenario) => scenario.results.find((result) => result.id === targetId)?.finalPoints === targetTotal)
  const targetRanks = [...new Set(enumeration.scenarios.map((scenario) => scenario.results.find((result) => result.id === targetId)?.finalRank).filter((rank): rank is number => Boolean(rank)))].sort((a, b) => a - b)
  const updateGuild = (id: string, patch: Partial<LeagueGuild>) => setGuilds((items) => items.map((guild) => guild.id === id ? { ...guild, ...patch } : guild))
  const updateWeek = (id: string, week: WeekNumber, patch: Partial<LeagueGuild['weeks'][WeekNumber]>) => setGuilds((items) => items.map((guild) => {
    if (guild.id !== id) return guild
    const weeks = { ...guild.weeks, [week]: { ...guild.weeks[week], ...patch } }
    if ((week === 1 || week === 3) && patch.rank !== undefined && patch.rank !== null) { const nextWeek = (week + 1) as 2 | 4; weeks[nextWeek] = { ...weeks[nextWeek], group: groupFromMatchRank(patch.rank) } }
    return { ...guild, weeks }
  }))
  const reset = () => { setGuilds(DEFAULT_GUILDS.map((guild) => ({ ...guild, weeks: { ...guild.weeks } }))); setTargetId(DEFAULT_GUILDS[0].id); setWeekStarted({ 1: true, 2: true, 3: true, 4: false }) }

  return <ContentPage active="/tools/league-points" title={t('league.title')} wide><div className="space-y-5" data-testid="league-points-page">
    <header className="border-b border-border pb-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t('league.eyebrow')}</p><h1 className="mt-1 text-3xl font-bold tracking-tight">{t('league.title')}</h1><p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{t('league.description')}</p></header>
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{t('league.rulesTitle')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('league.rulesHint')}</p></div><Button variant="ghost" size="sm" onClick={reset}><IconRefresh size={16} />{t('league.reset')}</Button></div><div className="mt-4 grid gap-4 xl:grid-cols-3"><RuleInputs title={t('league.matchPoints')} values={rules.matchPoints} t={t} /><RuleInputs title={t('league.round1Bonuses')} values={rules.round1Bonuses} t={t} /><RuleInputs title={t('league.round2Bonuses')} values={rules.round2Bonuses} t={t} /></div></section>
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">{t('league.rosterTitle')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('league.rosterHint')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>{t('league.target')}</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="h-9 min-w-32 rounded-md border border-border bg-background px-2 text-sm">{guilds.map((guild) => <option key={guild.id} value={guild.id}>{guild.name}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground"><span>{t('league.targetScore')}</span><Input aria-label={t('league.targetScore')} type="number" min={0} placeholder="—" value={targetTotal ?? ''} onChange={(event) => updateGuild(targetId, { targetTotal: event.target.value === '' ? null : numberValue(event.target.value) })} className="h-9 w-28 text-sm" /></label>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1080px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[14%]" />
            <col className="w-[11%]" />
            <col className="w-[10%]" />
            <col className="w-[14%]" />
            <col className="w-[11%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="w-36 whitespace-nowrap bg-slate-50 px-2 py-2 align-bottom dark:bg-slate-900/40">{t('league.guild')}</th>
              {([1, 2] as WeekNumber[]).map((week) => <th key={week} className="whitespace-nowrap bg-sky-50 px-2 py-2 align-bottom dark:bg-sky-950/20"><div className="flex items-center gap-2"><span className="font-semibold text-foreground">{t('league.weekShort', { week })}</span><button type="button" aria-pressed={weekStarted[week]} onClick={() => setWeekStarted((current) => ({ ...current, [week]: !current[week] }))} className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${weekStarted[week] ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-border bg-muted text-muted-foreground'}`}>{weekStarted[week] ? t('league.weekStarted') : t('league.weekNotStarted')}</button></div></th>)}
              <th className="w-24 whitespace-nowrap bg-sky-50 px-2 py-2 text-center align-bottom dark:bg-sky-950/20">{t('league.round1Total')}</th>
              {([3, 4] as WeekNumber[]).map((week) => <th key={week} className="whitespace-nowrap bg-violet-50 px-2 py-2 align-bottom dark:bg-violet-950/20"><div className="flex items-center gap-2"><span className="font-semibold text-foreground">{t('league.weekShort', { week })}</span><button type="button" aria-pressed={weekStarted[week]} onClick={() => setWeekStarted((current) => ({ ...current, [week]: !current[week] }))} className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${weekStarted[week] ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-border bg-muted text-muted-foreground'}`}>{weekStarted[week] ? t('league.weekStarted') : t('league.weekNotStarted')}</button></div></th>)}
              <th className="w-24 whitespace-nowrap bg-violet-50 px-2 py-2 text-center align-bottom dark:bg-violet-950/20">{t('league.round2Total')}</th>
              <th className="w-28 whitespace-nowrap bg-slate-50 px-2 py-2 text-center align-bottom dark:bg-slate-900/40">{t('league.currentTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {guilds.map((guild) => {
              const result = preview.results.find((item) => item.id === guild.id)!
              return <tr key={guild.id} className="border-b border-border/60 last:border-0">
                <td className="bg-slate-50 px-2 py-2 dark:bg-slate-900/40"><Input aria-label={t('league.guild')} value={guild.name} onChange={(event) => updateGuild(guild.id, { name: event.target.value })} className="h-9 w-28" /></td>
                <td className="bg-sky-50 px-2 py-2 dark:bg-sky-950/20"><WeekRankSelect guild={guild} week={1} started={weekStarted[1]} points={rules.matchPoints} t={t} onChange={(rank, group) => updateWeek(guild.id, 1, { rank, ...(group !== undefined ? { group } : {}) })} /></td>
                <td className="bg-sky-50 px-2 py-2 dark:bg-sky-950/20"><WeekRankSelect guild={guild} week={2} started={weekStarted[2]} points={rules.matchPoints} t={t} onChange={(rank, group) => updateWeek(guild.id, 2, { rank, ...(group !== undefined ? { group } : {}) })} /></td>
                <td className="bg-sky-50 px-2 py-2 text-center font-medium tabular-nums dark:bg-sky-950/20">{result.round1Total}</td>
                <td className="bg-violet-50 px-2 py-2 dark:bg-violet-950/20"><WeekRankSelect guild={guild} week={3} started={weekStarted[3]} points={rules.matchPoints} t={t} onChange={(rank, group) => updateWeek(guild.id, 3, { rank, ...(group !== undefined ? { group } : {}) })} /></td>
                <td className="bg-violet-50 px-2 py-2 dark:bg-violet-950/20"><WeekRankSelect guild={guild} week={4} started={weekStarted[4]} points={rules.matchPoints} t={t} onChange={(rank, group) => updateWeek(guild.id, 4, { rank, ...(group !== undefined ? { group } : {}) })} /></td>
                <td className="bg-violet-50 px-2 py-2 text-center font-medium tabular-nums dark:bg-violet-950/20">{result.round2Total}</td>
                <td className="bg-slate-50 px-2 py-2 text-center font-semibold tabular-nums dark:bg-slate-900/40">{result.finalPoints}</td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">{!valid ? <span className="text-xs text-amber-700 dark:text-amber-300"><IconInfoCircle size={14} className="mr-1 inline" />{t('league.rosterInvalid')}</span> : <span className="text-xs text-muted-foreground">{t('league.inputHint')}</span>}</div>
    </section>
    <section className="grid gap-4 lg:grid-cols-2"><div className="rounded-lg border border-border bg-card p-4 shadow-sm"><h2 className="font-semibold">{t('league.summaryTitle')}</h2>{!valid ? <p className="mt-3 text-sm text-muted-foreground">{t('league.completeRoster')}</p> : enumeration.truncated ? <p className="mt-3 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200"><IconInfoCircle size={16} className="mr-1 inline" />{t('league.tooMany', { limit: 6 })}</p> : <><p className="mt-3 text-xs text-muted-foreground">{t('league.possibleRanks')}</p><p className="mt-1 text-2xl font-semibold">{targetRanks.length ? targetRanks.map((rank) => t('league.rankValue', { rank })).join('、') : '—'}</p><p className="mt-1 text-xs text-muted-foreground">{t('league.scenarioCount', { count: matching.length })}</p>{matching.length ? <p className="mt-3 rounded-md border border-emerald-300/60 bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200">{t('league.qualifyCount', { count: matching.filter((scenario) => (scenario.results.find((result) => result.id === targetId)?.finalRank ?? 99) <= rules.qualificationCount).length })}</p> : <p className="mt-3 rounded-md border border-rose-300/60 bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/20 dark:text-rose-200">{t('league.noMatch')}</p>}</>}</div><div className="rounded-lg border border-border bg-card p-4 shadow-sm"><h2 className="font-semibold">{t('league.pathsTitle')}</h2>{!valid ? <p className="mt-3 text-sm text-muted-foreground">{t('league.completeRoster')}</p> : enumeration.truncated ? <p className="mt-3 text-sm text-muted-foreground">{t('league.tooMany', { limit: 6 })}</p> : matching.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t('league.noPath')}</p> : <div className="mt-3 space-y-2">{matching.slice(0, 6).map((scenario, index) => <ScenarioLine key={index} scenario={scenario} targetId={targetId} t={t} />)}</div>}</div></section>
    {current ? <section className="rounded-lg border border-border bg-card p-4 shadow-sm"><h2 className="font-semibold">{t('league.currentTitle')}</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="px-2 py-2">{t('league.guild')}</th>{([1, 2, 3, 4] as WeekNumber[]).map((week) => <th key={week} className="px-2 py-2">{t('league.weekShort', { week })}</th>)}<th className="px-2 py-2">{t('league.round1Total')}</th><th className="px-2 py-2">{t('league.round2Total')}</th><th className="px-2 py-2">{t('league.finalTotal')}</th><th className="px-2 py-2">{t('league.finalRank')}</th></tr></thead><tbody>{current.results.map((result) => <tr key={result.id} className="border-b border-border/60 last:border-0"><td className="px-2 py-2 font-medium">{result.name}</td>{result.weekPoints.map((points, index) => <td key={index} className="px-2 py-2">{points}</td>)}<td className="px-2 py-2">{result.round1Total}</td><td className="px-2 py-2">{result.round2Total}</td><td className="px-2 py-2 font-semibold">{result.finalPoints}</td><td className="px-2 py-2">#{result.finalRank}</td></tr>)}</tbody></table></div></section> : null}
  </div></ContentPage>
}

function RuleInputs({ title, values, t }: { title: string; values: number[]; t: (key: string, options?: Record<string, unknown>) => string }) { return <div><h3 className="text-sm font-medium">{title}</h3><div className="mt-2 grid grid-cols-4 gap-2">{values.map((value, index) => <div key={index} className="min-w-0 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-center"><span className="block truncate text-xs text-muted-foreground">{t('league.place', { rank: index + 1 })}</span><span className="mt-1 block text-lg font-semibold tabular-nums">{value}</span></div>)}</div></div> }
