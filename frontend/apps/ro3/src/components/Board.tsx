import { useRef, type ReactNode, type RefObject } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { pageWindow } from '../wikiBoards'

const WARM_BUTTON = 'bg-[image:var(--arkive-warm-search)] text-[color:var(--arkive-warm-search-foreground)] shadow-[0_0.3rem_0.8rem_rgba(236,122,28,0.28)]'

/** A page's main choice: a muted track whose lit pill is filled. Scrolls sideways on phones. */
export function PillTrack({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="tablist" aria-label={label} className="flex w-full gap-0.5 overflow-x-auto rounded-full bg-muted p-1 [scrollbar-width:none] md:w-fit">
      {children}
    </div>
  )
}

export function PillTab({ selected, onClick, count, children }: { selected: boolean; onClick: () => void; count?: number; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'flex min-h-10 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-colors md:flex-none md:px-4',
        selected ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {count !== undefined ? <span className={cn('text-xs tabular-nums', selected ? 'opacity-70' : 'opacity-80')}>{count}</span> : null}
    </button>
  )
}

/** The phone header's round search button, which unfolds the search box. */
export function SearchToggle({ open, label, onToggle }: { open: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      onClick={onToggle}
      className={cn('grid size-9 place-items-center rounded-full transition-colors', open ? 'bg-foreground text-background' : WARM_BUTTON)}
    >
      <Search aria-hidden="true" className="size-4" />
    </button>
  )
}

/** The pill search box: always shown from `lg`, folded behind the header toggle below. */
export function SearchBox({ open, query, onQuery, label, placeholder }: {
  open: boolean
  query: string
  onQuery: (query: string) => void
  label: string
  placeholder: string
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        input.current?.focus()
      }}
      className={cn(
        'w-full items-center gap-2 rounded-full border border-border bg-card py-1 pl-4 pr-1 transition-shadow focus-within:ring-2 focus-within:ring-ring/40 lg:flex lg:w-[23rem]',
        open ? 'flex' : 'hidden',
      )}
    >
      <input
        ref={input}
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        aria-label={label}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <button
        type="submit"
        aria-label={label}
        className={cn('grid size-9 shrink-0 place-items-center rounded-full transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] hover:scale-105', WARM_BUTTON)}
      >
        <Search aria-hidden="true" className="size-4" />
      </button>
    </form>
  )
}

/** Numbered pages under a board: both ends, the current page's neighbours, and arrows either side. */
export function Pager({ page, count, onPage, labels }: {
  page: number
  count: number
  onPage: (page: number) => void
  labels: { nav: string; previous: string; next: string; page: string }
}) {
  if (count <= 1) return null
  const arrow = 'grid size-9 place-items-center rounded-full text-foreground/75 transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35'
  return (
    <nav aria-label={labels.nav} className="flex items-center justify-center gap-1 border-t border-dashed border-border px-2.5 py-3 tabular-nums">
      <button type="button" aria-label={labels.previous} disabled={page === 0} onClick={() => onPage(page - 1)} className={arrow}>
        <ChevronLeft aria-hidden="true" className="size-4" />
      </button>
      {pageWindow(page, count).map((slot, index) => slot === 'gap' ? (
        <span key={`gap-${index}`} aria-hidden="true" className="w-5 text-center text-sm text-muted-foreground">…</span>
      ) : (
        <button
          key={slot}
          type="button"
          aria-label={labels.page.replace('{page}', String(slot + 1))}
          aria-current={slot === page ? 'page' : undefined}
          onClick={() => onPage(slot)}
          className={cn(
            'grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm font-semibold transition-colors',
            slot === page ? 'bg-foreground text-background' : 'text-foreground/75 hover:bg-muted hover:text-foreground',
          )}
        >
          {slot + 1}
        </button>
      ))}
      <button type="button" aria-label={labels.next} disabled={page >= count - 1} onClick={() => onPage(page + 1)} className={arrow}>
        <ChevronRight aria-hidden="true" className="size-4" />
      </button>
    </nav>
  )
}

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

/** A labelled run of facet chips in the dashed line under a board's tabs. */
export function FacetGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-center gap-1 md:shrink md:flex-wrap">
      <span className="mr-0.5 shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

export function Facet({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40 md:h-8',
        selected
          ? 'bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--arkive-nav-active)_45%,transparent)]'
          : 'bg-muted/70 text-foreground/75 hover:bg-muted hover:text-foreground',
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

/** A small white chip for a name, with an optional value set in the stage colour. */
export function Chip({ children, value, dot }: { children: ReactNode; value?: ReactNode; dot?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-card px-2 py-0.5 text-xs text-foreground/85 shadow-[0_0_0_1px_var(--border)]">
      {dot ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} /> : null}
      {children}
      {value !== undefined ? <b className="font-bold tabular-nums text-[color:var(--ro3-stage)]">{value}</b> : null}
    </span>
  )
}

/** A dashed-off block of a detail panel, its small title on the left and an optional note on the right. */
export function DetailBlock({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-t border-dashed border-border pt-2.5">
      <h4 className="flex items-baseline justify-between gap-2 text-xs font-semibold text-muted-foreground">
        {label}
        {note !== undefined ? <span className="font-normal tabular-nums">{note}</span> : null}
      </h4>
      {children}
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
