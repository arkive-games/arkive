import type { ReactNode } from 'react'

/**
 * The filter chrome the catalogue pages share.
 *
 * Shared rather than copied because every catalogue filters on something —
 * cost, bond family, equipment type, talent rarity, fellow quality — and a
 * hand-rolled chip row per page is how they drift apart visually.
 */

export function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
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
          ? 'rounded-md border border-ring bg-[color:var(--arkive-filter-active)] px-2.5 py-1 text-sm text-[color:var(--arkive-nav-active)]'
          : 'rounded-md border border-border px-2.5 py-1 text-sm text-muted-foreground hover:border-primary/60'
      }
    >
      {children}
    </button>
  )
}
