import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ArrowUp } from "lucide-react"
import { cn, FilterDisclosure, useIsMobile } from "@gamemap/ui"

export interface ArkiveContentPageProps {
  /** Desktop navigation (the app's `ArkiveMapTopBar`); hides itself on phones. */
  topBar?: ReactNode
  /** Phone header (`ArkiveMobileHeader`); hides itself from `md` up. */
  mobileHeader?: ReactNode
  /** The app's `SiteFooter`, which owns its links and bottom padding. */
  footer: ReactNode
  /** Rendered after the scroller, e.g. a phone bottom tab bar the page owns. */
  bottomNav?: ReactNode
  /** The desktop `<h1>` when `heading` is set. */
  title?: ReactNode
  heading?: boolean
  /** `wide` for dense grids; `standard` everywhere else. */
  width?: "standard" | "wide"
  /**
   * Catalogue controls, kept outside the results scroller so they stay put
   * while the results move. Phones can fold them away behind the shared
   * `FilterDisclosure`; desktop shows no toggle.
   */
  toolbar?: ReactNode
  /**
   * Toolbar content that must stay visible when the phone filters are folded
   * away: section tabs, the page description, the search box.
   */
  toolbarLead?: ReactNode
  /** Visible text of the phone filter toggle. Required with `toolbar`. */
  filterLabel?: ReactNode
  /** `true` while the toolbar holds a non-default selection; dots the toggle. */
  filtersActive?: boolean
  /**
   * Scroll the results back to the top whenever this changes: a new filter
   * scope or a new page, never an edit inside a card.
   */
  resultsKey?: unknown
  /** Accessible name of the phone back-to-top button; omit for no button. */
  backToTopLabel?: string
  /** Keep the footer on desktop only (pages with their own phone pagination). */
  hideMobileFooter?: boolean
  className?: string
  contentClassName?: string
  children: ReactNode
}

const WIDTH = {
  standard: "max-w-[var(--arkive-content-standard)]",
  wide: "max-w-[var(--arkive-content-wide-data)]",
} as const

/**
 * The page shell every Arkive game uses outside its map: the top bar, the
 * phone header, an optional fixed catalogue toolbar, then one scrolling column
 * of a named content width ending in the site footer.
 *
 * The column scrolls rather than the window, so it is marked
 * `data-content-scroll` for anything that has to find or reset it, and it is
 * `relative` so absolutely positioned descendants (screen-reader-only labels)
 * are contained by it instead of giving the window a second scrollbar.
 *
 * Every string, link and route comes in through a slot, which keeps this
 * package free of i18n, routing and build-time environment.
 */
export function ArkiveContentPage({
  topBar,
  mobileHeader,
  footer,
  bottomNav,
  title,
  heading = false,
  width = "standard",
  toolbar,
  toolbarLead,
  filterLabel,
  filtersActive = false,
  resultsKey,
  backToTopLabel,
  hideMobileFooter = false,
  className,
  contentClassName,
  children,
}: ArkiveContentPageProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const [showBackToTop, setShowBackToTop] = useState(false)
  const contentWidth = WIDTH[width]
  const hasToolbar = toolbar != null || toolbarLead != null
  const headingNode = heading ? <h1 className="mb-4 hidden text-3xl font-bold md:block">{title}</h1> : null

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [resultsKey])

  const backToTop = backToTopLabel != null && isMobile
  useEffect(() => {
    const scroller = scrollRef.current
    if (!backToTop || !scroller) {
      setShowBackToTop(false)
      return
    }
    const onScroll = () => setShowBackToTop(scroller.scrollTop > 500)
    onScroll()
    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => scroller.removeEventListener("scroll", onScroll)
  }, [backToTop])

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    scrollRef.current?.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" })
  }

  return (
    <div className={cn("flex h-dvh flex-col bg-background text-foreground", className)}>
      {topBar}
      {mobileHeader}
      <div className="flex min-h-0 flex-1 flex-col">
        {hasToolbar ? (
          <div
            data-content-toolbar
            className="max-h-[50%] shrink-0 overflow-y-auto overscroll-contain border-b border-border bg-background"
          >
            <div className={cn("arkive-content-page mx-auto w-full pb-3", contentWidth)}>
              {headingNode}
              {toolbarLead}
              {toolbar != null ? (
                <FilterDisclosure label={filterLabel} active={filtersActive} testId="content-toolbar-filters">
                  {toolbar}
                </FilterDisclosure>
              ) : null}
            </div>
          </div>
        ) : null}
        <div ref={scrollRef} data-content-scroll className="relative min-h-0 flex-1 overflow-y-auto">
          <div className="flex min-h-full flex-col">
            <main
              className={cn(
                "arkive-content-page mx-auto w-full flex-1 pb-6",
                hideMobileFooter && "pb-[calc(env(safe-area-inset-bottom)+7rem)] md:pb-6",
                contentWidth,
                contentClassName,
              )}
            >
              {hasToolbar ? null : headingNode}
              {children}
            </main>
            {hideMobileFooter ? <div className="hidden md:block">{footer}</div> : footer}
          </div>
        </div>
      </div>
      {showBackToTop ? (
        <button
          type="button"
          data-testid="content-back-to-top"
          aria-label={backToTopLabel}
          title={backToTopLabel}
          onClick={scrollToTop}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-4 z-[var(--arkive-layer-map-control)] flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
        >
          <ArrowUp className="size-5" />
        </button>
      ) : null}
      {bottomNav}
    </div>
  )
}
