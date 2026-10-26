import type { ReactNode } from 'react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { MAX_SKILL_LEVEL } from '@/features/score/bonds'
import { TYPE } from '@/lib/typography'

const NUMBER_CLASS = 'h-9 w-20 border-border bg-background text-sm tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]'

/**
 * The shared skill level, as the pathway, puppet and connection details all
 * show it: one line, the box on the left and everything about it to its right
 * — the cap, the levels relics add, and the notes.
 *
 * 途径, 秘偶 and 人脉 skill levels are always equal, so the three fields write
 * one value. The cap is what the role and divinity level allow, and the field
 * refuses anything above it. Relic rare words add levels on top
 * (`SkillLvPlus_N`); those take effect in game but never count toward the
 * score, so they are shown beside the field and not added to it.
 */
export function SkillLevelField({ value, cap, relicBonus, testId, note, onChange }: {
  value: number
  cap: number | null
  relicBonus: number
  testId: string
  /** Drawn last on the line: a formula hint for how this skill scores. */
  note?: ReactNode
  onChange: (level: number) => void
}) {
  const { t } = useTranslation()
  const max = cap ?? MAX_SKILL_LEVEL
  return (
    <div className="flex w-full basis-full flex-wrap items-center gap-x-3 gap-y-1" data-testid={`${testId}-row`}>
      <label className="flex items-center gap-2">
        <span className={TYPE.label}>{t('bonds.skillLevel')}</span>
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
      {cap !== null ? (
        <span className="text-xs font-semibold tabular-nums text-foreground" data-testid={`${testId}-cap`}>{t('bonds.skillLevelCapShort', { cap })}</span>
      ) : null}
      {relicBonus > 0 ? (
        <span className="text-xs text-amber-700 dark:text-amber-300" data-testid={`${testId}-relic`}>
          {t('bonds.skillLevelRelic', { bonus: relicBonus, total: Math.min(value, max) + relicBonus })}
        </span>
      ) : (
        // One sentence about relic levels: the bonus when there is one, the rule otherwise.
        <span className="text-xs text-muted-foreground">{t('bonds.skillLevelRelicNote')}</span>
      )}
      {note}
    </div>
  )
}
