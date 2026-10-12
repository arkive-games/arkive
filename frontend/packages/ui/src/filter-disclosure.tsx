import { useId, useState, type ReactNode } from "react"
import { ChevronDown, SlidersHorizontal } from "lucide-react"
import { cn } from "./utils"

export interface FilterDisclosureProps {
  /** Visible toggle text on phones, e.g. the localized word "Filters". */
  label: ReactNode
  /** Optional accessible names per state; the visible label plus aria-expanded suffice without them. */
  expandLabel?: string
  collapseLabel?: string
  /**
   * `true` while the filters hold a non-default selection. Dots the toggle so
   * an active filter stays visible with the panel collapsed.
   */
  active?: boolean
  /** Right-aligned text on the toggle row, e.g. the result count. */
  summary?: ReactNode
  /** Initial phone state when uncontrolled. Desktop is always expanded. */
  defaultExpanded?: boolean
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  /**
   * Layout classes for a wrapper around `children` (the spacing the page used
   * to own). Kept on its own element so a display utility here (`flex`,
   * `grid`) can never fight the visibility classes.
   */
  bodyClassName?: string
  testId?: string
  children: ReactNode
}

/**
 * Filter controls that phones can fold away behind one toggle row, while
 * desktop keeps them permanently in the page flow with no toggle at all.
 *
 * Collapsing hides the body with CSS rather than unmounting it: the controls
 * carry state of their own (search text, open comboboxes), and the same node is
 * the desktop copy, so it must be mounted exactly once on every breakpoint.
 *
 * From `md` up both wrappers are `display: contents`, so desktop markup is
 * layout-identical to rendering `children` bare (or inside `bodyClassName`).
 * On phones the disclosure takes a full row (`w-full`) even inside a
 * wrapping flex parent. `display: contents` drops the boxes but not the DOM
 * nodes, so a parent spacing its children with `gap` is unaffected while one
 * using a child-combinator rule (`space-y-*`, `divide-*`) would style the
 * wrapper instead — space such parents with `gap`.
 */
export function FilterDisclosure({
  label,
  expandLabel,
  collapseLabel,
  active = false,
  summary,
  defaultExpanded = true,
  expanded: controlledExpanded,
  onExpandedChange,
  bodyClassName,
  testId,
  children,
}: FilterDisclosureProps) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded)
  const expanded = controlledExpanded ?? uncontrolledExpanded
  const bodyId = useId()
  const stateLabel = expanded ? collapseLabel : expandLabel
  const toggle = () => {
    const next = !expanded
    if (controlledExpanded === undefined) setUncontrolledExpanded(next)
    onExpandedChange?.(next)
  }

  return (
    <div className="w-full md:contents" data-testid={testId} data-expanded={expanded}>
      <button
        type="button"
        data-testid="filter-disclosure-toggle"
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={stateLabel}
        title={stateLabel}
        onClick={toggle}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-md text-left text-sm font-medium text-foreground transition-colors hover:text-primary md:hidden",
          expanded && "mb-2",
        )}
      >
        <span className="relative inline-flex shrink-0">
          <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
          {active ? (
            <span
              data-testid="filter-disclosure-active-dot"
              aria-hidden
              className="absolute -right-1 -top-1 size-2 rounded-full bg-primary ring-2 ring-background"
            />
          ) : null}
        </span>
        <span className="min-w-0 truncate">{label}</span>
        {summary != null ? (
          <span className="ml-auto shrink-0 text-sm font-normal tabular-nums text-muted-foreground">{summary}</span>
        ) : null}
        <ChevronDown
          aria-hidden
          className={cn(
            "size-5 shrink-0 text-muted-foreground transition-transform",
            summary == null && "ml-auto",
            expanded && "rotate-180",
          )}
        />
      </button>
      <div id={bodyId} className={cn("md:contents", !expanded && "hidden")}>
        {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
      </div>
    </div>
  )
}
