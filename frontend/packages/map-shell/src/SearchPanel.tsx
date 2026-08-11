import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import MiniSearch, { type SearchOptions } from "minisearch"
import { IconSearch } from "@tabler/icons-react"
import { cn } from "@gamemap/ui"
import { formatCoords } from "./coordFormat"
import { searchTokenize } from "./searchTokenizer"

export type SearchItem = {
  id: string
  name: string
  description?: string
  idLabel?: string
  subtypeLabel?: string
  categoryLabel?: string
  iconUrl?: string
  x: number
  y: number
  /** World height (up axis). When present it's shown as a labeled `Z` value. */
  z?: number
  /** Numeric value used for nearest-value searches when the query is a bare integer. */
  proximityValue?: number
  /** Results sharing this key collapse to one row during a nearest-value search. */
  proximityKey?: string
  /** Stable tie-break order for equal-distance nearest-value results. */
  proximityOrder?: number
  /** User-visible value label shown on the result card. */
  proximityLabel?: string
  /** Numeric catalog id that should be pinned for an equal bare-number query. */
  numericId?: number
}

/** A `SearchItem` text field that can be indexed for searching. */
export type SearchField = "name" | "description" | "idLabel"

export type SearchPanelLabels = {
  search: string
  placeholder?: string
  resultsCount: (n: number) => string
  unnamed: string
  noDescription: string
  exactNumericMatches?: (value: number) => string
  nearbyNumericMatches?: (value: number) => string
}

export type SearchPanelProps = {
  items: SearchItem[]
  onSelect: (id: string) => void
  onFlyTo: (pos: { x: number; y: number }) => void
  labels: SearchPanelLabels
  debounceMs?: number
  classNames?: { root?: string }
  /**
   * "floating" (default): the desktop right-side absolute overlay.
   * "inline": fills its container (used inside a mobile bottom sheet).
   */
  variant?: "floating" | "inline"
  /** Placement preset for the floating variant. Ignored by the inline variant. */
  floatingPlacement?: "right" | "center"
  /**
   * Maps a result's DATA (x, y[, z]) to the coordinates shown on the card.
   * Default: identity. Fly-to still uses the raw DATA coords. An app supplies
   * this to display game-native coords (e.g. Palworld in-game coordinates).
   * When it returns a `z`, the card appends a labeled `Z` (height) value so the
   * up axis is unambiguous.
   */
  displayCoords?: (
    x: number,
    y: number,
    z?: number,
  ) => { x: number; y: number; z?: number }
  /**
   * Which item fields are indexed for searching. Required — the panel makes no
   * assumption about the item shape. E.g. AION2 passes `["name","description"]`;
   * Palworld passes `["name","idLabel"]` (its `description` is a non-textual
   * spawn level range). Fields not listed are still rendered on the card.
   */
  searchFields: SearchField[]
  /**
   * Optional per-query hook to override how a query is matched. Return a
   * MiniSearch `SearchOptions` to take over matching for that query, or
   * `undefined` to use the default (scope-aware prefix search). This is where
   * an app injects game-specific rules without the panel hardcoding fields,
   * such as an explicit exact-id query.
   */
  resolveSearchOptions?: (query: string) => SearchOptions | undefined
  /**
   * App-wide base MiniSearch options, merged UNDER the scope's fields and under
   * any `resolveSearchOptions` per-query override. Lets an app change matching
   * for every query without the panel hardcoding it. E.g. the Palworld map
   * passes `{ combineWith: "AND", fuzzy: false }`: pal names tokenize per CJK
   * character, so the MiniSearch default (OR-combine) makes "云海鹿" match every
   * pal sharing a single character — AND requires all characters instead. Pass
   * a STABLE reference (module constant / memoized); an inline object literal
   * re-runs the search every render.
   */
  searchOptions?: SearchOptions
  /** Maximum distance from a bare-number target for proximity results. */
  maxProximityDistance?: number
  /**
   * Optional secondary line rendered right-aligned in the coords row, computed
   * lazily per shown result (so an app can do a point lookup for only the ≤50
   * visible cards rather than every marker). AION2 uses it for the subzone.
   */
  resultAside?: (item: SearchItem) => string | undefined
  /**
   * Seed the search box from outside (e.g. a `?q=` deep link). Prefills the
   * input and runs the search immediately. Re-applied whenever the value
   * changes; a later user edit is preserved until the value changes again.
   */
  initialQuery?: string
  /**
   * Called with the ids of the currently shown results whenever they change
   * (empty array when the query is blank). Lets the host force those markers
   * onto the map even when their subtype filter is off. Must be a stable
   * callback (e.g. a `useState` setter or `useCallback`).
   */
  onResultsChange?: (ids: string[]) => void
}

