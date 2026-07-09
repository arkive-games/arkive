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
  cn,
} from '@gamemap/ui'
import { elementIconUrl, itemIconUrl, workIconUrl } from '../../../lib/assets'
import { type PalsBundle } from '../../../lib/pals'
import { filterStrings } from '../filterStrings'
import { isFilterActive, toggle, type PalFilter } from '../useFilteredPals'

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

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition',
        active
          ? 'border-primary bg-primary/15 text-foreground'
          : 'border-border bg-secondary/40 text-muted-foreground hover:border-primary/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mr-1 w-16 shrink-0 py-1 text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
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
  const { i18n } = useTranslation()
  const fs = filterStrings(i18n.resolvedLanguage ?? 'en-US')
  const [lootOpen, setLootOpen] = useState(false)

  // Which element / work / reaction values exist in the roster is decided by the
  // pipeline (data-palworld/pals.json `filters`) so chips with no pals are hidden.
  const { elements, works, reactions } = bundle.filters

  // Every lootable item id (union of all drops), sorted by localized name.
  const lootItems = useMemo(() => {
    const ids = new Set<string>()
    for (const p of bundle.pals) for (const d of p.drops) ids.add(d.item)
    return [...ids]
      .map((id) => ({ id, name: bundle.items[id] ?? id, icon: bundle.itemIcon[id] }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [bundle])

  const lootName = filter.loot ? (bundle.items[filter.loot] ?? filter.loot) : null

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/50 p-3">
      {elements.length ? (
        <Group label={fs.elements}>
          {elements.map((e) => (
            <Chip
              key={e}
              active={filter.elements.includes(e)}
              onClick={() => onChange({ ...filter, elements: toggle(filter.elements, e) })}
              title={bundle.enums.elements[e] ?? e}
            >
              <Glyph src={elementIconUrl(e)} size={16} />
              {bundle.enums.elements[e] ?? e}
            </Chip>
          ))}
        </Group>
      ) : null}

      {works.length ? (
        <Group label={fs.col.work}>
          {works.map((w) => (
            <Chip
              key={w}
              active={filter.works.includes(w)}
              onClick={() => onChange({ ...filter, works: toggle(filter.works, w) })}
              title={bundle.enums.work[w] ?? w}
            >
              <Glyph src={workIconUrl(w)} size={16} />
              {bundle.enums.work[w] ?? w}
            </Chip>
          ))}
        </Group>
      ) : null}

      {reactions.length ? (
        <Group label={fs.reaction}>
          {reactions.map((r) => (
            <Chip
              key={r}
              active={filter.reactions.includes(r)}
              onClick={() => onChange({ ...filter, reactions: toggle(filter.reactions, r) })}
            >
              {fs.reactions[r] ?? r}
            </Chip>
          ))}
        </Group>
      ) : null}

      {bundle.filters.nocturnal ? (
        <Group label={fs.nocturnal}>
          <Chip
            active={filter.nocturnal}
            onClick={() => onChange({ ...filter, nocturnal: !filter.nocturnal })}
          >
            {fs.nocturnalOnly}
          </Chip>
        </Group>
      ) : null}

      <Group label={fs.loot}>
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
          <PopoverContent className="w-72 p-0" align="start">
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
          <Chip active onClick={() => onChange({ ...filter, loot: null })} title={fs.clear}>
            ✕
          </Chip>
        ) : null}
      </Group>

      {isFilterActive(filter) ? (
        <div className="pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => onChange({ ...filter, elements: [], works: [], reactions: [], nocturnal: false, loot: null })}
          >
            {fs.clear}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
