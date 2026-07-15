import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Fish, Skull, Swords } from 'lucide-react'
import { ContentPage } from '../../components/ContentPage'
import { loadItems } from '../../lib/catalog'
import { loadPals } from '../../lib/pals'
import {
  loadDungeons,
  dungeonLevelRange,
  notableDrops,
  type DungeonEntry,
  type RewardTier,
} from '../../lib/dungeons'
import {
  CatalogSection,
  CatalogPageLoading,
  CatalogNotFound,
  CatalogDataProvider,
  ItemLink,
  PalLink,
} from '../catalog/components'
import { LotteryTable, RewardEntryRow, TIER_KEY, type Bundles } from './components'
import { DungeonEntranceMap } from './DungeonEntranceMap'

const NAV_LINK =
  'inline-flex items-center gap-1 rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm transition hover:border-primary/60 hover:bg-accent'

/** Difficulty order shared with the list page (ascending EXP bonus, then id). */
function orderDungeons(list: DungeonEntry[]): DungeonEntry[] {
  return [...list].sort((a, c) => a.bonusExpRate - c.bonusExpRate || a.id.localeCompare(c.id))
}

const TAB_ORDER = ['easy', 'medium', 'hard'] as const
type TabKey = (typeof TAB_ORDER)[number]

/** Boss-room rewards as a full-width tabbed card: one tab per difficulty, the
 *  `bonus` tier riding in the Hard tab under its own subheading. Dungeons with
 *  a single tier group render no tab bar. Entries flow in CSS multi-columns. */
