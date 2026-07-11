# Global Search Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A command-palette global search in the shared topbar of both apps (aion2, palworld) that finds any entity on the site and navigates to it — MiniSearch prefix matching, **fuzzy disabled**.

**Architecture:** A headless `GlobalSearch` component in `packages/map-shell` (trigger button + `CommandDialog` + MiniSearch over lazily-loaded app-supplied sources). Each app wires a widget that supplies localized data sources and navigation. The map search's tokenizer is extracted into a shared module.

**Tech Stack:** React 19, cmdk (`CommandDialog` in `@gamemap/ui`), MiniSearch 7, TanStack Router, i18next, vitest (jsdom) + Playwright.

**Spec:** `docs/superpowers/specs/2026-07-12-global-search-design.md`

**Working directory:** the `global-search` worktree, `frontend/` subdir. All test/lint commands run from `frontend/`.

**Constraint (enforced by `pnpm run check:shell`):** files in `packages/map-shell/src` must NOT reference `i18next`, `useTranslation`, `react-router`, `import.meta.env`, `localStorage`, `fetch(`, or `@/`. The GlobalSearch component receives all data via `load()` closures and all strings via `labels` — keep it that way.

---

### Task 1: Extract the shared search tokenizer

The map search's tokenizer (Latin runs / digit runs / per-CJK-char, leading-zero strip) moves to its own module so `GlobalSearch` can reuse it. No behavior change to `SearchPanel`.

**Files:**
- Create: `frontend/packages/map-shell/src/searchTokenizer.ts`
- Create: `frontend/packages/map-shell/src/searchTokenizer.test.ts`
- Modify: `frontend/packages/map-shell/src/SearchPanel.tsx` (lines ~164–172, the `tokenize` option)
- Modify: `frontend/packages/map-shell/src/index.ts`

- [ ] **Step 1: Write the failing test**

`frontend/packages/map-shell/src/searchTokenizer.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { searchTokenize } from "./searchTokenizer"

describe("searchTokenize", () => {
  it("splits letter runs from digit runs", () => {
    expect(searchTokenize("No.111B")).toEqual(["No", "111", "B"])
  })

  it("strips leading zeros from numeric tokens", () => {
    expect(searchTokenize("No.011")).toEqual(["No", "11"])
  })

  it("tokenizes CJK per character", () => {
    expect(searchTokenize("云海鹿")).toEqual(["云", "海", "鹿"])
  })

  it("mixes scripts", () => {
    expect(searchTokenize("Lv.3 拉普蕾西亚")).toEqual(["Lv", "3", "拉", "普", "蕾", "西", "亚"])
  })

  it("returns empty for symbol-only input", () => {
    expect(searchTokenize("--- ()")).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `pnpm vitest run packages/map-shell/src/searchTokenizer.test.ts`
Expected: FAIL — cannot resolve `./searchTokenizer`.

- [ ] **Step 3: Create the module**

`frontend/packages/map-shell/src/searchTokenizer.ts` — the exact logic currently inlined in `SearchPanel.tsx` (comment included):

```ts
/**
 * Shared MiniSearch tokenizer for the map search and the global search.
 * Tokenize into Latin-letter runs, digit runs, and single CJK chars.
 * Splitting letters from digits means a suffixed id like "No.111B" yields
 * the number token "111" (findable by a numeric query) while CJK still
 * matches per character. Strip leading zeros from numeric tokens (index +
 * query) so "11"/"011" both match a zero-padded id token "011" (No.011).
 */
export function searchTokenize(s: string): string[] {
  return (s.match(/[a-zA-Z]+|[0-9]+|[぀-ヿ㐀-鿿豈-﫿가-힯]/g) ?? []).map((t) =>
    /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t,
  )
}
```

- [ ] **Step 4: Use it in SearchPanel**

In `frontend/packages/map-shell/src/SearchPanel.tsx`:
- Add import: `import { searchTokenize } from "./searchTokenizer"`
- Replace the `tokenize:` option (the multi-line comment + arrow function, lines ~164–172) with:

```ts
      tokenize: searchTokenize,
