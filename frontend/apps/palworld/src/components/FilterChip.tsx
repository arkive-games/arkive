import type { ReactNode } from 'react'
import { cn } from '@gamemap/ui'

/** A toggleable filter pill, matching the Paldeck filter chips. */
export function FilterChip({
  active,
  onClick,
  title,
  testId,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  testId?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition',
        active
          ? 'border-primary bg-primary/15 text-foreground'
          : 'border-border bg-secondary/40 text-muted-foreground hover:border-primary/50 hover:text-foreground',
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
    <div className="flex flex-wrap items-center gap-1.5" data-testid={testId}>
      <span className="mr-1 w-16 shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
