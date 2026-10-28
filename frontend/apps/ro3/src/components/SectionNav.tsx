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
 * The wiki's own categories down the left of the page on large screens. It
 * lives inside the page column and sticks while the page scrolls, so the
 * footer below still runs the full width.
 */
export function SectionSidebar({ entries, active, onNavigate, label }: SectionNavProps) {
  return (
    <nav aria-label={label} className="sticky top-4 hidden flex-col gap-1 self-start lg:flex">
      {entries.map((entry) => {
        const current = entry.key === active
        return (
          <a
            key={entry.key}
            href={hrefForKey(entry.key)}
            onClick={navigateOnClick(entry.key, onNavigate)}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'group flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
              current
                ? 'bg-[color:var(--arkive-filter-active)] font-semibold text-[color:var(--arkive-nav-active)]'
                : 'text-foreground/80 hover:bg-accent hover:text-foreground',
            )}
          >
            <img
              src={entry.art}
              alt=""
              className="size-8 shrink-0 rounded-lg object-contain transition-transform duration-200 group-hover:scale-110"
            />
            <span className="truncate">{entry.label}</span>
          </a>
        )
      })}
    </nav>
  )
}

/** Below `lg` the same entries as one swipeable row above the page. */
export function SectionStrip({ entries, active, onNavigate, label }: SectionNavProps) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 mb-4 flex gap-2 overflow-x-auto border-b border-border px-4 pb-3 [scrollbar-width:none] md:-mx-6 md:px-6 lg:hidden"
    >
      {entries.map((entry) => {
        const current = entry.key === active
        return (
          <a
            key={entry.key}
            href={hrefForKey(entry.key)}
            onClick={navigateOnClick(entry.key, onNavigate)}
            aria-current={current ? 'page' : undefined}
            // Keep the current entry in view when it sits past the first screen.
            ref={current ? (node) => node?.scrollIntoView({ block: 'nearest', inline: 'center' }) : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-colors',
              current
                ? 'border-transparent bg-[color:var(--arkive-filter-active)] font-semibold text-[color:var(--arkive-nav-active)]'
                : 'border-border bg-card hover:bg-accent',
            )}
          >
            <img src={entry.art} alt="" className="size-7 rounded-full object-contain" />
            {entry.label}
          </a>
        )
      })}
    </nav>
  )
}
