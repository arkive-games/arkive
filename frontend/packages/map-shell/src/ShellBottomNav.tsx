import { Fragment, useEffect, useState, type ReactNode } from "react"
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconLanguage,
  IconMoonStars,
} from "@tabler/icons-react"
import {
  cn,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  useIsMobile,
} from "@gamemap/ui"

export interface ShellBottomTab {
  /** Stable key, e.g. the route path. */
  key: string
  label: ReactNode
  icon: ReactNode
  active?: boolean
}

export interface ShellBottomNavProps {
  /**
   * The fixed strip. Five slots is the most a phone fits without shrinking
   * labels below `text-xs`, and More occupies one — so four tabs.
   */
  tabs: ShellBottomTab[]
  /**
   * Wrap one tab in the app's own Link component. The shell computes the class
   * string and passes it in, which is what keeps this package router-agnostic —
   * it is not allowed to depend on a router at all (see `check:shell`).
   */
  renderTab: (tab: ShellBottomTab, className: string) => ReactNode
  more: {
    label: ReactNode
    icon: ReactNode
    /** True when the current page is reachable only through this sheet. */
    active?: boolean
    title: ReactNode
    /** Header slot beside the title, e.g. a link out to the brand hub. */
    brand?: ReactNode
  }
  /** Secondary pages, as a card grid inside the sheet. */
  grid?: {
    items: ShellBottomTab[]
    renderItem: (item: ShellBottomTab, className: string) => ReactNode
  }
  /**
   * Rendered as a drill-down sub-page rather than an inline list: the full set
   * would dominate the sheet at phone width, and stacking a second Radix
   * overlay inside a Sheet is a known z-index/focus trap in this UI kit.
   */
  language: {
    languages: { code: string; label: string }[]
    current: string
    onChange: (code: string) => void
    rowLabel: ReactNode
    backLabel: ReactNode
  }
  theme: {
    options: { value: string; label: string }[]
    current: string
    onChange: (value: string) => void
    rowLabel: ReactNode
  }
  /** Renderer switcher. Omit for an app with only one engine. */
  engine?: {
    choices: { value: string; label: string }[]
    current: string
    onChange: (value: string) => void
    rowLabel: ReactNode
  }
  /** App-specific rows, below the settings block. */
  extra?: ReactNode
  /** Rendered last, e.g. the site-info panel. */
  footer?: ReactNode
  /**
   * Current pathname. The sheet closes whenever it changes — a tap that
   * navigates must not leave the sheet covering its own destination.
   */
  pathname: string
  classNames?: { root?: string; tab?: string; tabActive?: string }
}

/** Which body the sheet is showing. */
type MorePane = "main" | "language"

/**
 * One settings row: icon + label on the left, control or value on the right.
 *
 * `flex-wrap` is load-bearing, not decoration. Theme labels are per-app and can
 * be short ("System"/"Light"/"Dark") or long and flavoured ("Auto (Change with
 * Map)"/"Day Mode (Elyos)"). Without wrapping, the long set overflowed the row,
 * overlapped its own label and pushed the whole page into horizontal scroll at
 * phone width. Short labels still sit inline; long ones drop to their own line.
 */
const ROW =
  "flex min-h-11 w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg border border-border px-3 py-2 text-sm"

/** A small on/off pill, shared by the theme segments and the engine choices. */
function pillClass(selected: boolean) {
  return cn(
    "min-w-0 truncate px-2 py-1 text-xs font-medium transition-colors",
    selected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
  )
}

/**
 * The phone navigation: a fixed tab strip plus the "More" sheet holding
 * everything that does not fit — secondary pages, language, theme, the renderer
 * switcher and the site-info panel.
 *
 * Shared so the apps cannot drift into two different mobile designs, which is
 * exactly what had happened: one had a drill-down language picker and a
 * segmented theme control, the other loose pills under headings.
 */
