import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  Popover, PopoverContent, PopoverTrigger, FilterChip, toggleValue, cn,
} from '@gamemap/ui'
import { elementIconUrl, itemIconUrl, workIconUrl } from '../../../lib/assets'
import { SIZE_ORDER, type PalsBundle } from '../../../lib/pals'
import { filterStrings } from '../filterStrings'
import { type PalFilter } from '../useFilteredPals'

function Glyph({ src, size = 20 }: { src: string; size?: number }) {
  const [ok, setOk] = useState(true)
  if (!ok) return null
  return <img src={src} alt="" width={size} height={size} loading="lazy"
    onError={() => setOk(false)} className="shrink-0 object-contain" />
}

/** Pointer hover opens without stealing input focus; keyboard and touch remain supported. */
function FacetMenu({ label, count, testId, open, onOpenChange, contentClassName, children }: {
  label: string; count: number; testId: string; open: boolean;
  onOpenChange: (open: boolean) => void; contentClassName?: string; children: ReactNode;
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
        if (hoverOpen.current) event.preventDefault()
        else skipFocusOpen.current = true
      }}
      className={cn('z-[var(--arkive-layer-nested-overlay)] max-h-[min(70dvh,var(--radix-popover-content-available-height))] w-112 max-w-[calc(100vw-2rem)] overflow-y-auto p-4', contentClassName)}
      aria-label={label}>{children}</PopoverContent>
  </Popover>
}

