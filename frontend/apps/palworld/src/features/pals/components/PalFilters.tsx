import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  toggleValue, CatalogFacetMenu, CatalogFacetOption, CatalogFacetTrack, CatalogFacetGrid, CatalogSelectedFilters, useCatalogFacetMenus,
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
        <CatalogFacetMenu {...menuProps('sizes')} label={t('pal.stat.size')} count={filter.sizes.length} testId="pal-filter-sizes">
          <CatalogFacetGrid>{sizes.map(value => <CatalogFacetOption key={value}
            active={filter.sizes.includes(value)} onClick={() => onChange({ ...filter, sizes: toggleValue(filter.sizes, value) })} label={value} />)}</CatalogFacetGrid>
        </CatalogFacetMenu>
        {bundle.filters.nocturnal && <CatalogFacetMenu {...menuProps('nocturnal')} label={fs.nocturnalOnly} count={Number(filter.nocturnal)}
          testId="pal-filter-nocturnal">
          <CatalogFacetOption active={filter.nocturnal} onClick={() => onChange({ ...filter, nocturnal: !filter.nocturnal })} label={fs.nocturnalOnly} />
        </CatalogFacetMenu>}
        <CatalogFacetMenu {...menuProps('loot')} label={fs.loot} count={Number(filter.loot !== null)} testId="pal-filter-loot" contentClassName="w-max [&_[data-slot=command-input]]:min-w-0">
          <Command className="w-max max-w-full gap-3 bg-transparent [&_[data-slot=command-input-wrapper]]:h-11 [&_[data-slot=command-input-wrapper]]:rounded-full [&_[data-slot=command-input-wrapper]]:border-0 [&_[data-slot=command-input-wrapper]]:bg-muted"><CommandInput placeholder={fs.lootPlaceholder} />
            <CommandList className="max-h-60 w-max max-w-full"><CommandEmpty>{fs.lootEmpty}</CommandEmpty><CommandGroup className="w-max max-w-full p-0 [&_[cmdk-group-items]]:max-w-[calc(min(22rem,100vw-2rem)-2rem-2px)] [&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-wrap [&_[cmdk-group-items]]:gap-2">
              {lootItems.map(item => <CommandItem key={item.id} value={`${item.name} ${item.id}`}
                onSelect={() => onChange({ ...filter, loot: filter.loot === item.id ? null : item.id })} className="min-h-11 w-fit max-w-full gap-2 rounded-full bg-muted/60 px-3 text-sm font-medium hover:!bg-foreground hover:!text-background data-[selected=true]:!bg-foreground data-[selected=true]:!text-background data-[selected-loot=true]:bg-foreground data-[selected-loot=true]:text-background"
                data-selected-loot={filter.loot === item.id || undefined}>
                {item.icon && <Glyph src={itemIconUrl(item.icon)} />}<span className="min-w-0 break-words">{item.name}</span>
                {filter.loot === item.id && <Check className="size-4 shrink-0" aria-hidden />}
              </CommandItem>)}
            </CommandGroup></CommandList>
          </Command>
        </CatalogFacetMenu>
      </CatalogFacetTrack>
      {search && <div className="min-w-0 lg:ml-auto">{search}</div>}
    </div>
    <CatalogSelectedFilters label={fs.filters} clearLabel={fs.clear}
      choices={choices.map(choice => ({ key: choice.key, label: choice.label, onRemove: choice.remove,
        icon: choice.icon ? <Glyph src={choice.icon} size={16} /> : undefined }))}
      onClear={() => onChange({ ...filter, elements: [], works: [], reactions: [], sizes: [], nocturnal: false, loot: null })} />
  </div>
}
