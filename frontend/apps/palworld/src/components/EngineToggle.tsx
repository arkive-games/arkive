import { useTranslation } from 'react-i18next'
import { CheckIcon, Cpu } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gamemap/ui'
import {
  MAP_ENGINE_CHOICES,
  MAP_ENGINE_LABELS,
  type MapEngineChoice,
} from '../lib/mapEngineChoice'

export interface EngineToggleProps {
  /** The engine actually rendering, which `?engine=` can override. */
  value: MapEngineChoice
  onChange: (choice: MapEngineChoice) => void
}

/**
 * Map-engine switcher for the top bar. Shaped exactly like the shell's own
 * language / theme menus (ghost icon `Button` trigger + a checked item per
 * option) so it reads as part of the same cluster; the `Cpu` glyph keeps it
 * visually distinct from `Languages` and `Settings`.
 *
 * Purely presentational: it owns no precedence logic, it just reports the pick
 * (App hands it `mapEngineStore.set`). The mobile equivalent lives in
 * `BottomTabBar`, since the mobile layout renders no top bar.
 */
export function EngineToggle({ value, onChange }: EngineToggleProps) {
  const { t } = useTranslation()
  const label = t('engineMenu')
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
        {MAP_ENGINE_CHOICES.map((choice) => (
          <DropdownMenuItem
            key={choice}
            data-testid={`engine-${choice}`}
            onSelect={() => onChange(choice)}
          >
            <span className="flex-1">{MAP_ENGINE_LABELS[choice].full}</span>
            {value === choice && <CheckIcon className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
