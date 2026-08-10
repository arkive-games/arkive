/**
 * Bring a result region back into view after a page change.
 *
 * The mobile spec requires a page change to return the scroller to the result
 * heading; meta's two paginated views (the forum feed and the games catalog)
 * previously did not scroll at all, so page 4 opened already scrolled past its own
 * first rows. Unlike the game apps, meta scrolls the document rather than a
 * `[data-content-scroll]` element, so this works on `window`.
 *
 * `smooth` is skipped under a reduced-motion preference, matching the game apps.
 */
export function scrollToResults(target: HTMLElement | null) {
  const top = target
    ? Math.max(0, target.getBoundingClientRect().top + window.scrollY)
    : 0
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' })
}