/**
 * Context-free right-side search overlay. MiniSearch with a letter/digit/CJK
 * tokenizer (so numeric-id, Latin and CJK queries all match) + prefix/fuzzy.
 * The item shape and matching rules are supplied by the caller; styling reads
 * theme tokens so each app's palette drives the accent.
 */
export function SearchPanel({
  items,
  onSelect,
  onFlyTo,
  labels,
  debounceMs = 200,
  classNames,
  displayCoords = (x, y, z) => ({ x, y, z }),
  searchFields,
  resolveSearchOptions,
  searchOptions,
  maxProximityDistance = Number.POSITIVE_INFINITY,
  resultAside,
  initialQuery,
  onResultsChange,
  variant = "floating",
  floatingPlacement = "right",
}: SearchPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState(initialQuery ?? "")
  const [debounced, setDebounced] = useState(initialQuery ?? "")

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), debounceMs)
    return () => clearTimeout(id)
  }, [query, debounceMs])

  // Re-seed from an externally supplied query (URL deep link / navigation).
  // Runs only when `initialQuery` actually changes, so a user edit afterwards
  // is never clobbered by an unrelated re-render. Bypasses the debounce so the
  // deep-linked search shows immediately.
  useEffect(() => {
    if (initialQuery === undefined) return
    setQuery(initialQuery)
    setDebounced(initialQuery)
  }, [initialQuery])

  const itemsById = useMemo(() => {
    const m = new Map<string, SearchItem>()
    for (const it of items) m.set(it.id, it)
    return m
  }, [items])

  const miniSearch = useMemo(() => {
    const ms = new MiniSearch<SearchItem>({
      fields: searchFields,
      storeFields: ["id"],
      // Fuzzy helps typo'd names, but on a purely-numeric query (an id like
      // "123") it matches every edit-distance-1 neighbour (No.113, No.12x…),
      // flooding results — so disable fuzzy for numeric terms; prefix stays on.
      searchOptions: {
        prefix: true,
        fuzzy: (term) => (/^\d+$/.test(term) ? false : 0.2),
      },
      tokenize: searchTokenize,
    })
    ms.addAll(items)
    return ms
    // searchFields is joined so a fresh array literal with the same contents
    // doesn't needlessly rebuild the index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, searchFields.join(",")])

  const resultState = useMemo(() => {
    const q = debounced.trim()
    if (!q) return { results: [] as SearchItem[], numericTarget: null, exactCount: 0 }
    if (/^\d+$/.test(q)) {
      const target = Number(q)
      const hasProximityItems = items.some((item) => Number.isFinite(item.proximityValue))
      const proximityItems = items.filter((item) =>
        item.numericId === target ||
        (Number.isFinite(item.proximityValue) &&
          Math.abs(item.proximityValue! - target) <= maxProximityDistance),
      )
      if (hasProximityItems) {
        const deduped = new Map<string, SearchItem>()
        for (const item of proximityItems) {
          const key = item.proximityKey ?? item.id
          if (!deduped.has(key)) deduped.set(key, item)
        }
        const results = [...deduped.values()]
          .sort((a, b) => {
            const exactOrder = Number(b.numericId === target) - Number(a.numericId === target)
            if (exactOrder !== 0) return exactOrder
            const aDistance = Number.isFinite(a.proximityValue)
              ? Math.abs(a.proximityValue! - target)
              : Number.POSITIVE_INFINITY
            const bDistance = Number.isFinite(b.proximityValue)
              ? Math.abs(b.proximityValue! - target)
              : Number.POSITIVE_INFINITY
            if (aDistance !== bDistance) return aDistance - bDistance
            return (a.proximityOrder ?? Number.MAX_SAFE_INTEGER) -
              (b.proximityOrder ?? Number.MAX_SAFE_INTEGER) ||
              a.id.localeCompare(b.id, undefined, { numeric: true })
          })
          .slice(0, 50)
        return {
          results,
          numericTarget: target,
          exactCount: results.filter((item) => item.numericId === target).length,
        }
      }
    }
    // Layer the options: app-wide base (`searchOptions`) < configured fields <
    // an app-supplied per-query override (`resolveSearchOptions`) which wins.
    // `...undefined` spreads to nothing, so an
    // absent base or resolver simply drops out.
    const opts: SearchOptions = {
      ...searchOptions,
      fields: searchFields,
      ...resolveSearchOptions?.(q),
    }
    const results = miniSearch.search(q, opts)
      .map((result) => itemsById.get(result.id as string))
      .filter((item): item is SearchItem => item !== undefined)
      .slice(0, 50)
    return { results, numericTarget: null, exactCount: 0 }
    // searchFields is joined (not referenced) so a fresh array literal with the
    // same contents doesn't churn `results` every render — which, via the
    // onResultsChange effect below, would loop setState→render→setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, items, itemsById, maxProximityDistance, miniSearch, searchFields.join(","), resolveSearchOptions, searchOptions])
  const { results, numericTarget, exactCount } = resultState

  // Report the shown result ids so the host can force those markers onto the
  // map even when their subtype filter is off (see SearchPanelProps). Guarded
  // by the last-reported id list so an unstable `results`/`onResultsChange`
  // reference can't spin an update loop: we only call out when the ids change.
  const lastReportedIds = useRef<string | null>(null)
  useEffect(() => {
    if (!onResultsChange) return
    const ids = results.map((result) => result.id)
    const key = ids.join(" ")
    if (key === lastReportedIds.current) return
    lastReportedIds.current = key
    onResultsChange(ids)
  }, [results, onResultsChange])

  // Floating only. The inline variant is mounted INSIDE palworld's mobile search
  // sheet, so an unconditional listener cleared the query when the user tapped the
  // sheet's own chrome -- and on any map pan, which also dropped the forced-visible
  // result markers.
  useEffect(() => {
    if (variant !== "floating" || !query.trim()) return
    const dismissOnOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setQuery("")
      setDebounced("")
    }
    document.addEventListener("pointerdown", dismissOnOutsidePointer, true)
    return () => document.removeEventListener("pointerdown", dismissOnOutsidePointer, true)
  }, [query, variant])

  const handleSelect = (id: string) => {
    const item = itemsById.get(id)
    if (!item) return
    onSelect(id)
    onFlyTo({ x: item.x, y: item.y })
    // The selected marker opens its own detail card at the destination. Close
    // the result list so that card is not hidden behind the centered search
    // overlay, while keeping the search field ready for the next lookup.
    setQuery("")
    setDebounced("")
  }

  const hasQuery = debounced.trim().length > 0

  return (
    <div
      ref={rootRef}
      className={cn(
        // The floating column spans the map's full height but only *renders*
        // a search bar (and a results panel once there is a query), so
        // `pointer-events-none` here with `auto` on each visible child. With
        // `auto` on the root the empty area below the bar silently swallowed
        // every click in a 290px-wide strip of the map — including marker
        // popups that opened underneath it.
        variant === "floating"
          ? cn(
              "pointer-events-none absolute top-3 bottom-3 z-[var(--arkive-layer-map-control)] flex flex-col gap-2",
              floatingPlacement === "center"
                ? "left-1/2 right-auto w-[calc(100%-2rem)] min-w-72 max-w-[34rem] -translate-x-1/2"
                : "right-3 w-[290px]",
            )
          : "flex min-h-0 max-h-full w-full flex-col gap-2 [&>div:first-child]:mr-10",
        classNames?.root,
      )}
      data-testid="search-panel"
    >
      {/* Search bar. min-h-12 is isolated_map_target (3rem): this floats over the map
          with nothing adjacent to share a target area with, so it takes the isolated
          size rather than the compact one. Previously it had no height at all and
          measured ~2.4rem from padding plus line box. */}
      <div className="pointer-events-auto flex min-h-12 items-center gap-1.5 rounded-lg border border-border bg-popover/95 px-3 py-2 text-popover-foreground shadow-sm backdrop-blur transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20">
        <IconSearch className="size-4 shrink-0 text-muted-foreground" stroke={1.8} aria-hidden />
        <input
          data-testid="marker-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={labels.placeholder ?? labels.search}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          data-testid="search-submit"
          onClick={() => setDebounced(query)}
          className="shrink-0 text-sm font-medium text-primary"
        >
          {labels.search}
        </button>
      </div>

      {/* Results panel */}
      {hasQuery && (
        <div className="pointer-events-auto flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-popover/95 shadow-sm backdrop-blur">
          <div className="border-b border-border px-3 py-2 text-center text-xs text-muted-foreground">
            {labels.resultsCount(results.length)}
          </div>
          <ul
            data-testid="search-results"
            className={cn(
              "min-h-0 flex-1 content-start gap-1.5 overflow-y-auto p-2",
              variant === "floating" && floatingPlacement === "center"
                ? "grid grid-cols-1 sm:grid-cols-2"
                : "flex flex-col",
            )}
          >
            {results.map((item, index) => {
              const metaLabel = [item.subtypeLabel, item.categoryLabel]
                .filter(Boolean)
                .join(" / ")
              const groupLabel = numericTarget === null
                ? undefined
                : index === 0 && exactCount > 0
                  ? labels.exactNumericMatches?.(numericTarget)
                  : index === exactCount
                    ? labels.nearbyNumericMatches?.(numericTarget)
                    : undefined
              return (
                <Fragment key={item.id}>
                  {groupLabel ? (
                    <li className="col-span-full">
                      <div
                        data-testid="search-result-group"
                        className="px-1 pb-0.5 pt-1 text-xs font-medium text-muted-foreground"
                      >
                        {groupLabel}
                      </div>
                    </li>
                  ) : null}
                  <li className="min-w-0">
                    <button
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className={cn(
                        "w-full rounded-md border border-transparent bg-card px-2.5 py-1.5 text-left text-card-foreground",
                        "transition-colors hover:border-border hover:bg-accent/20",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {item.iconUrl && (
                          <img
                            src={item.iconUrl}
                            alt=""
                            className="size-[18px] shrink-0 object-contain"
                          />
                        )}
                        {item.idLabel && (
                          <span className="shrink-0 rounded bg-muted px-1 text-xs font-mono tabular-nums text-muted-foreground">
                            {item.idLabel}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {item.name || labels.unnamed}
                        </span>
                      </div>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        {metaLabel ? <span className="shrink-0">{metaLabel}</span> : null}
                        {metaLabel ? <span aria-hidden>·</span> : null}
                        <span
                          className={cn(
                            "min-w-0 truncate",
                            item.description ? undefined : "text-muted-foreground/60 italic",
                          )}
                        >
                          {item.description || labels.noDescription}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground/70">
                        {(() => {
                          const c = displayCoords(item.x, item.y, item.z)
                          // Compact `(X, Y, Z)` visible; the axis-labeled aria/title
                          // spells out which number is which (esp. the Z height).
                          const { text, aria } = formatCoords(c.x, c.y, c.z)
                          return (
                            <span
                              className="shrink-0 tabular-nums"
                              aria-label={aria}
                              title={aria}
                            >
                              {text}
                            </span>
                          )
                        })()}
                        {(() => {
                          const aside = resultAside?.(item) ?? item.proximityLabel
                          return aside ? (
                            <span className="truncate text-right">{aside}</span>
                          ) : null
                        })()}
                      </div>
                    </button>
                  </li>
                </Fragment>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
