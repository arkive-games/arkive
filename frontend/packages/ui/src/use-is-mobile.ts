import { useEffect, useState } from "react"

/** Viewport width below this (px) is treated as a phone. Matches Tailwind `md`. */
export const MOBILE_MAX_WIDTH = 767

const query = `(max-width: ${MOBILE_MAX_WIDTH}px)`

/**
 * `true` when the viewport is a phone (< 768px). Initialized synchronously from
 * `matchMedia` on the first render (this is a client-only app, so `window` is
 * always present) — that avoids a desktop→mobile remount flash and keeps the
 * initial layout correct. Falls back to `false` if `matchMedia` is unavailable
 * (SSR/tests). Drives the JS layout switches that CSS `md:` prefixes can't
 * express (e.g. rendering a Sheet instead of a sidebar).
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])

  return isMobile
}
