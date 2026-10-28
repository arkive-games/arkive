import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { hrefForKey, navigateOnClick, type NavKey } from '../navigation'

export interface SectionNavEntry {
  key: NavKey
  label: string
  art: string
}

interface SectionNavProps {
  entries: SectionNavEntry[]
  active: NavKey
  onNavigate: (key: NavKey) => void
  label: string
}

/**
 * The phone header's free end, where a wiki page may put its own action
 * (the skill board parks its search toggle there). Null on wide screens'
 * first render and whenever no header is mounted.
 */
const HeaderActionSlot = createContext<HTMLElement | null>(null)
export function HeaderActionProvider({ value, children }: { value: HTMLElement | null; children: ReactNode }) {
  return <HeaderActionSlot.Provider value={value}>{children}</HeaderActionSlot.Provider>
}

/** Renders `children` into the phone header's action slot, when there is one. */
export function HeaderAction({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderActionSlot)
  return slot ? createPortal(children, slot) : null
}

/** The section's title: the page's subject, so it outranks every control below it. */
function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn('flex items-center gap-2 font-extrabold leading-tight', className)}>
      <span aria-hidden="true" className="h-[1.15em] w-1.5 shrink-0 rounded-full bg-[image:var(--arkive-warm-search)]" />
      {children}
    </h2>
  )
}

/**
 * The wiki's own categories down the left of the page on large screens, set
 * straight on the page under a large title. It sticks while the page scrolls,
 * so the footer below still runs the full width.
 */
export function SectionSidebar({ entries, active, onNavigate, label }: SectionNavProps) {
  return (
    <nav aria-label={label} className="sticky top-4 hidden flex-col gap-1 self-start lg:flex">
      <SectionTitle className="mb-3 px-2 text-2xl">{label}</SectionTitle>
      {entries.map((entry) => {
        const current = entry.key === active
        return (
          <a
            key={entry.key}
            href={hrefForKey(entry.key)}
            onClick={navigateOnClick(entry.key, onNavigate)}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'group flex h-12 items-center gap-3 rounded-xl px-2 text-sm font-semibold transition-[background-color,color,box-shadow]',
              current
                ? 'bg-card text-[color:var(--arkive-nav-active)] shadow-[0_0.25rem_0.9rem_rgba(13,116,206,0.1),0_0_0_1px_var(--border)]'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <span
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-[0.6rem] transition-[background-color,transform] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:scale-105',
                current ? 'bg-[color:var(--arkive-filter-active)]' : 'bg-muted group-hover:bg-card',
              )}
            >
              <img src={entry.art} alt="" className="size-7 object-contain" />
            </span>
            <span className="truncate">{entry.label}</span>
          </a>
        )
      })}
    </nav>
  )
}

/**
 * Below `lg` the title stays, and the categories fold into a pill beside it
 * that opens them as a grid -- one row of header instead of a second strip.
 */
export function SectionStrip({ entries, active, onNavigate, label, onSlot }: SectionNavProps & {
  /** Receives the header's action slot, for `HeaderActionProvider`. */
  onSlot: (node: HTMLElement | null) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const current = entries.find((entry) => entry.key === active) ?? entries[0]

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={root} className="relative mb-3 flex items-center gap-2 lg:hidden">
      <SectionTitle className="text-xl">{label}</SectionTitle>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="wiki-section-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 min-w-0 items-center gap-1 rounded-full bg-[color:var(--arkive-filter-active)] py-0 pl-1 pr-2.5 text-sm font-bold text-[color:var(--arkive-nav-active)]"
      >
        <img src={current.art} alt="" className="size-7 shrink-0 object-contain" />
        <span className="truncate">{current.label}</span>
        <ChevronDown aria-hidden="true" className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      <span ref={onSlot} className="ml-auto flex shrink-0 items-center" />
      {open ? (
        <nav
          id="wiki-section-menu"
          aria-label={label}
          className="absolute inset-x-0 top-full z-30 mt-1.5 grid grid-cols-4 gap-1 rounded-2xl bg-card p-2 shadow-[0_0.75rem_2rem_rgba(0,0,0,0.14),0_0_0_1px_var(--border)]"
        >
          {entries.map((entry) => {
            const selected = entry.key === active
            return (
              <a
                key={entry.key}
                href={hrefForKey(entry.key)}
                onClick={(event) => {
                  setOpen(false)
                  navigateOnClick(entry.key, onNavigate)(event)
                }}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold transition-colors',
                  selected
                    ? 'bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <img src={entry.art} alt="" className="size-8 object-contain" />
                {entry.label}
              </a>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
