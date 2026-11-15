import { useId, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@gamemap/ui'

export interface EncyclopediaEntry { key: string; label: string; icon: ReactNode; children?: readonly EncyclopediaEntry[] }
export interface EncyclopediaGroup { key: string; label: string; entries: readonly EncyclopediaEntry[] }
const currentEntry = (entry: EncyclopediaEntry, active: string): boolean => entry.key === active || Boolean(entry.children?.some(child => currentEntry(child, active)))
const desktopQuery = '(min-width: 1024px)'
function subscribeDesktop(changed: () => void) {
  const media = window.matchMedia(desktopQuery)
  media.addEventListener('change', changed)
  return () => media.removeEventListener('change', changed)
}
/** Mount a toolbar in only one place when an app adapts its existing mobile shell. */
export function useEncyclopediaDesktop() {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(desktopQuery).matches, () => false)
}

/** Category navigation only; the game continues to own its records and controls. */
export function ArkiveEncyclopediaWorkspace({ groups, active, label, collapsed, onCollapsedChange, collapseLabel, expandLabel, renderLink, railFooter, children }: {
  groups: readonly EncyclopediaGroup[]; active: string; label: string;
  collapsed: boolean; onCollapsedChange: (collapsed: boolean) => void;
  collapseLabel: string; expandLabel: string;
  renderLink: (entry: EncyclopediaEntry, className: string, children: ReactNode) => ReactNode;
  /** Optional game-owned reading history, hidden with the expanded labels. */
  railFooter?: ReactNode;
  children: ReactNode;
}) {
  const navId = useId()
  return <div data-encyclopedia-workspace data-collapsed={collapsed}
    className="lg:grid lg:grid-cols-[var(--arkive-encyclopedia-rail-size)_minmax(0,1fr)] lg:items-start lg:gap-8"
    style={{ '--arkive-encyclopedia-rail-size': collapsed ? 'var(--arkive-encyclopedia-rail-collapsed)' : 'var(--arkive-encyclopedia-rail-expanded)' } as CSSProperties}>
    <aside className="sticky top-0 hidden max-h-[calc(100dvh-12rem)] min-w-0 flex-col overflow-y-auto overscroll-contain lg:flex" data-testid="encyclopedia-rail">
      <div className={cn('mb-3 flex min-h-10 items-center gap-2', collapsed ? 'justify-center' : 'justify-between px-2')}>
        {!collapsed && <h2 className="flex items-center gap-2 text-2xl font-extrabold leading-tight"><span aria-hidden className="h-[1.15em] w-1.5 shrink-0 rounded-full bg-[image:var(--arkive-warm-search)]" />{label}</h2>}
        <button type="button" onClick={() => onCollapsedChange(!collapsed)} aria-expanded={!collapsed} aria-controls={navId}
          aria-label={collapsed ? expandLabel : collapseLabel} title={collapsed ? expandLabel : collapseLabel}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
          {collapsed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronLeft className="size-4" aria-hidden />}
        </button>
      </div>
      <nav id={navId} aria-label={label}>
        {groups.map(group => <div key={group.key} className="mb-4 space-y-1">
          {!collapsed && group.label !== label && <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">{group.label}</p>}
          {group.entries.map(entry => <div key={entry.key}>
            {renderLink(entry, cn('group flex min-h-12 items-center rounded-xl px-2 text-sm font-semibold transition-colors',
              collapsed ? 'justify-center' : 'gap-3',
              currentEntry(entry, active) ? 'bg-card text-[color:var(--arkive-nav-active)] shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-muted hover:text-foreground'),
              <><span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', currentEntry(entry, active) ? 'bg-[color:var(--arkive-filter-active)]' : 'bg-muted group-hover:bg-card')}>{entry.icon}</span>
                <span className={collapsed ? 'sr-only' : 'min-w-0 break-words'}>{entry.label}</span></>)}
            {!collapsed && currentEntry(entry, active) && entry.children && <div className="my-1 ml-6 space-y-1 border-l-2 border-border pl-2">
              {entry.children.map(child => <div key={child.key}>{renderLink(child,
                cn('flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm', child.key === active ? 'bg-[color:var(--arkive-filter-active)] font-semibold text-[color:var(--arkive-nav-active)]' : 'text-muted-foreground hover:bg-muted'),
                <><span className="grid size-5 shrink-0 place-items-center">{child.icon}</span><span className="min-w-0 break-words">{child.label}</span></>)}</div>)}
            </div>}
          </div>)}
        </div>)}
      </nav>
      {!collapsed && railFooter}
    </aside>
    <div className="min-w-0" data-encyclopedia-content>{children}</div>
  </div>
}
