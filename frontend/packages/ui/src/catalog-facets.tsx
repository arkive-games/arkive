import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { FilterChip } from './filter-controls'
import { cn } from './utils'

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
      className={cn('z-[var(--arkive-layer-nested-overlay)] max-h-[min(70dvh,var(--radix-popover-content-available-height))] w-112 max-w-[calc(100vw-2rem)] overflow-y-auto p-4', contentClassName)}
      aria-label={label}>{children}</PopoverContent>
  </Popover>
}

export function CatalogFacetOption({ active, label, icon, onClick, testId }: {
  active: boolean; label: string; icon?: ReactNode; onClick: () => void; testId?: string;
}) {
  return <FilterChip variant="tile" active={active} onClick={onClick} testId={testId}
    className={cn('min-h-11 gap-2 px-3 text-sm', active
      ? 'border-foreground bg-foreground text-background'
      : 'border-border bg-card text-foreground hover:border-foreground hover:!bg-foreground hover:!text-background')}>
    {icon}<span className="min-w-0 flex-1 break-words text-left">{label}</span>
    {active ? <Check className="size-4 shrink-0" aria-hidden /> : <span className="size-4 shrink-0" aria-hidden />}
  </FilterChip>
}

/** One open selector across the whole track, including delayed pointer dismissal. */
export function useCatalogFacetMenus() {
  const [openFacet, setOpenFacet] = useState<string | null>(null)
  return (id: string) => ({ open: openFacet === id, restoreFocus: openFacet === null || openFacet === id, onOpenChange: (next: boolean) => {
    setOpenFacet(current => next ? id : current === id ? null : current)
  } })
}

export function CatalogFacetTrack({ children }: { children: ReactNode }) {
  return <div className="flex w-fit max-w-full min-h-[var(--arkive-catalog-control-height)] flex-wrap items-center gap-1 rounded-2xl bg-muted p-1 lg:h-[var(--arkive-catalog-control-height)] lg:flex-nowrap lg:rounded-full">{children}</div>
}

export function CatalogFacetGrid({ children, columns = 3 }: { children: ReactNode; columns?: 2 | 3 }) {
  return <div className={cn('grid grid-cols-1 gap-2 min-[390px]:grid-cols-2', columns === 3 && 'sm:grid-cols-3')}>{children}</div>
}
