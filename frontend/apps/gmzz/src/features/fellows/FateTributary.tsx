import { useTranslation } from 'react-i18next'

import { Tip } from '@/features/score/Tip'
import { loadFateTributary, type FateMilestone } from './data'
import { useRemoteData } from '@/lib/useRemoteData'

const ATTRIBUTE_NAMES: Record<string, string> = {
  Atk_P: '攻击',
  Pierce_P: '穿刺',
  Block_P: '格挡',
  CritHurt_N: '暴击伤害',
  CritDef_N: '暴击防御',
  DeltaHurt_N: '造成伤害',
  DeltaBeHurted_N: '受到伤害',
  AllControlAcc_N: '全控制命中',
  AllControlEva_N: '全控制抵抗',
  AllProHurtMulti_N: '全系伤害加深',
  AllProHurtDivi_N: '全系伤害减免',
}

function isPercentAttribute(key: string) {
  return key.endsWith('_P') || key.includes('Multi') || key.includes('Divi')
}

function formatAttribute(key: string, value: number) {
  const shown = isPercentAttribute(key) ? `${Number((value * 100).toFixed(2))}%` : value
  return `${ATTRIBUTE_NAMES[key] ?? key} +${shown}`
}

function Milestone({ milestone }: { milestone: FateMilestone }) {
  const { t } = useTranslation()
  return (
    <article className="rounded-lg border border-border/70 bg-background/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('fellows.fateStep', { step: milestone.id })}</h3>
        {milestone.awakePoints ? <span className="text-xs font-medium text-primary">★{milestone.awakePoints}</span> : null}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t('fellows.fateCost')}</dt>
        <dd className="tabular-nums">{milestone.itemCount} {t('fellows.fateCrystal')}</dd>
        <dt className="text-muted-foreground">{t('fellows.fateEcho')}</dt>
        <dd className="tabular-nums">+{milestone.echoGain}</dd>
      </dl>
      <div className="mt-3 border-t border-border/60 pt-2">
        <p className="text-xs font-semibold">{t('fellows.fateAttributes')}</p>
        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
          {Object.entries(milestone.attributes).map(([key, value]) => <li key={key}>{formatAttribute(key, value)} <span>({t('fellows.fateCumulative')})</span></li>)}
        </ul>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t('fellows.fateServerGain', { score: milestone.score, mark: milestone.mark })}</p>
    </article>
  )
}

export function FateTributary() {
  const { t } = useTranslation()
  const fate = useRemoteData(loadFateTributary)

  if (fate.error) return <p className="mt-6 text-sm text-muted-foreground">{t('fellows.fateLoadError')}</p>
  if (fate.loading || !fate.data) return <p className="mt-6 text-sm text-muted-foreground">{t('loading')}</p>

  const serverTooltip = (
    <>
      <p>{t('fellows.fateServerBefore')}</p>
      <p className="mt-1">{t('fellows.fateServerAfter')}</p>
      <p className="mt-1">{t('fellows.fateCapHidden', { caps: fate.data.capUnlocks.map((unlock) => `${unlock.level}级`).join(' / ') })}</p>
    </>
  )

  return (
    <section className="mt-6 rounded-xl border border-border bg-card p-4" aria-labelledby="fate-tributary-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="fate-tributary-title" className="text-lg font-semibold">{t('fellows.fateTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('fellows.fateDescription')}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded border border-amber-500/50 bg-amber-50/50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {t('fellows.fateServerEffectLabel')}
          <Tip kind="info" title={t('fellows.fateServerEffectLabel')} content={serverTooltip} label={t('fellows.fateServerEffectLabel')} />
        </span>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{t('fellows.fateAttributeNote')}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {fate.data.milestones.map((milestone) => <Milestone key={milestone.id} milestone={milestone} />)}
      </div>

      <section className="mt-4 border-t border-border/70 pt-3">
        <h3 className="text-sm font-semibold">{t('fellows.fateStoryTitle')}</h3>
        <div className="mt-2 space-y-2">
          {fate.data.capUnlocks.map((unlock) => (
            <p key={unlock.militaryId} className="whitespace-pre-line text-sm text-muted-foreground">
              {unlock.story || unlock.content}
            </p>
          ))}
        </div>
      </section>
    </section>
  )
}
