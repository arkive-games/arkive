import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
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
import type { Engraving } from '@/lib/data'

/**
 * Searchable engraving picker — the same Popover + cmdk pattern palworld's
 * PalPicker uses, on the same shared primitives.
 *
 * A plain `<select>` was unusable at this size: 43 options with no way to type,
 * and the icon could only appear outside the control. Here the icon sits on every
 * row and on the trigger, and typing filters on name and slug.
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
  onChange,
}: {
  label: string
  options: EngravingOption[]
  /** The selected engraving's display name; '' for an empty slot. */
  value: string
  /** Names that carry combat power for the current role. */
  scoring: Set<string>
  labels: { empty: string; search: string; notFound: string; noPower: string }
  onChange: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? options.find((o) => o.name === value) ?? null : null

  // cmdk filters on each item's `value`, so index the slug alongside the name —
  // it makes the list reachable from a latin keyboard without switching IME.
  const searchText = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of options) m.set(o.name, `${o.name} ${o.engraving.slug}`)
    return m
  }, [options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={`${label}: ${selected ? selected.name : labels.empty}`}
          className="h-9 w-full justify-start gap-1.5 px-1.5 font-normal"
        >
          {selected ? (
            <>
              <Icon option={selected} className="size-5" />
              <span className="min-w-0 flex-1 truncate text-left">{selected.name}</span>
              <span
                role="button"
                tabIndex={-1}
                aria-label={labels.empty}
                className="shrink-0 rounded p-0.5 hover:bg-accent"
                onClick={(e) => {
                  // Keep the click off the trigger, or clearing also opens the list.
                  e.stopPropagation()
                  onChange('')
                }}
              >
                <X className="size-3.5 opacity-60" />
              </span>
            </>
          ) : (
            // No icon box on an empty trigger: the card already shows a large
            // placeholder directly above it, and five columns leave too little
            // width to spend on a second one.
            <>
              <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
                {labels.empty}
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        // The column is far narrower than the list needs, so size to the
        // viewport rather than the trigger; Radix shifts it back on-screen.
        className="w-[min(20rem,calc(100vw-1.5rem))] p-0"
        align="start"
      >
        <Command
          filter={(v, search) =>
            v.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0
          }
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
                <Check className={cn('ml-auto size-4 shrink-0', value ? 'opacity-0' : 'opacity-100')} />
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
                  <Icon option={o} />
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  {/* 15 of the 43 have no BattlePoint grid; say so on the row
                      rather than letting them silently score zero. */}
                  {scoring.has(o.name) ? null : (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {labels.noPower}
                    </span>
                  )}
                  <Check
                    className={cn('size-4 shrink-0', o.name === value ? 'opacity-100' : 'opacity-0')}
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

function Icon({ option, className }: { option: EngravingOption; className?: string }) {
  const slug = option.engraving.icon_slug
  if (!slug) {
    // Defensive: every engraving resolves through IconInfo.loa today.
    return (
      <span
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded border border-dashed border-border text-xs text-muted-foreground',
          className,
        )}
      >
        {option.name.slice(0, 1)}
      </span>
    )
  }
  return (
    <img
      src={`engravings/${slug}.png`}
      alt=""
      loading="lazy"
      className={cn('size-6 shrink-0 rounded bg-black/5 object-contain dark:bg-white/10', className)}
    />
  )
}