export function ShellBottomNav({
  tabs,
  renderTab,
  more,
  grid,
  language,
  theme,
  engine,
  extra,
  footer,
  pathname,
  classNames,
}: ShellBottomNavProps) {
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<MorePane>("main")
  const isMobile = useIsMobile()

  // A tap that navigates must not leave the sheet over the destination.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // The strip is `md:hidden`, but the sheet portals to <body> and so is NOT
  // hidden by that class. Without this an open sheet stays draped over the
  // desktop layout after a rotation past 768px (a landscape phone is 844px).
  useEffect(() => {
    if (!isMobile) setOpen(false)
  }, [isMobile])

  const tabClass = (active?: boolean) =>
    cn(
      "relative flex min-h-14 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-xs font-medium transition-colors active:bg-accent/70",
      active
        ? "text-primary after:absolute after:left-1/2 after:top-0 after:h-0.5 after:w-6 after:-translate-x-1/2 after:rounded-full after:bg-primary"
        : "text-muted-foreground",
      classNames?.tab,
      active && classNames?.tabActive,
    )

  return (
    <>
      <nav
        data-testid="bottom-tab-bar"
        className={cn(
          "fixed inset-x-0 bottom-0 z-[2500] flex min-h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t border-border bg-card/97 text-card-foreground shadow-[0_-0.5rem_1.5rem_rgba(8,33,51,0.08)] backdrop-blur md:hidden",
          classNames?.root,
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tabs.map((tab) => (
          <span key={tab.key} className="flex flex-1">
            {renderTab(tab, tabClass(tab.active))}
          </span>
        ))}
        {/* SheetTrigger rather than a bare button so Radix knows the trigger and
            returns focus to it when the sheet closes via Escape or the X. */}
        <Sheet
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            // Always reopen on the main body: a sheet that remembered it was
            // left on the language sub-page would look like the wrong menu.
            if (!next) setPane("main")
          }}
        >
          <SheetTrigger asChild>
            <button
              type="button"
              data-testid="tab-more"
              data-active={more.active}
              aria-current={more.active ? "page" : undefined}
              aria-label={typeof more.label === "string" ? more.label : undefined}
              className={tabClass(more.active)}
            >
              {more.icon}
              <span className="px-0.5">{more.label}</span>
            </button>
          </SheetTrigger>

          <SheetContent
            side="bottom"
            data-testid="more-sheet"
            className="max-h-[90dvh] overflow-y-auto rounded-t-xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            {/* `pr-8` keeps the header clear of the sheet's absolute close button. */}
            <SheetHeader className="pr-8">
              <div className="flex items-center justify-between gap-2">
                {/* The title tracks the visible body so the sub-page is
                    announced, and SheetTitle stays mounted in both panes
                    (Radix requires it). */}
                <SheetTitle>{pane === "language" ? language.rowLabel : more.title}</SheetTitle>
                {more.brand}
              </div>
            </SheetHeader>

            {pane === "main" ? (
              <>
                {grid && grid.items.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {grid.items.map((item) => (
                      <Fragment key={item.key}>
                        {grid.renderItem(
                          item,
                          cn(
                            "flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg border border-border px-1 py-2 text-xs font-medium active:scale-[0.98]",
                            item.active
                              ? "bg-primary text-primary-foreground"
                              : "bg-card text-card-foreground",
                          ),
                        )}
                      </Fragment>
                    ))}
                  </div>
                )}

                <div className={cn("space-y-2 border-border", grid && "mt-3 border-t pt-3")}>
                  {/* One row showing the current language, not every option. */}
                  <button
                    type="button"
                    data-testid="more-lang-open"
                    onClick={() => setPane("language")}
                    className={ROW}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <IconLanguage className="size-5 shrink-0 text-muted-foreground" stroke={1.8} />
                      {language.rowLabel}
                    </span>
                    <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                      <span className="truncate">
                        {language.languages.find((l) => l.code === language.current)?.label ??
                          language.current}
                      </span>
                      <IconChevronRight className="size-4 shrink-0" stroke={1.8} />
                    </span>
                  </button>

                  <div className={ROW}>
                    <span className="flex min-w-0 items-center gap-2">
                      <IconMoonStars className="size-5 shrink-0 text-muted-foreground" stroke={1.8} />
                      {theme.rowLabel}
                    </span>
                    {/* Segmented control rather than a cycling toggle: every
                        state is visible, so "auto" is discoverable. */}
                    <div
                      role="group"
                      aria-label={typeof theme.rowLabel === "string" ? theme.rowLabel : undefined}
                      className="flex max-w-full overflow-hidden rounded-md border border-border"
                    >
                      {theme.options.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          data-testid={`more-theme-${value}`}
                          aria-pressed={theme.current === value}
                          onClick={() => theme.onChange(value)}
                          className={pillClass(theme.current === value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {engine && (
                  // Tapping a choice deliberately leaves the sheet OPEN (unlike
                  // the grid links) so the active state visibly moves.
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">{engine.rowLabel}</span>
                    <div className="flex gap-1">
                      {engine.choices.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          data-testid={`more-engine-${value}`}
                          aria-pressed={engine.current === value}
                          onClick={() => engine.onChange(value)}
                          className={cn("rounded", pillClass(engine.current === value))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {extra && <div className="mt-3 border-t border-border pt-3">{extra}</div>}
                {footer && <div className="mt-3 border-t border-border pt-3">{footer}</div>}
              </>
            ) : (
              <div>
                <button
                  type="button"
                  data-testid="more-lang-back"
                  onClick={() => setPane("main")}
                  className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-1 text-sm font-medium text-muted-foreground"
                >
                  <IconChevronLeft className="size-4" stroke={1.8} />
                  {language.backLabel}
                </button>
                <div className="mt-1 flex flex-col">
                  {language.languages.map(({ code, label }) => (
                    <button
                      key={code}
                      type="button"
                      data-testid={`more-lang-${code}`}
                      aria-pressed={language.current === code}
                      onClick={() => {
                        language.onChange(code)
                        // Straight back: the picked language is the answer, so
                        // there is nothing left to do on this page.
                        setPane("main")
                      }}
                      className={cn(
                        "flex items-center justify-between gap-2 border-b border-border px-1 py-2.5 text-left text-sm last:border-b-0",
                        language.current === code
                          ? "font-semibold text-primary"
                          : "text-card-foreground",
                      )}
                    >
                      <span className="truncate">{label}</span>
                      {language.current === code && <IconCheck className="size-4 shrink-0" stroke={1.8} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </nav>
    </>
  )
}
