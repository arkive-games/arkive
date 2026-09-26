import type { HTMLAttributes, ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { cn, Input } from '@gamemap/ui'
import content from '../locales/zh-CN.json'

/**
 * The building blocks every RO3 table is made of, in the idiom the other
 * games' catalogue pages use -- underline tabs, bordered chips, a search input
 * with a leading icon, bordered card panels. Shared so seven tables cannot
 * drift into seven chip styles again, which is where the old stylesheet was.
 */

export function TabRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn('flex flex-wrap items-end gap-1 border-b border-border', className)}>
      {children}
    </div>
  )
}

export function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-1.5 text-sm transition-colors',
        active ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm transition-colors',
        active
          ? 'border-ring bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]'
          : 'border-border text-muted-foreground hover:border-primary/60',
      )}
    >
      {children}
    </button>
  )
}

export function SearchField({ value, onChange, label, placeholder, className }: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder: string
  className?: string
}) {
  return (
    <label className={cn('relative block', className)}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        className="pl-9 pr-9"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      {value ? (
        <button
          type="button"
          aria-label={content.search.clear}
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </label>
  )
}

export function Panel({ children, className, ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn('rounded-lg border border-border bg-card p-4 shadow-sm', className)} {...rest}>
      {children}
    </section>
  )
}

/**
 * The detail column beside a list. It sticks while the list scrolls on wide
 * screens, and stacks under the list below `lg`.
 */
export function DetailPanel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <aside aria-label={label} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm lg:sticky lg:top-4 lg:self-start">
      {children}
    </aside>
  )
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {children}
    </section>
  )
}

export function Facts({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    // The hairlines are the `bg-border` showing through a 1px gap, so a row
    // must be full or its empty cell reads as a grey block.
    <dl className={cn('grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border', items.length % 3 === 0 && 'sm:grid-cols-3')}>
      {items.map((item) => (
        <div key={item.label} className="bg-card px-3 py-2">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
}

/** A game icon on a quiet square, so transparent artwork has an edge. */
export function IconTile({ src, fallback, className }: { src?: string; fallback: ReactNode; className?: string }) {
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted', className)}>
      {src ? <img src={src} alt="" loading="lazy" className="size-full object-contain" /> : fallback}
    </span>
  )
}
