const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const RANGE_CLASS = `h-6 w-full cursor-pointer accent-[color:var(--arkive-nav-accent)] disabled:cursor-default disabled:opacity-50 ${FOCUS}`
const ENDS_CLASS = 'flex justify-between text-xs tabular-nums text-muted-foreground'
const HEADING_CLASS = 'flex items-baseline justify-between gap-2 text-xs'

/**
 * An integer slider with its two ends labelled.
 *
 * Used wherever a value has a small, ordered range the player thinks of as a
 * ladder — relic grade, knowledge level, enhancement stage — rather than as a
 * number to type. `heading` adds a label/value line above the track for the
 * places that do not draw their own; without it the field is track and ends
 * only. A range with one value (`min === max`) is shown disabled: there is
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
  testId: string
  heading?: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className="min-w-0">
      {heading ? (
        <div className={HEADING_CLASS}>
          <span className="font-semibold text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums text-foreground" data-testid={`${testId}-value`}>
            {valueText}
          </span>
        </div>
      ) : null}
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={Math.min(max, Math.max(min, value))}
        disabled={min >= max}
        className={RANGE_CLASS}
        aria-label={label}
        aria-valuetext={valueText}
        data-testid={testId}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className={ENDS_CLASS}>
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  )
}
