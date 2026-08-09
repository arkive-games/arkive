import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Plus, X, Zap } from 'lucide-react'
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
import { OverflowMarquee } from '@gamemap/map-shell'
import type { BreedingPal, NameMap } from '../../lib/breeding'
import { palIconUrl } from '../../lib/breeding'
import { formatPalId, palIdText } from '../../lib/palId'
import {
  LEGENDARY_ICON,
  TILE_FRAME,
  TILE_HEADER,
  type BreedingVariant,
} from './RecipeCard'

function PalIcon({ pal }: { pal: BreedingPal }) {
  return (
    <img
      src={palIconUrl(pal.icon)}
      alt=""
      loading="lazy"
      className={cn(
        'size-6 shrink-0 rounded-full bg-black/5 object-contain dark:bg-white/10',
        pal.legendary && LEGENDARY_ICON,
      )}
    />
  )
}

function PalMeta({ pal }: { pal: BreedingPal }) {
  const id = formatPalId(pal.zukanIndex, pal.zukanIndexSuffix)
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
      {id ? (
        <span>
          {id.text}
          {id.accent ? <span className="text-primary">{id.accent}</span> : null}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-0.5">
        <Zap className="size-3 shrink-0" />
        {pal.rank}
      </span>
    </span>
  )
}

export interface PalPickerProps {
  label: string
  pals: BreedingPal[]
  names: NameMap
  value: string | null
  onChange: (id: string | null) => void
  labels: { anyPal: string; searchPal: string; noPalFound: string }
  /**
   * `tile` renders the trigger as a square (icon + name + metadata) instead of
   * the wide desktop combobox, so the three pickers fit one phone line as
   * `A + B = C`. The list inside the popover is the same either way.
   */
  variant?: BreedingVariant
  /** Which slot this picker fills — only used to tag the tile for tests. */
  slot?: 'a' | 'b' | 'c'
}

export function PalPicker({ label, pals, names, value, onChange, labels, variant = 'row', slot }: PalPickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? pals.find((p) => p.id === value) ?? null : null
  const selectedPalId = selected ? formatPalId(selected.zukanIndex, selected.zukanIndexSuffix) : undefined
  const selectedPalIdText = palIdText(selectedPalId)
  const tile = variant === 'tile'

  // cmdk filters on each item's `value`; index name + id so both are searchable.
  const searchText = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of pals) {
      const id = formatPalId(p.zukanIndex, p.zukanIndexSuffix)
      m.set(p.id, `${names[p.id] ?? p.id} ${p.id} ${palIdText(id) ?? ''}`)
    }
    return m
  }, [pals, names])

  // Clearing back to "any Pal". On tiles the × in the header strip is small, so
  // the popover also opens with an explicit "Any Pal" row (a full-width target).
  const clear = () => onChange(null)

  return (
    <div className={tile ? 'min-w-0' : 'flex flex-col gap-1.5'}>
      {tile ? null : <span className="text-xs font-medium text-muted-foreground">{label}</span>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {tile ? (
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              // The visible label lives in the strip, but the button's own name
              // must still say which slot it is and what is in it.
              aria-label={`${label}: ${selected ? names[selected.id] ?? selected.id : labels.anyPal}`}
              data-testid={slot ? `breeding-pick-${slot}` : 'breeding-pick'}
              className={cn(
                TILE_FRAME,
                'h-20 !aspect-auto border-primary/40 hover:border-primary/70 hover:bg-accent',
                // Dashed + muted while unset: an empty picker reads as "any
                // Pal" (the query's actual meaning), not as a broken card.
                selected ? 'bg-card' : 'border-dashed bg-muted/30',
              )}
            >
              {/* No uppercase/tracking here (unlike the building tile's type
                  strip): "Parent A" in caps is measurably wider and would
                  truncate on a 320px screen. */}
              <span className={cn(TILE_HEADER, '!bg-primary/10 font-medium !text-primary')}>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {selected ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={labels.anyPal}
                    title={labels.anyPal}
                    className="-mr-0.5 shrink-0 rounded p-0.5 hover:bg-accent"
                    onClick={(e) => {
                      // Keep the click off the trigger, or clearing would also
                      // open the list.
                      e.stopPropagation()
                      clear()
                    }}
                  >
                    <X className="size-3 opacity-60" />
                  </span>
                ) : (
                  <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
                )}
              </span>
              {selected ? (
                <span className="flex min-h-0 flex-1 flex-col">
                  <span className="flex min-h-0 flex-1 items-center justify-center gap-1.5 px-1.5 text-left">
                    <span
                      className={cn(
                        'relative size-8 shrink-0 rounded-full bg-black/5 dark:bg-white/10',
                        selected.legendary && LEGENDARY_ICON,
                      )}
                    >
                      <img
                        src={palIconUrl(selected.icon)}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 size-full rounded-full object-contain"
                      />
                    </span>
                    <OverflowMarquee
                      text={names[selected.id] ?? selected.id}
                      auto
                      className="text-sm font-semibold leading-tight"
                    />
                  </span>
                  <span className="flex shrink-0 items-center border-t border-primary/15 px-1 py-0.5 text-xs leading-tight tabular-nums text-foreground dark:text-white">
                    <OverflowMarquee
                      text={[selectedPalIdText, String(selected.rank)].filter(Boolean).join(' ')}
                      auto
                      className="min-w-0 flex-1"
                      contentClassName="inline-flex min-w-full items-center justify-center gap-1 text-center"
                    >
                      {selectedPalIdText ? <span>{selectedPalIdText}</span> : null}
                      <span className="inline-flex items-center gap-0.5">
                        <Zap className="size-3 shrink-0" />
                        {selected.rank}
                      </span>
                    </OverflowMarquee>
                  </span>
                </span>
              ) : (
                <span className="flex min-h-0 flex-1 items-center gap-1 px-1 text-left text-muted-foreground">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/40 bg-primary/5">
                    <Plus className="size-4" />
                  </span>
                  <span className="min-w-0 truncate text-xs">{labels.anyPal}</span>
                </span>
              )}
            </button>
          ) : (
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="h-11 w-full justify-start gap-2 px-2.5 font-normal"
            >
              {selected ? (
                <>
                  <PalIcon pal={selected} />
                  <span className="truncate">{names[selected.id] ?? selected.id}</span>
                  <PalMeta pal={selected} />
                </>
              ) : (
                <span className="text-muted-foreground">{labels.anyPal}</span>
              )}
              {selected ? (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={labels.anyPal}
                  className="ml-1 rounded p-0.5 hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation()
                    clear()
                  }}
                >
                  <X className="size-4 opacity-60" />
                </span>
              ) : (
                <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
              )}
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent
          // A tile trigger is far narrower than the list needs, so the tile
          // variant sizes to the viewport instead of the trigger (Radix shifts
          // it back inside the screen for the edge tiles).
          className={cn('p-0', tile ? 'w-[min(20rem,calc(100vw-1.5rem))]' : 'w-[var(--radix-popover-trigger-width)]')}
          align="start"
        >
          <Command
            filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}
          >
            <CommandInput placeholder={labels.searchPal} />
            <CommandList>
              <CommandEmpty>{labels.noPalFound}</CommandEmpty>
              <CommandGroup>
                {tile ? (
                  <CommandItem
                    value={labels.anyPal}
                    onSelect={() => {
                      clear()
                      setOpen(false)
                    }}
                    className="gap-2"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground">
                      <Plus className="size-3.5" />
                    </span>
                    <span className="truncate text-muted-foreground">{labels.anyPal}</span>
                    <Check className={cn('ml-auto size-4 shrink-0', value ? 'opacity-0' : 'opacity-100')} />
                  </CommandItem>
                ) : null}
                {pals.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={searchText.get(p.id)}
                    onSelect={() => {
                      onChange(p.id === value ? null : p.id)
                      setOpen(false)
                    }}
                    className="gap-2"
                  >
                    <PalIcon pal={p} />
                    <span className="truncate">{names[p.id] ?? p.id}</span>
                    <PalMeta pal={p} />
                    <Check className={cn('ml-1 size-4 shrink-0', p.id === value ? 'opacity-100' : 'opacity-0')} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
