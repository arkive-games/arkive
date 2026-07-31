import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger, cn } from '@gamemap/ui'
import {
  TILE_FOOTER,
  TILE_FRAME,
  TILE_HEADER,
  TILE_NAME,
  TileIconUnknown,
} from './RecipeCard'

/** Generation budgets the planner offers (a chain of N breeding steps). */
export const GEN_CHOICES = [2, 3, 4, 5, 6] as const
export type GenChoice = (typeof GEN_CHOICES)[number]

/** Narrow an arbitrary number to a supported budget (2 is the floor/default). */
export function toGenChoice(n: number): GenChoice {
  return (GEN_CHOICES as readonly number[]).includes(n) ? (n as GenChoice) : 2
}

export interface GenPickerProps {
  label: string
  value: GenChoice
  onChange: (gen: GenChoice) => void
  /** Formats a budget for display, e.g. 3 → "3 generations". */
  format: (gen: number) => string
}

/**
 * The planner's middle square. Its slot is where Parent B sits in the recipe
 * formula, but the planner never takes a second parent — the whole point is that
 * it FINDS the partners. Rather than leave a hole (or a dangling two-square
 * row), the slot carries the generation budget: a `?` where the Pal icon would
 * be, the current budget as the name, and a tap to change it.
 *
 * Shares the tile geometry exported by RecipeCard, so it lines up pixel-for-
 * pixel with the Pal squares either side of it.
 */
export function GenPicker({ label, value, onChange, format }: GenPickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="min-w-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-label={`${label}: ${format(value)}`}
            data-testid="breeding-pick-gen"
            className={cn(TILE_FRAME, 'border-border bg-card hover:border-primary/60 hover:bg-accent')}
          >
            <span className={cn(TILE_HEADER, 'font-medium')}>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
            </span>
            <TileIconUnknown />
            <span className={TILE_FOOTER}>
              {/* The number alone — a phone tile has ~90px, and the word
                  "generations" is already on the strip above it. */}
              <span className={cn(TILE_NAME, 'tabular-nums')}>{value}</span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto min-w-[8rem] p-1" align="center">
          <ul className="flex flex-col">
            {GEN_CHOICES.map((g) => (
              <li key={g}>
                <button
                  type="button"
                  data-testid={`breeding-gen-${g}`}
                  aria-pressed={g === value}
                  onClick={() => {
                    onChange(g)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                    g === value && 'font-medium text-primary',
                  )}
                >
                  <span className="flex-1 tabular-nums">{format(g)}</span>
                  <Check className={cn('size-4 shrink-0', g === value ? 'opacity-100' : 'opacity-0')} />
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}
