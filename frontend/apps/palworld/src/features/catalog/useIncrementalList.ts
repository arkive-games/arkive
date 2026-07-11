import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Reveal chunk sizes. All catalog data is already in memory (static JSON
// bundles), so this is purely a DOM-size control: the items grid would
// otherwise mount ~1,900 HoverCard-wrapped tiles at once. 160 ≈ 20 rows of
// the densest (8-col) grid — comfortably past the first viewport.
const INITIAL_COUNT = 160
const STEP = 160

// Pre-reveal margin: bump the count while the sentinel is still well below
// the viewport so scrolling never visibly hits the end of the grid.
const SENTINEL_ROOT_MARGIN = '800px'

const STORAGE_PREFIX = 'palworld.reveal.'

function restoreCount(storageKey: string | undefined): number {
  if (!storageKey) return INITIAL_COUNT
  const raw = sessionStorage.getItem(STORAGE_PREFIX + storageKey)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > INITIAL_COUNT ? n : INITIAL_COUNT
}

/**
 * Incrementally reveal an in-memory list as the user scrolls (auto-scroll
 * "pagination" without any data fetching). Attach `sentinelRef` to an element
 * below the grid; when it approaches the viewport the next chunk is revealed.
 * `showMore` is the manual fallback for the same step (keyboard users, no-IO
 * environments, deterministic e2e).
 *
 * `storageKey` persists the reveal depth in sessionStorage so list → detail →
 * back restores the scroll position (the browser can only restore scroll if
 * the tiles are actually re-rendered). The count resets to the initial chunk
 * whenever `list` changes identity (new filter / query / language).
 */
export function useIncrementalList<T>(list: T[], storageKey?: string) {
  const [count, setCount] = useState(() => restoreCount(storageKey))
  const prevList = useRef<T[] | null>(null)

  useEffect(() => {
    // A list identity change means a filter / query / language switch →
    // start back at the top with the initial chunk. But keep the restored
    // depth across mount and the async bundle arrival: while data loads the
    // list is a fresh empty array each render, so "previous list was empty"
    // marks initial population, not a user filter change.
    const prev = prevList.current
    prevList.current = list
    if (prev === null || prev.length === 0) return
    setCount(INITIAL_COUNT)
  }, [list])

  useEffect(() => {
    if (!storageKey) return
    sessionStorage.setItem(STORAGE_PREFIX + storageKey, String(count))
  }, [count, storageKey])

  const showMore = useCallback(() => {
    setCount((c) => c + STEP)
  }, [])

  const sentinelRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node || typeof IntersectionObserver === 'undefined') return
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) showMore()
        },
        { rootMargin: SENTINEL_ROOT_MARGIN },
      )
      observer.observe(node)
      return () => observer.disconnect()
    },
    [showMore],
  )

  const shown = useMemo(() => (count >= list.length ? list : list.slice(0, count)), [list, count])
  return { shown, remaining: Math.max(0, list.length - count), showMore, sentinelRef }
}
