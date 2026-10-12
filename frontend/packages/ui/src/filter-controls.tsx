import type { CSSProperties, KeyboardEvent, ReactNode } from "react"
import { Search, X } from "lucide-react"
import { Input } from "./input"
import { cn } from "./utils"

/** Toggle a value in or out of a multi-select filter selection. */
export function toggleValue<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/**
 * Chip looks the apps settled on before they shared one component:
 * - `tag` — the site filter tokens (`--arkive-filter-active`); the default.
 * - `accent` — `tag` with the nav accent ring, for chip groups that headline a page.
 * - `pill` — a rounded pill tinted with the primary color.
 * - `emphasis` — a pill that fills solid primary when active, for one standout toggle.
 * - `solid` — a pill that fills solid when active; `color` overrides the fill.
 */
export type FilterChipVariant = "tag" | "accent" | "pill" | "emphasis" | "solid"

const CHIP_BASE: Record<FilterChipVariant, string> = {
  tag: "rounded-md px-2.5 py-1 text-sm transition-colors",
  accent:
    "min-h-8 rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]",
  pill: "rounded-full px-2.5 py-1 text-xs font-medium transition",
  emphasis: "rounded-full px-2.5 py-1 text-xs font-medium transition",
  solid: "rounded-full px-3 py-1 text-xs transition",
}

const CHIP_STATE: Record<FilterChipVariant, { on: string; off: string }> = {
  tag: {
    on: "border-ring bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]",
    off: "border-border text-muted-foreground enabled:hover:border-primary/60",
  },
  accent: {
    on: "border-[color:var(--arkive-nav-accent)] bg-[color:var(--arkive-filter-active)] text-foreground",
    off: "border-border bg-background text-muted-foreground hover:border-[color:var(--arkive-nav-accent)]/60 hover:text-foreground",
  },
  pill: {
    on: "border-primary bg-primary/15 text-foreground",
    off: "border-border bg-secondary/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
  },
  emphasis: {
    on: "border-primary bg-primary font-semibold text-primary-foreground shadow-sm ring-2 ring-primary/20",
    off: "border-primary/40 bg-primary/5 text-foreground shadow-xs hover:border-primary/70 hover:bg-primary/10",
  },
  solid: {
    on: "border-primary bg-primary text-primary-foreground",
    off: "border-border bg-card text-muted-foreground hover:bg-accent/10",
  },
}

export interface FilterChipProps {
  active: boolean
  onClick: () => void
  variant?: FilterChipVariant
  /** How many records the chip would leave; shown after the label. */
  count?: ReactNode
  /** Active fill color for `solid` chips (e.g. a character's color). */
  color?: string
  disabled?: boolean
  title?: string
  testId?: string
  className?: string
  children: ReactNode
}

/** A toggleable filter chip (`aria-pressed`). */
export function FilterChip({
  active,
  onClick,
  variant = "tag",
  count,
  color,
  disabled = false,
  title,
  testId,
  className,
  children,
}: FilterChipProps) {
  const state = CHIP_STATE[variant]
  const style: CSSProperties | undefined =
    active && color ? { backgroundColor: color, borderColor: color, color: "#fff" } : undefined
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      title={title}
      data-testid={testId}
      style={style}
      className={cn(
        "inline-flex items-center gap-1.5 border disabled:cursor-not-allowed disabled:opacity-45",
        CHIP_BASE[variant],
        active ? state.on : state.off,
        className,
      )}
    >
      {children}
      {count != null ? <span className="text-xs tabular-nums opacity-70">{count}</span> : null}
    </button>
  )
}

/**
 * A labelled row of filter chips.
 * - `inline` — the label leads the chips on one wrapping line.
 * - `column` — the label sits in a fixed-width column and the chips wrap beside it.
 */
export function FilterRow({
  label,
  layout = "inline",
  testId,
  className,
  children,
}: {
  label: ReactNode
  layout?: "inline" | "column"
  testId?: string
  className?: string
  children: ReactNode
}) {
  if (layout === "column") {
    return (
      <div className={cn("flex items-start gap-1.5", className)} data-testid={testId}>
        <span className="mr-1 w-16 shrink-0 py-1 text-xs font-semibold text-muted-foreground">{label}</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
      </div>
    )
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} data-testid={testId}>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

/** A filter group headed by a title and a one-line hint, chips wrapping below. */
export function FilterGroup({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h2 className="text-sm font-bold text-foreground">{label}</h2>
        {hint != null ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

/**
 * Every filter, the search box and the result count on one wrapping line, the
 * count at its end where it reads as the answer to whatever was just filtered.
 */
export function FilterBar({ children, count }: { children: ReactNode; count?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3">
      {children}
      {count != null ? <span className="ml-auto shrink-0 text-sm tabular-nums text-muted-foreground">{count}</span> : null}
    </div>
  )
}

export interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** Accessible name; defaults to the placeholder. */
  label?: string
  /** Visible caption above the box. */
  caption?: ReactNode
  /** Accessible name of the clear button; the button only renders when given. */
  clearLabel?: string
  /** Escape empties the box. */
  clearOnEscape?: boolean
  /** `sm` fits inside a `FilterBar`; `md` is a standalone box. */
  size?: "sm" | "md"
  type?: "search" | "text"
  className?: string
  inputClassName?: string
  testId?: string
}

/** A search box with a leading magnifier icon. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  caption,
  clearLabel,
  clearOnEscape = false,
  size = "md",
  type = "text",
  className,
  inputClassName,
  testId,
}: SearchInputProps) {
  const onKeyDown = clearOnEscape
    ? (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") onChange("")
      }
    : undefined
  const box = (
    <span className="relative block">
      <Search
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground",
          size === "sm" ? "left-2.5" : "left-3",
        )}
      />
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        // The visible caption is what names the box, matching the wrapping
        // <label> these boxes used to have; without one, the explicit label,
        // then the placeholder.
        aria-label={typeof caption === "string" ? caption : (label ?? placeholder)}
        data-testid={testId}
        className={cn(size === "sm" ? "h-8 pl-8 text-sm" : "pl-9", clearLabel && "pr-9", inputClassName)}
      />
      {clearLabel && value ? (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </span>
  )
  return (
    <label className={cn("relative block", className)}>
      {caption != null ? (
        <span className="mb-1 block text-xs font-semibold text-muted-foreground">{caption}</span>
      ) : null}
      {box}
    </label>
  )
}
