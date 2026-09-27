import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { cn, Dialog, DialogContent, DialogTitle, Input } from '@gamemap/ui'
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

export function Chip({ active, onClick, children, disabled = false, count }: {
  active: boolean
  onClick: () => void
  children: ReactNode
  disabled?: boolean
  /** How many records the chip would leave; shown after the label. */
  count?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        active
          ? 'border-ring bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]'
          : 'border-border text-muted-foreground enabled:hover:border-primary/60',
      )}
    >
      {children}
      {count !== undefined ? <span className="text-xs opacity-70">{count}</span> : null}
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
    <dl className={cn('grid gap-px overflow-hidden rounded-md border border-border bg-border', items.length % 3 === 0 ? 'grid-cols-3' : 'grid-cols-2')}>
      {items.map((item) => (
        <div key={item.label} className="bg-card px-3 py-2">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 text-sm font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Name-and-figure chips, the way every table lists an item's attributes. */
export function AttributeChips({ values }: { values: Array<{ key: number | string; label: ReactNode; value: ReactNode }> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((item) => (
        <span key={item.key} className="rounded bg-[color:var(--arkive-filter-active)] px-1.5 py-0.5 text-xs">
          {item.label} <b className="font-semibold text-[color:var(--arkive-nav-active)]">{item.value}</b>
        </span>
      ))}
    </div>
  )
}

/** Effect rows: a line of text with a short note under it. */
export function EffectList({ rows }: { rows: Array<{ key: number | string; title: ReactNode; note?: ReactNode }> }) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <div key={row.key} className="flex flex-col gap-0.5 rounded-md bg-muted px-3 py-2">
          <span className="text-sm">{row.title}</span>
          {row.note ? <span className="text-xs text-muted-foreground">{row.note}</span> : null}
        </div>
      ))}
    </div>
  )
}

/**
 * List on the left, detail on the right -- or, on a phone, the detail in the
 * shared dialog, so it is not stranded below hundreds of tiles.
 */
export function CatalogLayout({ list, detail, detailLabel, open, onClose }: {
  list: ReactNode
  detail: ReactNode
  detailLabel: string
  open: boolean
  onClose: () => void
}) {
  const [isCompact, setIsCompact] = useState(() => window.matchMedia('(width < 1024px)').matches)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const media = window.matchMedia('(width < 1024px)')
    const update = () => {
      setIsCompact(media.matches)
      closeRef.current()
    }
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-3">{list}</div>
      <div className="hidden lg:sticky lg:top-4 lg:block">
        <DetailPanel label={detailLabel}>{detail}</DetailPanel>
      </div>
      <Dialog open={isCompact && open} onOpenChange={(next) => { if (!next) onClose() }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogTitle className="sr-only">{detailLabel}</DialogTitle>
          <div className="flex flex-col gap-4">{detail}</div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
}

/**
 * A catalogue tile for an item record: icon, name and one meta line, with the
 * record's quality as a coloured top edge -- the game marks quality that way.
 */
export function RecordTile({ icon, name, meta, accent, active, onClick }: {
  icon: ReactNode
  name: string
  meta: ReactNode
  accent: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{ borderTopColor: accent }}
      className={cn(
        'flex min-w-0 flex-col gap-1.5 rounded-md border border-t-[3px] bg-card p-2 text-left transition-colors',
        active ? 'border-ring bg-[color:var(--arkive-filter-active)]' : 'border-border hover:border-primary/60',
      )}
    >
      <span className="grid aspect-square w-full place-items-center overflow-hidden rounded bg-muted">{icon}</span>
      <span className="truncate text-sm font-semibold">{name}</span>
      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">{meta}</span>
    </button>
  )
}

/** The head of an item's detail column: icon, a coloured kicker, name, note. */
export function RecordHeader({ icon, fallback, kicker, kickerColor, name, note }: {
  icon?: string
  fallback: ReactNode
  kicker: string
  kickerColor: string
  name: string
  note: string
}) {
  return (
    <header className="flex items-center gap-3 border-b border-border pb-4">
      <IconTile className="size-14" src={icon} fallback={fallback} />
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium" style={{ color: kickerColor }}>{kicker}</span>
        <h3 className="text-lg font-semibold">{name}</h3>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
    </header>
  )
}

/** A game icon on a quiet square, so transparent artwork has an edge. */
export function IconTile({ src, fallback, className }: { src?: string; fallback: ReactNode; className?: string }) {
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted', className)}>
      {src ? <img src={src} alt="" loading="lazy" className="size-full object-contain" /> : fallback}
    </span>
  )
}
