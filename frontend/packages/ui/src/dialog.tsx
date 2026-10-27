"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "./utils"
import { Button } from "./button"
import {
  MODAL_OVERLAY_CLASS,
  MODAL_SURFACE_CLASS,
  POPUP_CLOSE_CONTROL_CLASS,
} from "./popup-styles"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-[var(--arkive-layer-sheet-backdrop)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        MODAL_OVERLAY_CLASS,
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  overlayClassName,
  children,
  size = "default",
  showCloseButton = true,
  showTideLine = false,
  closeButtonProps,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** Extra attributes for the built-in close button, e.g. a localized `aria-label`. */
  closeButtonProps?: React.ComponentProps<typeof DialogPrimitive.Close> & {
    "data-testid"?: string
  }
  /**
   * Width above `sm`. The size classes are variant-scoped, so a plain `max-w-*`
   * in `className` cannot override them — pick a size instead. `lg` is for
   * content laid out in columns, such as an icon-grid picker.
   */
  size?: "default" | "sm" | "lg"
  showCloseButton?: boolean
  showTideLine?: boolean
  overlayClassName?: string
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-size={size}
        className={cn(
          "fixed top-[50%] left-[50%] z-[var(--arkive-layer-sheet)] grid w-full max-w-[calc(100%-2rem)] grid-cols-1 translate-x-[-50%] translate-y-[-50%] gap-4 p-6 duration-[var(--arkive-motion-standard)] data-[size=default]:sm:max-w-lg data-[size=sm]:sm:max-w-md data-[size=lg]:sm:max-w-4xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          MODAL_SURFACE_CLASS,
          "arkive-dialog-surface rounded-[var(--arkive-radius-dialog)] border-0",
          className
        )}
        {...props}
      >
        {showTideLine && <DialogTideLine />}
        {children}
        {showCloseButton && (
          // Centred on the first line of a default title.
          <DialogRoundClose
            {...closeButtonProps}
            className={cn(
              "absolute top-4 right-4.5 z-[var(--arkive-layer-local-control)] md:top-5 md:right-5.5",
              closeButtonProps?.className,
            )}
          />
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

/**
 * The dialogs' close control: a small round face inside a full touch target.
 * For a dialog that lays out its own header instead of the built-in corner button.
 */
function DialogRoundClose({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close> & { "data-testid"?: string }) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      {...props}
      className={cn(
        "group shrink-0 hover:bg-transparent [&_svg]:pointer-events-none [&_svg]:shrink-0",
        POPUP_CLOSE_CONTROL_CLASS,
        className,
      )}
    >
      <span className="grid size-8 place-items-center rounded-full bg-foreground/[0.06] transition-colors group-hover:bg-foreground/10">
        <XIcon className="size-4" />
      </span>
      {!props["aria-label"] && <span className="sr-only">Close</span>}
    </DialogPrimitive.Close>
  )
}

function DialogTideLine() {
  return (
    <div
      data-slot="dialog-tide-line"
      className="pointer-events-none absolute inset-x-0 top-0 z-[var(--arkive-layer-local-control)] h-2 overflow-hidden text-primary"
      aria-hidden="true"
    >
      <svg viewBox="0 0 520 14" preserveAspectRatio="none" className="h-full w-full">
        <path
          d="M0 8C58 1 95 13 151 7s95-4 151 0 100 5 218-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx="430"
          cy="6"
          r="4"
          className="fill-[color:var(--arkive-nav-accent,var(--ring))] stroke-background"
          strokeWidth="2"
        />
      </svg>
    </div>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      // The right padding keeps a long title clear of the round close button.
      className={cn("pr-10 text-xl leading-snug font-bold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogRoundClose,
  DialogTitle,
  DialogTrigger,
}
