import { useMemo, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from '@gamemap/ui'
import type { Engraving } from '@/lib/data'

/**
 * Engraving picker whose trigger IS the card's tile — large icon on the first
 * line, name on the second — rather than a separate combobox row.
 *
 * The list is the Popover + cmdk pattern palworld's PalPicker uses, on the same
 * shared primitives. Typing filters on the name and the latin slug, so the list
 * is reachable without switching IME.
 *
 * The tile is both the Popover trigger (click to choose) and the HoverCard
 * trigger (hover to read the scaled effect text). Radix clones props onto the
 * child, so nesting the two `asChild` triggers over one button gives both
 * behaviours without a second affordance competing for the card's width.
 */

export interface EngravingOption {
  engraving: Engraving
  name: string
}

export function EngravingPicker({
  label,
  options,
  value,
  scoring,
  labels,
  tooltip,
  onChange,
}: {
  label: string
  options: EngravingOption[]
  /** The selected engraving's display name; '' for an empty slot. */
  value: string
  /** Names that carry combat power for the current role. */
  scoring: Set<string>
  labels: { empty: string; search: string; notFound: string; noPower: string }
  /** Hovercard body — the scaled effect text, built by the card. */
  tooltip: React.ReactNode
  onChange: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? options.find((o) => o.name === value) ?? null : null

  const searchText = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of options) m.set(o.name, `${o.name} ${o.engraving.slug}`)
    return m
  }, [options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <HoverCard openDelay={160} closeDelay={120}>
        <HoverCardTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              aria-label={`${label}: ${selected ? selected.name : labels.empty}`}
              className={cn(
                'flex w-full flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors',
                selected
                  ? 'border-border bg-background hover:border-accent/60 hover:bg-accent/10'
                  : 'border-dashed border-border bg-muted/20 hover:border-accent/60 hover:bg-accent/10',
              )}
            >
              {selected ? (
                <TileIcon option={selected} />
              ) : (
                <span
                  aria-hidden
                  className="grid size-14 place-items-center rounded-md border border-dashed border-border text-2xl font-normal leading-none text-muted-foreground"
                >
                  <Plus className="size-6" />
                </span>
              )}
              <span
                className={cn(
                  'w-full truncate text-center text-sm',
                  selected ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                {selected ? selected.name : labels.empty}
              </span>
            </button>
          </PopoverTrigger>
        </HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          className="max-h-80 w-72 overflow-auto border-border bg-card text-foreground"
        >
          {tooltip}
        </HoverCardContent>
      </HoverCard>
      <PopoverContent className="w-[min(22rem,calc(100vw-1.5rem))] p-0" align="start">
        <Command
          filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}
        >
          <CommandInput placeholder={labels.search} />
          <CommandList>
            <CommandEmpty>{labels.notFound}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={labels.empty}
                onSelect={() => {
                  onChange('')
                  setOpen(false)
                }}
                className="gap-2"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded border border-dashed border-muted-foreground/50 text-muted-foreground">
                  <Plus className="size-3.5" />
                </span>
                <span className="truncate text-muted-foreground">{labels.empty}</span>
                <Check
                  className={cn('ml-auto size-4 shrink-0', value ? 'opacity-0' : 'opacity-100')}
                />
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.engraving.slug}
                  value={searchText.get(o.name)}
                  onSelect={() => {
                    onChange(o.name === value ? '' : o.name)
                    setOpen(false)
                  }}
                  className="gap-2"
                >
                  <RowIcon option={o} />
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  {/* 15 of the 43 have no BattlePoint grid; say so on the row
                      rather than letting them silently score zero. */}
                  {scoring.has(o.name) ? null : (
                    <span className="shrink-0 text-xs text-muted-foreground">{labels.noPower}</span>
                  )}
                  <Check
                    className={cn(
                      'size-4 shrink-0',
                      o.name === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function TileIcon({ option }: { option: EngravingOption }) {
  const slug = option.engraving.icon_slug
  if (!slug) return <Fallback name={option.name} className="size-14 text-xl" />
  return (
    <img
      src={`engravings/${slug}.png`}
      alt=""
      width={56}
      height={56}
      className="size-14 rounded-md object-contain"
    />
  )
}

function RowIcon({ option }: { option: EngravingOption }) {
  const slug = option.engraving.icon_slug
  if (!slug) return <Fallback name={option.name} className="size-6 text-xs" />
  return (
    <img
      src={`engravings/${slug}.png`}
      alt=""
      loading="lazy"
      className="size-6 shrink-0 rounded bg-black/5 object-contain dark:bg-white/10"
    />
  )
}

/** Defensive: every engraving resolves through IconInfo.loa today. */
function Fallback({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-md border border-dashed border-accent/50 font-medium text-foreground',
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  )
}
