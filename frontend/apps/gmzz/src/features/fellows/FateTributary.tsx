import { useTranslation } from 'react-i18next'

import { loadFateTributary, type FateMilestone } from './data'
import { useRemoteData } from '@/lib/useRemoteData'

function formatAttribute(key: string, value: number): string {
  const percent = key.endsWith('_P') || key.includes('Multi') || key.includes('Divi')
  return `${key}: ${percent ? `${(value * 100).toFixed(1)}%` : value}`
}

function milestoneAttributes(milestone: FateMilestone): string[] {
  return Object.entries(milestone.attributes).map(([key, value]) => formatAttribute(key, value))
}

export function FateTributary() {
  const { t, i18n } = useTranslation()
  const fate = useRemoteData(loadFateTributary)

  if (fate.error) return <p className="text-sm text-muted-foreground">{t('fellows.fateLoadError')}</p>
  if (fate.loading || !fate.data) return <p className="text-sm text-muted-foreground">{t('loading')}</p>

  const locale = i18n.language
  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4" aria-labelledby="fate-tributary-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="fate-tributary-title" className="text-lg font-semibold">{t('fellows.fateTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('fellows.fateDescription')}</p>
        </div>
        <span className="rounded border border-amber-500/50 bg-amber-50/50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {t('fellows.fateStrategicOnly')}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2">{t('fellows.fateStep')}</th>
              <th className="px-2 py-2">{t('fellows.fateCost')}</th>
              <th className="px-2 py-2">{t('fellows.fateEcho')}</th>
              <th className="px-2 py-2">{t('fellows.fateScore')}</th>
              <th className="px-2 py-2">{t('fellows.fateEffect')}</th>
            </tr>
          </thead>
          <tbody>
            {fate.data.milestones.map((milestone) => (
              <tr key={milestone.id} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-2 align-top tabular-nums">{milestone.id}</td>
                <td className="px-2 py-2 align-top tabular-nums">{milestone.itemCount}</td>
                <td className="px-2 py-2 align-top tabular-nums">
                  +{milestone.echoGain} · {milestone.echoPoints}
                  {milestone.awakePoints ? <span className="ml-1 text-primary">★{milestone.awakePoints}</span> : null}
                </td>
                <td className="px-2 py-2 align-top tabular-nums">{milestone.score} / {milestone.mark}</td>
                <td className="max-w-sm px-2 py-2 align-top text-xs text-muted-foreground">
                  {milestoneAttributes(milestone).join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{t('fellows.fateScoreNote')}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {fate.data.capUnlocks.map((unlock) => (
          <div key={unlock.level} className="rounded-md border border-border/70 p-3">
            <p className="text-sm font-semibold">{t('fellows.fateCap', { level: unlock.level })}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {unlock.unlockTime
                ? new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(unlock.unlockTime * 1000))
                : t('fellows.fateUnlockUnknown')}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

