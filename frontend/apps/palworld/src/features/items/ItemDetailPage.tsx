import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from '@tanstack/react-router'
import { ContentPage } from '../../components/ContentPage'
import {
  loadItems,
  loadBuildings,
  loadTech,
  type ItemsBundle,
  type BuildingsBundle,
  type TechBundle,
} from '../../lib/catalog'
import { loadPals, type PalsBundle } from '../../lib/pals'
import { itemTypeLabel } from '../catalog/labels'
import {
  CatalogSection,
  InfoRows,
  StatRow,
  CatalogPageLoading,
  CatalogNotFound,
  ItemLink,
  BuildingLink,
  PalLink,
  MaterialRow,
  ItemGlyph,
} from '../catalog/components'

interface Bundles {
  items: ItemsBundle
  buildings: BuildingsBundle
  tech: TechBundle
  pals: PalsBundle
}

const FOOD_KEYS = ['satiety', 'health', 'sanity', 'concentration'] as const
const EQUIP_KEYS = [
  'attack',
  'defense',
  'hp',
  'shield',
  'magicAttack',
  'magicDefense',
  'durability',
  'magazine',
] as const

export default function ItemDetailPage() {
  const { id } = useParams({ from: '/items/$id' })
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [b, setB] = useState<Bundles | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  let body: React.ReactNode
  if (loadError) {
    body = <div className="text-center text-destructive">{loadError}</div>
  } else if (!b) {
    body = <CatalogPageLoading />
  } else {
    const item = b.items.byId.get(id)
    if (!item) {
      body = (
        <CatalogNotFound message={t('item.notFound', { id })} to="/items" backLabel={t('item.backToList')} />
      )
    } else {
      const iname = (iid: string) => b.items.text[iid]?.name ?? iid
      const text = b.items.text[id]
      const food = item.food
      const equip = item.equip
      const foodRows = food ? FOOD_KEYS.filter((k) => food[k] != null && food[k] !== 0) : []
      const equipRows = equip ? EQUIP_KEYS.filter((k) => equip[k] != null && equip[k] !== 0) : []
      const elementLabel = item.element ? b.pals.enums.elements[item.element] ?? item.element : ''

      body = (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex min-w-0 items-center gap-3">
            {item.icon ? <ItemGlyph icon={item.icon} size={48} /> : null}
            <div className="min-w-0">
              <div className="text-sm text-muted-foreground">{itemTypeLabel(item.typeA, b.items.typeLabels)}</div>
              <h1 className="text-3xl font-bold">{text?.name ?? item.id}</h1>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
            {/* Main column */}
            <div className="space-y-6 md:order-1">
              {text?.description ? (
                <CatalogSection title={t('item.section.description')}>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{text.description}</p>
                </CatalogSection>
              ) : null}

              {item.recipe ? (
                <CatalogSection title={t('item.section.craft')}>
                  <div className="divide-y divide-border/60">
                    {item.recipe.materials.map((m) => (
                      <MaterialRow key={m.item} id={m.item} name={iname(m.item)} count={m.count} />
                    ))}
                  </div>
                  {item.recipe.craftedAt?.length ? (
                    <div className="mt-3">
                      <div className="mb-1.5 text-xs text-muted-foreground">{t('item.craftedAt')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.recipe.craftedAt.map((bid) => (
                          <BuildingLink
                            key={bid}
                            id={bid}
                            name={b.buildings.text[bid]?.name ?? bid}
                            icon={b.buildings.byId.get(bid)?.icon}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <div>
                      {t('item.work')}: <span className="text-foreground tabular-nums">{item.recipe.work}</span>
                    </div>
                    {item.recipe.unlockItemId ? (
                      <div>
                        {t('item.unlockItem')}:{' '}
                        <Link
                          to="/items/$id"
                          params={{ id: item.recipe.unlockItemId }}
                          className="text-primary hover:underline"
                        >
                          {iname(item.recipe.unlockItemId)}
                        </Link>
                      </div>
                    ) : item.handcraft ? (
                      <div>{t('item.handcraft')}</div>
                    ) : null}
                  </div>
                </CatalogSection>
              ) : null}

              {item.droppedBy?.length || item.unlockTech?.length || item.partnerFor?.length ? (
                <CatalogSection title={t('item.section.obtain')}>
                  {item.droppedBy?.length ? (
                    <div className="mb-3">
                      <div className="mb-1.5 text-xs text-muted-foreground">{t('item.droppedBy')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.droppedBy.map((pid) => (
                          <PalLink
                            key={pid}
                            id={pid}
                            name={b.pals.text[pid]?.name ?? pid}
                            icon={b.pals.byId.get(pid)?.icon}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {item.partnerFor?.length ? (
                    <div className="mb-3">
                      <div className="mb-1.5 text-xs text-muted-foreground">{t('pal.unlockItem')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.partnerFor.map((pid) => (
                          <PalLink
                            key={pid}
                            id={pid}
                            name={b.pals.text[pid]?.name ?? pid}
                            icon={b.pals.byId.get(pid)?.icon}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {item.unlockTech?.length ? (
                    <div>
                      <div className="mb-1.5 text-xs text-muted-foreground">{t('item.fromTech')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.unlockTech.map((tid) => (
                          <Link
                            key={tid}
                            to="/technology"
                            className="inline-flex items-center rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm transition hover:border-primary/60 hover:bg-accent"
                          >
                            {b.tech.text[tid]?.name ?? tid}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CatalogSection>
              ) : null}

              {item.usedInItems?.length || item.usedInBuildings?.length ? (
                <CatalogSection title={t('item.section.usedIn')}>
                  {item.usedInItems?.length ? (
                    <div className="mb-3">
                      <div className="mb-1.5 text-xs text-muted-foreground">{t('item.usedInItems')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.usedInItems.map((iid) => (
                          <ItemLink key={iid} id={iid} name={iname(iid)} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {item.usedInBuildings?.length ? (
                    <div>
                      <div className="mb-1.5 text-xs text-muted-foreground">{t('item.usedInBuildings')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.usedInBuildings.map((bid) => (
                          <BuildingLink
                            key={bid}
                            id={bid}
                            name={b.buildings.text[bid]?.name ?? bid}
                            icon={b.buildings.byId.get(bid)?.icon}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CatalogSection>
              ) : null}
            </div>

            {/* Sidebar */}
            <div className="space-y-6 md:order-2">
              <CatalogSection title={t('item.section.properties')} testId="item-properties">
                <InfoRows>
                  <StatRow label={t('item.type')} value={itemTypeLabel(item.typeA, b.items.typeLabels)} />
                  <StatRow label={t('item.rarity')} value={item.rarity} />
                  <StatRow label={t('item.sortId')} value={item.sortId} />
                  {item.rank ? <StatRow label={t('item.rank')} value={item.rank} /> : null}
                  {elementLabel ? <StatRow label={t('item.element')} value={elementLabel} /> : null}
                  {item.weight ? <StatRow label={t('item.weight')} value={item.weight} /> : null}
                  {item.price ? <StatRow label={t('item.price')} value={item.price} /> : null}
                  {item.maxStack ? <StatRow label={t('item.stack')} value={item.maxStack} /> : null}
                  {foodRows.map((k) => (
                    <StatRow key={k} label={t(`item.food.${k}`)} value={food![k]} />
                  ))}
                  {equipRows.map((k) => (
                    <StatRow key={k} label={t(`item.equip.${k}`)} value={equip![k]} />
                  ))}
                </InfoRows>
              </CatalogSection>
            </div>
          </div>

          <Link to="/items" className="inline-block text-sm text-primary hover:underline">
            {t('item.backToList')}
          </Link>
        </div>
      )
    }
  }

  return (
    <ContentPage active="/items" title={t('item.title')} maxWidth="max-w-5xl">
      {body}
    </ContentPage>
  )
}