function BossRewardsSection({ d, b }: { d: DungeonEntry; b: Bundles }) {
  const { t } = useTranslation()
  const groups = useMemo(() => {
    const byKey = new Map<TabKey, RewardTier[]>()
    for (const tier of d.bossRewards) {
      const key = TIER_KEY[tier.tier] ?? 'hard'
      const tab: TabKey = key === 'bonus' ? 'hard' : key
      byKey.set(tab, [...(byKey.get(tab) ?? []), tier])
    }
    return TAB_ORDER.filter((k) => byKey.has(k)).map((k) => ({ key: k, tiers: byKey.get(k)! }))
  }, [d])
  const [active, setActive] = useState(0)
  // Prev/next navigation can land on a dungeon with fewer tabs.
  useEffect(() => {
    setActive(0)
  }, [d.id])
  const group = groups[Math.min(active, groups.length - 1)]
  if (!group) return null

  return (
    <CatalogSection title={t('dungeon.bossRewards')} testId="dungeon-boss-rewards">
      {groups.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {groups.map((g, i) => (
            <button
              key={g.key}
              type="button"
              data-testid={`dungeon-tier-tab-${g.key}`}
              aria-pressed={g === group}
              onClick={() => setActive(i)}
              className={
                'rounded-md px-3 py-1.5 text-sm transition ' +
                (g === group
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent')
              }
            >
              {t(`dungeon.tier.${g.key}`)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="space-y-3">
        {group.tiers.map((tier) => (
          <div key={tier.tier}>
            {/* The bonus tier always announces itself; the tab already names
                the main tier, so plain tiers get no redundant subheading. */}
            {(TIER_KEY[tier.tier] ?? 'hard') === 'bonus' ? (
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                {t('dungeon.tier.bonus')}
              </div>
            ) : null}
            <ul className="gap-x-4 md:columns-2 xl:columns-3">
              {tier.entries.map((entry, i) => (
                <RewardEntryRow
                  key={i}
                  tier={tier}
                  entry={entry}
                  b={b}
                  interiorLottery={d.chests?.normal}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </CatalogSection>
  )
}

export default function DungeonDetailPage() {
  const { id } = useParams({ from: '/dungeons/$id' })
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [b, setB] = useState<Bundles | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadDungeons(lng), loadItems(lng), loadPals(lng)])
      .then(([dungeons, items, pals]) => {
        if (!cancelled) setB({ dungeons, items, pals })
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
    const d = b.dungeons.byId.get(id)
    if (!d) {
      body = (
        <CatalogNotFound
          message={t('dungeon.notFound', { id })}
          to="/dungeons"
          backLabel={t('dungeon.backToList')}
        />
      )
    } else {
      const name = b.dungeons.text[d.id]?.name ?? d.id
      const range = dungeonLevelRange(d)
      const ordered = orderDungeons(b.dungeons.file.dungeons)
      const idx = ordered.findIndex((x) => x.id === d.id)
      const prev = idx > 0 ? ordered[idx - 1] : null
      const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null
      const notable = notableDrops(b.dungeons.file, d)
      const e = d.enemies ?? {}
      // Row per spawn bucket, boss first. When deeper floors exist (the
      // Terraria-collab dungeon), the base pool reads "Floor 1".
      const enemyRows = [
        { key: 'boss', label: t('dungeon.boss'), icon: Swords, tone: 'text-destructive', list: e.boss },
        { key: 'midBoss', label: t('dungeon.midBoss'), icon: Swords, tone: 'text-muted-foreground', list: e.midBoss },
        {
          key: 'normal',
          label: e.floor2 ? t('dungeon.floor', { n: 1 }) : t('dungeon.enemies'),
          icon: Skull, tone: 'text-muted-foreground', list: e.normal,
        },
        { key: 'floor2', label: t('dungeon.floor', { n: 2 }), icon: Skull, tone: 'text-muted-foreground', list: e.floor2 },
        { key: 'floor3', label: t('dungeon.floor', { n: 3 }), icon: Skull, tone: 'text-muted-foreground', list: e.floor3 },
        { key: 'floor4', label: t('dungeon.floor', { n: 4 }), icon: Skull, tone: 'text-muted-foreground', list: e.floor4 },
        { key: 'fishing', label: t('dungeon.fishing'), icon: Fish, tone: 'text-muted-foreground', list: e.fishing },
      ]
        .map((r) => ({ ...r, list: r.list ?? [] }))
        .filter((r) => r.list.length)
      const normalLot = d.chests?.normal ? b.dungeons.file.lotteries[d.chests.normal] : undefined
      const specialLot = d.chests?.special ? b.dungeons.file.lotteries[d.chests.special] : undefined

      body = (
        <div className="space-y-6">
          <div data-testid="dungeon-header" className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold">{name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{d.id}</span>
                {range ? (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium tabular-nums">
                    Lv. {range.min}–{range.max}
                  </span>
                ) : null}
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  {t('dungeon.expBonus', { rate: d.bonusExpRate })}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {prev ? (
                <Link
                  to="/dungeons/$id"
                  params={{ id: prev.id }}
                  aria-label={t('dungeon.prevDungeon')}
                  data-testid="dungeon-prev"
                  className={NAV_LINK}
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  <span className="max-w-36 truncate">{b.dungeons.text[prev.id]?.name ?? prev.id}</span>
                </Link>
              ) : null}
              {next ? (
                <Link
                  to="/dungeons/$id"
                  params={{ id: next.id }}
                  aria-label={t('dungeon.nextDungeon')}
                  data-testid="dungeon-next"
                  className={NAV_LINK}
                >
                  <span className="max-w-36 truncate">{b.dungeons.text[next.id]?.name ?? next.id}</span>
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>

          {notable.length ? (
            <CatalogSection title={t('dungeon.notableDrops')} testId="dungeon-notable-drops">
              <div className="flex flex-wrap gap-1.5">
                {notable.map((n) => (
                  <ItemLink
                    key={n.item}
                    id={n.item}
                    name={b.items.text[n.item]?.name ?? n.item}
                    icon={b.items.byId.get(n.item)?.icon}
                  />
                ))}
              </div>
            </CatalogSection>
          ) : null}

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            {enemyRows.length ? (
              <CatalogSection title={t('dungeon.encounters')} testId="dungeon-encounters">
                <div className="space-y-3">
                  {enemyRows.map((row) => (
                    <div key={row.key} className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${row.tone}`}>
                        <row.icon className="size-3.5" aria-hidden />
                        {row.label}
                      </span>
                      {row.list.map((en, i) => (
                        <span key={`${en.pal}-${i}`} className="inline-flex items-center gap-1">
                          <PalLink
                            id={en.pal}
                            name={b.pals.text[en.pal]?.name ?? en.pal}
                            icon={b.pals.byId.get(en.pal)?.icon}
                          />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            Lv.{en.lvMin === en.lvMax ? en.lvMin : `${en.lvMin}–${en.lvMax}`}
                          </span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </CatalogSection>
            ) : null}
            <DungeonEntranceMap dungeonId={d.id} dungeonName={name} />
          </div>

          {normalLot ? (
            <CatalogSection title={t('dungeon.chestLoot')} testId="dungeon-chest-loot">
              <LotteryTable slots={normalLot} b={b} columns />
            </CatalogSection>
          ) : null}
          {specialLot ? (
            <CatalogSection title={t('dungeon.techChest')} testId="dungeon-tech-chest">
              <LotteryTable slots={specialLot} b={b} columns />
            </CatalogSection>
          ) : null}
          {d.bossRewards.length ? <BossRewardsSection d={d} b={b} /> : null}

          {/* One probability footnote for every loot table above (was repeated
              under each table). */}
          {normalLot || specialLot || d.bossRewards.length ? (
            <p className="text-xs text-muted-foreground">{t('dungeon.lootNote')}</p>
          ) : null}

          <Link to="/dungeons" className="inline-block text-sm text-primary hover:underline">
            {t('dungeon.backToList')}
          </Link>
        </div>
      )
    }
  }

  return (
    <ContentPage active="/dungeons" title={t('dungeon.title')}>
      <CatalogDataProvider items={b?.items} pals={b?.pals}>
        {body}
      </CatalogDataProvider>
    </ContentPage>
  )
}
