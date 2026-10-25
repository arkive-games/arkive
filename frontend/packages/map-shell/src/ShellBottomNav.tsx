import { Fragment, useEffect, useState, type ReactNode } from "react"
import { useOptionalTheme, type Theme } from "./theme/ThemeProvider"
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconLanguage,
  IconMoonStars,
  IconSettings,
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

import {
  ArkiveSettingsPanel,
  useArkiveSettingsProps,
  type ArkiveSettingsConfig,
} from "./ArkiveSettingsPanel"

export interface ShellBottomTab {
  /** Stable key, e.g. the route path. */
  key: string
  label: ReactNode
  icon: ReactNode
  active?: boolean
  /**
   * Makes this tab a group: its pages are listed under the group's label in
   * the menu drawer. The mobile counterpart of a desktop `ShellNavItem`
   * dropdown. Children are drawn through `renderTab`, like any tab, and the
   * group's own `key` is never navigated to.
   *
   * Only honoured on `tabs`; a grid item with children is rendered as a leaf.
   */
  children?: ShellBottomTab[]
}

export interface ShellBottomNavProps {
  /** The primary sections, listed first in the drawer. */
  tabs: ShellBottomTab[]
  /**
   * Wrap one tab in the app's own Link component. The shell computes the class
   * string and passes it in, which is what keeps this package router-agnostic —
   * it is not allowed to depend on a router at all (see `check:shell`).
   */
  renderTab: (tab: ShellBottomTab, className: string) => ReactNode
  more: {
    /** Accessible name of the menu button. */
    label: ReactNode
    /** The menu button's icon. */
    icon: ReactNode
    /** True when the current page is reachable only through the drawer. */
    active?: boolean
    title: ReactNode
  }
  /** Secondary pages, as a card grid inside the drawer. */
  grid?: {
    items: ShellBottomTab[]
    renderItem: (item: ShellBottomTab, className: string) => ReactNode
  }
  /**
   * Rendered as a drill-down sub-page rather than an inline list: the full set
   * would dominate the drawer at phone width, and stacking a second Radix
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
    /** Default to the surrounding `ThemeProvider`, which every app mounts. */
    current?: string
    onChange?: (value: string) => void
    rowLabel: ReactNode
  }
  /**
   * The full settings panel, as a second drill-down sub-page.
   *
   * A sub-page and not a dialog: a portalled overlay opened from inside a Sheet
   * has its pointer events swallowed by the sheet's own overlay and goes dead
   * rather than merely looking wrong. The language pane above exists for the
   * same reason.
   */
  settings?: {
    /** Defaults to this package's own localized "Settings", as the panel title does. */
    rowLabel?: ReactNode
    backLabel: ReactNode
    config: ArkiveSettingsConfig
  }
  /** Rendered last, e.g. the site-info panel. */
  footer?: ReactNode
  /**
   * Current pathname. The drawer closes whenever it changes — a tap that
   * navigates must not leave the drawer covering its own destination.
   */
  pathname: string
  classNames?: { root?: string; tab?: string; tabActive?: string }
}

/** Which body the drawer is showing. */
type MorePane = "main" | "language" | "settings"

/**
 * One settings row: icon + label on the left, control or value on the right.
 *
 * `flex-wrap` is load-bearing, not decoration. Theme labels are per-app and can
 * be short ("System"/"Light"/"Dark") or long and flavoured ("Auto (Change with
 * Map)"/"Day Mode (Elyos)"). Without wrapping, the long set overflowed the row
 * and overlapped its own label. Short labels still sit inline; long ones drop
 * to their own line.
 */
const ROW =
  "arkive-setting-row flex min-h-12 w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-md px-3 py-2 text-sm outline-none transition-[color,background-color,box-shadow] hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"

/** A small on/off pill shared by the theme segments. */
function pillClass(selected: boolean) {
  return cn(
    "flex min-h-11 min-w-0 items-center justify-center whitespace-normal px-2 py-1 text-center text-xs font-semibold leading-tight transition-colors",
    selected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
  )
}

/**
 * The phone navigation: a round menu button pinned to the top-right corner,
 * opening a drawer that holds every section, secondary pages, language, theme,
 * settings and the site-info panel.
 *
 * The phone website has no bottom tab bar: that pattern is reserved for a
 * future native app, and on the web it hid the bottom of every page and map.
 * Shared so the apps cannot drift into different mobile designs.
 */
