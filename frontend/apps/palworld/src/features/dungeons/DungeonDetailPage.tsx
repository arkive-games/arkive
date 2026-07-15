import { useEffect, useState } from 'react'
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

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              {normalLot ? (
                <CatalogSection title={t('dungeon.chestLoot')} testId="dungeon-chest-loot">
                  <LotteryTable slots={normalLot} b={b} />
                </CatalogSection>
              ) : null}
              {specialLot ? (
                <CatalogSection title={t('dungeon.techChest')} testId="dungeon-tech-chest">
                  <LotteryTable slots={specialLot} b={b} />
                </CatalogSection>
              ) : null}
            </div>
            {d.bossRewards.length ? (
              <CatalogSection title={t('dungeon.bossRewards')} testId="dungeon-boss-rewards">
                <div className="space-y-3">
                  {d.bossRewards.map((tier) => (
                    <div key={tier.tier}>
                      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                        {t(`dungeon.tier.${TIER_KEY[tier.tier] ?? 'hard'}`)}
                      </div>
                      <ul className="space-y-1.5">
                        {tier.entries.map((entry, i) => (
                          <RewardEntryRow key={i} tier={tier} entry={entry} b={b} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </CatalogSection>
            ) : null}
          </div>

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
