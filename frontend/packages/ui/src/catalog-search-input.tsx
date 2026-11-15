import { useRef, type ComponentProps, type RefObject } from 'react'
import { ArrowRight, Search, X } from 'lucide-react'
import { cn } from './utils'

export interface CatalogSearchInputProps extends Omit<ComponentProps<'input'>, 'size' | 'ref'> {
  density?: 'comfortable' | 'compact'
  submitLabel?: string
  clearLabel?: string
  onClear?: () => void
  onSearch?: () => void
  inputClassName?: string
  inputRef?: RefObject<HTMLInputElement | null>
}

/** The reviewed catalog control; live filtering stays owned by the caller. */
export function CatalogSearchInput({ density = 'comfortable', className, inputClassName, inputRef: externalRef, submitLabel, clearLabel, onClear, onSearch,
  type = 'search', ...input }: CatalogSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const label = input['aria-label'] ?? input.placeholder
  return <form data-density={density} role="search" aria-disabled={input.disabled || undefined} className={cn('catalog-search', className)} onSubmit={event => {
    event.preventDefault()
    if (input.disabled) return
    onSearch?.()
    inputRef.current?.focus()
  }}>
    <Search className="size-5 shrink-0" strokeWidth={1.8} aria-hidden />
    <input {...input} ref={node => { inputRef.current = node; if (externalRef) externalRef.current = node }} type={type} aria-label={label} className={inputClassName} />
    {clearLabel && input.value && <button type="button" disabled={input.disabled} className="catalog-search-clear" aria-label={clearLabel} onClick={() => {
      onClear?.()
      inputRef.current?.focus()
    }}><X className="size-4" aria-hidden /></button>}
    <button type="submit" disabled={input.disabled} aria-label={submitLabel ?? 'Search'}><ArrowRight className="size-4" strokeWidth={2.2} aria-hidden /></button>
  </form>
}
