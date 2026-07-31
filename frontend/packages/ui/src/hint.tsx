"use client"

import * as React from "react"
import { InfoIcon } from "lucide-react"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"
import { useIsMobile } from "./use-is-mobile"
import { cn } from "./utils"

/**
 * How the hint is opened on a phone.
 *
 * - `child` — the child element itself becomes the tap target. Use when the
 *   child is inert (a badge, a value, a `cursor-help` span): there is no
 *   behaviour to steal.
 * - `icon` — the child is rendered untouched and a small ⓘ button is placed
 *   next to it. Use when the child already does something on tap (a filter
 *   chip, a text input, a link): hijacking that tap would either break the
 *   control or fire two actions at once.
 */
export type HintMobileTrigger = "child" | "icon"

export interface HintProps {
  /** The explanatory body. Identical on both breakpoints. */
  content: React.ReactNode
  /** The trigger. Must be a single element for `mobileTrigger="child"`. */
  children: React.ReactNode
  /**
   * Sheet heading, shown above `content` on mobile. Usually the subject being
   * explained (the badge's own label). This package is i18n-free, so pass a
   * translated node — never rely on a default.
   */
  title?: React.ReactNode
  /**
   * Accessible name for the sheet when there is no visible {@link title}:
   * rendered as an `sr-only` heading so Radix always finds a title. Also
   * injected — the package invents no copy.
   */
  srTitle?: string
  /**
   * Accessible name for the ⓘ button in `mobileTrigger="icon"` mode. Defaults
   * to `title`/`srTitle` when either is a plain string.
   */
  iconLabel?: string
  /** @default "child" */
  mobileTrigger?: HintMobileTrigger
  /** Extra classes for the desktop tooltip (e.g. `max-w-xs`). */
  contentClassName?: string
  /** Extra classes for the mobile sheet body. */
  bodyClassName?: string
  /** Extra classes for the mobile sheet panel. */
  sheetClassName?: string
  /** Extra classes for the ⓘ button (icon mode). */
  iconClassName?: string
  /** Tooltip placement passthrough — desktop only. */
  side?: React.ComponentProps<typeof TooltipContent>["side"]
  align?: React.ComponentProps<typeof TooltipContent>["align"]
  sideOffset?: number
  /** @default "hint-sheet" */
  sheetTestId?: string
  /** `data-testid` for the ⓘ button (icon mode). */
  iconTestId?: string
}

/** Props this component merges onto a cloned child trigger. */
type TriggerProps = {
  role?: string
  tabIndex?: number
  onClick?: React.MouseEventHandler<HTMLElement>
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>
}

/**
 * One explanatory hint, reachable on both input models.
 *
 * Desktop (>= 768px) renders the plain Radix hover tooltip — byte-for-byte the
 * behaviour a bare `Tooltip`/`TooltipTrigger asChild`/`TooltipContent` trio
 * gives. A touch screen has no hover at all, so below that width the trigger
 * becomes tappable and the same `content` opens in a bottom sheet, matching the
 * app's other bottom-sheet surfaces (the "More" menu, the mobile filter sheet).
 *
 * Requires a `TooltipProvider` ancestor, exactly like the primitives it wraps.
 *
 * The sheet panel sits at `z-[3050]`, one rung above the `z-[3000]` Sheet, so a
 * hint opened from *inside* another sheet (filter chips move into one on phones)
 * paints above it. Its own overlay stays at 3000 but is portalled later, so it
 * still covers the sheet underneath — and because both layers are modal Radix
 * dialogs, the topmost one keeps `pointer-events: auto` and taps land on it.
 */
export function Hint({
  content,
  children,
  title,
  srTitle,
  iconLabel,
  mobileTrigger = "child",
  contentClassName,
  bodyClassName,
  sheetClassName,
  iconClassName,
  side,
  align,
  sideOffset,
  sheetTestId = "hint-sheet",
  iconTestId,
}: HintProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)

  if (!isMobile) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          className={contentClassName}
          side={side}
          align={align}
          {...(sideOffset === undefined ? {} : { sideOffset })}
        >
          {content}
        </TooltipContent>
      </Tooltip>
    )
  }

  const openSheet = () => setOpen(true)

  // Radix requires a Title in every Dialog; when the caller has no visible
  // heading to show, keep it for screen readers only.
  const heading = title ?? srTitle ?? ""
  const headingHidden = title === undefined || title === null
  const label =
    iconLabel ?? (typeof title === "string" ? title : undefined) ?? srTitle

  let trigger: React.ReactNode
  if (mobileTrigger === "icon") {
    trigger = (
      <span className="inline-flex items-center gap-1">
        {children}
        <button
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid={iconTestId}
          onClick={openSheet}
          className={cn(
            // `size-6` matches the height of the chips/inputs this sits beside,
            // which keeps the row aligned while still giving a real tap target.
            "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground",
            iconClassName,
          )}
        >
          <InfoIcon className="size-4" aria-hidden />
        </button>
      </span>
    )
  } else if (React.isValidElement(children)) {
    // Clone rather than wrap so the trigger's own layout/`data-testid` survive
    // untouched — the same contract `TooltipTrigger asChild` has on desktop.
    const child = children as React.ReactElement<TriggerProps>
    trigger = React.cloneElement(child, {
      role: child.props.role ?? "button",
      tabIndex: child.props.tabIndex ?? 0,
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        child.props.onClick?.(event)
        openSheet()
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
        child.props.onKeyDown?.(event)
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          openSheet()
        }
      },
    } as TriggerProps)
  } else {
    // A fragment or bare text can't be cloned; give it a focusable wrapper.
    trigger = (
      <span
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openSheet}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            openSheet()
          }
        }}
        className="inline-flex"
      >
        {children}
      </span>
    )
  }

  return (
    <>
      {trigger}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          data-testid={sheetTestId}
          className={cn("z-[3050] max-h-[85dvh] overflow-y-auto", sheetClassName)}
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
        >
          {/* `pr-8` keeps the heading clear of the sheet's absolute close button. */}
          <SheetHeader className="pr-8">
            <SheetTitle className={headingHidden ? "sr-only" : undefined}>{heading}</SheetTitle>
          </SheetHeader>
          <div className={cn("text-sm whitespace-pre-line", bodyClassName)}>{content}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}
