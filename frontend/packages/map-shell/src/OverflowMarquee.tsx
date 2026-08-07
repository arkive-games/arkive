import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { cn } from "@gamemap/ui"

export interface OverflowMarqueeProps {
  text: string
  className?: string
}

type MarqueeStyle = CSSProperties & {
  "--gm-overflow-shift": string
  transitionDuration: string
}

/**
 * Keeps compact controls single-line, then reveals clipped copy by sliding it
 * only when the text is actually wider than its viewport. The animation is a
 * hover affordance rather than perpetual motion and respects reduced-motion.
 */
export function OverflowMarquee({ text, className }: OverflowMarqueeProps) {
  const viewportRef = useRef<HTMLSpanElement>(null)
  const contentRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(0)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return

    const measure = () => {
      setOverflow(Math.max(0, Math.ceil(content.scrollWidth - viewport.clientWidth)))
    }
    measure()

    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(content)
    return () => observer.disconnect()
  }, [text])

  const style: MarqueeStyle = {
    "--gm-overflow-shift": `${-overflow}px`,
    transitionDuration: `${Math.max(1200, overflow * 35)}ms`,
  }

  return (
    <span
      ref={viewportRef}
      className={cn(
        "group/overflow-marquee block min-w-0 overflow-hidden whitespace-nowrap",
        className,
      )}
      title={overflow > 0 ? text : undefined}
      data-overflow={overflow > 0 ? "true" : "false"}
    >
      <span
        ref={contentRef}
        style={style}
        className={cn(
          "inline-block min-w-full transform-gpu text-left",
          overflow > 0 &&
            "motion-safe:transition-transform motion-safe:ease-linear group-hover/overflow-marquee:motion-safe:translate-x-[var(--gm-overflow-shift)]",
        )}
      >
        {text}
      </span>
    </span>
  )
}
