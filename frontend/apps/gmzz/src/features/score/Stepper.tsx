import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { clamp } from '@/features/score/data'

/**
 * A number between two round −/+ buttons, the score page's one numeric input.
 * `pill` is the full-height field; `mini` is the compact well used inside
 * talent and puppet cards.
 *
 * The box holds what was typed and the clamp lands on blur. Clamping on every
 * keystroke makes a two-digit level unretypable: clearing "70" snaps the box to
 * the minimum, and the next digits append to it — type "65" and you get "165",
 * clamped straight back to 70, so the box shows the value you were trying to
 * replace. `draft` is null whenever the box is not being edited, so external
 * changes still flow in.
 */
export function Stepper({ value, min, max, onChange, label, testId, disabled = false, variant = 'pill' }: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  /** What the number is, for the input's and the buttons' accessible names. */
  label: string
  testId: string
  disabled?: boolean
  variant?: 'pill' | 'mini'
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string | null>(null)
  const step = (delta: number) => onChange(clamp(value + delta, min, max))

  return (
    <span className={variant === 'mini' ? 'gz-mini' : 'gz-step'} data-testid={`${testId}-stepper`}>
      <button type="button" disabled={disabled || value <= min} onClick={() => step(-1)}
        aria-label={t('score.stepDown', { name: label })} data-testid={`${testId}-down`}>−</button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft ?? value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => {
          const raw = event.target.value
          setDraft(raw)
          // An in-range value applies as you type; anything else waits for blur
          // rather than yanking the caret to a clamped number.
          const parsed = Math.trunc(Number(raw))
          if (raw !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) onChange(parsed)
        }}
        onBlur={() => {
          if (draft !== null && draft !== '') onChange(clamp(Math.trunc(Number(draft)), min, max))
          setDraft(null)
        }}
        data-testid={testId}
      />
      <button type="button" disabled={disabled || value >= max} onClick={() => step(1)}
        aria-label={t('score.stepUp', { name: label })} data-testid={`${testId}-up`}>+</button>
    </span>
  )
}
