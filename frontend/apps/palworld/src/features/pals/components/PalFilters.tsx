import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, X } from 'lucide-react'
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

/** Each selector owns one focus-managed surface; selecting a facet keeps it open. */
function FacetMenu({ label, count, testId, children }: {
  label: string; count: number; testId: string; children: ReactNode;
}) {
  return <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={label} data-testid={testId}
        className="flex min-h-11 items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:border-ring data-[state=open]:bg-muted lg:min-h-9 lg:gap-2 lg:px-3">
        <span className="min-w-0 whitespace-nowrap">{label}</span>
        {count > 0 && <span className="hidden size-5 shrink-0 place-items-center rounded-full bg-foreground text-xs tabular-nums text-background sm:grid">{count}</span>}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={8} collisionPadding={16}
      className="z-[var(--arkive-layer-nested-overlay)] max-h-[min(70dvh,var(--radix-popover-content-available-height))] w-112 max-w-[calc(100vw-2rem)] overflow-y-auto p-4"
      aria-label={label}>
      {children}
    </PopoverContent>
  </Popover>
}

function FacetOption({ active, label, icon, onClick, testId }: {
  active: boolean; label: string; icon?: ReactNode; onClick: () => void; testId?: string;
}) {
  return <FilterChip variant="tile" active={active} onClick={onClick} testId={testId}
    className={cn('min-h-11 gap-2 px-3 text-sm', active ? 'border-ring' : 'border-border bg-card hover:bg-muted')}>
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
  const secondaryCount = filter.reactions.length + filter.sizes.length + Number(filter.nocturnal) + Number(filter.loot !== null)
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
    <div className="flex flex-col items-start gap-3 lg:flex-row lg:justify-between">
      <div className="flex flex-wrap gap-2">
        <FacetMenu label={fs.elements} count={filter.elements.length} testId="pal-filter-elements">
          <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:grid-cols-3">
            {elements.map(value => <FacetOption key={value} active={filter.elements.includes(value)}
              onClick={() => onChange({ ...filter, elements: toggleValue(filter.elements, value) })}
              testId={`pal-element-${value}`} label={bundle.enums.elements[value] ?? value}
              icon={<Glyph src={elementIconUrl(value)} />} />)}
          </div>
        </FacetMenu>
        <FacetMenu label={fs.col.work} count={filter.works.length} testId="pal-filter-works">
          <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:grid-cols-3">
            {works.map(value => <FacetOption key={value} active={filter.works.includes(value)}
              onClick={() => onChange({ ...filter, works: toggleValue(filter.works, value) })}
              testId={`pal-work-${value}`} label={bundle.enums.work[value] ?? value}
              icon={<Glyph src={workIconUrl(value)} />} />)}
          </div>
        </FacetMenu>
        <FacetMenu label={fs.filters} count={secondaryCount} testId="pal-filter-other">
          <div className="space-y-4">
            <fieldset><legend className="mb-2 text-sm font-semibold text-muted-foreground">{fs.reaction}</legend>
              <div className="grid grid-cols-2 gap-2">{reactions.map(value => <FacetOption key={value}
                active={filter.reactions.includes(value)} onClick={() => onChange({ ...filter, reactions: toggleValue(filter.reactions, value) })}
                label={fs.reactions[value] ?? value} />)}</div>
            </fieldset>
            <fieldset><legend className="mb-2 text-sm font-semibold text-muted-foreground">{t('pal.stat.size')}</legend>
              <div className="flex flex-wrap gap-2">{sizes.map(value => <FilterChip key={value} variant="pill" className="min-h-9 text-sm"
                active={filter.sizes.includes(value)} onClick={() => onChange({ ...filter, sizes: toggleValue(filter.sizes, value) })}>{value}</FilterChip>)}</div>
            </fieldset>
            {bundle.filters.nocturnal && <FacetOption active={filter.nocturnal}
              onClick={() => onChange({ ...filter, nocturnal: !filter.nocturnal })} label={fs.nocturnalOnly} />}
            <fieldset><legend className="mb-2 text-sm font-semibold text-muted-foreground">{fs.loot}</legend>
              <Command><CommandInput placeholder={fs.lootPlaceholder} />
                <CommandList className="max-h-40"><CommandEmpty>{fs.lootEmpty}</CommandEmpty><CommandGroup>
                  {lootItems.map(item => <CommandItem key={item.id} value={`${item.name} ${item.id}`}
                    onSelect={() => onChange({ ...filter, loot: filter.loot === item.id ? null : item.id })} className="gap-2"
                    data-selected-loot={filter.loot === item.id || undefined}>
                    {item.icon && <Glyph src={itemIconUrl(item.icon)} />}<span className="min-w-0 flex-1 truncate">{item.name}</span>
                    {filter.loot === item.id && <Check className="size-4 shrink-0" aria-hidden />}
                  </CommandItem>)}
                </CommandGroup></CommandList>
              </Command>
            </fieldset>
          </div>
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
