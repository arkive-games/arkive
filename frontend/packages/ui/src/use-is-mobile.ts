import { useEffect, useState } from "react"

/** Viewport width below this (px) is treated as a phone. Matches Tailwind `md`. */
export const MOBILE_MAX_WIDTH = 767

/**
 * `true` when the viewport is a phone (< 768px). SSR/first-render safe: returns
 * `false` until mounted, then subscribes to a `matchMedia` query. Drives the
 * JS layout switches that CSS `md:` prefixes can't express (e.g. rendering a
 * Sheet instead of a sidebar).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])

  return isMobile
}
