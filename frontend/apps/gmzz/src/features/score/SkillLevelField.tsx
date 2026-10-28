import type { ReactNode } from 'react'
import { IconInfoCircle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { MAX_SKILL_LEVEL } from '@/features/score/bonds'
import { Stepper } from '@/features/score/Stepper'

/**
 * The shared skill level, as the pathway, puppet and connection details all
 * show it: a stepper under its label, with the cap beside the label.
 *
 * 途径, 秘偶 and 人脉 skill levels are always equal, so the three fields write
 * one value. The cap is what the role and divinity level allow, and the field
 * refuses anything above it. Relic rare words add levels on top
 * (`SkillLvPlus_N`); those take effect in game but never count toward the
 * score, so they are only told on the info mark's tooltip, never added.
 */
export function SkillLevelField({ value, cap, relicBonus, testId, note, onChange }: {
  value: number
  cap: number | null
  relicBonus: number
  testId: string
  /** Drawn last: a formula hint for how this skill scores. */
  note?: ReactNode
  onChange: (level: number) => void
}) {
  const { t } = useTranslation()
  const max = cap ?? MAX_SKILL_LEVEL
  const relicTip = relicBonus > 0
    ? t('bonds.skillLevelRelic', { bonus: relicBonus, total: Math.min(value, max) + relicBonus })
    : t('bonds.skillLevelRelicNote')
  return (
    <div className="gz-field" data-testid={`${testId}-row`}>
      <span className="flex items-center gap-1">
        {t('bonds.skillLevel')}
        {cap !== null ? <em className="num" data-testid={`${testId}-cap`}>{t('bonds.skillLevelCapShort', { cap })}</em> : null}
        <span className={`gz-tip end ${relicBonus > 0 ? 'on' : ''}`} tabIndex={0} role="img" data-tip={relicTip} aria-label={relicTip}
          data-testid={`${testId}-relic`}>
          <IconInfoCircle stroke={1.8} aria-hidden />
        </span>
        {note}
      </span>
      <Stepper value={Math.min(value, max)} min={1} max={max} onChange={onChange} label={t('bonds.skillLevel')} testId={testId} />
    </div>
  )
}
