import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger, cn } from '@gamemap/ui'
import { TILE_FRAME, TILE_HEADER } from './RecipeCard'

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
  compact?: boolean
}

/** Generation-budget picker with a compact phone layout and a full tile fallback. */
export function GenPicker({ label, value, onChange, format, compact = false }: GenPickerProps) {
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
            className={cn(
              TILE_FRAME,
              compact
                ? 'relative h-10 !aspect-auto flex-row items-center border-primary/40 bg-primary/5 px-3 hover:border-primary/70 hover:bg-primary/10'
                : 'h-20 !aspect-auto border-primary/40 bg-card hover:border-primary/70 hover:bg-accent',
            )}
          >
            {compact ? (
              <>
                <span className="min-w-0 truncate text-xs font-medium text-primary">{label}</span>
                <span className="absolute left-1/2 -translate-x-1/2 text-lg font-semibold tabular-nums text-primary">
                  {value}
                </span>
                <ChevronsUpDown className="ml-auto size-4 shrink-0 text-primary/60" />
              </>
            ) : (
              <>
                <span className={cn(TILE_HEADER, '!bg-primary/10 font-medium !text-primary')}>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
                </span>
                <span className="flex min-h-0 flex-1 items-center justify-center">
                  <span className="text-2xl font-semibold tabular-nums text-primary">{value}</span>
                </span>
              </>
            )}
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
