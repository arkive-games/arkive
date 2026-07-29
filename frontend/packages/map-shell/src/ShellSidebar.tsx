import { useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn, ScrollArea } from "@gamemap/ui"

export interface ShellSidebarProps {
  width?: number
  /**
   * Which edge the sidebar sits on. Only the collapse toggle differs: it hangs
   * off the outward edge (32px, `w-8`) and its chevron points away from the
   * content. The right toggle's testid is suffixed (`sidebar-toggle-right`) so
   * existing `sidebar-toggle` selectors keep resolving to exactly one element
   * once a second sidebar is on the page.
   *
   * The toggle overhangs into the neighbouring column — it has to, since a
   * collapsed sidebar is 0px wide and the tab must stay clickable. Overlays
   * floating in that column need matching clearance; see the `right-11` on each
   * app's floating SearchPanel.
   */
  side?: "left" | "right"
  /** Accessible name for the sidebar landmark, e.g. "Filters" or "About". */
  label?: string
  defaultCollapsed?: boolean
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  collapseLabel: string
  expandLabel: string
  backgroundSlot?: ReactNode
  headerSlot?: ReactNode
  mapSelector?: {
    maps: { id: string; label: string; icon?: ReactNode }[]
    activeMapId: string
    onSelectMap: (id: string) => void
  }
  mapSelectorSlot?: ReactNode
  children?: ReactNode
  classNames?: {
    root?: string
    scrollArea?: string
    /**
     * The collapse button's edge position and corner rounding are owned by
     * the `side` prop and cannot be overridden here: `left-*`/`right-*` are
     * separate tailwind-merge conflict groups, so e.g. `right-4` merges
     * alongside the existing `left-0` instead of replacing it.
     */
    collapseButton?: string
    content?: string
  }
}

export function ShellSidebar({
  width = 346,
  side = "left",
  label,
  defaultCollapsed = false,
  collapsed: collapsedProp,
  onCollapsedChange,
  collapseLabel,
  expandLabel,
  backgroundSlot,
  headerSlot,
  mapSelector,
  mapSelectorSlot,
  children,
  classNames,
}: ShellSidebarProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultCollapsed)
  const collapsed = collapsedProp ?? uncontrolled
  const toggle = () => {
    const next = !collapsed
    setUncontrolled(next)
    onCollapsedChange?.(next)
  }
  const showMapSelector = mapSelector !== undefined && mapSelector.maps.length >= 2
  // Points the way the panel's inner edge will move: outward when expanded (a
  // click closes it), inward when collapsed (a click opens it).
  const chevronPointsRight = side === "right" ? !collapsed : collapsed
  const Chevron = chevronPointsRight ? ChevronRight : ChevronLeft

  return (
    <aside
      aria-label={label}
      className={cn(
        "relative flex h-full shrink-0 flex-col transition-all duration-300",
        classNames?.root,
      )}
      style={{ width: collapsed ? 0 : width, maxWidth: width }}
    >
      {backgroundSlot}
      <ScrollArea className={cn("h-full flex-1", classNames?.scrollArea)}>
        {!collapsed && (
          <div className={cn("flex flex-col px-0 pb-4", classNames?.content)}>
            {headerSlot}
            {mapSelectorSlot ??
              (showMapSelector && (
                <nav className="mb-3 flex flex-wrap gap-1">
                  {mapSelector.maps.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      data-testid={`map-tab-${m.id}`}
                      aria-pressed={m.id === mapSelector.activeMapId}
                      onClick={() => mapSelector.onSelectMap(m.id)}
                      className={cn(
                        "flex items-center gap-1 rounded px-3 py-1 text-sm transition-colors",
                        m.id === mapSelector.activeMapId
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground hover:bg-accent",
                      )}
                    >
                      {m.icon}
                      {m.label}
                    </button>
                  ))}
                </nav>
              ))}
            {children}
          </div>
        )}
      </ScrollArea>
      <button
        type="button"
        data-testid={side === "right" ? "sidebar-toggle-right" : "sidebar-toggle"}
        onClick={toggle}
        aria-label={collapsed ? expandLabel : collapseLabel}
        aria-expanded={!collapsed}
        className={cn(
          // z-700 is the floating-map-control tier: above the map surface and
          // the search overlay (z-600), but BELOW Radix's portalled layers
          // (popover z-2000, sheet z-3000). It used to be z-20000, which put
          // this 32px tab on top of the top-bar popover — opaque, and winning
          // the hit test, so clicking the popover's edge collapsed the sidebar.
          "absolute top-[100px] z-[700] flex h-12 w-8 select-none flex-col items-center justify-center",
          side === "right"
            ? "left-0 -translate-x-full rounded-l-md rounded-r-none"
            : "right-0 translate-x-full rounded-r-md rounded-l-none",
          classNames?.collapseButton,
        )}
      >
        <Chevron className="h-4 w-4" />
        {/* `break-words` matters: hosts pass a content label here, and the tab
            is only 32px wide. Long unbreakable words (e.g. Italian
            "Informazioni") would otherwise spill out of the tab. */}
        <span className="mt-0.5 break-words whitespace-normal px-0.5 text-center text-xs leading-tight">
          {collapsed ? expandLabel : collapseLabel}
        </span>
      </button>
    </aside>
  )
}
