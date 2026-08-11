/** Shared visual rules for interactive surfaces rendered above page content. */
export const FLOATING_SURFACE_CLASS =
  "rounded-lg border border-border bg-popover text-popover-foreground shadow-lg outline-none"

export const MODAL_SURFACE_CLASS =
  "rounded-lg border border-border bg-background text-foreground shadow-lg outline-none"

export const MODAL_OVERLAY_CLASS = "bg-black/50"

export const MENU_CONTENT_CLASS =
  "overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none"

export const MENU_ITEM_CLASS =
  "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium leading-none outline-hidden select-none transition-[color,background-color,box-shadow] hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-disabled:pointer-events-none aria-disabled:opacity-50"

export const POPUP_CLOSE_CONTROL_CLASS =
  "flex size-11 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none md:size-9"
