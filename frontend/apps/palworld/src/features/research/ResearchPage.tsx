import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { cn, useIsMobile } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import {
  loadItems,
  loadResearch,
  loadTech,
  type ItemsBundle,
  type ResearchBundle,
  type ResearchProject,
  type TechBundle,
} from '../../lib/catalog'
import { loadPals, type PalsBundle, type WorkType } from '../../lib/pals'
import { workIconUrl } from '../../lib/assets'
import { buildResearchTrees, type ResearchTreeNode } from '../../lib/researchTree'
import {
  CatalogDataProvider,
  CatalogPageLoading,
  ItemGlyph,
  ItemHover,
} from '../catalog/components'
import { IconImg } from '../pals/components/atoms'

/** Compact material cost chip for tree nodes: item icon + count only (the
 *  name shows in the hover card / on the linked item page). */
function MaterialGlyph({ id, icon, count }: { id: string; icon?: string; count: number }) {
  return (
    <ItemHover id={id}>
      <Link
        to="/items/$id"
        params={{ id }}
        className="inline-flex items-center gap-0.5 rounded-md border border-border bg-secondary/40 px-1 py-0.5 transition hover:border-primary/60 hover:bg-accent"
      >
        {icon ? <ItemGlyph icon={icon} size={16} /> : null}
        <span className="text-xs tabular-nums text-muted-foreground">×{count}</span>
      </Link>
    </ItemHover>
  )
}

