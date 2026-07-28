import { useTranslation } from 'react-i18next'
import { CheckIcon, Cpu } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gamemap/ui'
import type { MapEngineChoice } from '../lib/mapEngineChoice'

/**
 * The two engine labels are proper nouns (a library and a rendering API), so
 * they are constants rather than i18n keys — translating them would duplicate an
 * untranslatable string across all 17 locales. Only the menu's own label
 * (`engineMenu`) is localized.
 */
const ENGINE_OPTIONS: { value: MapEngineChoice; label: string }[] = [
  { value: 'gl', label: 'WebGL (three.js)' },
  { value: 'leaflet', label: 'Leaflet' },
]

export interface EngineToggleProps {
  value: MapEngineChoice
  onChange: (choice: MapEngineChoice) => void
}

/**
 * Map-engine switcher for the top bar. Shaped exactly like the shell's own
 * language / theme menus (ghost icon `Button` trigger + a checked item per
 * option) so it reads as part of the same cluster; the `Cpu` glyph keeps it
 * visually distinct from `Languages` and `Settings`.
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
        {ENGINE_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            data-testid={`engine-${option.value}`}
            onSelect={() => onChange(option.value)}
          >
            <span className="flex-1">{option.label}</span>
            {value === option.value && <CheckIcon className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
