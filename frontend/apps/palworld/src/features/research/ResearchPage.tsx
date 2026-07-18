import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ContentPage } from '../../components/ContentPage'
import {
  loadItems,
  loadResearch,
  loadTech,
  type ItemsBundle,
  type ResearchBundle,
  type TechBundle,
} from '../../lib/catalog'
import { loadPals, type PalsBundle, type WorkType } from '../../lib/pals'
import { workIconUrl } from '../../lib/assets'
import {
  CatalogDataProvider,
  CatalogPageLoading,
  MaterialChip,
} from '../catalog/components'
import { IconImg } from '../pals/components/atoms'

/** Research Lab catalog: every lab project grouped by its work-suitability
 *  category — effect, material costs, lab work, prerequisite chain, and the
 *  technologies a gate project unlocks (inverse of `tech.requireResearch`). */
export default function ResearchPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [research, setResearch] = useState<ResearchBundle | null>(null)
  const [items, setItems] = useState<ItemsBundle | null>(null)
  const [tech, setTech] = useState<TechBundle | null>(null)
  const [pals, setPals] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  // Category groups in first-seen (game) order.
  const groups = useMemo(() => {
    if (!research) return []
    const order: string[] = []
    const byCat = new Map<string, typeof research.projects>()
    for (const p of research.projects) {
      if (!byCat.has(p.category)) {
        byCat.set(p.category, [])
        order.push(p.category)
      }
      byCat.get(p.category)!.push(p)
    }
    return order.map((cat) => ({ cat, projects: byCat.get(cat)! }))
  }, [research])

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

  return (
    <ContentPage
      active="/research"
      title={t('research.title', { defaultValue: 'Research' })}
      heading
      maxWidth="max-w-5xl"
    >
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !research || !items || !tech || !pals ? (
        <CatalogPageLoading />
      ) : (
        <CatalogDataProvider items={items} tech={tech} pals={pals}>
          <p className="mb-4 text-sm text-muted-foreground">
            {t('research.caption', {
              defaultValue:
                'Research Lab projects by work category: the buff granted, material cost, lab work, and prerequisite chain.',
            })}
          </p>
          <div className="space-y-8">
            {groups.map(({ cat, projects }) => (
              <section key={cat}>
                <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
                  <IconImg src={workIconUrl(cat as WorkType)} alt="" size={20} />
                  {pals.enums.work[cat as WorkType] ?? cat}
                  <span className="text-sm font-normal text-muted-foreground">
                    {projects.length}
                  </span>
                </h2>
                <div className="divide-y divide-border/60 rounded-lg border border-border bg-card">
                  {projects.map((p) => (
                    <div key={p.id} className="px-4 py-3" data-testid="research-row">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-medium">{research.text[p.id]?.name ?? p.id}</span>
                        {p.effect ? (
                          <span className="text-sm text-emerald-600 dark:text-emerald-400">
                            {t(`research.effect.${p.effect.type}`, { defaultValue: p.effect.type })}{' '}
                            <span className="tabular-nums">+{p.effect.value}%</span>
                            {p.effect.work ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({pals.enums.work[p.effect.work as WorkType] ?? p.effect.work})
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        {p.essential ? (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-300">
                            {t('research.essential', { defaultValue: 'Essential' })}
                          </span>
                        ) : null}
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {t('research.work', { defaultValue: 'Work' })}: {p.work}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {p.materials.map((m) => (
                          <MaterialChip
                            key={m.item}
                            id={m.item}
                            name={items.text[m.item]?.name ?? m.item}
                            icon={items.byId.get(m.item)?.icon}
                            count={m.count}
                          />
                        ))}
                        {p.requires ? (
                          <span className="text-xs text-muted-foreground">
                            {t('research.requires', { defaultValue: 'Requires' })}:{' '}
                            {research.text[p.requires]?.name ?? p.requires}
                          </span>
                        ) : null}
                        {(techsByResearch.get(p.id) ?? []).map((tid) => (
                          <Link
                            key={tid}
                            to="/technology"
                            search={{ tech: tid }}
                            className="rounded bg-sky-500/15 px-1.5 py-0.5 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400"
                          >
                            {t('research.unlocksTech', { defaultValue: 'Unlocks' })}:{' '}
                            {tech.text[tid]?.name ?? tid}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </CatalogDataProvider>
      )}
    </ContentPage>
  )
}
