import type { ReactNode } from 'react'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)]'
const ARROW_CLASS = `flex min-h-0 flex-1 items-center justify-center px-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35 ${FOCUS}`

/**
 * A native select with two arrows fused to its right edge that step to the
 * next larger or smaller option — a number box and a drop-down in one, for a
 * ladder long enough that opening the list to move one rung is a chore.
 *
 * The caller owns the ordering, so `onUp`/`onDown` say what "larger" means;
 * null at an end of the ladder disables that arrow. `className` is the select's
 * own, with its right corners squared off here to meet the arrows.
 */
export default function StepSelect({
  value,
  label,
  upLabel,
  downLabel,
  testId,
  className,
  onChange,
  onUp,
  onDown,
  children,
}: {
  value: string | number
  label: string
  upLabel: string
  downLabel: string
  testId: string
  className: string
  onChange: (raw: string) => void
  onUp: (() => void) | null
  onDown: (() => void) | null
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${className} rounded-r-none`}
        aria-label={label}
        data-testid={testId}
      >
        {children}
      </select>
      <div className="flex shrink-0 flex-col overflow-hidden rounded-r-md border border-l-0 border-border bg-background">
        <button type="button" className={ARROW_CLASS} disabled={!onUp} onClick={() => onUp?.()}
          aria-label={upLabel} title={upLabel} data-testid={`${testId}-up`}>
          <IconChevronUp className="size-3" stroke={2} aria-hidden />
        </button>
        <button type="button" className={`${ARROW_CLASS} border-t border-border`} disabled={!onDown} onClick={() => onDown?.()}
          aria-label={downLabel} title={downLabel} data-testid={`${testId}-down`}>
          <IconChevronDown className="size-3" stroke={2} aria-hidden />
        </button>
      </div>
    </div>
  )
}
