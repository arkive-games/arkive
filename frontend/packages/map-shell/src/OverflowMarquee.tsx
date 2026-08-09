import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { cn } from "@gamemap/ui"

export interface OverflowMarqueeProps {
  text: string
  className?: string
  /** Automatically pans overflowing text; reduced-motion users can swipe it. */
  auto?: boolean
  /** Optional rich content whose plain-text equivalent is provided by `text`. */
  children?: ReactNode
  contentClassName?: string
}

type MarqueeStyle = CSSProperties & {
  "--gm-overflow-shift": string
  transitionDuration: string
}

/**
 * Keeps compact controls single-line, then reveals clipped copy by sliding it
 * only when the text is actually wider than its viewport. The animation is a
 * hover affordance by default; `auto` moves from the beginning to the end,
 * then resets before the next pass. Both modes respect reduced-motion.
 */
export function OverflowMarquee({
  text,
  className,
  auto = false,
  children,
  contentClassName,
}: OverflowMarqueeProps) {
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

  useEffect(() => {
    const content = contentRef.current
    if (!auto || !content || overflow <= 0) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reducedMotion.matches) return

    const travelDuration = Math.max(1600, overflow * 35)
    const animation = content.animate(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: 0.22 },
        { transform: `translateX(${-overflow}px)`, offset: 0.82 },
        { transform: `translateX(${-overflow}px)`, offset: 1 },
      ],
      {
        duration: travelDuration + 3200,
        easing: "linear",
        iterations: Infinity,
      },
    )

    return () => animation.cancel()
  }, [auto, overflow, text])

  const style: MarqueeStyle = {
    "--gm-overflow-shift": `${-overflow}px`,
    transitionDuration: `${Math.max(1200, overflow * 35)}ms`,
  }

  return (
    <span
      ref={viewportRef}
      className={cn(
        "group/overflow-marquee block min-w-0 overflow-hidden whitespace-nowrap",
        auto && "motion-reduce:overflow-x-auto",
        className,
      )}
      title={overflow > 0 ? text : undefined}
      data-overflow={overflow > 0 ? "true" : "false"}
    >
      <span
        ref={contentRef}
        style={style}
        className={cn(
          contentClassName
            ? "min-w-full transform-gpu"
            : "inline-block min-w-full transform-gpu text-left",
          contentClassName,
          overflow > 0 && !auto &&
            "motion-safe:transition-transform motion-safe:ease-linear group-hover/overflow-marquee:motion-safe:translate-x-[var(--gm-overflow-shift)]",
        )}
      >
        {children ?? text}
      </span>
    </span>
  )
}