function FacetOption({ active, label, icon, onClick, testId }: {
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

export function PalFilters({ bundle, filter, onChange, search }: {
  bundle: PalsBundle; filter: PalFilter; onChange: (filter: PalFilter) => void; search?: ReactNode;
}) {
  const { t, i18n } = useTranslation()
  const fs = filterStrings(i18n.resolvedLanguage ?? 'en-US')
  const { elements, works, reactions } = bundle.filters
  const sizes = useMemo(() => SIZE_ORDER.filter(size => bundle.pals.some(pal => pal.size === size)), [bundle])
  const lootItems = useMemo(() => {
    const ids = new Set(bundle.pals.flatMap(pal => pal.drops.map(drop => drop.item)))
    const last = Object.keys(bundle.itemOrder).length
    return [...ids].map(id => ({ id, name: bundle.items[id] ?? id, icon: bundle.itemIcon[id] }))
      .sort((a, b) => (bundle.itemOrder[a.id] ?? last) - (bundle.itemOrder[b.id] ?? last) || a.id.localeCompare(b.id))
  }, [bundle])
  const [openFacet, setOpenFacet] = useState<string | null>(null)
  const menuProps = (id: string) => ({ open: openFacet === id, onOpenChange: (next: boolean) => {
    setOpenFacet(current => next ? id : current === id ? null : current)
  } })
  const choices = [
    ...filter.elements.map(value => ({ key: `element-${value}`, label: bundle.enums.elements[value] ?? value,
      icon: elementIconUrl(value), remove: () => onChange({ ...filter, elements: toggleValue(filter.elements, value) }) })),
    ...filter.works.map(value => ({ key: `work-${value}`, label: bundle.enums.work[value] ?? value,
      icon: workIconUrl(value), remove: () => onChange({ ...filter, works: toggleValue(filter.works, value) }) })),
    ...filter.reactions.map(value => ({ key: `reaction-${value}`, label: fs.reactions[value] ?? value,
      icon: undefined, remove: () => onChange({ ...filter, reactions: toggleValue(filter.reactions, value) }) })),
    ...filter.sizes.map(value => ({ key: `size-${value}`, label: value,
      icon: undefined, remove: () => onChange({ ...filter, sizes: toggleValue(filter.sizes, value) }) })),
    ...(filter.nocturnal ? [{ key: 'nocturnal', label: fs.nocturnalOnly, icon: undefined,
      remove: () => onChange({ ...filter, nocturnal: false }) }] : []),
    ...(filter.loot ? [{ key: 'loot', label: bundle.items[filter.loot] ?? filter.loot,
      icon: bundle.itemIcon[filter.loot] ? itemIconUrl(bundle.itemIcon[filter.loot]) : undefined,
      remove: () => onChange({ ...filter, loot: null }) }] : []),
  ]
  return <div data-testid="pal-filter-toolbar" className="space-y-3">
    <div className="flex flex-col items-start gap-3 lg:flex-row lg:flex-wrap lg:justify-between">
      <div className="flex min-h-[var(--arkive-catalog-control-height)] flex-wrap items-center gap-1 rounded-2xl bg-muted p-1 lg:h-[var(--arkive-catalog-control-height)] lg:flex-nowrap lg:rounded-full">
        <FacetMenu {...menuProps('elements')} label={fs.elements} count={filter.elements.length} testId="pal-filter-elements">
          <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:grid-cols-3">
            {elements.map(value => <FacetOption key={value} active={filter.elements.includes(value)}
              onClick={() => onChange({ ...filter, elements: toggleValue(filter.elements, value) })}
              testId={`pal-element-${value}`} label={bundle.enums.elements[value] ?? value}
              icon={<Glyph src={elementIconUrl(value)} />} />)}
          </div>
        </FacetMenu>
        <FacetMenu {...menuProps('works')} label={fs.col.work} count={filter.works.length} testId="pal-filter-works">
          <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:grid-cols-3">
            {works.map(value => <FacetOption key={value} active={filter.works.includes(value)}
              onClick={() => onChange({ ...filter, works: toggleValue(filter.works, value) })}
              testId={`pal-work-${value}`} label={bundle.enums.work[value] ?? value}
              icon={<Glyph src={workIconUrl(value)} />} />)}
          </div>
        </FacetMenu>
        <FacetMenu {...menuProps('reactions')} label={fs.reaction} count={filter.reactions.length} testId="pal-filter-reactions">
          <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:grid-cols-3">{reactions.map(value => <FacetOption key={value}
            active={filter.reactions.includes(value)} onClick={() => onChange({ ...filter, reactions: toggleValue(filter.reactions, value) })}
            label={fs.reactions[value] ?? value} />)}</div>
        </FacetMenu>
        <FacetMenu {...menuProps('sizes')} label={t('pal.stat.size')} count={filter.sizes.length} testId="pal-filter-sizes" contentClassName="w-80">
          <div className="grid grid-cols-3 gap-2">{sizes.map(value => <FacetOption key={value}
            active={filter.sizes.includes(value)} onClick={() => onChange({ ...filter, sizes: toggleValue(filter.sizes, value) })} label={value} />)}</div>
        </FacetMenu>
        {bundle.filters.nocturnal && <FacetMenu {...menuProps('nocturnal')} label={fs.nocturnalOnly} count={Number(filter.nocturnal)}
          testId="pal-filter-nocturnal" contentClassName="w-56">
          <FacetOption active={filter.nocturnal} onClick={() => onChange({ ...filter, nocturnal: !filter.nocturnal })} label={fs.nocturnalOnly} />
        </FacetMenu>}
        <FacetMenu {...menuProps('loot')} label={fs.loot} count={Number(filter.loot !== null)} testId="pal-filter-loot" contentClassName="w-96">
          <Command><CommandInput placeholder={fs.lootPlaceholder} />
            <CommandList className="max-h-60"><CommandEmpty>{fs.lootEmpty}</CommandEmpty><CommandGroup>
              {lootItems.map(item => <CommandItem key={item.id} value={`${item.name} ${item.id}`}
                onSelect={() => onChange({ ...filter, loot: filter.loot === item.id ? null : item.id })} className="gap-2"
                data-selected-loot={filter.loot === item.id || undefined}>
                {item.icon && <Glyph src={itemIconUrl(item.icon)} />}<span className="min-w-0 flex-1 truncate">{item.name}</span>
                {filter.loot === item.id && <Check className="size-4 shrink-0" aria-hidden />}
              </CommandItem>)}
            </CommandGroup></CommandList>
          </Command>
        </FacetMenu>
      </div>
      {search && <div className="min-w-0 lg:ml-auto">{search}</div>}
    </div>
    {choices.length > 0 && <div className="flex flex-wrap items-center gap-2" aria-label={fs.filters}>
      {choices.map(choice => <button key={choice.key} type="button" aria-label={`${fs.clear}: ${choice.label}`} onClick={choice.remove}
        className="inline-flex min-h-8 items-center gap-2 rounded-full bg-muted px-3 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        {choice.icon && <Glyph src={choice.icon} size={16} />}{choice.label}<X className="size-3" aria-hidden />
      </button>)}
      <button type="button" className="min-h-8 px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => onChange({ ...filter, elements: [], works: [], reactions: [], sizes: [], nocturnal: false, loot: null })}>{fs.clear}</button>
    </div>}
  </div>
}
