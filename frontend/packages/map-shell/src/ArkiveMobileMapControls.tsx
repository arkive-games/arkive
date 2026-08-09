import type { ReactNode } from "react"
import { IconAdjustmentsHorizontal, IconSearch } from "@tabler/icons-react"
import {
  cn,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@gamemap/ui"

interface MobileMapSheet {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  content: ReactNode
}

export interface ArkiveMobileMapControlsProps {
  search: MobileMapSheet
  filter: MobileMapSheet & {
    active?: boolean
    header?: ReactNode
  }
  className?: string
}

const ACTION =
  "relative flex size-12 touch-manipulation items-center justify-center rounded-xl border bg-card text-foreground shadow-[0_0.4rem_1.2rem_rgba(8,33,51,0.16)] transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

/**
 * Shared phone controls for full-bleed maps. The engine-owned zoom pill is
 * positioned above this group by arkive-map-theme.css, producing one ordered
 * right-edge stack without coupling either map engine to application chrome.
 */
export function ArkiveMobileMapControls({
  search,
  filter,
  className,
}: ArkiveMobileMapControlsProps) {
  return (
    <div
      data-testid="mobile-map-controls"
      className={cn("arkive-mobile-map-actions absolute right-3 z-[700] flex flex-col gap-2", className)}
    >
      <Sheet open={search.open} onOpenChange={search.onOpenChange}>
        <SheetTrigger asChild>
          <button
            type="button"
            data-testid="map-fab-search"
            aria-label={search.label}
            aria-expanded={search.open}
            className={cn(ACTION, "border-primary bg-primary text-primary-foreground")}
          >
            <IconSearch className="size-5" stroke={1.8} />
          </button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          data-testid="search-sheet"
          className="arkive-mobile-map-sheet inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+4rem)] max-h-[min(72dvh,calc(100dvh-5rem))]"
        >
          <SheetTitle className="sr-only">{search.label}</SheetTitle>
          {search.content}
        </SheetContent>
      </Sheet>

      <Sheet open={filter.open} onOpenChange={filter.onOpenChange}>
        <SheetTrigger asChild>
          <button
            type="button"
            data-testid="map-fab-filter"
            data-active={filter.active === true}
            aria-label={filter.label}
            aria-expanded={filter.open}
            aria-pressed={filter.active === true}
            className={cn(
              ACTION,
              "border-primary text-primary",
              filter.active && "bg-[color:var(--arkive-filter-active)]",
            )}
          >
            <IconAdjustmentsHorizontal className="size-5" stroke={1.8} />
            {filter.active ? (
              <span
                data-testid="map-filter-active-indicator"
                className="absolute right-1.5 top-1.5 size-2 rounded-full border border-card bg-[color:var(--arkive-nav-accent)]"
              />
            ) : null}
          </button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          data-testid="filter-sheet"
          className="arkive-mobile-map-sheet inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+4rem)] max-h-[min(85dvh,calc(100dvh-5rem))]"
        >
          <SheetHeader className="shrink-0 pr-10">
            <SheetTitle>{filter.label}</SheetTitle>
            {filter.header}
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {filter.content}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
