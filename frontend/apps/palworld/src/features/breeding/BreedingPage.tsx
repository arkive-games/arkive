import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import {
  Button,
  Hint,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TooltipProvider,
  useIsMobile,
} from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { MobilePagination, useMobilePagination } from '../../components/MobilePagination'
import {
  buildChildIndex,
  comboKey,
  favKey,
  loadBreeding,
  makeEngine,
  queryFormulas,
  sanitizeTree,
  setSubtree,
  type BreedingData,
  type BreedTreeNode,
  type Combo,
  type NameMap,
  type TreePath,
} from '../../lib/breeding'
import { findChains } from '../../lib/breedingChains'
import { loadPals, type PalsBundle } from '../../lib/pals'
import { CatalogDataProvider } from '../catalog/components'
import { PalPicker } from './PalPicker'
import { BreedingTreeView } from './BreedingTreeView'
import { BreedingChainsView } from './BreedingChainsView'
import { RecipeCard, TileSep, buildRecipeMeta, type BreedingVariant } from './RecipeCard'
import { GenPicker, toGenChoice, type GenChoice } from './GenPicker'

// Cap on rendered cards; a target-only query can match >1000 parent pairs. Set
// above the default browse list (~365: every Pal + special combos) so that view
// is never truncated.
const RENDER_CAP = 500

const FAV_STORAGE_KEY = 'palworld.breeding.favs'
const LAST_CHAIN_GEN_STORAGE_KEY = 'palworld.breeding.lastChainGen'
const SEARCH_MEMORY_STORAGE_KEY = 'palworld.breeding.searchMemory'

interface BreedingSearchMemory {
  a?: string
  b?: string
  c?: string
  gen?: GenChoice
  routeGen?: number
}

