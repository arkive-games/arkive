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
