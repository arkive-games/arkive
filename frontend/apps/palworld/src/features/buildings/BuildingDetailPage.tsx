import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from '@tanstack/react-router'
import { ContentPage } from '../../components/ContentPage'
import {
  loadItems,
  loadBuildings,
  loadTech,
  buildingIconUrl,
  type ItemsBundle,
  type BuildingsBundle,
  type TechBundle,
} from '../../lib/catalog'
import { loadPals, type PalsBundle } from '../../lib/pals'
import { loadRecycler, type RecyclerFile } from '../../lib/recycler'
import { RecyclerComparisonSection } from '../recycler/RecyclerSections'
import { buildingTypeLabel, energyLabel } from '../catalog/labels'
import {
  CatalogSection,
  InfoRows,
  StatRow,
  CatalogPageLoading,
  CatalogNotFound,
  CatalogDataProvider,
  ItemLink,
  MaterialChip,
} from '../catalog/components'
import { RevealFooter } from '../catalog/RevealFooter'
import { useIncrementalList } from '../catalog/useIncrementalList'
import { buildingUnlockLevel, makeTechResolvers } from '../technology/techModel'
import { TechChip } from '../technology/components/TechChip'

interface Bundles {
  items: ItemsBundle
  buildings: BuildingsBundle
  tech: TechBundle
  pals: PalsBundle
}

export default function BuildingDetailPage() {
  const { id } = useParams({ from: '/buildings/$id' })
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [b, setB] = useState<Bundles | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Relic-recycler conversion odds. Loaded separately and best-effort: the
  // page renders fully without it (only the recycler building shows it).
  const [recycler, setRecycler] = useState<RecyclerFile | null>(null)

  useEffect(() => {
    let cancelled = false
    loadRecycler()
      .then((r) => { if (!cancelled) setRecycler(r) })
      .catch((err) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadItems(lng), loadBuildings(lng), loadTech(lng), loadPals(lng)])
      .then(([items, buildings, tech, pals]) => {
        if (!cancelled) setB({ items, buildings, tech, pals })
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  // Items craftable at this building — the reverse of item.recipe.craftedAt
  // (the dataset only stores the relation on the item side). Stable game
  // inventory order (SortId), identical across languages.
  const crafts = useMemo(() => {
    if (!b) return []
    return b.items.items
      .filter((i) => !i.illegal && i.recipe?.craftedAt?.includes(id))
      .sort((x, y) => x.sortId - y.sortId || x.id.localeCompare(y.id))
  }, [b, id])

  // Production stations craft up to ~900 items (AncientWorkBench) — reveal
  // the chip list incrementally like the item grid.
  const craftsReveal = useIncrementalList(crafts, `building.${id}.crafts`)

  let body: React.ReactNode
  if (loadError) {
    body = <div className="text-center text-destructive">{loadError}</div>
  } else if (!b) {
    body = <CatalogPageLoading />
  } else {
    const bld = b.buildings.byId.get(id)
    if (!bld) {
      body = (
        <CatalogNotFound
          message={t('building.notFound', { id })}
          to="/buildings"
          backLabel={t('building.backToList')}
        />
      )
    } else {
      const iname = (iid: string) => b.items.text[iid]?.name ?? iid
      const techResolvers = makeTechResolvers(b.items, b.buildings, b.tech, b.pals)
      const text = b.buildings.text[id]
      const energy = bld.energyType ? energyLabel(bld.energyType, b.buildings.energyLabels) : ''
      const level = buildingUnlockLevel(bld, b.tech)

      body = (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            {bld.icon ? (
              <img
                src={buildingIconUrl(bld.icon)}
                alt=""
                className="size-16 shrink-0 object-contain"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : null}
            <div className="min-w-0">
              <div className="text-sm text-muted-foreground">{buildingTypeLabel(bld.typeA, b.buildings.typeLabels)}</div>
              <h1 className="text-3xl font-bold">{text?.name ?? bld.id}</h1>
              <div className="mt-0.5 font-mono text-xs text-muted-foreground">{bld.id}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
            {/* Main column */}
            <div className="space-y-6 md:order-1">
              {text?.description ? (
                <CatalogSection title={t('building.section.description')}>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{text.description}</p>
                </CatalogSection>
              ) : null}

              {bld.materials.length ? (
                <CatalogSection title={t('building.section.materials')}>
                  <div className="flex flex-wrap gap-1.5">
                    {bld.materials.map((m) => (
                      <MaterialChip key={m.item} id={m.item} name={iname(m.item)} count={m.count} />
                    ))}
                  </div>
                </CatalogSection>
              ) : null}

              {bld.unlockTech?.length ? (
                <CatalogSection title={t('building.fromTech')}>
                  <div className="flex flex-wrap gap-1.5">
                    {bld.unlockTech.map((tid) => {
                      const entry = b.tech.byId.get(tid)
                      return entry ? (
                        <TechChip key={tid} tech={entry} resolvers={techResolvers} />
                      ) : null
                    })}
                  </div>
                </CatalogSection>
              ) : null}

              {crafts.length ? (
                <CatalogSection title={`${t('building.section.crafts')} · ${crafts.length}`}>
                  <div className="flex flex-wrap gap-1.5">
                    {craftsReveal.shown.map((i) => (
                      <ItemLink key={i.id} id={i.id} name={iname(i.id)} icon={i.icon} />
                    ))}
                  </div>
                  <RevealFooter
                    shownCount={craftsReveal.shown.length}
                    remaining={craftsReveal.remaining}
                    showMore={craftsReveal.showMore}
                    sentinelRef={craftsReveal.sentinelRef}
                    testId="building-crafts-show-more"
                  />
                </CatalogSection>
              ) : null}
            </div>

            {/* Sidebar */}
            <div className="space-y-6 md:order-2">
              <CatalogSection title={t('building.section.info')}>
                <InfoRows>
                  <StatRow label={t('building.id')} value={bld.id} />
                  <StatRow label={t('building.type')} value={buildingTypeLabel(bld.typeA, b.buildings.typeLabels)} />
                  {level != null ? <StatRow label={t('building.level')} value={level} /> : null}
                  {bld.work ? <StatRow label={t('building.work')} value={bld.work} /> : null}
                  {energy ? <StatRow label={t('building.energy')} value={energy} /> : null}
                </InfoRows>
              </CatalogSection>
            </div>
          </div>

          {/* Relic-conversion odds: full width — the five-tier comparison
              table doesn't fit next to the sidebar. */}
          {recycler && recycler.building === id ? (
            <RecyclerComparisonSection file={recycler} items={b.items} />
          ) : null}

          <Link to="/buildings" className="inline-block text-sm text-primary hover:underline">
            {t('building.backToList')}
          </Link>
        </div>
      )
    }
  }

  return (
    <ContentPage active="/buildings" title={t('building.title')} maxWidth="max-w-5xl">
      <CatalogDataProvider items={b?.items} buildings={b?.buildings} tech={b?.tech} pals={b?.pals}>
        {body}
      </CatalogDataProvider>
    </ContentPage>
  )
}
