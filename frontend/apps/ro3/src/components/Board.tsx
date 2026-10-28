import type { ReactNode, RefObject } from 'react'
import { cn } from '@gamemap/ui'

/** A board's sub choice: plain text with the stage colour underlining the lit one. */
export function UnderlineTab({ selected, onClick, children, className }: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'relative flex h-10 shrink-0 items-baseline px-2 pt-2.5 text-sm transition-colors after:absolute after:inset-x-2 after:bottom-1 after:h-1 after:rounded-full md:px-3 md:after:inset-x-3',
        selected
          ? 'font-bold text-foreground after:bg-[color:var(--ro3-stage)]'
          : 'font-semibold text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function DetailPanel({ panelRef, pointerRef, children, className }: {
  panelRef: RefObject<HTMLDivElement | null>
  pointerRef: RefObject<HTMLSpanElement | null>
  children: ReactNode
  className?: string
}) {
  return (
    <div ref={panelRef} className={cn('relative rounded-lg bg-[color:var(--ro3-skill-panel)] p-3 md:p-3.5', className)}>
      <span
        ref={pointerRef}
        aria-hidden="true"
        className="absolute left-9 top-0 -ml-2 -mt-2 size-4 rotate-45 rounded-[0.3rem_0.2rem] bg-[color:var(--ro3-skill-panel)] transition-[left,top] duration-300 ease-[cubic-bezier(.34,1.4,.64,1)]"
      />
      {children}
    </div>
  )
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[color:var(--arkive-filter-active)] px-1.5 text-xs font-bold leading-5 text-[color:var(--arkive-nav-active)]">
      {children}
    </span>
  )
}

/** What a node adds, one attribute a line with its value set large on the right. */
export function ValueList({ label, rows }: { label: string; rows: Array<[string, string]> }) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold text-muted-foreground">{label}</h4>
      <dl className="flex flex-col divide-y divide-border rounded-lg bg-card px-3 shadow-[0_0_0_1px_var(--border)]">
        {rows.map(([name, value]) => (
          <div key={name} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-sm text-foreground/80">{name}</dt>
            <dd className="text-base font-bold tabular-nums text-[color:var(--ro3-stage)]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function CostList({ label, rows }: { label: string; rows: Array<[string, string]> }) {
  if (rows.length === 0) return null
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <h4 className="text-xs font-semibold text-muted-foreground">{label}</h4>
      <ul className="flex flex-col gap-0.5 text-sm">
        {rows.map(([name, value]) => (
          <li key={name} className="flex items-baseline justify-between gap-2">
            <span className="truncate text-foreground/80">{name}</span>
            <span className="shrink-0 font-semibold tabular-nums">{value}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
