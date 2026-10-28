import type { ReactNode } from 'react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@gamemap/ui'

export type GzOption = { value: string; label: ReactNode; disabled?: boolean }
export type GzOptionGroup = { label: ReactNode; options: GzOption[] }

/** Radix refuses an empty item value, so "" travels under this stand-in. */
const EMPTY = '\u0000empty'
const wrap = (value: string) => (value === '' ? EMPTY : value)
const unwrap = (value: string) => (value === EMPTY ? '' : value)

const isGroup = (entry: GzOption | GzOptionGroup): entry is GzOptionGroup => 'options' in entry

/**
 * The site's one dropdown: a pill trigger in the score page's style and a
 * themed menu, instead of the browser's native list (white in dark mode, a
 * system highlight colour, unstyleable groups). The menu sits on the nested
 * overlay layer, so it opens above the dialogs it is used in.
 *
 * Groups carry a label and are set off from their neighbours by a rule; the
 * picked option is marked with a check.
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
      <SelectContent position="popper" sideOffset={4} className="gz-sel-menu z-[var(--arkive-layer-nested-overlay)]">
        {options.map((entry, index) => {
          // A rule between a group and whatever sits beside it.
          const rule = index > 0 && (isGroup(entry) || isGroup(options[index - 1])) ? <SelectSeparator /> : null
          return isGroup(entry) ? (
            <SelectGroup key={`g${index}`}>
              {rule}
              <SelectLabel>{entry.label}</SelectLabel>
              {entry.options.map(item)}
            </SelectGroup>
          ) : rule ? (
            <SelectGroup key={`o${index}`}>{rule}{item(entry)}</SelectGroup>
          ) : item(entry)
        })}
      </SelectContent>
    </Select>
  )
}
