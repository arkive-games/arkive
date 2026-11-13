import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tip } from '@/features/score/Tip'
import { loadFateTributary, type FateAwakeningLevel, type FateEchoLevel, type FateTributary as FateData } from './data'
import { useRemoteData } from '@/lib/useRemoteData'

function isPercentAttribute(key: string) {
  return key.endsWith('_P') || key.includes('Multi') || key.includes('Divi')
}

function formatAttribute(key: string, value: number, name: string) {
  const shown = isPercentAttribute(key) ? `${Number((value * 100).toFixed(2))}%` : value
  return `${name} +${shown}`
}

function AwakeningTable({ levels }: { levels: FateAwakeningLevel[] }) {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full min-w-[34rem] text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t('fellows.fateScale')}</th>
            <th className="px-3 py-2 font-medium">{t('fellows.fateCost')}</th>
            <th className="px-3 py-2 font-medium">{t('fellows.fateSourceCore')}</th>
            <th className="px-3 py-2 font-medium">{t('fellows.fateEcho')}</th>
            <th className="px-3 py-2 font-medium">{t('fellows.fateRelationRequirement')}</th>
          </tr>
        </thead>
        <tbody>
          {levels.map((level) => (
            <tr key={level.level} className="border-t border-border/60">
              <td className="px-3 py-2 font-semibold tabular-nums">{level.level}</td>
              <td className="px-3 py-2 tabular-nums">{level.itemCount} {t('fellows.fateCrystal')}</td>
              <td className="px-3 py-2 tabular-nums">{level.sourceCoreCount ? `+${level.sourceCoreCount}` : '—'}</td>
              <td className="px-3 py-2 tabular-nums">+{level.echoGain}</td>
              <td className="px-3 py-2 tabular-nums">{t('fellows.fateRelationLevel', { level: level.relationLevelCap })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GlobalEchoSlider({ data }: { data: FateData }) {
  const { t } = useTranslation()
  const [level, setLevel] = useState(0)
  const selected = level > 0 ? data.echoTable[level - 1] : undefined
  const serverTip = selected
    ? t('fellows.fateServerGainTip', { score: selected.score, mark: selected.mark })
    : t('fellows.fateServerGainNone')
  return (
    <section className="border-t border-border/70 pt-4" aria-labelledby="fate-global-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="fate-global-title" className="text-sm font-semibold">{t('fellows.fateGlobalTitle', { count: data.echoTable.length })}</h3>
        <Tip title={t('fellows.fateServerEffectLabel')} content={serverTip} label={t('fellows.fateServerEffectLabel')} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('fellows.fateGlobalDescription')}</p>
      <div className="mt-3 grid gap-3 rounded-lg border border-border/70 bg-background/40 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <label className="flex min-w-0 items-center gap-3" htmlFor="fate-global-level">
          <span className="shrink-0 text-sm font-medium">{t('fellows.fateGlobalLevel', { level })}</span>
          <input id="fate-global-level" type="range" min={0} max={data.echoTable.length} value={level} onChange={(event) => setLevel(Number(event.target.value))} className="min-w-0 flex-1" />
        </label>
        <label className="flex items-center gap-2 text-sm" htmlFor="fate-global-level-input">
          <span className="text-muted-foreground">0–{data.echoTable.length}</span>
          <input id="fate-global-level-input" type="number" min={0} max={data.echoTable.length} value={level} onChange={(event) => setLevel(Math.min(data.echoTable.length, Math.max(0, Number(event.target.value) || 0)))} className="w-16 rounded border border-border bg-background px-2 py-1 text-center tabular-nums" />
        </label>
      </div>
      {selected ? <EchoLevel level={selected} name={data.attributeNames} /> : <p className="mt-3 text-sm text-muted-foreground">{t('fellows.fateGlobalNone')}</p>}
    </section>
  )
}

function EchoLevel({ level, name }: { level: FateEchoLevel; name: Record<string, string> }) {
  const { t } = useTranslation()
  return (
    <article className="mt-3 rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{t('fellows.fateGlobalLevel', { level: level.level })}</h4>
        <span className="text-xs tabular-nums text-muted-foreground">{t('fellows.fateGlobalScore', { score: level.score })}</span>
      </div>
      <ul className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {Object.entries(level.attributes).map(([key, value]) => <li key={key}>{formatAttribute(key, value, name[key] ?? key)}</li>)}
      </ul>
    </article>
  )
}

export function FateTributaryPanel({ data, compact = false }: { data: FateData; compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <section className={`rounded-xl border border-border bg-card p-4 ${compact ? 'mt-4' : 'mt-6'}`} aria-labelledby="fate-tributary-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="fate-tributary-title" className="text-lg font-semibold">{t('fellows.fateTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('fellows.fateDescription')}</p>
        </div>
        <Tip title={t('fellows.fateServerEffectLabel')} content={t('fellows.fateServerEffectTip')} label={t('fellows.fateServerEffectLabel')} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded border border-border/70 bg-background/40 px-2 py-1">{t('fellows.fateEligibleSummary', { eligible: data.eligibleRelationCount, total: data.relationCount })}</span>
        <span className="rounded border border-border/70 bg-background/40 px-2 py-1">{t('fellows.fateScaleSummary', { levels: data.awakeningLevelCount })}</span>
      </div>
      <div className="mt-3">
        <AwakeningTable levels={data.awakeningLevels} />
      </div>
      <GlobalEchoSlider data={data} />
      {!compact ? (
        <section className="mt-4 border-t border-border/70 pt-3">
          <h3 className="text-sm font-semibold">{t('fellows.fateStoryTitle')}</h3>
          <div className="mt-2 space-y-2">
            {data.capUnlocks.map((unlock) => <p key={unlock.militaryId} className="whitespace-pre-line text-sm text-muted-foreground">{unlock.story || unlock.content}</p>)}
          </div>
        </section>
      ) : null}
    </section>
  )
}

export function FateTributary() {
  const { t } = useTranslation()
  const fate = useRemoteData(loadFateTributary)
  if (fate.error) return <p className="mt-6 text-sm text-muted-foreground">{t('fellows.fateLoadError')}</p>
  if (fate.loading || !fate.data) return <p className="mt-6 text-sm text-muted-foreground">{t('loading')}</p>
  return <FateTributaryPanel data={fate.data} />
}