export function ShellBottomNav({
  tabs,
  renderTab,
  more,
  grid,
  language,
  theme,
  settings,
  footer,
  pathname,
  classNames,
}: ShellBottomNavProps) {
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<MorePane>("main")
  const isMobile = useIsMobile()
  const themeContext = useOptionalTheme()
  const currentTheme = theme.current ?? themeContext?.theme ?? "auto"
  const setTheme = theme.onChange ?? ((value: string) => themeContext?.setTheme(value as Theme))
  // Unconditional: hooks cannot be skipped, and an empty config is never
  // rendered because the pane only opens when `settings` is present.
  const settingsProps = useArkiveSettingsProps(settings?.config ?? {})
  const settingsLabel = settings?.rowLabel ?? settingsProps.strings.title

  // A tap that navigates must not leave the drawer over the destination.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // The button is `md:hidden`, but the drawer portals to <body> and so is NOT
  // hidden by that class. Without this an open drawer stays draped over the
  // desktop layout after a rotation past 768px (a landscape phone is 844px).
  useEffect(() => {
    if (!isMobile) setOpen(false)
  }, [isMobile])

  // One class for every page cell, so a page looks the same whichever section
  // of the drawer lists it.
  const cellClass = (active?: boolean) =>
    cn(
      "arkive-more-route flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-xs font-semibold transition-colors active:scale-[0.98]",
      active
        ? "bg-primary text-primary-foreground"
        : "bg-foreground/[0.05] text-card-foreground hover:bg-foreground/10",
      classNames?.tab,
      active && classNames?.tabActive,
    )

  const leaves = tabs.filter((tab) => !tab.children || tab.children.length === 0)
  const groups = tabs.filter((tab) => tab.children && tab.children.length > 0)

  const section = (key: string, heading: ReactNode, cells: ReactNode) => (
    <section key={key} data-testid={`tab-group-${key}`} className="mt-4 first:mt-0">
      {heading && <h3 className="mb-2 px-1 text-xs font-bold text-muted-foreground">{heading}</h3>}
      <div className="grid grid-cols-3 gap-1.5">{cells}</div>
    </section>
  )

  return (
    // SheetTrigger rather than a bare button so Radix knows the trigger and
    // returns focus to it when the drawer closes via Escape or the X.
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Always reopen on the main body: a drawer that remembered it was left
        // on the language sub-page would look like the wrong menu.
        if (!next) setPane("main")
      }}
    >
      <SheetTrigger asChild>
        <button
          type="button"
          data-testid="tab-more"
          data-active={more.active}
          aria-label={typeof more.label === "string" ? more.label : undefined}
          title={typeof more.label === "string" ? more.label : undefined}
          className={cn(
            "arkive-menu-button fixed right-3 top-[calc(env(safe-area-inset-top)+0.375rem)] z-[var(--arkive-layer-map-control)] flex size-11 touch-manipulation items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors active:bg-accent md:hidden",
            classNames?.root,
          )}
        >
          {more.icon}
        </button>
      </SheetTrigger>

      <SheetContent
        side="right"
        data-testid="more-sheet"
        className="arkive-more-sheet w-[min(22rem,88vw)] gap-0 overflow-y-auto p-0 pt-[env(safe-area-inset-top)] sm:max-w-none"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        // Radix skips links when choosing what to focus, so by default the
        // language row took focus and showed a ring on every open. Focusing the
        // drawer itself still moves focus into the dialog.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const drawer = event.currentTarget as HTMLElement
          drawer.focus()
        }}
      >
        {/* `pr-12` keeps the header clear of the drawer's absolute close button. */}
        <SheetHeader className="border-b border-border px-4 pb-3 pt-4 pr-12">
          {/* The title tracks the visible body so the sub-page is announced,
              and SheetTitle stays mounted in every pane (Radix requires it). */}
          <SheetTitle>
            {pane === "language"
              ? language.rowLabel
              : pane === "settings"
                ? settingsLabel
                : more.title}
          </SheetTitle>
        </SheetHeader>

        {pane === "main" ? (
          <div className="px-4 pb-4 pt-4">
            <nav data-testid="bottom-tab-bar">
              {leaves.length > 0 && section(
                "primary",
                null,
                leaves.map((tab) => <Fragment key={tab.key}>{renderTab(tab, cellClass(tab.active))}</Fragment>),
              )}
              {groups.map((group) => section(
                group.key,
                group.label,
                (group.children ?? []).map((child) => (
                  <Fragment key={child.key}>{renderTab(child, cellClass(child.active))}</Fragment>
                )),
              ))}
              {grid && grid.items.length > 0 && section(
                "more",
                null,
                grid.items.map((item) => (
                  <Fragment key={item.key}>{grid.renderItem(item, cellClass(item.active))}</Fragment>
                )),
              )}
            </nav>

            <div className="mt-4 space-y-1 border-t border-border pt-3">
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
                {/* Segmented control rather than a cycling toggle: every state
                    is visible, so "auto" is discoverable. */}
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
                      aria-pressed={currentTheme === value}
                      onClick={() => setTheme(value)}
                      className={pillClass(currentTheme === value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {settings && (
                <button
                  type="button"
                  data-testid="more-settings-open"
                  onClick={() => setPane("settings")}
                  className={ROW}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <IconSettings className="size-5 shrink-0 text-muted-foreground" stroke={1.8} />
                    {settingsLabel}
                  </span>
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground" stroke={1.8} />
                </button>
              )}
            </div>

            {footer && <div className="mt-3 border-t border-border pt-3">{footer}</div>}
          </div>
        ) : pane === "settings" && settings ? (
          <div className="px-4 pb-4 pt-4">
            <button
              type="button"
              data-testid="more-settings-back"
              onClick={() => setPane("main")}
              className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground"
            >
              <IconChevronLeft className="size-4" stroke={1.8} />
              {settings.backLabel}
            </button>
            <div className="mt-2">
              <ArkiveSettingsPanel {...settingsProps} />
            </div>
          </div>
        ) : (
          <div className="px-4 pb-4 pt-4">
            <button
              type="button"
              data-testid="more-lang-back"
              onClick={() => setPane("main")}
              className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground"
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
                    "flex min-h-11 items-center justify-between gap-2 border-b border-border px-1 py-2.5 text-left text-sm last:border-b-0",
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
  )
}