```

(Delete the now-duplicated comment block above it — the explanation lives in `searchTokenizer.ts`.)

- [ ] **Step 5: Export from the package index**

In `frontend/packages/map-shell/src/index.ts`, add:

```ts
export { searchTokenize } from "./searchTokenizer"
```

- [ ] **Step 6: Run the map-shell tests**

Run: `pnpm vitest run packages/map-shell`
Expected: `searchTokenizer.test.ts` PASSES and every existing `SearchPanel.test.tsx` test still PASSES.

- [ ] **Step 7: Commit**

```bash
git add packages/map-shell/src/searchTokenizer.ts packages/map-shell/src/searchTokenizer.test.ts packages/map-shell/src/SearchPanel.tsx packages/map-shell/src/index.ts
git commit -m "refactor(map-shell): extract shared search tokenizer from SearchPanel"
```

(Run `git add`/`git commit` from `frontend/`; paths are relative to it. Stage explicit paths only — never `git add -A`.)

---

### Task 2: UI plumbing — dialog overlay z-index + Command pass-through

Radix dialogs default to `z-50`, but Leaflet panes reach z-index ~1000 in the root stacking context (that's why the topbar menus use `z-[2000]`). The dialog needs a z boost on **both** the content and the overlay, and `CommandDialog` must forward `shouldFilter` to the inner `Command` (we filter with MiniSearch, not cmdk).

**Files:**
- Modify: `frontend/packages/ui/src/dialog.tsx` (DialogContent, lines 50–82)
- Modify: `frontend/packages/ui/src/command.tsx` (CommandDialog, lines 30–59)

- [ ] **Step 1: DialogContent gains `overlayClassName`**

In `frontend/packages/ui/src/dialog.tsx` replace the `DialogContent` signature and overlay line:

```tsx
function DialogContent({
  className,
  overlayClassName,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  overlayClassName?: string
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay className={overlayClassName} />
```

(the rest of `DialogContent` is unchanged).

- [ ] **Step 2: CommandDialog forwards `overlayClassName` + `commandProps`**

In `frontend/packages/ui/src/command.tsx` replace `CommandDialog` with:

```tsx
function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  overlayClassName,
  commandProps,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
  className?: string
  overlayClassName?: string
  commandProps?: React.ComponentProps<typeof CommandPrimitive>
  showCloseButton?: boolean
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn("overflow-hidden p-0", className)}
        overlayClassName={overlayClassName}
        showCloseButton={showCloseButton}
      >
        <Command
          className="**:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          {...commandProps}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Typecheck the ui package**

Run: `pnpm --filter @gamemap/ui exec tsc --noEmit` (if the package has no `check` script, `pnpm vitest run` in Task 4 plus the app builds will cover it — in that case just confirm the file compiles via `pnpm --filter aion2 exec tsc -b --noEmit` later; don't block here).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/dialog.tsx packages/ui/src/command.tsx
git commit -m "feat(ui): dialog overlayClassName + CommandDialog commandProps pass-through"
```

---

### Task 3: `ShellTopBar` search slot

**Files:**
- Modify: `frontend/packages/map-shell/src/ShellTopBar.tsx`

- [ ] **Step 1: Add the `search` prop**

In `ShellTopBarProps` (after `rightExtras?: ReactNode`):

```ts
  /** Global search widget, rendered at the start of the right-side cluster. */
  search?: ReactNode
```

In the component signature add `search,` to the destructured props. In the JSX, render it first in the right cluster:

```tsx
      <div className={cn("ml-auto flex items-center gap-1", classNames?.right)}>
        {search}
        {languageSwitcher && (
```

- [ ] **Step 2: Verify compile**

Run: `pnpm --filter @gamemap/map-shell check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/map-shell/src/ShellTopBar.tsx
git commit -m "feat(map-shell): ShellTopBar search slot"
```

---

### Task 4: `GlobalSearch` component (map-shell) — TDD

The shared widget: trigger button, Ctrl/Cmd+K, lazy per-language source loading, MiniSearch (prefix, **no fuzzy**, AND), grouped results.

**Files:**
- Create: `frontend/packages/map-shell/src/GlobalSearch.tsx`
- Create: `frontend/packages/map-shell/src/GlobalSearch.test.tsx`
- Modify: `frontend/packages/map-shell/src/index.ts`

- [ ] **Step 1: Write the failing tests**

`frontend/packages/map-shell/src/GlobalSearch.test.tsx`:

```tsx
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { GlobalSearch, type GlobalSearchEntry, type GlobalSearchSource } from "./GlobalSearch"

afterEach(cleanup)

const labels = {
  button: "Search",
  placeholder: "Search everything…",
  empty: "No results",
  loading: "Loading…",
}

const pals: GlobalSearchEntry[] = [
  { id: "SheepBall", name: "Lamball", idLabel: "No.001" },
  { id: "Alpaca", name: "Melpaca", idLabel: "No.011" },
]
const items: GlobalSearchEntry[] = [{ id: "Wool", name: "Wool" }]

function sources(over?: Partial<Record<"pals" | "items", () => Promise<GlobalSearchEntry[]>>>): GlobalSearchSource[] {
  return [
    { key: "pals", label: "Pals", load: over?.pals ?? (() => Promise.resolve(pals)) },
    { key: "items", label: "Items", load: over?.items ?? (() => Promise.resolve(items)) },
  ]
}

function renderSearch(props?: {
  sources?: GlobalSearchSource[]
  onSelect?: (sourceKey: string, id: string) => void
  lang?: string
}) {
  return render(
    <GlobalSearch
      sources={props?.sources ?? sources()}
      onSelect={props?.onSelect ?? vi.fn()}
      labels={labels}
      lang={props?.lang ?? "en-US"}
      debounceMs={0}
    />,
  )
}

async function openAndType(query: string) {
  fireEvent.click(screen.getByTestId("global-search-button"))
  const input = await screen.findByPlaceholderText(labels.placeholder)
  fireEvent.change(input, { target: { value: query } })
  return input
}

describe("GlobalSearch", () => {
  it("opens on click, loads sources, and finds a prefix match with its group heading", async () => {
    renderSearch()
    await openAndType("Lam")
    expect(await screen.findByText("Lamball")).toBeTruthy()
    expect(screen.getByText("Pals")).toBeTruthy()
    // idLabel chip rendered
    expect(screen.getByText("No.001")).toBeTruthy()
  })

  it("does NOT fuzzy-match a typo'd query", async () => {
    renderSearch()
    await openAndType("Lambell") // edit distance 1 from "Lamball"
    expect(await screen.findByText(labels.empty)).toBeTruthy()
    expect(screen.queryByText("Lamball")).toBeNull()
  })

  it("AND-combines multi-token queries", async () => {
    renderSearch({
      sources: [
        {
          key: "pals",
          label: "Pals",
          load: () =>
            Promise.resolve([
              { id: "a", name: "云海鹿" },
              { id: "b", name: "海豚" },
            ]),
        },
      ],
    })
    await openAndType("云海")
    expect(await screen.findByText("云海鹿")).toBeTruthy()
    expect(screen.queryByText("海豚")).toBeNull() // shares 海 only — OR would match
  })

  it("matches zero-padded id labels by bare number", async () => {
    renderSearch()
    await openAndType("11")
    expect(await screen.findByText("Melpaca")).toBeTruthy() // No.011 → token "11"
  })

  it("selecting a result calls onSelect with source key + entry id and closes", async () => {
    const onSelect = vi.fn()
    renderSearch({ onSelect })
    await openAndType("Wool")
    fireEvent.click(await screen.findByText("Wool"))
    expect(onSelect).toHaveBeenCalledWith("items", "Wool")
    await waitFor(() => expect(screen.queryByPlaceholderText(labels.placeholder)).toBeNull())
  })

  it("tolerates a failing source", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    renderSearch({
      sources: sources({ pals: () => Promise.reject(new Error("boom")) }),
    })
    await openAndType("Wool")
    expect(await screen.findByText("Wool")).toBeTruthy()
    expect(screen.queryByText("Lamball")).toBeNull()
    err.mockRestore()
  })

  it("reloads sources when lang changes", async () => {
    const load = vi.fn(() => Promise.resolve(pals))
    const src: GlobalSearchSource[] = [{ key: "pals", label: "Pals", load }]
    const { rerender } = render(
      <GlobalSearch sources={src} onSelect={vi.fn()} labels={labels} lang="en-US" debounceMs={0} />,
    )
    fireEvent.click(screen.getByTestId("global-search-button"))
    await screen.findByPlaceholderText(labels.placeholder)
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    rerender(
      <GlobalSearch sources={src} onSelect={vi.fn()} labels={labels} lang="zh-CN" debounceMs={0} />,
    )
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  })

  it("opens via Ctrl+K", async () => {
    renderSearch()
    fireEvent.keyDown(window, { key: "k", ctrlKey: true })
    expect(await screen.findByPlaceholderText(labels.placeholder)).toBeTruthy()
  })

  it("skips entries with empty names", async () => {
    renderSearch({
      sources: [
        {
          key: "pals",
          label: "Pals",
          load: () => Promise.resolve([{ id: "x", name: "" }, { id: "SheepBall", name: "Lamball" }]),
        },
      ],
    })
    await openAndType("Lam")
    expect(await screen.findByText("Lamball")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/map-shell/src/GlobalSearch.test.tsx`
Expected: FAIL — cannot resolve `./GlobalSearch`.

- [ ] **Step 3: Implement the component**

`frontend/packages/map-shell/src/GlobalSearch.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react"
import MiniSearch from "minisearch"
import { Search } from "lucide-react"
import {
  Button,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
} from "@gamemap/ui"
import { searchTokenize } from "./searchTokenizer"

export type GlobalSearchEntry = {
  /** Unique within its source (used to navigate). */
  id: string
  /** Localized display name — indexed. Empty-name entries are skipped. */
  name: string
  /** Short monospace chip, e.g. a Paldeck "No.011" — indexed. */
  idLabel?: string
  /** Muted secondary text (category label, map name…) — NOT indexed. */
  detail?: string
  iconUrl?: string
}

export type GlobalSearchSource = {
  /** Stable group key, e.g. "pals" / "wiki-npc" / "markers". */
  key: string
  /** Localized group heading. */
  label: string
  /**
   * Lazy entry loader — called on first dialog open (once per language; the
   * result is cached until `lang` or the `sources` identity changes). A
   * rejected load is logged and contributes zero entries.
   */
  load: () => Promise<GlobalSearchEntry[]>
}

export type GlobalSearchLabels = {
  button: string
  placeholder: string
  empty: string
  loading: string
}

export type GlobalSearchProps = {
  /** Pass a STABLE (memoized) array — its identity is the load-cache key. */
  sources: GlobalSearchSource[]
  /** Navigate to the entity; the dialog closes itself before calling this. */
  onSelect: (sourceKey: string, entryId: string) => void
  labels: GlobalSearchLabels
  /** Current language — cache key; a change discards loaded entries. */
  lang: string
  debounceMs?: number
  classNames?: { trigger?: string }
}

type Doc = { docId: string; sourceKey: string; entry: GlobalSearchEntry }

/**
 * Topbar global search: a trigger button (and Ctrl/Cmd+K) opening a command
 * palette over every entity the app registers as a source. Matching mirrors
 * the map search (shared tokenizer, prefix) but with fuzzy OFF and AND-combined
 * tokens, so results are exact-prefix only. Data and navigation stay in the
 * app: sources lazy-load localized entries, onSelect routes the pick.
 */
export function GlobalSearch({
  sources,
  onSelect,
  labels,
  lang,
  debounceMs = 200,
  classNames,
}: GlobalSearchProps) {
  const [open, setOpen] = useState(false)
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  // Loaded-entry cache: valid for one (sources identity, lang) pair.
  const cacheRef = useRef<{ sources: GlobalSearchSource[]; lang: string; docs: Doc[] } | null>(null)

  // Ctrl/Cmd+K toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), debounceMs)
    return () => clearTimeout(id)
  }, [query, debounceMs])

  // Load all sources on first open (per sources identity + language).
  useEffect(() => {
    if (!open) return
    const cached = cacheRef.current
    if (cached && cached.sources === sources && cached.lang === lang) {
      setDocs(cached.docs)
      return
    }
    let cancelled = false
    setDocs(null)
    Promise.all(
      sources.map(async (s) => {
        try {
          const entries = await s.load()
          return entries
            .filter((e) => e.name)
            .map((e): Doc => ({ docId: `${s.key}:${e.id}`, sourceKey: s.key, entry: e }))
        } catch (err) {
          console.error(`GlobalSearch: source "${s.key}" failed to load`, err)
          return []
        }
      }),
    ).then((lists) => {
      if (cancelled) return
      const all = lists.flat()
      cacheRef.current = { sources, lang, docs: all }
      setDocs(all)
    })
    return () => {
      cancelled = true
    }
  }, [open, lang, sources])

  const docsById = useMemo(() => new Map((docs ?? []).map((d) => [d.docId, d])), [docs])

  const mini = useMemo(() => {
    if (!docs) return null
    const ms = new MiniSearch<Doc>({
      idField: "docId",
      fields: ["name", "idLabel"],
      storeFields: ["docId"],
      extractField: (doc, field) =>
        field === "docId" ? doc.docId : (doc.entry[field as "name" | "idLabel"] ?? ""),
      // Global scope needs precision: prefix stays on so partial queries match,
      // fuzzy is OFF (explicit requirement) and tokens AND-combine so a CJK
      // query doesn't match on a single shared character.
      searchOptions: { prefix: true, fuzzy: false, combineWith: "AND" },
      tokenize: searchTokenize,
    })
    ms.addAll(docs)
    return ms
  }, [docs])

  // Top-50 hits grouped by source, groups ordered by their best hit.
  const groups = useMemo(() => {
    const q = debounced.trim()
    if (!q || !mini) return []
    const hits = mini.search(q).slice(0, 50)
    const byKey = new Map<string, Doc[]>()
    for (const hit of hits) {
      const doc = docsById.get(hit.id as string)
      if (!doc) continue
      const list = byKey.get(doc.sourceKey)
      if (list) list.push(doc)
      else byKey.set(doc.sourceKey, [doc])
    }
    const labelByKey = new Map(sources.map((s) => [s.key, s.label]))
    return [...byKey.entries()].map(([key, list]) => ({
      key,
      label: labelByKey.get(key) ?? key,
      docs: list,
    }))
  }, [debounced, mini, docsById, sources])

  const hasQuery = debounced.trim().length > 0
  const loading = open && docs === null
  const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setQuery("")
      setDebounced("")
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        data-testid="global-search-button"
        aria-label={labels.button}
        title={labels.button}
        onClick={() => setOpen(true)}
        className={cn("h-8 gap-2 px-2 text-muted-foreground hover:text-foreground", classNames?.trigger)}
      >
        <Search className="size-4" />
        <span className="hidden text-sm lg:inline">{labels.button}</span>
        <kbd className="pointer-events-none hidden rounded border border-border bg-muted px-1.5 font-mono text-xs lg:inline">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={labels.button}
        description={labels.placeholder}
        className="top-[15%] z-[2100] translate-y-0 sm:max-w-xl"
        overlayClassName="z-[2090]"
        commandProps={{ shouldFilter: false }}
        showCloseButton={false}
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={labels.placeholder}
          data-testid="global-search-input"
        />
        <CommandList className="max-h-[min(420px,60vh)]" data-testid="global-search-results">
          {loading && (
            <div className="py-6 text-center text-sm text-muted-foreground">{labels.loading}</div>
          )}
          {!loading && hasQuery && groups.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">{labels.empty}</div>
          )}
          {groups.map((g) => (
            <CommandGroup key={g.key} heading={g.label}>
              {g.docs.map((doc) => (
                <CommandItem
                  key={doc.docId}
                  value={doc.docId}
                  data-testid="global-search-item"
                  onSelect={() => {
                    handleOpenChange(false)
                    onSelect(doc.sourceKey, doc.entry.id)
                  }}
                >
                  {doc.entry.iconUrl && (
                    <img src={doc.entry.iconUrl} alt="" className="size-5 shrink-0 object-contain" />
                  )}
                  {doc.entry.idLabel && (
                    <span className="shrink-0 rounded bg-muted px-1 font-mono text-xs tabular-nums text-muted-foreground">
                      {doc.entry.idLabel}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{doc.entry.name}</span>
                  {doc.entry.detail && (
                    <span className="ml-auto max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">
                      {doc.entry.detail}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  )
}
```

- [ ] **Step 4: Export from the package index**

In `frontend/packages/map-shell/src/index.ts`, add:

```ts
export {
  GlobalSearch,
  type GlobalSearchProps,
  type GlobalSearchEntry,
  type GlobalSearchSource,
  type GlobalSearchLabels,
} from "./GlobalSearch"
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/map-shell`
Expected: all PASS (new + existing). If a cmdk/Radix jsdom issue surfaces (e.g. missing `ResizeObserver`/`scrollIntoView`), stub it at the top of the test file:

```ts
window.HTMLElement.prototype.scrollIntoView = () => {}
```

(add `globalThis.ResizeObserver` similarly only if the failure names it).

- [ ] **Step 6: Guard-rail + typecheck**

Run: `pnpm run check:shell` — expected exit 0 (no i18next/router/fetch/etc. references).
Run: `pnpm --filter @gamemap/map-shell check` — expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/map-shell/src/GlobalSearch.tsx packages/map-shell/src/GlobalSearch.test.tsx packages/map-shell/src/index.ts
git commit -m "feat(map-shell): GlobalSearch command-palette widget (prefix, no fuzzy)"
```

---

### Task 5: Palworld — i18n strings

**Files:**
- Modify: `frontend/apps/palworld/src/i18n.ts`

- [ ] **Step 1: Add the label tables**

After `COMPLETED_LABELS` (~line 208) add:

```ts
// Global search (topbar palette): input placeholder / empty / loading states.
// The trigger-button label reuses the existing `search` key.
export const GLOBAL_SEARCH_PLACEHOLDER_LABELS: Record<Language, string> = {
  'en-US': 'Search pals, items, tech…', 'de-DE': 'Pals, Items, Technologien suchen…',
  'es-ES': 'Buscar pals, objetos, tecnología…', 'es-MX': 'Buscar pals, objetos, tecnología…',
  'fr-FR': 'Rechercher pals, objets, technologies…', 'id-ID': 'Cari pal, item, teknologi…',
  'it-IT': 'Cerca pal, oggetti, tecnologie…', 'ja-JP': 'パル・アイテム・技術を検索…',
  'ko-KR': '팰, 아이템, 기술 검색…', 'pl-PL': 'Szukaj pali, przedmiotów, technologii…',
  'pt-BR': 'Buscar pals, itens, tecnologia…', 'ru-RU': 'Поиск палов, предметов, технологий…',
  'th-TH': 'ค้นหาพัล ไอเทม เทคโนโลยี…', 'tr-TR': 'Pal, eşya, teknoloji ara…',
  'vi-VN': 'Tìm pal, vật phẩm, công nghệ…', 'zh-CN': '搜索帕鲁、物品、科技…',
  'zh-TW': '搜尋帕魯、物品、科技…',
}
export const GLOBAL_SEARCH_EMPTY_LABELS: Record<Language, string> = {
  'en-US': 'No results', 'de-DE': 'Keine Ergebnisse', 'es-ES': 'Sin resultados',
  'es-MX': 'Sin resultados', 'fr-FR': 'Aucun résultat', 'id-ID': 'Tidak ada hasil',
  'it-IT': 'Nessun risultato', 'ja-JP': '結果なし', 'ko-KR': '결과 없음',
  'pl-PL': 'Brak wyników', 'pt-BR': 'Sem resultados', 'ru-RU': 'Ничего не найдено',
  'th-TH': 'ไม่พบผลลัพธ์', 'tr-TR': 'Sonuç yok', 'vi-VN': 'Không có kết quả',
  'zh-CN': '无结果', 'zh-TW': '無結果',
}
export const GLOBAL_SEARCH_LOADING_LABELS: Record<Language, string> = {
  'en-US': 'Loading…', 'de-DE': 'Wird geladen…', 'es-ES': 'Cargando…', 'es-MX': 'Cargando…',
  'fr-FR': 'Chargement…', 'id-ID': 'Memuat…', 'it-IT': 'Caricamento…', 'ja-JP': '読み込み中…',
  'ko-KR': '불러오는 중…', 'pl-PL': 'Wczytywanie…', 'pt-BR': 'Carregando…', 'ru-RU': 'Загрузка…',
  'th-TH': 'กำลังโหลด…', 'tr-TR': 'Yükleniyor…', 'vi-VN': 'Đang tải…', 'zh-CN': '加载中…',
  'zh-TW': '載入中…',
}
```

- [ ] **Step 2: Merge into the resource bundle**

In the `addResourceBundle` object (after the `markerActions:` entry, ~line 694), add:

```ts
      globalSearch: {
        placeholder: GLOBAL_SEARCH_PLACEHOLDER_LABELS[lng],
        empty: GLOBAL_SEARCH_EMPTY_LABELS[lng],
        loading: GLOBAL_SEARCH_LOADING_LABELS[lng],
      },
```

- [ ] **Step 3: Commit**

```bash
git add apps/palworld/src/i18n.ts
git commit -m "feat(palworld): global-search i18n strings (17 locales)"
```

---

### Task 6: Palworld — widget, TopNav wiring, map-param reactivity

**Files:**
- Create: `frontend/apps/palworld/src/components/GlobalSearchWidget.tsx`
- Modify: `frontend/apps/palworld/src/components/TopNav.tsx`
- Modify: `frontend/apps/palworld/src/App.tsx` (~line 79, `mapId` state)

- [ ] **Step 1: Create the widget**

`frontend/apps/palworld/src/components/GlobalSearchWidget.tsx`:

```tsx
import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { GlobalSearch, type GlobalSearchEntry, type GlobalSearchSource } from '@gamemap/map-shell'
import { loadPals, buildActiveSkills } from '../lib/pals'
import { loadBuildings, loadItems, loadQuests, loadTech, buildingIconUrl } from '../lib/catalog'
import { loadMarkers, loadStatic } from '../lib/data'
import { itemIconUrl, palIconUrl } from '../lib/assets'
import { formatPalId, palIdText } from '../lib/palId'

/**
 * Topbar global search: every site entity (pals, skills, passives, items,
 * buildings, tech, quests, map markers) as lazily-loaded sources over the
 * existing per-language cached loaders. Selection routes to the entity's
 * detail page; markers deep-link to the map with the search box seeded
 * (`/?map=…&q=<name>`), the same link the Paldeck spawn maps use.
 */
export function GlobalSearchWidget() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const navigate = useNavigate()
  // Marker entries navigate by map + localized name (the map's ?q deep link);
  // filled as a side effect of the markers source load.
  const markerNav = useRef(new Map<string, { map: string; q: string }>())

  const sources = useMemo<GlobalSearchSource[]>(() => [
    {
      key: 'pals',
      label: t('pal.title'),
      load: async () => {
        const b = await loadPals(lng)
        return b.pals.map((p) => ({
          id: p.id,
          name: b.text[p.id]?.name ?? '',
          idLabel: palIdText(formatPalId(p.zukanIndex, p.zukanIndexSuffix)),
          iconUrl: palIconUrl(p.icon),
        }))
      },
    },
    {
      key: 'skills',
      label: t('pal.section.activeSkills'),
      load: async () => {
        const b = await loadPals(lng)
        return buildActiveSkills(b)
          .filter((s) => s.name)
          .map((s) => ({ id: s.wazaId, name: s.name }))
      },
    },
    {
      key: 'passives',
      label: t('pal.section.passives'),
      load: async () => {
        const b = await loadPals(lng)
        return b.passives.map((p) => ({ id: p.id, name: b.passiveText[p.id]?.name ?? '' }))
      },
    },
    {
      key: 'items',
      label: t('item.title'),
      load: async () => {
        const b = await loadItems(lng)
        return b.items
          .filter((i) => !i.illegal)
          .map((i) => ({
            id: i.id,
            name: b.text[i.id]?.name ?? '',
            detail: b.typeLabels[i.typeA],
            iconUrl: i.icon ? itemIconUrl(i.icon) : undefined,
          }))
      },
    },
    {
      key: 'buildings',
      label: t('building.title'),
      load: async () => {
        const b = await loadBuildings(lng)
        return b.buildings.map((e) => ({
          id: e.id,
          name: b.text[e.id]?.name ?? '',
          detail: b.typeLabels[e.typeA],
          iconUrl: e.icon ? buildingIconUrl(e.icon) : undefined,
        }))
      },
    },
    {
      key: 'tech',
      label: t('tech.title'),
      load: async () => {
        const b = await loadTech(lng)
        return b.techs.map((e) => ({ id: e.id, name: b.text[e.id]?.name ?? '' }))
      },
    },
    {
      key: 'quests',
      label: t('quest.title'),
      load: async () => {
        const b = await loadQuests(lng)
        return b.quests.map((q) => ({ id: q.id, name: b.text[q.id]?.title ?? '' }))
      },
    },
    {
      key: 'markers',
      label: t('categories'),
      load: async () => {
        const { maps, mapsL10n } = await loadStatic(lng)
        const entries: GlobalSearchEntry[] = []
        for (const map of maps) {
          const { markers, l10n } = await loadMarkers(map.id, lng)
          // One entry per distinct localized name per map: the map's ?q deep
          // link shows every same-named marker at once, so duplicates here
          // would only crowd the palette.
          const seen = new Set<string>()
          for (const row of markers) {
            const name = l10n[row.id]?.name
            if (!name || seen.has(name)) continue
            seen.add(name)
            markerNav.current.set(row.id, { map: map.id, q: name })
            entries.push({ id: row.id, name, detail: mapsL10n[map.id]?.name ?? map.id })
          }
        }
        return entries
      },
    },
  ], [lng, t])

  const handleSelect = (sourceKey: string, id: string) => {
    switch (sourceKey) {
      case 'pals':
        void navigate({ to: '/pals/$id', params: { id } })
        break
      case 'skills':
        void navigate({ to: '/active-skills/$id', params: { id } })
        break
      case 'passives':
        void navigate({ to: '/passives' })
        break
      case 'items':
        void navigate({ to: '/items/$id', params: { id } })
        break
      case 'buildings':
        void navigate({ to: '/buildings/$id', params: { id } })
        break
      case 'tech':
        void navigate({ to: '/technology', search: { tech: id } })
        break
      case 'quests':
        void navigate({ to: '/quests/$id', params: { id } })
        break
      case 'markers': {
        const m = markerNav.current.get(id)
        if (m) void navigate({ to: '/', search: { map: m.map, q: m.q } })
        break
      }
    }
  }

  return (
    <GlobalSearch
      sources={sources}
      onSelect={handleSelect}
      lang={lng}
      labels={{
        button: t('search'),
        placeholder: t('globalSearch.placeholder'),
        empty: t('globalSearch.empty'),
        loading: t('globalSearch.loading'),
      }}
    />
  )
}
```

- [ ] **Step 2: Wire into TopNav**

In `frontend/apps/palworld/src/components/TopNav.tsx`:
- Add import: `import { GlobalSearchWidget } from './GlobalSearchWidget'`
- Add the `search` prop to `<ShellTopBar …>` (next to `rightExtras`):

```tsx
      search={<GlobalSearchWidget />}
```

- [ ] **Step 3: Make the map route react to `?map=` changes**

In `frontend/apps/palworld/src/App.tsx`, directly after the `const [mapId, setMapId] = useState(mapParam ?? 'MainWorld')` line (~79), add:

```tsx
  // ?map= is read once as the initial state above; a later in-app navigation
  // (e.g. picking a marker in the global search while already on the map)
  // changes only the URL, so sync it back into state here.
  useEffect(() => {
    if (mapParam && mapParam !== mapId) setMapId(mapParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapParam])
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter palworld exec tsc -b --noEmit` (if the app has no tsc build config, `pnpm lint:palworld` + the e2e run below cover it).
Run: `pnpm lint:palworld`
Expected: clean (fix any reported issues in the new files).

- [ ] **Step 5: Commit**

```bash
git add apps/palworld/src/components/GlobalSearchWidget.tsx apps/palworld/src/components/TopNav.tsx apps/palworld/src/App.tsx
git commit -m "feat(palworld): topbar global search over all site entities"
```

---

### Task 7: Palworld — e2e

**Files:**
- Create: `frontend/apps/palworld/e2e/global-search.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from '@playwright/test'

// The topbar global search palette: opens by button and Ctrl+K, prefix-matches
// (no fuzzy), and navigates to the picked entity.

test('finds a pal by name and navigates to its detail page', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('global-search-button').click()
  const input = page.getByTestId('global-search-input')
  await expect(input).toBeVisible()
  await input.fill('Lamball')
  const hit = page.getByTestId('global-search-item').filter({ hasText: 'Lamball' }).first()
  await expect(hit).toBeVisible()
  await hit.click()
  await expect(page).toHaveURL(/\/pals\/SheepBall$/)
})

test('opens with Ctrl+K and finds an item from a catalog page', async ({ page }) => {
  await page.goto('/items')
  await page.keyboard.press('Control+k')
  const input = page.getByTestId('global-search-input')
  await expect(input).toBeVisible()
  await input.fill('Paldium')
  await expect(page.getByTestId('global-search-item').first()).toBeVisible()
})

test('does not fuzzy-match typos', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('global-search-button').click()
  const input = page.getByTestId('global-search-input')
  await input.fill('Lamball') // warm-up: wait for sources to load
  await expect(page.getByTestId('global-search-item').first()).toBeVisible()
  await input.fill('Lambell') // one edit away — must yield nothing
  await expect(page.getByTestId('global-search-item')).toHaveCount(0)
})
```

- [ ] **Step 2: Run it**

Run: `pnpm e2e:palworld -- global-search.spec.ts` (playwright starts its own dev server on port 5188, `reuseExistingServer` outside CI).
Expected: 3 PASS. Known pre-existing failure elsewhere: the ko-KR smoke test — ignore it; run only this spec.

- [ ] **Step 3: Commit**

```bash
git add apps/palworld/e2e/global-search.spec.ts
git commit -m "test(palworld): e2e for topbar global search"
```

---

### Task 8: aion2 — i18n strings (4 locales)

**Files:**
- Modify: `frontend/apps/aion2/public/locales/en-US/common.yaml`
- Modify: `frontend/apps/aion2/public/locales/zh-CN/common.yaml`
- Modify: `frontend/apps/aion2/public/locales/zh-TW/common.yaml`
- Modify: `frontend/apps/aion2/public/locales/ko-KR/common.yaml`

- [ ] **Step 1: Append a `globalSearch` block to each file**

Read each file first to match its existing top-level key style, then append (top-level key, 2-space indent):

en-US:
```yaml
globalSearch:
  button: Search
  placeholder: Search quests, NPCs, items, markers…
  empty: No results
  loading: Loading…
  group:
    quest: Quests
    npc: NPCs
    item: Items
    markers: Map markers
```

zh-CN:
```yaml
globalSearch:
  button: 搜索
  placeholder: 搜索任务、NPC、物品、地图标记…
  empty: 无结果
  loading: 加载中…
  group:
    quest: 任务
    npc: NPC
    item: 物品
    markers: 地图标记
```

zh-TW:
```yaml
globalSearch:
  button: 搜尋
  placeholder: 搜尋任務、NPC、物品、地圖標記…
  empty: 無結果
  loading: 載入中…
  group:
    quest: 任務
    npc: NPC
    item: 物品
    markers: 地圖標記
```

ko-KR:
```yaml
globalSearch:
  button: 검색
  placeholder: 퀘스트, NPC, 아이템, 지도 마커 검색…
  empty: 결과 없음
  loading: 불러오는 중…
  group:
    quest: 퀘스트
    npc: NPC
    item: 아이템
    markers: 지도 마커
```

- [ ] **Step 2: Commit**

```bash
git add apps/aion2/public/locales/en-US/common.yaml apps/aion2/public/locales/zh-CN/common.yaml apps/aion2/public/locales/zh-TW/common.yaml apps/aion2/public/locales/ko-KR/common.yaml
git commit -m "feat(aion2): global-search i18n strings"
```

---

### Task 9: aion2 — widget + TopNavbar wiring

**Files:**
- Create: `frontend/apps/aion2/src/components/GlobalSearchWidget.tsx`
- Modify: `frontend/apps/aion2/src/components/TopNavbar.tsx`

Data access notes for this task:
- Wiki entity ids come from `loadWikiIndex(type)` (`@/lib/wiki`); their localized names live in the i18next namespace `wiki/<type>` (file keyed by id: `{"2000925": {"name": "…"}}`). Load with `i18n.loadNamespaces`, then read the whole bundle with `i18n.getResourceBundle`.
- Marker locale namespaces `markers/<mapId>` are keyed by marker id (`{"World_L_A-fragments-0": {"name","description"}}`), so the global index needs **no raw `markers/<map>.json` fetch**. Map ids come from `data/maps.json` (`maps[].name`); display names from the `maps` namespace (`t('maps:<id>.name')`).
- The map page reads `?map=`/`?marker=` once on mount from `window.location` (`MapRoute.tsx` `appliedDeepLink` guard), so marker selection uses a **full-page navigation** — reliable from the wiki and from the map page itself.

- [ ] **Step 1: Create the widget**

`frontend/apps/aion2/src/components/GlobalSearchWidget.tsx`:

```tsx
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import {
  GlobalSearch,
  type GlobalSearchEntry,
  type GlobalSearchSource,
} from "@gamemap/map-shell";
import i18n from "@/i18n";
import { loadGameData } from "@/lib/data";
import { loadWikiIndex } from "@/lib/wiki";

const WIKI_TYPES = ["quest", "npc", "item"] as const;
type WikiType = (typeof WIKI_TYPES)[number];

type NameBundle = Record<string, { name?: string; description?: string }>;

/** The current-language resource bundle of a data-repo namespace, loaded on demand. */
async function loadBundle(ns: string): Promise<NameBundle> {
  await i18n.loadNamespaces([ns]);
  const lng = i18n.resolvedLanguage ?? i18n.language;
  return (i18n.getResourceBundle(lng, ns) ?? {}) as NameBundle;
}

/**
 * Topbar global search: wiki entities (quest/NPC/item) + the markers of every
 * map. Wiki names and marker names both come from the data-repo locale
 * namespaces (marker locale files are keyed by marker id, so no raw marker
 * fetch is needed). Wiki picks route client-side; marker picks do a full-page
 * navigation because the map page reads its deep-link params once on mount.
 */
export default function GlobalSearchWidget() {
  const { t, i18n: i18next } = useTranslation("common");
  const lng = i18next.resolvedLanguage ?? i18next.language;
  const navigate = useNavigate();
  // markerId -> mapId, filled as a side effect of the markers source load.
  const markerNav = useRef(new Map<string, string>());

  const sources = useMemo<GlobalSearchSource[]>(() => {
    const wikiSource = (type: WikiType): GlobalSearchSource => ({
      key: `wiki-${type}`,
      label: t(`globalSearch.group.${type}`),
      load: async () => {
        const [{ docs }, names] = await Promise.all([
          loadWikiIndex(type),
          loadBundle(`wiki/${type}`),
        ]);
        return docs.map((d): GlobalSearchEntry => ({
          id: String(d.id),
          name: names[String(d.id)]?.name ?? "",
          detail: d.level ? `Lv.${d.level}` : undefined,
        }));
      },
    });

    const markersSource: GlobalSearchSource = {
      key: "markers",
      label: t("globalSearch.group.markers"),
      load: async () => {
        const { maps } = await loadGameData<{ maps: { name: string }[] }>(
          "data/maps.json",
        );
        await i18n.loadNamespaces(["maps"]);
        const entries: GlobalSearchEntry[] = [];
        for (const map of maps) {
          const bundle = await loadBundle(`markers/${map.name}`);
          const mapLabel = i18n.t(`maps:${map.name}.shortName`, {
            defaultValue: i18n.t(`maps:${map.name}.name`, { defaultValue: map.name }),
          });
          for (const [markerId, v] of Object.entries(bundle)) {
            if (!v?.name) continue;
            markerNav.current.set(markerId, map.name);
            entries.push({
              id: markerId,
              name: v.name,
              detail: [v.description, mapLabel].filter(Boolean).join(" · "),
            });
          }
        }
        return entries;
      },
    };

    return [...WIKI_TYPES.map(wikiSource), markersSource];
    // `lng` re-creates the sources on language change so GlobalSearch reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, lng]);

  const handleSelect = (sourceKey: string, id: string) => {
    if (sourceKey === "markers") {
      const mapId = markerNav.current.get(id);
      if (!mapId) return;
      // Full-page navigation: MapRoute applies ?map/?marker once on mount.
      window.location.assign(
        `/?map=${encodeURIComponent(mapId)}&marker=${encodeURIComponent(id)}`,
      );
      return;
    }
    const type = sourceKey.replace(/^wiki-/, "");
    void navigate({ to: "/wiki/$type/$slug", params: { type, slug: id } });
  };

  return (
    <GlobalSearch
      sources={sources}
      onSelect={handleSelect}
      lang={lng}
      labels={{
        button: t("globalSearch.button"),
        placeholder: t("globalSearch.placeholder"),
        empty: t("globalSearch.empty"),
        loading: t("globalSearch.loading"),
      }}
    />
  );
}
```

Type note: `WikiIndexDoc.level` — check `@/types/wiki`; if `level` is optional/absent on some types the `d.level ? …` guard already handles it, but if the TS type lacks `level` entirely, drop the `detail` line for wiki entries rather than fighting the type.

- [ ] **Step 2: Wire into TopNavbar**

In `frontend/apps/aion2/src/components/TopNavbar.tsx`:
- Add import: `import GlobalSearchWidget from "@/components/GlobalSearchWidget";`
- Add to the `<ShellTopBar …>` props (before `rightExtras`):

```tsx
      search={<GlobalSearchWidget />}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm lint:aion2`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/aion2/src/components/GlobalSearchWidget.tsx apps/aion2/src/components/TopNavbar.tsx
git commit -m "feat(aion2): topbar global search over wiki entities and all-map markers"
```

---

### Task 10: aion2 — e2e

**Files:**
- Create: `frontend/apps/aion2/e2e/global-search.spec.ts`

The test pins the language via the `?lng=` querystring (aion2's detector reads it first) and picks a known entity name from the served locale data itself, so it doesn't hardcode translated strings.

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";

// Topbar global search: wiki entities and markers, prefix-only matching.

test("finds a wiki NPC and navigates to its page", async ({ page, request }) => {
  // A real NPC name from the served locale data (language pinned to en-US).
  const npcNames = await request
    .get("/data/locales/en-US/wiki/npc.json")
    .then((r) => r.json() as Promise<Record<string, { name: string }>>);
  const [id, entry] = Object.entries(npcNames).find(([, v]) => v.name) ?? [];
  expect(id).toBeTruthy();

  await page.goto("/wiki?lng=en-US");
  await page.getByTestId("global-search-button").click();
  const input = page.getByTestId("global-search-input");
  await expect(input).toBeVisible();
  await input.fill(entry!.name);
  const hit = page
    .getByTestId("global-search-item")
    .filter({ hasText: entry!.name })
    .first();
  await expect(hit).toBeVisible({ timeout: 30_000 }); // first open loads all namespaces
  await hit.click();
  await expect(page).toHaveURL(new RegExp(`/wiki/npc/\\d+`));
});

test("finds a map marker and deep-links onto the map", async ({ page, request }) => {
  const markerNames = await request
    .get("/data/locales/en-US/markers/World_L_A.json")
    .then((r) => r.json() as Promise<Record<string, { name?: string }>>);
  const [markerId, entry] =
    Object.entries(markerNames).find(([, v]) => v.name) ?? [];
  expect(markerId).toBeTruthy();

  await page.goto("/wiki?lng=en-US");
  await page.getByTestId("global-search-button").click();
  await page.getByTestId("global-search-input").fill(entry!.name!);
  const hit = page.getByTestId("global-search-item").first();
  await expect(hit).toBeVisible({ timeout: 30_000 });
  await hit.click();
  // Marker picks do a full-page navigation to the map deep link.
  await page.waitForURL(/\/\?map=.+&marker=.+/);
  await expect(page.getByTestId("search-panel")).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run (aion2's default port 5173 may be taken by an unrelated app — always pin one):
`E2E_PORT=5183 pnpm e2e:aion2 -- global-search.spec.ts`
Expected: 2 PASS. Known pre-existing failure elsewhere: the wiki embedded-map POI test — ignore; run only this spec.

- [ ] **Step 3: Commit**

```bash
git add apps/aion2/e2e/global-search.spec.ts
git commit -m "test(aion2): e2e for topbar global search"
```

---

### Task 11: Full verification

- [ ] **Step 1: Unit tests** — `pnpm test` (from `frontend/`). Expected: all pass.
- [ ] **Step 2: Shell guard** — `pnpm run check:shell`. Expected: exit 0.
- [ ] **Step 3: Package typecheck** — `pnpm --filter @gamemap/map-shell check`. Expected: clean.
- [ ] **Step 4: Lints** — `pnpm lint:palworld && pnpm lint:aion2`. Expected: clean.
- [ ] **Step 5: Builds** — `pnpm build:palworld && pnpm build:aion2`. Expected: both succeed.
- [ ] **Step 6: e2e** — `pnpm e2e:palworld -- global-search.spec.ts` and `E2E_PORT=5183 pnpm e2e:aion2 -- global-search.spec.ts`. Expected: pass.
- [ ] **Step 7:** Fix anything that fails, commit fixes with scoped messages.

Merge-back (rebase onto master) and live testing on the running dev servers (aion2 → :15173, palworld → :15174 — probe before asking to start) happen after this plan completes, per the workspace conventions and the finishing-a-development-branch skill.
