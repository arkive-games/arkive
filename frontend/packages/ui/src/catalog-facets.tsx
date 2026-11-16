import { Children, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { FilterChip } from './filter-controls'
import { cn } from './utils'
import { balanceFacetRows } from './catalog-facet-layout'

/** Pointer hover opens without stealing input focus; keyboard and touch remain supported. */
export function CatalogFacetMenu({ label, count, testId, open, onOpenChange, restoreFocus = true, contentClassName, children }: {
  label: string; count: number; testId: string; open: boolean;
  onOpenChange: (open: boolean) => void; restoreFocus?: boolean; contentClassName?: string; children: ReactNode;
}) {
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverOpen = useRef(false)
  const skipFocusOpen = useRef(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current) }
  const leave = () => {
    cancelClose()
    if (hoverOpen.current) closeTimer.current = setTimeout(() => onOpenChange(false), 160)
  }
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  return <Popover open={open} onOpenChange={onOpenChange}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={label} data-testid={testId}
        onPointerEnter={event => {
          if (event.pointerType !== 'mouse') return
          cancelClose(); hoverOpen.current = true; onOpenChange(true)
        }} onPointerLeave={leave}
        onFocus={event => {
          if (skipFocusOpen.current) { skipFocusOpen.current = false; return }
          if (!event.currentTarget.matches(':focus-visible')) return
          hoverOpen.current = false; onOpenChange(true)
        }}
        onKeyDown={event => {
          if (event.key !== 'ArrowDown') return
          event.preventDefault(); hoverOpen.current = false; onOpenChange(true)
          setTimeout(() => contentRef.current?.querySelector<HTMLElement>('button, input')?.focus(), 0)
        }}
        className={cn('flex min-h-[var(--arkive-catalog-control-inner-height)] items-center justify-center gap-2 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:!bg-foreground hover:!text-background focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:!bg-foreground data-[state=open]:!text-background',
          count > 0 && 'bg-card text-foreground')}>
        <span className="min-w-0 whitespace-nowrap">{label}</span>
        {count > 0 && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-xs tabular-nums text-background">{count}</span>}
      </button>
    </PopoverTrigger>
    <PopoverContent ref={contentRef} align="start" sideOffset={8} collisionPadding={16}
      onPointerEnter={cancelClose} onPointerLeave={leave}
      onOpenAutoFocus={event => { if (hoverOpen.current) event.preventDefault() }}
      onCloseAutoFocus={event => {
        if (hoverOpen.current || !restoreFocus) event.preventDefault()
        else skipFocusOpen.current = true
      }}
      className={cn('z-[var(--arkive-layer-nested-overlay)] max-h-[min(70dvh,var(--radix-popover-content-available-height))] w-max max-w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-4', contentClassName)}
      aria-label={label}>{children}</PopoverContent>
  </Popover>
}

export function CatalogFacetOption({ active, label, icon, onClick, testId }: {
  active: boolean; label: ReactNode; icon?: ReactNode; onClick: () => void; testId?: string;
}) {
  return <FilterChip variant="tile" active={active} onClick={onClick} testId={testId}
    className={cn('min-h-11 max-w-full gap-2 rounded-full border-transparent px-3 text-sm', active
      ? 'border-transparent bg-foreground text-background'
      : 'border-transparent bg-muted/60 text-foreground hover:!bg-foreground hover:!text-background')}>
    {icon}<span className="min-w-0 break-words text-left">{label}</span>
    {active ? <Check className="size-4 shrink-0" aria-hidden /> : null}
  </FilterChip>
}

/** One open selector across the whole track, including delayed pointer dismissal. */
export function useCatalogFacetMenus() {
  const [openFacet, setOpenFacet] = useState<string | null>(null)
  return (id: string) => ({ open: openFacet === id, restoreFocus: openFacet === null || openFacet === id, onOpenChange: (next: boolean) => {
    setOpenFacet(current => next ? id : current === id ? null : current)
  } })
}

const FacetTrackContext = createContext<ReturnType<typeof useCatalogFacetMenus> | null>(null)

export function CatalogFacetTrack({ children }: { children: ReactNode }) {
  const menus = useCatalogFacetMenus()
  return <FacetTrackContext.Provider value={menus}><div className="flex w-fit max-w-full min-h-[var(--arkive-catalog-control-height)] flex-wrap items-center gap-1 rounded-2xl bg-muted p-1 lg:h-[var(--arkive-catalog-control-height)] lg:flex-nowrap lg:rounded-full">{children}</div></FacetTrackContext.Provider>
}

export function CatalogFacetGroup({ label, count = 0, testId, children }: {
  label: string; count?: number; testId: string; children: ReactNode;
}) {
  const fallback = useCatalogFacetMenus()
  const menus = useContext(FacetTrackContext) ?? fallback
  return <CatalogFacetMenu {...menus(testId)} label={label} count={count} testId={testId}>
    <CatalogFacetGrid>{children}</CatalogFacetGrid>
  </CatalogFacetMenu>
}

export function CatalogFacetChoice({ children, ...props }: {
  active: boolean; onClick: () => void; testId?: string; children: ReactNode;
}) {
  return <CatalogFacetOption {...props} label={children} />
}

/** Quiet summaries stay distinct from the solid controls that open facet menus. */
export function CatalogSelectedFilters({ label, clearLabel, choices, onClear }: {
  label: string; clearLabel: string; onClear: () => void;
  choices: { key: string; label: string; icon?: ReactNode; onRemove: () => void }[];
}) {
  if (!choices.length) return null
  return <div role="group" aria-label={label} data-testid="catalog-selected-filters"
    className="flex flex-wrap items-start gap-x-4 gap-y-2">
    <div className="flex min-w-0 flex-1 flex-wrap gap-2">
      {choices.map(choice => <button key={choice.key} type="button"
        aria-label={`${clearLabel}: ${choice.label}`} onClick={choice.onRemove}
        data-testid={`catalog-selected-${choice.key}`}
        className="group inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-border bg-background py-1 pl-2 pr-2 text-sm font-medium text-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring md:min-h-9">
        {choice.icon && <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted">{choice.icon}</span>}
        <span className={cn('min-w-0 break-words text-left', !choice.icon && 'pl-1')}>{choice.label}</span>
        <span className="ml-1 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-foreground group-hover:text-background group-focus-visible:bg-foreground group-focus-visible:text-background">
          <X className="size-3" aria-hidden />
        </span>
      </button>)}
    </div>
    <button type="button" onClick={onClear} data-testid="catalog-clear-filters"
      className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-muted/60 px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-ring md:min-h-9">
      <RotateCcw className="size-4" aria-hidden />{clearLabel}
    </button>
  </div>
}

export function CatalogFacetGrid({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const options = Children.toArray(children)
  const [layout, setLayout] = useState<{ width: number; positions: { row: number; left: number }[] } | null>(null)
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    let active = true
    const measure = () => {
      if (!active) return
      const panel = element.closest<HTMLElement>('[data-slot="popover-content"]')
      if (!panel) return
      const style = getComputedStyle(panel)
      const inset = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
        + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
      const budget = Math.max(1, Math.min(22 * rem, window.innerWidth - 2 * rem) - inset)
      element.style.setProperty('--facet-option-budget', `${budget}px`)
      const nodes = Array.from(element.children) as HTMLElement[]
      // Computed widths ignore the popover's opening scale animation.
      const widths = nodes.map(node => parseFloat(getComputedStyle(node).width) || 0)
      const gap = parseFloat(getComputedStyle(element).rowGap) || 0
      const rows = balanceFacetRows(widths, budget, gap)
      let width = 0
      const positions: { row: number; left: number }[] = []
      rows.forEach((row, index) => {
        let left = 0
        row.forEach(item => { positions[item] = { row: index + 1, left }; left += widths[item] + gap })
        width = Math.max(width, left - gap)
      })
      const next = { width: Math.max(0, width), positions }
      setLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    for (const child of element.children) observer.observe(child)
    observer.observe(document.documentElement)
    window.addEventListener('resize', measure)
    document.fonts?.ready.then(measure)
    return () => { active = false; observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [children])
  return <div ref={root} className="grid max-w-full items-center justify-items-start gap-y-2"
    style={{ width: layout?.width }}>
    {options.map((option, index) => <div key={(option as { key?: string }).key ?? index}
      className="flex w-max min-w-0 max-w-[var(--facet-option-budget)] [&>button]:max-w-full"
      style={{ gridColumn: 1, gridRow: layout?.positions[index]?.row ?? index + 1, marginLeft: layout?.positions[index]?.left ?? 0 }}>
      {option}
    </div>)}
  </div>
}
