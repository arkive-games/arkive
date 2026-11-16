import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  toggleValue, CatalogFacetMenu, CatalogFacetOption, CatalogFacetTrack, CatalogFacetGrid, useCatalogFacetMenus,
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
  const menuProps = useCatalogFacetMenus()
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
      <CatalogFacetTrack>
        <CatalogFacetMenu {...menuProps('elements')} label={fs.elements} count={filter.elements.length} testId="pal-filter-elements">
          <CatalogFacetGrid>
            {elements.map(value => <CatalogFacetOption key={value} active={filter.elements.includes(value)}
              onClick={() => onChange({ ...filter, elements: toggleValue(filter.elements, value) })}
              testId={`pal-element-${value}`} label={bundle.enums.elements[value] ?? value}
              icon={<Glyph src={elementIconUrl(value)} />} />)}
          </CatalogFacetGrid>
        </CatalogFacetMenu>
        <CatalogFacetMenu {...menuProps('works')} label={fs.col.work} count={filter.works.length} testId="pal-filter-works">
          <CatalogFacetGrid>
            {works.map(value => <CatalogFacetOption key={value} active={filter.works.includes(value)}
              onClick={() => onChange({ ...filter, works: toggleValue(filter.works, value) })}
              testId={`pal-work-${value}`} label={bundle.enums.work[value] ?? value}
              icon={<Glyph src={workIconUrl(value)} />} />)}
          </CatalogFacetGrid>
        </CatalogFacetMenu>
        <CatalogFacetMenu {...menuProps('reactions')} label={fs.reaction} count={filter.reactions.length} testId="pal-filter-reactions">
          <CatalogFacetGrid>{reactions.map(value => <CatalogFacetOption key={value}
            active={filter.reactions.includes(value)} onClick={() => onChange({ ...filter, reactions: toggleValue(filter.reactions, value) })}
            label={fs.reactions[value] ?? value} />)}</CatalogFacetGrid>
        </CatalogFacetMenu>
        <CatalogFacetMenu {...menuProps('sizes')} label={t('pal.stat.size')} count={filter.sizes.length} testId="pal-filter-sizes" contentClassName="w-80">
          <div className="grid grid-cols-3 gap-2">{sizes.map(value => <CatalogFacetOption key={value}
            active={filter.sizes.includes(value)} onClick={() => onChange({ ...filter, sizes: toggleValue(filter.sizes, value) })} label={value} />)}</div>
        </CatalogFacetMenu>
        {bundle.filters.nocturnal && <CatalogFacetMenu {...menuProps('nocturnal')} label={fs.nocturnalOnly} count={Number(filter.nocturnal)}
          testId="pal-filter-nocturnal" contentClassName="w-56">
          <CatalogFacetOption active={filter.nocturnal} onClick={() => onChange({ ...filter, nocturnal: !filter.nocturnal })} label={fs.nocturnalOnly} />
        </CatalogFacetMenu>}
        <CatalogFacetMenu {...menuProps('loot')} label={fs.loot} count={Number(filter.loot !== null)} testId="pal-filter-loot" contentClassName="w-96">
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
        </CatalogFacetMenu>
      </CatalogFacetTrack>
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
