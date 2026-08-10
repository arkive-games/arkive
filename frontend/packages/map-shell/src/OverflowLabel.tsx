import type { ReactNode } from "react"
import { cn } from "@gamemap/ui"

export interface OverflowLabelProps {
  /** The label in full. Also the `title` text when `singleLine` clips it. */
  text: string
  className?: string
  /** Rich content whose plain-text equivalent is `text`. */
  children?: ReactNode
  contentClassName?: string
  /**
   * Keep the label on one line and clip it with an ellipsis.
   *
   * Only for chrome whose height is fixed and cannot grow. Both current users are
   * pickers -- the map selector's trigger and the breeding picker's `h-20` tile -- so
   * the full label is one tap away in the list the value was chosen from. Do not
   * reach for this to keep a grid tidy; that is the case wrapping exists for.
   */
  singleLine?: boolean
}

/**
 * Shows a label in full, wrapping onto as many lines as it needs.
 *
 * This replaced a marquee that revealed clipped text by sliding it sideways. Two
 * things were wrong with that. The slide was a hover affordance, so on touch the
 * clipped remainder was unreachable -- `title` does not open on tap either. And the one
 * call site that panned automatically ran with `iterations: Infinity`, which is
 * automatic motion continuing past five seconds with no mechanism to pause, stop or
 * hide it: a WCAG 2.2.2 (Pause, Stop, Hide) Level A failure. Wrapping needs no
 * pointer, no gesture and no motion, so both problems go away rather than move.
 *
 * The cost is row height, and it is larger than it looks. Measured in the 20rem map
 * sidebar, a long marker label needs THREE lines, taking a filter chip from 38px to
 * 62px -- 63% taller. A two-line clamp was tried and rejected: at that width it still
 * clipped every long label, so it would have kept the original problem while paying
 * most of the cost. Chips in one grid row stay equal height, so the grid steps between
 * rows rather than looking ragged.
 */
export function OverflowLabel({
  text,
  className,
  children,
  contentClassName,
  singleLine,
}: OverflowLabelProps) {
  return (
    <span
      className={cn("block min-w-0", singleLine && "overflow-hidden", className)}
      title={singleLine ? text : undefined}
    >
      <span
        className={cn(
          // `truncate` belongs on the box that DIRECTLY contains the text. Putting it
          // on the outer span instead leaves this inner block overflowing it, and the
          // outer just hard-clips: text-overflow has no inline content of its own to
          // ellipsise. The result was a label cut mid-word with no ellipsis at all --
          // silent truncation, which is worse than either option we chose between.
          //
          // break-words when wrapping, so one long unbroken token cannot push past the
          // container; CJK wraps on its own.
          singleLine ? "block truncate" : "block break-words",
          contentClassName,
        )}
      >
        {children ?? text}
      </span>
    </span>
  )
}
