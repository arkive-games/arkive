import { useRef, useState, type CSSProperties, type ReactNode } from "react"
import { cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@gamemap/ui"

export interface ShellMapOption {
  id: string
  label: string
  /** Optional leading glyph — a map thumbnail `<img>`, a marker icon, an svg…
   *  Shown in the trigger for the active map and next to every row in the list.
   *  The wrapper sizes it (`size-7`, clipped and rounded), so callers can pass a
   *  plain `<img src=… alt="" />` without styling it. */
  icon?: ReactNode
  /** Optional secondary line under the label in the list (e.g. a marker count).
   *  Not shown in the trigger, which stays a single line. */
  hint?: string
}

export interface ShellMapSelectProps {
  maps: ShellMapOption[]
  activeMapId: string
  onSelectMap: (id: string) => void
  placeholder?: string
  /** @deprecated No longer rendered. The picker used to sit on a fixed-width
   *  decorative gradient band that neither matched the sidebar width nor the
   *  rest of the design system; the trigger is now a normal full-width control.
   *  Still accepted so existing call sites keep compiling. */
  barStyle?: CSSProperties
  classNames?: {
    wrapper?: string
    /** @deprecated The gradient band it targeted no longer exists. */
    bar?: string
    trigger?: string
    content?: string
    item?: string
  }
}

/** Fixed-size, clipped slot for an option's leading glyph, so a caller-supplied
 *  `<img>` (map thumbnail) and an inline svg both land on the same footprint. */
function MapGlyph({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted [&_img]:size-full [&_img]:object-cover"
    >
      {children}
    </span>
  )
}

export function ShellMapSelect({
  maps,
  activeMapId,
  onSelectMap,
  placeholder,
  classNames,
}: ShellMapSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  // The listbox is item-aligned, so its width is intrinsic: a long-labelled
  // option can make it wider than the trigger, a short one narrower — which
  // looks broken under a full-width trigger. Pin a minimum on open (cheap, and
  // the trigger is guaranteed measured by then). `--radix-select-trigger-width`
  // would do this declaratively but only exists for `position="popper"`.
  const [triggerWidth, setTriggerWidth] = useState<number>()
  const active = maps.find((m) => m.id === activeMapId)

  return (
    <div ref={rootRef} className={cn("w-full", classNames?.wrapper)}>
      <Select
        value={activeMapId}
        onValueChange={onSelectMap}
        onOpenChange={(open) => {
          if (!open) return
          const trigger = rootRef.current?.querySelector<HTMLElement>(
            '[data-slot="select-trigger"]',
          )
          setTriggerWidth(trigger?.offsetWidth)
        }}
      >
        <SelectTrigger
          data-testid="map-select"
          className={cn(
            // min-h-11 keeps the phone touch target at the 44px floor (the
            // picker also lives inside the mobile filter sheet). It has to be a
            // *min* height: the primitive sets `data-[size=default]:h-9`, which
            // tailwind-merge leaves alone (different modifier) and which then
            // wins on specificity over a plain `h-*`.
            "min-h-11 w-full justify-between gap-2 rounded-lg border-border bg-card px-3 text-base font-semibold text-foreground shadow-sm transition-colors",
            // Tint from `primary` rather than `accent`: accent is a saturated
            // highlight in some themes (palworld's is amber) and clashes with
            // the primary-coloured border below.
            "hover:border-primary/60 hover:bg-primary/5 data-[state=open]:border-primary data-[state=open]:bg-primary/10",
            // The chevron is the trigger's own direct-child svg: undim it (the
            // primitive ships it at opacity-50) and flip it while open, so the
            // control reads as something you can act on.
            "[&>svg]:opacity-100 [&>svg]:transition-transform data-[state=open]:[&>svg]:rotate-180",
            classNames?.trigger,
          )}
        >
          {/* Explicit children keep the trigger single-line: without them Radix
              portals the whole selected row in, secondary line included. */}
          <SelectValue placeholder={placeholder}>
            {active ? (
              <>
                {active.icon ? <MapGlyph>{active.icon}</MapGlyph> : null}
                <span className="truncate">{active.label}</span>
              </>
            ) : undefined}
          </SelectValue>
        </SelectTrigger>
        {/* z-[3100]: the map picker is also rendered inside the mobile filter
            bottom-sheet, and both the sheet and this listbox portal to <body>
            as siblings. @gamemap/ui ships Select content at z-50 while a Sheet
            sits at z-3000, and Radix copies the content's computed z-index
            onto the fixed positioning wrapper — so the list opened *behind*
            the sheet. Worse, Radix's dialog overlay carries an inline
            `pointer-events: auto` (to survive the body-level
            `pointer-events: none`), so at z-3000 it also swallowed every tap
            aimed at an option: the picker looked completely dead on phones.
            Lift the listbox above sheet level; a popup must always be the
            topmost layer. Matches aion2's alert-dialog override (3050/3100).
            Desktop is unaffected — nothing there sits between z-50 and
            z-3100. Still overridable via `classNames.content`, since
            tailwind-merge lets a later z-* win. */}
        <SelectContent
          className={cn("z-[3100] rounded-lg p-1 shadow-lg", classNames?.content)}
          style={triggerWidth ? { minWidth: triggerWidth } : undefined}
        >
          {maps.map((m) => (
            <SelectItem
              key={m.id}
              value={m.id}
              data-testid={`map-option-${m.id}`}
              className={cn(
                "min-h-10 gap-2.5 rounded-md py-1.5 pr-9 pl-2",
                // The active row stays legible under the amber focus highlight
                // it inherits from the primitive: tinted, primary, semibold —
                // plus the primitive's check on the right.
                "data-[state=checked]:bg-primary/10 data-[state=checked]:font-semibold data-[state=checked]:text-primary",
                // …and its check too: the primitive forces every unclassed svg
                // to muted-foreground with a `:not([class*='text-'])` rule, so
                // this needs `!` to win rather than tie on specificity.
                "data-[state=checked]:[&_svg]:text-primary!",
                classNames?.item,
              )}
            >
              {m.icon ? <MapGlyph>{m.icon}</MapGlyph> : null}
              {/* Column inside the item's text slot (a flex row from the
                  primitive), so label and hint stack without disturbing it. */}
              <span className="flex min-w-0 flex-col text-left">
                <span className="truncate text-sm leading-tight">{m.label}</span>
                {m.hint ? (
                  <span className="truncate text-xs leading-tight font-normal text-muted-foreground">
                    {m.hint}
                  </span>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
