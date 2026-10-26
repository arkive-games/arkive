import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { MAX_SKILL_LEVEL } from '@/features/score/bonds'
import { TYPE } from '@/lib/typography'

const NUMBER_CLASS = 'h-9 border-border bg-background text-sm tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]'

/**
 * The shared skill level, as the pathway, puppet and connection details all
 * show it. 途径, 秘偶 and 人脉 skill levels are always equal, so the three
 * fields write one value. The cap is what the role and divinity level allow,
 * and the field refuses anything above it. Relic rare words add levels on top
 * (`SkillLvPlus_N`); those take effect in game but never count toward the
 * score, so they are shown beside the field and not added to it.
 */
export function SkillLevelField({ value, cap, relicBonus, testId, onChange }: {
  value: number
  cap: number | null
  relicBonus: number
  testId: string
  onChange: (level: number) => void
}) {
  const { t } = useTranslation()
  const max = cap ?? MAX_SKILL_LEVEL
  return (
    <div className="min-w-0">
      <label className="block w-28">
        <span className={`mb-0.5 block ${TYPE.label}`}>
          {cap === null ? t('bonds.skillLevel') : t('bonds.skillLevelCap', { cap })}
        </span>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          value={Math.min(value, max)}
          onChange={(event) => {
            const raw = Math.trunc(Number(event.target.value))
            if (Number.isFinite(raw) && raw >= 1) onChange(Math.min(raw, max))
          }}
          className={NUMBER_CLASS}
          data-testid={testId}
        />
      </label>
      {relicBonus > 0 ? (
        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300" data-testid={`${testId}-relic`}>
          {t('bonds.skillLevelRelic', { bonus: relicBonus, total: Math.min(value, max) + relicBonus })}
        </p>
      ) : null}
      <p className="mt-0.5 max-w-xs text-xs leading-5 text-muted-foreground">{t('bonds.skillLevelRelicNote')}</p>
    </div>
  )
}
