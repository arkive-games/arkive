import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from '@tanstack/react-router'
import { ContentPage } from '../../components/ContentPage'
import { loadDungeons, dungeonsByItem, type DungeonsBundle } from '../../lib/dungeons'
import {
  loadItems,
  loadBuildings,
  loadTech,
  loadQuests,
  type ItemsBundle,
  type BuildingsBundle,
  type TechBundle,
  type QuestsBundle,
} from '../../lib/catalog'
import { loadPals, type PalsBundle } from '../../lib/pals'
import { loadMerchants, type MerchantsBundle } from '../../lib/merchants'
import { loadRecycler, type RecyclerFile } from '../../lib/recycler'
import { RecyclerRecipeSection } from '../recycler/RecyclerSections'
import { ItemSourceRows, UnlocksCraftSection } from './ItemSources'
import { itemTypeLabel } from '../catalog/labels'
import {
  CatalogSection,
  InfoRows,
  StatRow,
  CatalogPageLoading,
  CatalogNotFound,
  CatalogDataProvider,
  ItemLink,
  BuildingLink,
  PalLink,
  MaterialChip,
  ItemGlyph,
} from '../catalog/components'
import { makeTechResolvers } from '../technology/techModel'
import { TechChip } from '../technology/components/TechChip'

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
  // Dungeon loot dataset for the "found in dungeons" obtain row. Loaded
  // separately and best-effort: the page renders fully without it.
  const [dungeons, setDungeons] = useState<DungeonsBundle | null>(null)
  // Relic-recycler odds for the "conversion outputs" section on relic items;
  // best-effort like the dungeons dataset.
  const [recycler, setRecycler] = useState<RecyclerFile | null>(null)
  // Merchant catalog, so the merchant source chips can name + link merchants.
  const [merchants, setMerchants] = useState<MerchantsBundle | null>(null)
  // Quests, for the "reward from quest" reverse link (inverse of QuestDetailPage
  // reward items). Best-effort like the others.
  const [quests, setQuests] = useState<QuestsBundle | null>(null)

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

  useEffect(() => {
    let cancelled = false
    loadDungeons(lng)
      .then((d) => { if (!cancelled) setDungeons(d) })
      .catch((err) => console.error(err))
    loadRecycler()
      .then((r) => { if (!cancelled) setRecycler(r) })
      .catch((err) => console.error(err))
    loadMerchants()
      .then((m) => { if (!cancelled) setMerchants(m) })
      .catch((err) => console.error(err))
    loadQuests(lng)
      .then((q) => { if (!cancelled) setQuests(q) })
      .catch((err) => console.error(err))
    return () => {
      cancelled = true
    }
  }, [lng])

  // Quests that reward this item (reverse of QuestDetailPage reward list).
  const rewardingQuests = useMemo(() => {
    if (!quests) return []
    return quests.quests.filter((q) => q.rewardItems?.some((r) => r.item === id))
  }, [quests, id])

  // Dungeons whose chest / boss-reward lotteries can drop the current item.
  const itemDungeons = useMemo(() => {
    if (!dungeons) return []
    const ids = dungeonsByItem(dungeons.file).get(id)
    if (!ids) return []
    return dungeons.file.dungeons.filter((d) => ids.has(d.id))
  }, [dungeons, id])

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
      const techResolvers = makeTechResolvers(b.items, b.buildings, b.tech, b.pals)
      const text = b.items.text[id]
      const food = item.food
      const equip = item.equip
      const foodRows = food ? FOOD_KEYS.filter((k) => food[k] != null && food[k] !== 0) : []
      const equipRows = equip ? EQUIP_KEYS.filter((k) => equip[k] != null && equip[k] !== 0) : []
      const elementLabel = item.element ? b.pals.enums.elements[item.element] ?? item.element : ''
      const recyclerRecipe = recycler?.recipes.find((r) => r.input === id)
      // Blueprint acquisition: emitted source channels, plus whether the relic
      // recycler can yield this item (inverse of the recycler recipes).
      const recyclerYields =
        recycler?.recipes.some((r) => r.slots.some((sl) => sl.items.some((i) => i.item === id))) ??
        false
      const hasObtain =
        item.droppedBy?.length ||
        item.unlockTech?.length ||
        itemDungeons.length ||
        item.sources?.length ||
        item.noSource ||
        recyclerYields ||
        rewardingQuests.length

      body = (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex min-w-0 items-center gap-3">
            {item.icon ? <ItemGlyph icon={item.icon} size={48} /> : null}
            <div className="min-w-0">
              <div className="text-sm text-muted-foreground">{itemTypeLabel(item.typeA, b.items.typeLabels)}</div>
              <h1 className="text-3xl font-bold">{text?.name ?? item.id}</h1>
              <div className="mt-0.5 font-mono text-xs text-muted-foreground">{item.id}</div>
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
                  <div className="flex flex-wrap gap-1.5">
                    {item.recipe.materials.map((m) => (
                      <MaterialChip key={m.item} id={m.item} name={iname(m.item)} count={m.count} />
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
                    {item.recipe.productCount && item.recipe.productCount > 1 ? (
                      <div>
                        {t('item.yields')}:{' '}
                        <span className="text-foreground tabular-nums">×{item.recipe.productCount}</span>
                      </div>
                    ) : null}
                    {item.recipe.craftExp ? (
                      <div>
                        {t('item.craftExp', { defaultValue: 'Craft EXP' })}:{' '}
                        <span className="text-foreground tabular-nums">{item.recipe.craftExp}</span>
                      </div>
                    ) : null}
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

              <UnlocksCraftSection item={item} items={b.items} />

              {/* Skill card: the active skill this item teaches a pal (links to
                  the active-skill detail page; name from the game skill locale). */}
              {item.grantsSkill ? (
                <CatalogSection title={t('item.section.teaches')}>
                  <Link
                    to="/active-skills/$id"
                    params={{ id: item.grantsSkill }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm transition hover:border-primary/60 hover:bg-accent"
                  >
                    {b.pals.skills[item.grantsSkill]?.name ?? item.grantsSkill}
                  </Link>
                </CatalogSection>
              ) : null}

              {/* Armor / accessory: passive skills granted when equipped. Passives
                  have no detail page, so these are name facts (game passive locale). */}
              {item.itemPassives?.length ? (
                <CatalogSection title={t('item.section.grantsPassives')}>
                  <div className="flex flex-wrap gap-1.5">
                    {item.itemPassives.map((pid) => (
                      <span
                        key={pid}
                        className="inline-flex items-center rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm"
                      >
                        {b.pals.passiveText[pid]?.name ?? pid}
                      </span>
                    ))}
                  </div>
                </CatalogSection>
              ) : null}

              {/* Cooked-dish buff: timed effect(s) granted when eaten. */}
              {item.foodBuff ? (
                <CatalogSection title={t('item.section.foodBuff', { defaultValue: 'Food Buff' })}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {item.foodBuff.effects.map((e) => (
                      <span
                        key={e.type}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-emerald-500/10 px-2 py-1 text-sm font-medium text-emerald-600 dark:text-emerald-400"
                      >
                        {t(`item.foodEffect.${e.type}`, { defaultValue: e.type })}
                        <span className="tabular-nums">+{e.value}</span>
                      </span>
                    ))}
                    {item.foodBuff.time ? (
                      <span className="text-xs text-muted-foreground">
                        {t('item.duration', { defaultValue: 'Duration' })}: {item.foodBuff.time}s
                      </span>
                    ) : null}
                  </div>
                </CatalogSection>
              ) : null}

              {hasObtain ? (
                <CatalogSection title={t('item.section.obtain')}>
                  <div className="space-y-3">
                    {item.droppedBy?.length ? (
                      <div>
                        <div className="mb-1.5 text-xs text-muted-foreground">{t('item.droppedBy')}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {item.droppedBy.map((d) => (
                            <PalLink
                              key={d.id}
                              id={d.id}
                              name={b.pals.text[d.id]?.name ?? d.id}
                              icon={b.pals.byId.get(d.id)?.icon}
                              badge={d.isBoss ? t('item.bossDrop') : undefined}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <ItemSourceRows
                      item={item}
                      items={b.items}
                      pals={b.pals}
                      merchants={merchants}
                      recycler={recycler}
                    />
                    {item.unlockTech?.length ? (
                      <div>
                        <div className="mb-1.5 text-xs text-muted-foreground">{t('item.fromTech')}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {item.unlockTech.map((tid) => {
                            const entry = b.tech.byId.get(tid)
                            return entry ? (
                              <TechChip key={tid} tech={entry} resolvers={techResolvers} />
                            ) : null
                          })}
                        </div>
                      </div>
                    ) : null}
                    {itemDungeons.length ? (
                      <div data-testid="item-dungeon-sources">
                        <div className="mb-1.5 text-xs text-muted-foreground">{t('dungeon.foundIn')}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {itemDungeons.map((d) => (
                            <Link
                              key={d.id}
                              to="/dungeons/$id"
                              params={{ id: d.id }}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm transition hover:border-primary/60 hover:bg-accent"
                            >
                              {dungeons?.text[d.id]?.name ?? d.id}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {rewardingQuests.length ? (
                      <div>
                        <div className="mb-1.5 text-xs text-muted-foreground">
                          {t('item.rewardFromQuest', { defaultValue: 'Quest reward' })}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {rewardingQuests.map((q) => (
                            <Link
                              key={q.id}
                              to="/quests/$id"
                              params={{ id: q.id }}
                              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm transition hover:border-primary/60 hover:bg-accent"
                            >
                              {quests?.text[q.id]?.title ?? q.id}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </CatalogSection>
              ) : null}

              {recycler && recyclerRecipe ? (
                <RecyclerRecipeSection
                  file={recycler}
                  recipe={recyclerRecipe}
                  items={b.items}
                  buildings={b.buildings}
                />
              ) : null}

              {item.usedInItems?.length || item.usedInBuildings?.length ? (
                <CatalogSection title={t('item.section.usedIn')}>
                  {item.usedInItems?.length ? (
                    <div className="mb-3">
                      <div className="mb-1.5 text-xs text-muted-foreground">{t('item.usedInItems')}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.usedInItems.map((iid) => (
                          <ItemLink
                            key={iid}
                            id={iid}
                            name={iname(iid)}
                            icon={b.items.byId.get(iid)?.icon}
                          />
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
                  {item.corruption ? (
                    <StatRow
                      label={t('item.corruption', { defaultValue: 'Sanity drain' })}
                      value={item.corruption}
                    />
                  ) : null}
                  {item.pvpBanned ? (
                    <StatRow
                      label={t('item.pvp', { defaultValue: 'PvP' })}
                      value={t('item.pvpBanned', { defaultValue: 'Restricted' })}
                    />
                  ) : null}
                  {item.notConsumed ? (
                    <StatRow
                      label={t('item.consumable', { defaultValue: 'On use' })}
                      value={t('item.notConsumed', { defaultValue: 'Not consumed' })}
                    />
                  ) : null}
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
      <CatalogDataProvider
        items={b?.items}
        buildings={b?.buildings}
        tech={b?.tech}
        pals={b?.pals}
      >
        {body}
      </CatalogDataProvider>
    </ContentPage>
  )
}
