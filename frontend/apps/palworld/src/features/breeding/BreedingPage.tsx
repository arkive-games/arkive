import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft, List, ListTree } from 'lucide-react'
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
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
import { BreedingChainsTreeView, BreedingChainsView } from './BreedingChainsView'
import { RecipeCard, buildRecipeMeta } from './RecipeCard'

// Cap on rendered cards; a target-only query can match >1000 parent pairs. Set
// above the default browse list (~365: every Pal + special combos) so that view
// is never truncated.
const RENDER_CAP = 500

const FAV_STORAGE_KEY = 'palworld.breeding.favs'

export default function BreedingPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

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
          mode === 'chains' ? { a: prev.a, c: prev.c, gen: prev.gen ?? 2 } : { a: prev.a, b: prev.b, c: prev.c },
      })
    },
    [navigate],
  )

  const setGen = useCallback(
    (g: 2 | 3 | 4 | 5 | 6) => {
      navigate({ search: (prev) => ({ ...prev, gen: g }) })
    },
    [navigate],
  )

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
    // The tree layout (`view`) only exists in planner mode.
    const view = search.gen != null ? search.view : undefined
    const cleaned = { a: keep(search.a), b: keep(search.b), c: keep(search.c), tree, gen: search.gen, view }
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
  const shown = ordered.slice(0, RENDER_CAP)

  const pickerLabels = {
    anyPal: t('breeding.anyPal'),
    searchPal: t('breeding.searchPal'),
    noPalFound: t('breeding.noPalFound'),
  }

  return (
    <TooltipProvider delayDuration={200}>
      <ContentPage active="/breeding" title={t('breeding.navBreeding')} heading>
        <CatalogDataProvider pals={pals ?? undefined}>
          <div className="mb-3 inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
            <Button variant={gen == null ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode('recipes')}>
              {t('breeding.modeRecipes')}
            </Button>
            <Button variant={gen == null ? 'ghost' : 'secondary'} size="sm" onClick={() => setMode('chains')}>
              {t('breeding.modeChains')}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <PalPicker
              label={t('breeding.parentA')}
              pals={payload?.data.pals ?? []}
              names={payload?.names ?? {}}
              value={aSel}
              onChange={(id) => setParam('a', id)}
              labels={pickerLabels}
            />
            {gen == null ? (
              <PalPicker
                label={t('breeding.parentB')}
                pals={payload?.data.pals ?? []}
                names={payload?.names ?? {}}
                value={bSel}
                onChange={(id) => setParam('b', id)}
                labels={pickerLabels}
              />
            ) : null}
            <PalPicker
              label={t('breeding.child')}
              pals={payload?.data.pals ?? []}
              names={payload?.names ?? {}}
              value={cSel}
              onChange={(id) => setParam('c', id)}
              labels={pickerLabels}
            />
            {gen != null ? (
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
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {gen != null
                ? chains
                  ? // Direct recipes count individually (the group renders one card
                    // per partner); a multi-step chain is one entry.
                    t('breeding.chainCount', {
                      count: chains.reduce(
                        (n, ch) => n + (ch.steps.length === 1 ? ch.steps[0].partners.length : 1),
                        0,
                      ),
                    })
                  : t('breeding.chainPrompt')
                : result.browsingSpecial
                  ? t('breeding.showingSpecial')
                  : t('breeding.combinations', { count: result.total })}
              {/* Same badge as the Passive Skills page; the tip covers the breeding side. */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    data-testid="breeding-mutation-info"
                    className="inline-flex cursor-help items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-xs font-medium text-violet-600 ring-1 ring-inset ring-violet-500/30 dark:text-violet-300"
                  >
                    <span className="inline-block size-1.5 rounded-full bg-violet-500" />
                    {t('passive.mutation')}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{t('breeding.mutationTip')}</TooltipContent>
              </Tooltip>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {gen != null && chains && chains.length > 0 ? (
                <span className="mr-1 inline-flex items-center gap-0.5 rounded-md border border-border p-0.5">
                  <Button
                    variant={search.view === 'tree' ? 'ghost' : 'secondary'}
                    size="icon"
                    className="size-7"
                    aria-label={t('breeding.viewList')}
                    title={t('breeding.viewList')}
                    onClick={() => navigate({ search: (prev) => ({ ...prev, view: undefined }) })}
                  >
                    <List className="size-4" />
                  </Button>
                  <Button
                    variant={search.view === 'tree' ? 'secondary' : 'ghost'}
                    size="icon"
                    className="size-7"
                    aria-label={t('breeding.viewTree')}
                    title={t('breeding.viewTree')}
                    onClick={() => navigate({ search: (prev) => ({ ...prev, view: 'tree' }) })}
                  >
                    <ListTree className="size-4" />
                  </Button>
                </span>
              ) : null}
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
                  onClick={() => navigate({ search: gen != null ? { gen } : {} })}
                >
                  {t('breeding.clear')}
                </Button>
              ) : null}
            </span>
          </div>

          {loadError ? (
            <div className="mt-8 text-center text-destructive">{loadError}</div>
          ) : gen != null ? (
            !aSel || !cSel ? (
              <div className="mt-8 text-center text-sm text-muted-foreground">{t('breeding.chainPrompt')}</div>
            ) : chains && chains.length === 0 ? (
              <div className="mt-8 text-center text-sm text-muted-foreground">
                {t('breeding.noChains', { count: gen })}
              </div>
            ) : chains && search.view === 'tree' ? (
              <BreedingChainsTreeView
                // Remount on a query change to reset the reveal caps.
                key={`${aSel}|${cSel}|${gen}`}
                chains={chains}
                names={payload?.names ?? {}}
                meta={meta}
                uniqueLabel={t('breeding.unique')}
              />
            ) : chains ? (
              <BreedingChainsView
                // Remount on a query change to reset per-group and per-step caps.
                key={`${aSel}|${cSel}|${gen}`}
                chains={chains}
                names={payload?.names ?? {}}
                meta={meta}
                uniqueLabel={t('breeding.unique')}
                favs={favs}
                onToggleFav={toggleFav}
                favLabel={t('breeding.favorite')}
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
            />
          ) : (
            <>
              <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
                {shown.map((f) => {
                  const fk = favKey(f)
                  return (
                    <RecipeCard
                      key={comboKey(f)}
                      f={f}
                      names={payload?.names ?? {}}
                      meta={meta}
                      uniqueLabel={t('breeding.unique')}
                      fav={{ isFav: favs.has(fk), onToggle: () => toggleFav(fk), label: t('breeding.favorite') }}
                      onSelect={() => updateTree([], { a: f.a, b: f.b, ag: f.ag, bg: f.bg })}
                      selectLabel={t('breeding.expandRecipe')}
                    />
                  )
                })}
              </div>
              {result.total > shown.length ? (
                <div className="mt-3 text-center text-sm text-muted-foreground">
                  {t('breeding.more', { count: result.total - shown.length })}
                </div>
              ) : null}
            </>
          )}
        </CatalogDataProvider>
      </ContentPage>
    </TooltipProvider>
  )
}
