import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  FilterChip,
  FilterRow,
  toggleValue,
} from '@gamemap/ui'
import { elementIconUrl, itemIconUrl, workIconUrl } from '../../../lib/assets'
import { SIZE_ORDER, type PalsBundle } from '../../../lib/pals'
import { filterStrings } from '../filterStrings'
import { isFilterActive, type PalFilter } from '../useFilteredPals'

/** An <img> that hides itself when the asset is missing. */
function Glyph({ src, size = 18 }: { src: string; size?: number }) {
  const [ok, setOk] = useState(true)
  if (!ok) return null
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setOk(false)}
      className="shrink-0 object-contain"
    />
  )
}


export function PalFilters({
  bundle,
  filter,
  onChange,
}: {
  bundle: PalsBundle
  filter: PalFilter
  onChange: (f: PalFilter) => void
}) {
  const { t, i18n } = useTranslation()
  const fs = filterStrings(i18n.resolvedLanguage ?? 'en-US')
  const [lootOpen, setLootOpen] = useState(false)

  // Which element / work / reaction values exist in the roster is decided by the
  // pipeline (data-palworld/pals.json `filters`) so chips with no pals are hidden.
  const { elements, works, reactions } = bundle.filters

  // Size facet is derived client-side (not in the pipeline's `filters` block):
  // canonical order, hiding any size with no pals — same idea as the loot list.
  const sizes = useMemo(
    () => SIZE_ORDER.filter((s) => bundle.pals.some((p) => p.size === s)),
    [bundle],
  )

  // Every lootable item id (union of all drops), in the game's inventory order
  // (items.json position = SortId) — identical across languages.
  const lootItems = useMemo(() => {
    const ids = new Set<string>()
    for (const p of bundle.pals) for (const d of p.drops) ids.add(d.item)
    const last = Object.keys(bundle.itemOrder).length
    return [...ids]
      .map((id) => ({ id, name: bundle.items[id] ?? id, icon: bundle.itemIcon[id] }))
      .sort(
        (a, b) =>
          (bundle.itemOrder[a.id] ?? last) - (bundle.itemOrder[b.id] ?? last) ||
          a.id.localeCompare(b.id),
      )
  }, [bundle])

  const lootName = filter.loot ? (bundle.items[filter.loot] ?? filter.loot) : null

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
      {elements.length ? (
        <FilterRow layout="column" label={fs.elements}>
          {elements.map((e) => (
            <FilterChip variant="pill"
              key={e}
              active={filter.elements.includes(e)}
              onClick={() => onChange({ ...filter, elements: toggleValue(filter.elements, e) })}
              title={bundle.enums.elements[e] ?? e}
              // Stable hooks for tests: the visible label is localized game text.
              testId={`pal-element-${e}`}
            >
              <Glyph src={elementIconUrl(e)} size={16} />
              {bundle.enums.elements[e] ?? e}
            </FilterChip>
          ))}
        </FilterRow>
      ) : null}

      {works.length ? (
        <FilterRow layout="column" label={fs.col.work}>
          {works.map((w) => (
            <FilterChip variant="pill"
              key={w}
              active={filter.works.includes(w)}
              onClick={() => onChange({ ...filter, works: toggleValue(filter.works, w) })}
              title={bundle.enums.work[w] ?? w}
              testId={`pal-work-${w}`}
            >
              <Glyph src={workIconUrl(w)} size={16} />
              {bundle.enums.work[w] ?? w}
            </FilterChip>
          ))}
        </FilterRow>
      ) : null}

      {reactions.length ? (
        <FilterRow layout="column" label={fs.reaction}>
          {reactions.map((r) => (
            <FilterChip variant="pill"
              key={r}
              active={filter.reactions.includes(r)}
              onClick={() => onChange({ ...filter, reactions: toggleValue(filter.reactions, r) })}
            >
              {fs.reactions[r] ?? r}
            </FilterChip>
          ))}
        </FilterRow>
      ) : null}

      {sizes.length ? (
        <FilterRow layout="column" label={t('pal.stat.size')}>
          {sizes.map((s) => (
            <FilterChip variant="pill"
              key={s}
              active={filter.sizes.includes(s)}
              onClick={() => onChange({ ...filter, sizes: toggleValue(filter.sizes, s) })}
            >
              {s}
            </FilterChip>
          ))}
        </FilterRow>
      ) : null}

      {bundle.filters.nocturnal ? (
        <FilterRow layout="column" label={fs.nocturnal}>
          <FilterChip variant="pill"
            active={filter.nocturnal}
            onClick={() => onChange({ ...filter, nocturnal: !filter.nocturnal })}
          >
            {fs.nocturnalOnly}
          </FilterChip>
        </FilterRow>
      ) : null}

      <FilterRow layout="column" label={fs.loot}>
        <Popover open={lootOpen} onOpenChange={setLootOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-normal">
              {filter.loot ? (
                <>
                  {bundle.itemIcon[filter.loot] ? (
                    <Glyph src={itemIconUrl(bundle.itemIcon[filter.loot])} size={16} />
                  ) : null}
                  {lootName}
                </>
              ) : (
                <span className="text-muted-foreground">{fs.lootPlaceholder}</span>
              )}
            </Button>
          </PopoverTrigger>
          {/* Lifted above the mobile filter sheet: on phones this whole
              block is mounted inside that sheet, and the popover's default
              z-index would put the item list behind it. */}
          <PopoverContent className="z-[var(--arkive-layer-nested-overlay)] w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder={fs.lootPlaceholder} className="text-sm" />
              <CommandList>
                <CommandEmpty>{fs.lootEmpty}</CommandEmpty>
                <CommandGroup>
                  {lootItems.map((it) => (
                    <CommandItem
                      key={it.id}
                      value={`${it.name} ${it.id}`}
                      onSelect={() => {
                        onChange({ ...filter, loot: it.id })
                        setLootOpen(false)
                      }}
                      className="gap-2"
                    >
                      {it.icon ? <Glyph src={itemIconUrl(it.icon)} size={18} /> : null}
                      <span className="truncate">{it.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {filter.loot ? (
          <FilterChip variant="pill" active onClick={() => onChange({ ...filter, loot: null })} title={fs.clear}>
            ✕
          </FilterChip>
        ) : null}
      </FilterRow>

      {isFilterActive(filter) ? (
        <div className="pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => onChange({ ...filter, elements: [], works: [], reactions: [], sizes: [], nocturnal: false, loot: null })}
          >
            {fs.clear}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
