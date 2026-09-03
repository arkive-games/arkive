import { useId } from 'react'

import { TYPE } from '@/lib/typography'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const RANGE_CLASS = `h-6 w-full cursor-pointer accent-[color:var(--arkive-nav-accent)] disabled:cursor-default disabled:opacity-50 ${FOCUS}`
const ENDS_CLASS = `flex justify-between ${TYPE.valueMuted}`
const TICKS_CLASS = `relative h-4 ${TYPE.valueMuted}`
const HEADING_CLASS = 'flex items-baseline justify-between gap-2'
/** The tick or reading that is the current value, picked out from the scale around it. */
const CURRENT_CLASS = 'font-semibold text-foreground'

/**
 * Width of the browser's default range thumb. The track the thumb's centre
 * travels is the input's width less this, so per-step labels are laid out along
 * that inner span rather than the full width, or the end ones drift off the
 * marks they name.
 */
const THUMB_PX = 16

/**
 * An integer slider with its two ends labelled.
 *
 * Used wherever a value has a small, ordered range the player thinks of as a
 * ladder — relic grade, knowledge level, enhancement stage — rather than as a
 * number to type. `heading` adds a label/value line above the track for the
 * places that do not draw their own; without it the field is track and labels
 * only. `tickLabel` marks every step of the range and labels it, for a ladder
 * short enough that each rung deserves a name (the eight enhancement stages);
 * the two end labels are then not drawn, and the current step's label is
 * picked out, so the scale is also the reading. `showValue` puts the current
 * value between the two end labels for the same reason. `labels` puts the
 * label row above the track instead of below, so two stacked sliders can share
 * the middle. A range with one value (`min === max`) is shown disabled: there is
 * nothing to drag to.
 */
export default function RangeField({
  label,
  min,
  max,
  value,
  valueText,
  minLabel,
  maxLabel,
  tickLabel,
  labels = 'below',
  showValue = false,
  testId,
  heading = false,
  onChange,
}: {
  label: string
  min: number
  max: number
  value: number
  valueText: string
  minLabel: string
  maxLabel: string
  /** Labels every step in place of the two end labels. */
  tickLabel?: (value: number) => string
  labels?: 'above' | 'below'
  /** Reads the current value between the two end labels. */
  showValue?: boolean
  testId: string
  heading?: boolean
  onChange: (value: number) => void
}) {
  const listId = useId()
  const clamped = Math.min(max, Math.max(min, value))
  const steps = tickLabel && max > min ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : null

  const labelRow = steps ? (
    <div className={TICKS_CLASS} aria-hidden>
      {steps.map((step) => (
        <span
          key={step}
          className={`absolute -translate-x-1/2 whitespace-nowrap ${step === clamped ? CURRENT_CLASS : ''}`}
          style={{ left: `calc(${THUMB_PX / 2}px + ${(step - min) / (max - min)} * (100% - ${THUMB_PX}px))` }}
        >
          {tickLabel?.(step)}
        </span>
      ))}
    </div>
  ) : (
    <div className={ENDS_CLASS}>
      <span>{minLabel}</span>
      {showValue ? (
        <span className={CURRENT_CLASS} data-testid={`${testId}-value`}>
          {valueText}
        </span>
      ) : null}
      <span>{maxLabel}</span>
    </div>
  )

  return (
    <div className="min-w-0">
      {heading ? (
        <div className={HEADING_CLASS}>
          <span className={TYPE.label}>{label}</span>
          <span className={TYPE.value} data-testid={`${testId}-value`}>
            {valueText}
          </span>
        </div>
      ) : null}
      {labels === 'above' ? labelRow : null}
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={clamped}
        disabled={min >= max}
        list={steps ? listId : undefined}
        className={RANGE_CLASS}
        aria-label={label}
        aria-valuetext={valueText}
        data-testid={testId}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {steps ? (
        <datalist id={listId}>
          {steps.map((step) => (
            <option key={step} value={step} />
          ))}
        </datalist>
      ) : null}
      {labels === 'below' ? labelRow : null}
    </div>
  )
}