export default function BreedingPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const isMobile = useIsMobile()

  // The URL query (?a=&b=&c=) is the source of truth for the selections, so a
  // pick updates the address bar and pushes a history entry (Back undoes it),
  // and the calculator can be opened prefilled from a Paldeck page.
  const search = useSearch({ from: '/breeding' })
  const navigate = useNavigate({ from: '/breeding' })
  const aSel = search.a ?? null
  const bSel = search.b ?? null
  const cSel = search.c ?? null
  // Multi-generation planner mode: active while a generation budget is set.
  const gen = search.gen ?? null
  const [selectedChainGeneration, setSelectedChainGeneration] = useState<number | null>(null)
  const searchMemoryReady = useRef(false)
  const [lastChainGen, setLastChainGen] = useState<GenChoice>(() => {
    if (search.gen != null) return toGenChoice(search.gen)
    try {
      return toGenChoice(Number(localStorage.getItem(LAST_CHAIN_GEN_STORAGE_KEY)))
    } catch {
      return 2
    }
  })

  useEffect(() => {
    if (searchMemoryReady.current) return
    searchMemoryReady.current = true
    if (aSel || bSel || cSel || gen != null) return

    try {
      const raw = sessionStorage.getItem(SEARCH_MEMORY_STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as BreedingSearchMemory
      const savedGen = [2, 3, 4, 5, 6].includes(Number(saved.gen)) ? toGenChoice(Number(saved.gen)) : undefined
      if (!saved.a && !saved.b && !saved.c && savedGen == null) return
      setSelectedChainGeneration(typeof saved.routeGen === 'number' ? saved.routeGen : null)
      navigate({
        search: {
          a: typeof saved.a === 'string' ? saved.a : undefined,
          b: typeof saved.b === 'string' ? saved.b : undefined,
          c: typeof saved.c === 'string' ? saved.c : undefined,
          gen: savedGen,
        },
        replace: true,
      })
    } catch {
      // A malformed or unavailable session store should behave like no memory.
    }
  }, [aSel, bSel, cSel, gen, navigate])

  useEffect(() => {
    if (!searchMemoryReady.current || (!aSel && !bSel && !cSel && gen == null)) return
    try {
      const memory: BreedingSearchMemory = {
        a: aSel ?? undefined,
        b: bSel ?? undefined,
        c: cSel ?? undefined,
        gen: gen ?? undefined,
        routeGen: selectedChainGeneration ?? undefined,
      }
      sessionStorage.setItem(SEARCH_MEMORY_STORAGE_KEY, JSON.stringify(memory))
    } catch {
      // Session storage can be unavailable in private browsing.
    }
  }, [aSel, bSel, cSel, gen, selectedChainGeneration])

  useEffect(() => {
    if (gen == null) return
    const next = toGenChoice(gen)
    setLastChainGen(next)
    try {
      localStorage.setItem(LAST_CHAIN_GEN_STORAGE_KEY, String(next))
    } catch {
      // Storage can be unavailable in private browsing; in-memory recall still works.
    }
  }, [gen])

  const setParam = useCallback(
    (key: 'a' | 'b' | 'c', id: string | null) => {
      // A picker change invalidates the drill-down (its root recipe belonged
      // to the previous query), so it also exits tree mode.
      navigate({ search: (prev) => ({ ...prev, [key]: id ?? undefined, tree: undefined }) })
    },
    [navigate],
  )

  const setMode = useCallback(
    (mode: 'recipes' | 'chains') => {
      // The planner has no Parent B and no drill-down; both are dropped on
      // entry. The A / Child selection survives mode switches.
      navigate({
        search: (prev) =>
          mode === 'chains'
            ? { a: prev.a, c: prev.c, gen: prev.gen ?? lastChainGen }
            : { a: prev.a, b: prev.b, c: prev.c },
      })
    },
    [lastChainGen, navigate],
  )

  const setGen = useCallback(
    (g: GenChoice) => {
      navigate({ search: (prev) => ({ ...prev, gen: g }) })
    },
    [navigate],
  )

  const clearSearch = useCallback(() => {
    try {
      sessionStorage.removeItem(SEARCH_MEMORY_STORAGE_KEY)
    } catch {
      // Clearing the visible state still works without session storage.
    }
    setSelectedChainGeneration(null)
    navigate({ search: gen != null ? { gen } : {} })
  }, [gen, navigate])

  const [payload, setPayload] = useState<{ data: BreedingData; names: NameMap } | null>(null)
  // Full Pal bundle, loaded only to power the pal hover cards on recipe chips.
  // A failure here is non-fatal — the cards just degrade to plain links.
  const [pals, setPals] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [favs, setFavs] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(FAV_STORAGE_KEY)
      return new Set(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify([...favs]))
    } catch { /* no storage */ }
  }, [favs])

  const toggleFav = useCallback((key: string) => {
    setFavs((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadBreeding(lng)
      .then((p) => {
        if (!cancelled) setPayload(p)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  useEffect(() => {
    let cancelled = false
    loadPals(lng)
      .then((b) => {
        if (!cancelled) setPals(b)
      })
      .catch((err) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [lng])

  const engine = useMemo(() => (payload ? makeEngine(payload.data) : null), [payload])

  // Drop any query selection that isn't a real roster Pal, and prune tree nodes
  // that don't resolve to real recipes anymore (replace, not push). The
  // drill-down tree doesn't exist in planner mode, so `gen` evicts `tree`.
  useEffect(() => {
    if (!payload || !engine) return
    const ids = new Set(payload.data.pals.map((p) => p.id))
    const keep = (v?: string) => (v && ids.has(v) ? v : undefined)
    const tree = search.tree && search.gen == null ? sanitizeTree(engine, ids, search.tree) : undefined
    const cleaned = { a: keep(search.a), b: keep(search.b), c: keep(search.c), tree, gen: search.gen, view: undefined }
    if (
      cleaned.a !== search.a ||
      cleaned.b !== search.b ||
      cleaned.c !== search.c ||
      cleaned.view !== search.view ||
      JSON.stringify(tree) !== JSON.stringify(search.tree)
    ) {
      navigate({ search: cleaned, replace: true })
    }
  }, [payload, engine, search.a, search.b, search.c, search.tree, search.gen, search.view, navigate])

  // child -> recipes index powering the tree sections. A full-roster scan
  // (~n²/2 pair resolutions), so it is only built when tree mode is entered;
  // the boolean dep keeps it stable across drill navigations.
  const treeActive = search.tree != null && gen == null
  const childIndex = useMemo(
    () => (engine && payload && treeActive ? buildChildIndex(engine, payload.data) : null),
    [engine, payload, treeActive],
  )

  const updateTree = useCallback(
    (path: TreePath, sub: BreedTreeNode | undefined) => {
      navigate({ search: (prev) => ({ ...prev, tree: setSubtree(prev.tree, path, sub) }) })
    },
    [navigate],
  )

  const meta = useMemo(() => buildRecipeMeta(payload?.data.pals ?? []), [payload])

  const result = useMemo(() => {
    if (!payload || !engine || gen != null) return { list: [] as Combo[], total: 0, browsingSpecial: false }
    return queryFormulas(engine, payload.data, { a: aSel, b: bSel, c: cSel })
  }, [payload, engine, aSel, bSel, cSel, gen])

  // Planner-mode chains: a couple of full-roster scans (~n²/2 resolutions,
  // <100 ms) per A/C/gen change — computed only while the mode is active.
  const chains = useMemo(
    () => (gen != null && payload && engine && aSel && cSel ? findChains(engine, payload.data, aSel, cSel, gen) : null),
    [gen, payload, engine, aSel, cSel],
  )
  const availableChainGenerations = useMemo(
    () =>
      chains
        ? [...new Set(chains.map((chain) => chain.steps.length))].filter((generation) => generation > 1).sort((a, b) => a - b)
        : [],
    [chains],
  )
  const chainGenerationCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const chain of chains ?? []) {
      const generation = chain.steps.length
      if (generation > 1) counts.set(generation, (counts.get(generation) ?? 0) + 1)
    }
    return counts
  }, [chains])
  const activeChainGeneration = useMemo(() => {
    if (!isMobile || availableChainGenerations.length === 0) return null
    return selectedChainGeneration != null && availableChainGenerations.includes(selectedChainGeneration)
      ? selectedChainGeneration
      : availableChainGenerations[0]
  }, [availableChainGenerations, isMobile, selectedChainGeneration])
  const displayedChains = useMemo(
    () =>
      chains && activeChainGeneration != null
        ? chains.filter((chain) => chain.steps.length === activeChainGeneration)
        : chains,
    [activeChainGeneration, chains],
  )
  const resultSummary =
    gen != null
      ? chains
        ? `${t('total')} ${t('breeding.chainCount', {
            count: chains.reduce(
              (count, chain) => count + (chain.steps.length === 1 ? chain.steps[0].partners.length : 1),
              0,
            ),
          })}`
        : t('breeding.chainPrompt')
      : result.browsingSpecial
        ? t('breeding.showingSpecial')
        : result.total === 0
          ? t('breeding.zeroRouteSummary', { count: result.total })
          : t('breeding.chainCount', { count: result.total })

  const hasFilter = aSel != null || bSel != null || cSel != null

  // Same filter + sort as everything else, but favourites float to the top
  // (stable partition preserves the sorted order within each group).
  const ordered = useMemo(() => {
    if (favs.size === 0) return result.list
    const fav: Combo[] = []
    const rest: Combo[] = []
    for (const f of result.list) (favs.has(favKey(f)) ? fav : rest).push(f)
    return [...fav, ...rest]
  }, [result.list, favs])
  const mobilePaging = useMobilePagination(ordered, {
    pageSize: 20,
    resetKey: `${aSel ?? ''}|${bSel ?? ''}|${cSel ?? ''}`,
  })
  const shown = mobilePaging.isMobile ? mobilePaging.visibleItems : ordered.slice(0, RENDER_CAP)

  const pickerLabels = {
    anyPal: t('breeding.anyPal'),
    searchPal: t('breeding.searchPal'),
    noPalFound: t('breeding.noPalFound'),
  }

  // Phone pickers keep the three-slot formula, while result cards use the
  // denser row layout shared with the multi-generation results.
  const pickerVariant: BreedingVariant = isMobile ? 'tile' : 'row'
  const resultVariant: BreedingVariant = isMobile ? 'compact' : 'row'
  const pickerProps = {
    pals: payload?.data.pals ?? [],
    names: payload?.names ?? {},
    labels: pickerLabels,
    variant: pickerVariant,
  }
  const pickerA = (
    <PalPicker
      {...pickerProps}
      slot="a"
      label={t('breeding.parentA')}
      value={aSel}
      onChange={(id) => setParam('a', id)}
    />
  )
  const pickerB = (
    <PalPicker
      {...pickerProps}
      slot="b"
      label={t('breeding.parentB')}
      value={bSel}
      onChange={(id) => setParam('b', id)}
    />
  )
  const pickerC = (
    <PalPicker
      {...pickerProps}
      slot="c"
      label={t('breeding.child')}
      value={cSel}
      onChange={(id) => setParam('c', id)}
    />
  )
  // Phone: the budget sits below the source-to-target selection row.
  const genTile =
    gen == null ? null : (
      <GenPicker
        label={t('breeding.maxGenerations')}
        value={toGenChoice(gen)}
        onChange={setGen}
        format={(g) => String(g)}
      />
    )
  // Desktop keeps the labelled select next to the wide comboboxes.
  const genControl =
    gen == null ? null : (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('breeding.maxGenerations')}</span>
        <Select
          value={String(gen)}
          onValueChange={(v) => {
            const n = Number(v)
            setGen(n === 3 ? 3 : n === 4 ? 4 : n === 5 ? 5 : n === 6 ? 6 : 2)
          }}
        >
          <SelectTrigger className="!h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">2</SelectItem>
            <SelectItem value="3">3</SelectItem>
            <SelectItem value="4">4</SelectItem>
            <SelectItem value="5">5</SelectItem>
            <SelectItem value="6">6</SelectItem>
          </SelectContent>
        </Select>
      </div>
    )

  return (
    <TooltipProvider delayDuration={200}>
      <ContentPage active="/breeding" title={t('breeding.navBreeding')} heading hideMobileFooter>
        <CatalogDataProvider pals={pals ?? undefined}>
          <div className="mb-3 inline-flex items-center gap-0.5 rounded-lg border border-primary/30 bg-primary/5 p-0.5">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={gen == null}
              className={gen == null ? 'bg-primary !text-white hover:bg-primary/90 hover:!text-white' : 'text-primary hover:bg-primary/10 hover:text-primary'}
              onClick={() => setMode('recipes')}
            >
              {t('breeding.modeRecipes')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={gen != null}
              className={gen != null ? 'bg-primary !text-white hover:bg-primary/90 hover:!text-white' : 'text-primary hover:bg-primary/10 hover:text-primary'}
              onClick={() => setMode('chains')}
            >
              {t('breeding.modeChains')}
            </Button>
          </div>
          {isMobile ? (
            // Recipes retain the familiar A + B = C equation. Planner mode
            // gives the source and target enough width for full Pal identity,
            // then places the generation budget in a compact secondary row.
            gen == null ? (
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1"
                data-testid="breeding-picker-row"
              >
                {pickerA}
                <TileSep>+</TileSep>
                {pickerB}
                <TileSep>=</TileSep>
                {pickerC}
              </div>
            ) : (
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1"
                data-testid="breeding-picker-row"
              >
                {pickerA}
                <TileSep>+</TileSep>
                {genTile}
                <TileSep>=</TileSep>
                {pickerC}
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {pickerA}
              {gen == null ? pickerB : null}
              {pickerC}
              {genControl}
            </div>
          )}

          <div className="mt-4 flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
              <span className="min-w-0 flex-1">{resultSummary}</span>
              {/* Same badge as the Passive Skills page; the tip covers the
                  breeding side. `Hint`, not a bare tooltip: the badge is inert,
                  so on a phone it becomes the tap target for a bottom sheet —
                  hover never fires there and the explanation was unreachable. */}
              <Hint
                title={t('passive.mutation')}
                content={t('breeding.mutationTip')}
                contentClassName="max-w-xs"
              >
                <span
                  data-testid="breeding-mutation-info"
                  className="inline-flex cursor-help items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-xs font-medium text-violet-600 ring-1 ring-inset ring-violet-500/30 dark:text-violet-300"
                >
                  <span className="inline-block size-1.5 rounded-full bg-violet-500" />
                  {t('passive.mutation')}
                </span>
              </Hint>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {search.tree ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate({ search: (prev) => ({ ...prev, tree: undefined }) })}
                >
                  <ArrowLeft className="size-4" />
                  {t('breeding.allRecipes')}
                </Button>
              ) : null}
              {hasFilter ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSearch}
                >
                  {t('breeding.clear')}
                </Button>
              ) : null}
            </span>
          </div>
          {isMobile && availableChainGenerations.length > 0 ? (
            <div
              className="mt-3 flex items-center gap-2 overflow-x-auto pb-1"
              role="navigation"
              aria-label={t('breeding.modeChains')}
            >
              {availableChainGenerations.map((generation) => {
                const selected = generation === activeChainGeneration
                return (
                  <Button
                    key={generation}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={selected}
                    data-testid={`breeding-generation-jump-${generation}`}
                    className={
                      selected
                        ? 'shrink-0 gap-1.5 border-primary bg-primary !text-white hover:bg-primary/90 hover:!text-white'
                        : 'shrink-0 gap-1.5 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary'
                    }
                    onClick={() => setSelectedChainGeneration(generation)}
                  >
                    <span>
                      {t('breeding.chainNGen', { count: generation })}
                      {lng.startsWith('zh') ? '（' : ' ('}
                      {chainGenerationCounts.get(generation) ?? 0}
                      {lng.startsWith('zh') ? '）' : ')'}
                    </span>
                  </Button>
                )
              })}
            </div>
          ) : null}

          {loadError ? (
            <div className="mt-8 text-center text-destructive">{loadError}</div>
          ) : gen != null ? (
            !aSel || !cSel ? (
              <div className="mt-8 text-center text-sm text-muted-foreground">{t('breeding.chainPrompt')}</div>
            ) : chains && chains.length === 0 ? (
              <div className="mt-8 text-center text-sm text-muted-foreground">
                {t('breeding.noChains', { count: gen })}
              </div>
            ) : chains && displayedChains ? (
              <BreedingChainsView
                // Remount on a query change to reset per-group and per-step caps.
                key={`${aSel}|${cSel}|${gen}|${activeChainGeneration ?? 'all'}`}
                chains={displayedChains}
                names={payload?.names ?? {}}
                meta={meta}
                uniqueLabel={t('breeding.unique')}
                favs={favs}
                onToggleFav={toggleFav}
                favLabel={t('breeding.favorite')}
                variant={pickerVariant}
                hideMultiGroupHeader={activeChainGeneration != null}
              />
            ) : null
          ) : search.tree && engine && childIndex ? (
            <BreedingTreeView
              root={search.tree}
              engine={engine}
              index={childIndex}
              names={payload?.names ?? {}}
              meta={meta}
              uniqueLabel={t('breeding.unique')}
              selectLabel={t('breeding.expandRecipe')}
              onChange={updateTree}
              variant={resultVariant}
            />
          ) : (
            <>
              <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
                {shown.map((f) => {
                  return (
                    <RecipeCard
                      key={comboKey(f)}
                      f={f}
                      names={payload?.names ?? {}}
                      meta={meta}
                      uniqueLabel={t('breeding.unique')}
                      variant={resultVariant}
                    />
                  )
                })}
              </div>
              {!mobilePaging.isMobile && result.total > shown.length ? (
                <div className="mt-3 text-center text-sm text-muted-foreground">
                  {t('breeding.more', { count: result.total - shown.length })}
                </div>
              ) : null}
              <MobilePagination
                page={mobilePaging.page}
                pageCount={mobilePaging.pageCount}
                onPageChange={mobilePaging.goToPage}
              />
            </>
          )}
        </CatalogDataProvider>
      </ContentPage>
    </TooltipProvider>
  )
}
