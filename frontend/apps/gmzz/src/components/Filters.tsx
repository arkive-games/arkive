import type { ReactNode } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { Input } from '@gamemap/ui'

/**
 * The filter chrome the catalogue pages share.
 *
 * Shared rather than copied because every catalogue filters on something —
 * cost, bond family, equipment type, talent rarity, fellow quality — and a
 * hand-rolled chip row per page is how they drift apart visually.
 */

/**
 * Every filter, the search box and the result count on one wrapping line.
 *
 * These pages used to stack them — description, each chip row, the search box,
 * then the count — which put six lines and a quarter of the screen between the
 * heading and the first result. On a tool site the results are the page, so
 * the controls take one line and the count sits at its end, where it reads as
 * the answer to whatever was just filtered.
 */
export function FilterBar({ children, count }: { children: ReactNode; count?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3">
      {children}
      {count != null ? (
        <span className="ml-auto shrink-0 text-sm tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </div>
  )
}

export function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

/** A search box sized to sit inside a `FilterBar` rather than take a row of its own. */
export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="relative min-w-48 flex-1 md:max-w-xs">
      <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-8 pl-8 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  )
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'rounded-md border border-ring bg-[color:var(--arkive-filter-active)] px-2 py-0.5 text-sm text-[color:var(--arkive-nav-active)]'
          : 'rounded-md border border-border px-2 py-0.5 text-sm text-muted-foreground hover:border-primary/60'
      }
    >
      {children}
    </button>
  )
}
