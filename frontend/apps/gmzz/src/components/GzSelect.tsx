import type { ReactNode } from 'react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@gamemap/ui'

export type GzOption = { value: string; label: ReactNode; disabled?: boolean }
export type GzOptionGroup = { label: ReactNode; options: GzOption[] }

/** Radix refuses an empty item value, so "" travels under this stand-in. */
const EMPTY = '\u0000empty'
const wrap = (value: string) => (value === '' ? EMPTY : value)
const unwrap = (value: string) => (value === EMPTY ? '' : value)

/**
 * The site's one dropdown: a pill trigger in the score page's style and a
 * themed menu, instead of the browser's native list (white in dark mode, a
 * system highlight colour, unstyleable groups). The menu sits on the nested
 * overlay layer, so it opens above the dialogs it is used in.
 */
export function GzSelect({ value, onChange, options, label, testId, className = '', disabled = false, placeholder }: {
  value: string
  onChange: (value: string) => void
  options: (GzOption | GzOptionGroup)[]
  /** Accessible name of the trigger. */
  label: string
  testId?: string
  className?: string
  disabled?: boolean
  placeholder?: ReactNode
}) {
  const item = (option: GzOption) => (
    <SelectItem key={option.value} value={wrap(option.value)} disabled={option.disabled}
      data-testid={testId ? `${testId}-option-${option.value}` : undefined}>
      {option.label}
    </SelectItem>
  )
  return (
    <Select value={wrap(value)} onValueChange={(next) => onChange(unwrap(next))} disabled={disabled}>
      <SelectTrigger aria-label={label} data-testid={testId} className={`gz-sel ${className}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="gz-sel-menu z-[var(--arkive-layer-nested-overlay)]">
        {options.map((entry, index) =>
          'options' in entry ? (
            <SelectGroup key={`g${index}`}>
              {index > 0 ? <SelectSeparator /> : null}
              <SelectLabel>{entry.label}</SelectLabel>
              {entry.options.map(item)}
            </SelectGroup>
          ) : item(entry),
        )}
      </SelectContent>
    </Select>
  )
}
