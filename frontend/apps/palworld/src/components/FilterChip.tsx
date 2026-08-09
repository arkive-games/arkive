import type { ReactNode } from 'react'
import { cn } from '@gamemap/ui'

/** A toggleable filter pill, matching the Paldeck filter chips. */
export function FilterChip({
  active,
  onClick,
  tone = 'default',
  title,
  testId,
  children,
}: {
  active: boolean
  onClick: () => void
  tone?: 'default' | 'blue'
  title?: string
  testId?: string
  children: ReactNode
}) {
  const stateClass = tone === 'blue'
    ? active
      ? 'border-primary bg-primary font-semibold text-primary-foreground shadow-sm ring-2 ring-primary/20'
      : 'border-primary/40 bg-primary/5 text-foreground shadow-xs hover:border-primary/70 hover:bg-primary/10'
      : active
        ? 'border-primary bg-primary/15 text-foreground'
        : 'border-border bg-secondary/40 text-muted-foreground hover:border-primary/50 hover:text-foreground'

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition',
        stateClass,
      )}
    >
      {children}
    </button>
  )
}

/** Toggle a value in/out of a string-array selection. */
export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/** A titled row of filter chips: a fixed-width label followed by the chips. */
export function FilterRow({
  label,
  testId,
  children,
}: {
  label: string
  testId?: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-1.5" data-testid={testId}>
      <span className="mr-1 w-16 shrink-0 py-1 text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}
