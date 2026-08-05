import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
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

/**
 * Searchable single-select — a Popover over a cmdk list, the same pattern
 * palworld's PalPicker uses, on the same shared @gamemap/ui primitives.
 *
 * Used wherever a plain `<select>` was unworkable: the bracelet's 刻印效果 column
 * offers 289 lines, and engravings 43. A native select cannot be typed into, and
 * cannot show an icon inside the control.
 *
 * Options carry their own `search` text so a list can be found by more than its
 * label — engravings index their latin slug, which makes them reachable without
 * switching IME.
 */

export interface SearchOption {
  value: string
  label: string
  /** Rendered before the label, in the list and on the trigger. */
  icon?: React.ReactNode
  /** Rendered after the label in the list only; use for a note or an amp. */
  meta?: React.ReactNode
  /** Extra text to match on. The label is always searchable. */
  search?: string
}

export function SearchSelect({
  options,
  value,
  onChange,
  labels,
  ariaLabel,
  clearable = true,
  className,
}: {
  options: SearchOption[]
  value: string
  onChange: (value: string) => void
  labels: { empty: string; search: string; notFound: string }
  ariaLabel: string
  /** When false the list has no clear row and the trigger has no ×. */
  clearable?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? options.find((o) => o.value === value) ?? null : null

  // cmdk filters on each item's `value` prop, so fold the searchable text into
  // it and key the React element separately.
  const searchText = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of options) m.set(o.value, `${o.label} ${o.search ?? ''}`)
    return m
  }, [options])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={`${ariaLabel}: ${selected ? selected.label : labels.empty}`}
          className={cn('h-9 w-full justify-start gap-1.5 px-1.5 font-normal', className)}
        >
          {selected ? (
            <>
              {selected.icon}
              <span className="min-w-0 flex-1 truncate text-left">{selected.label}</span>
              {clearable ? (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={labels.empty}
                  className="shrink-0 rounded p-0.5 hover:bg-accent"
                  onClick={(e) => {
                    // Keep the click off the trigger, or clearing also opens it.
                    e.stopPropagation()
                    onChange('')
                  }}
                >
                  <X className="size-3.5 opacity-60" />
                </span>
              ) : (
                <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
              )}
            </>
          ) : (
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
        // Columns are far narrower than the list needs, so size to the viewport
        // rather than the trigger; Radix shifts it back on-screen at the edges.
        className="w-[min(24rem,calc(100vw-1.5rem))] p-0"
        align="start"
      >
        <Command
          filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}
        >
          <CommandInput placeholder={labels.search} />
          <CommandList>
            <CommandEmpty>{labels.notFound}</CommandEmpty>
            <CommandGroup>
              {clearable ? (
                <CommandItem
                  value={labels.empty}
                  onSelect={() => {
                    onChange('')
                    setOpen(false)
                  }}
                  className="gap-2"
                >
                  <span className="truncate text-muted-foreground">{labels.empty}</span>
                  <Check
                    className={cn('ml-auto size-4 shrink-0', value ? 'opacity-0' : 'opacity-100')}
                  />
                </CommandItem>
              ) : null}
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={searchText.get(o.value)}
                  onSelect={() => {
                    onChange(clearable && o.value === value ? '' : o.value)
                    setOpen(false)
                  }}
                  className="gap-2"
                >
                  {o.icon}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.meta}
                  <Check
                    className={cn('size-4 shrink-0', o.value === value ? 'opacity-100' : 'opacity-0')}
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
