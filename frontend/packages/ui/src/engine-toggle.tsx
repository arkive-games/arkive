import { CheckIcon, Cpu } from "lucide-react"
import { Button } from "./button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu"

export interface EngineToggleProps<T extends string> {
  /** The engine actually rendering, which `?engine=` can override. */
  value: T
  /** Menu order; pass `MAP_ENGINE_CHOICES` from `@gamemap/map-shell`. */
  choices: readonly T[]
  /** Display names per choice; pass `MAP_ENGINE_LABELS` from `@gamemap/map-shell`. */
  labels: Record<T, { full: string }>
  onChange: (choice: T) => void
  /** Trigger tooltip / accessible name, injected so this stays i18n-free. */
  label: string
}

/**
 * Map-engine switcher for a top bar. Shaped exactly like the shell's own
 * language / theme menus (ghost icon `Button` trigger + a checked item per
 * option) so it reads as part of the same cluster; the `Cpu` glyph keeps it
 * visually distinct from `Languages` and `Settings`.
 *
 * Purely presentational: it owns no precedence logic and no vocabulary — the
 * app hands it the resolved value, the choice list, the labels and the store's
 * setter. Generic over the choice id so this package needs no dependency on
 * `@gamemap/map-shell` (which already depends on this one). A mobile equivalent
 * is up to each app, since mobile layouts may render no top bar.
 */
export function EngineToggle<T extends string>({
  value,
  choices,
  labels,
  onChange,
  label,
}: EngineToggleProps<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="engine-menu"
          aria-label={label}
          title={label}
        >
          <Cpu className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[2000]">
        {choices.map((choice) => (
          <DropdownMenuItem
            key={choice}
            data-testid={`engine-${choice}`}
            onSelect={() => onChange(choice)}
          >
            <span className="flex-1">{labels[choice].full}</span>
            {value === choice && <CheckIcon className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