function NodeCard({
  p,
  research,
  items,
  tech,
  pals,
  techIds,
  mobile = false,
}: {
  p: ResearchProject
  research: ResearchBundle
  items: ItemsBundle
  tech: TechBundle
  pals: PalsBundle
  techIds: string[]
  mobile?: boolean
}) {
  const { t } = useTranslation()
  const v = p.effect?.value ?? 0
  return (
    <div
      className={cn(
        'rounded-lg border bg-card px-2.5 py-2 shadow-sm',
        mobile ? 'w-full border-primary/25' : 'w-44',
        p.essential ? 'border-amber-400/60' : !mobile && 'border-border',
      )}
      data-testid="research-node"
    >
      <div className="text-sm font-medium leading-tight">
        {research.text[p.id]?.name ?? p.id}
      </div>
      {p.effect ? (
        <div className="mt-1 text-xs leading-tight text-emerald-600 dark:text-emerald-400">
          {t(`research.effect.${p.effect.type}`, { defaultValue: p.effect.type })}{' '}
          <span className="tabular-nums">{v > 0 ? `+${v}` : v}%</span>
          {p.effect.work ? (
            <span className="ml-1 text-muted-foreground">
              ({pals.enums.work[p.effect.work as WorkType] ?? p.effect.work})
            </span>
          ) : null}
        </div>
      ) : null}
      {p.essential ? (
        <div className="mt-1">
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-300">
            {t('research.essential')}
          </span>
        </div>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {p.materials.map((m) => (
          <MaterialGlyph key={m.item} id={m.item} icon={items.byId.get(m.item)?.icon} count={m.count} />
        ))}
      </div>
      <div className="mt-1 text-xs tabular-nums text-muted-foreground">
        {t('research.work')}: {p.work.toLocaleString()}
      </div>
      {techIds.map((tid) => (
        <Link
          key={tid}
          to="/technology"
          search={{ tech: tid }}
          className="mt-1 block text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
        >
          {t('research.unlocksTech')}: {tech.text[tid]?.name ?? tid}
        </Link>
      ))}
    </div>
  )
}

/** Mobile research hierarchy. It preserves prerequisite order without making
 * the user pan across a desktop-width tree. */
function MobileTreeNode({
  node,
  research,
  items,
  tech,
  pals,
  techsByResearch,
}: {
  node: ResearchTreeNode
  research: ResearchBundle
  items: ItemsBundle
  tech: TechBundle
  pals: PalsBundle
  techsByResearch: Map<string, string[]>
}) {
  return (
    <div className="min-w-0">
      <NodeCard
        p={node.project}
        research={research}
        items={items}
        tech={tech}
        pals={pals}
        techIds={techsByResearch.get(node.project.id) ?? []}
        mobile
      />
      {node.children.length ? (
        <div className="ml-3 mt-2 space-y-2 border-l border-primary/30 pl-3">
          {node.children.map((child) => (
            <MobileTreeNode
              key={child.project.id}
              node={child}
              research={research}
              items={items}
              tech={tech}
              pals={pals}
              techsByResearch={techsByResearch}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** One tree node plus its subtree, with in-game-style right-angle connector
 *  lines: a stub below the parent, a rail across the children row, and a stub
 *  into each child. */
function TreeNode({
  node,
  research,
  items,
  tech,
  pals,
  techsByResearch,
}: {
  node: ResearchTreeNode
  research: ResearchBundle
  items: ItemsBundle
  tech: TechBundle
  pals: PalsBundle
  techsByResearch: Map<string, string[]>
}) {
  const kids = node.children
  return (
    <div className="flex flex-col items-center">
      <NodeCard
        p={node.project}
        research={research}
        items={items}
        tech={tech}
        pals={pals}
        techIds={techsByResearch.get(node.project.id) ?? []}
      />
      {kids.length ? (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-start">
            {kids.map((child, i) => (
              <div key={child.project.id} className="flex flex-col">
                <div className="relative h-4">
                  {kids.length > 1 ? (
                    <div
                      className={
                        'absolute top-0 h-px bg-border ' +
                        (i === 0
                          ? 'left-1/2 right-0'
                          : i === kids.length - 1
                            ? 'left-0 right-1/2'
                            : 'left-0 right-0')
                      }
                    />
                  ) : null}
                  <div className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-border" />
                </div>
                <div className="px-1.5">
                  <TreeNode
                    node={child}
                    research={research}
                    items={items}
                    tech={tech}
                    pals={pals}
                    techsByResearch={techsByResearch}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function countNodes(node: ResearchTreeNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0)
}

/** Research Lab catalog: one tab per work-suitability category, rendering the
 *  category's projects as the in-game prerequisite tree — effect, material
 *  costs, lab work, and the technologies a gate project unlocks (inverse of
 *  `tech.requireResearch`). */
export default function ResearchPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const isMobile = useIsMobile()

  const [research, setResearch] = useState<ResearchBundle | null>(null)
  const [items, setItems] = useState<ItemsBundle | null>(null)
  const [tech, setTech] = useState<TechBundle | null>(null)
  const [pals, setPals] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeCat, setActiveCat] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadResearch(lng), loadItems(lng), loadTech(lng), loadPals(lng)])
      .then(([r, i, tc, p]) => {
        if (cancelled) return
        setResearch(r)
        setItems(i)
        setTech(tc)
        setPals(p)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  // One prerequisite tree per category, in first-seen (game) order.
  const trees = useMemo(
    () => (research ? buildResearchTrees(research.projects) : []),
    [research],
  )

  // Technologies gated behind each research project (tech.requireResearch inverse).
  const techsByResearch = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const te of tech?.techs ?? []) {
      if (te.requireResearch) {
        const list = out.get(te.requireResearch) ?? []
        list.push(te.id)
        out.set(te.requireResearch, list)
      }
    }
    return out
  }, [tech])

  const current = trees.find((tr) => tr.category === activeCat) ?? trees[0]

  return (
    <ContentPage
      active="/research"
      title={t('research.title')}
      heading
      maxWidth="max-w-5xl"
    >
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !research || !items || !tech || !pals ? (
        <CatalogPageLoading />
      ) : (
        <CatalogDataProvider items={items} tech={tech} pals={pals}>
          <p className="mb-4 text-sm text-muted-foreground">{t('research.caption')}</p>
          <div
            className="-mx-4 mb-5 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 touch-pan-x md:mx-0 md:mb-6 md:flex-wrap md:px-0"
            role="tablist"
          >
            {trees.map(({ category, roots }) => {
              const active = category === current?.category
              const count = roots.reduce((sum, r) => sum + countNodes(r), 0)
              return (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveCat(category)}
                  className={
                    'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition ' +
                    (active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10')
                  }
                >
                  <IconImg src={workIconUrl(category as WorkType)} alt="" size={16} />
                  {pals.enums.work[category as WorkType] ?? category}
                  <span
                    className={
                      'text-xs tabular-nums ' +
                      (active ? 'text-primary-foreground/70' : 'text-muted-foreground')
                    }
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
          {current ? (
            isMobile ? (
              <div className="space-y-4" data-testid="mobile-research-tree">
                {current.roots.map((root) => (
                  <MobileTreeNode
                    key={root.project.id}
                    node={root}
                    research={research}
                    items={items}
                    tech={tech}
                    pals={pals}
                    techsByResearch={techsByResearch}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto pb-4">
                <div className="flex min-w-full justify-center">
                  <div className="w-max space-y-8">
                    {current.roots.map((root) => (
                      <TreeNode
                        key={root.project.id}
                        node={root}
                        research={research}
                        items={items}
                        tech={tech}
                        pals={pals}
                        techsByResearch={techsByResearch}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : null}
        </CatalogDataProvider>
      )}
    </ContentPage>
  )
}
