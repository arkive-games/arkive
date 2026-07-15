import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearch } from '@tanstack/react-router'
import { Fish, Skull, Swords } from 'lucide-react'
import { ContentPage } from '../../components/ContentPage'
import { loadItems } from '../../lib/catalog'
import { loadPals } from '../../lib/pals'
import { loadDungeons, type DungeonEntry } from '../../lib/dungeons'
import {
  CatalogSection,
  CatalogPageLoading,
  CatalogDataProvider,
  PalLink,
} from '../catalog/components'
import { LotteryTable, RewardEntryRow, TIER_KEY, type Bundles } from './components'

function DungeonCard({ d, b }: { d: DungeonEntry; b: Bundles }) {
  const { t } = useTranslation()
  const name = b.dungeons.text[d.id]?.name ?? d.id
  const e = d.enemies ?? {}
  // Row per spawn bucket. When deeper floors exist (the Terraria-collab
  // dungeon), the base pool reads "Floor 1" instead of the generic "Enemies".
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

  return (
    <CatalogSection testId={`dungeon-${d.id}`} className="scroll-mt-20">
      {/* Anchor target for ?d=<id> deep links. */}
      <div id={`dungeon-${d.id}`} className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-xl font-bold">{name}</h2>
        <span className="font-mono text-xs text-muted-foreground">{d.id}</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
          {t('dungeon.expBonus', { rate: d.bonusExpRate })}
        </span>
      </div>

      {enemyRows.length ? (
        <div className="mb-4 space-y-2">
          {enemyRows.map((row) => (
            <div key={row.key} className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold ${row.tone}`}>
                <row.icon className="size-3.5" aria-hidden />
                {row.label}
              </span>
              {row.list.map((en, i) => (
                <span key={`${en.pal}-${i}`} className="inline-flex items-center gap-1">
                  <PalLink id={en.pal} name={b.pals.text[en.pal]?.name ?? en.pal} icon={b.pals.byId.get(en.pal)?.icon} />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    Lv.{en.lvMin === en.lvMax ? en.lvMin : `${en.lvMin}–${en.lvMax}`}
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {normalLot ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t('dungeon.chestLoot')}</h3>
              <LotteryTable slots={normalLot} b={b} />
            </div>
          ) : null}
          {specialLot ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t('dungeon.techChest')}</h3>
              <LotteryTable slots={specialLot} b={b} />
            </div>
          ) : null}
        </div>

        {d.bossRewards.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('dungeon.bossRewards')}</h3>
            <div className="space-y-3">
              {d.bossRewards.map((tier) => (
                <div key={tier.tier}>
                  <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                    {t(`dungeon.tier.${TIER_KEY[tier.tier] ?? 'hard'}`)}
                  </div>
                  <ul className="space-y-1.5">
                    {tier.entries.map((e, i) => (
                      <RewardEntryRow key={i} tier={tier} entry={e} b={b} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </CatalogSection>
  )
}

export default function DungeonsPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const { d: focusId } = useSearch({ from: '/dungeons' })

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

  // Deep link (?d=<SpawnAreaId>): scroll the dungeon card into view once loaded.
  useEffect(() => {
    if (!b || !focusId) return
    document.getElementById(`dungeon-${focusId}`)?.scrollIntoView({ block: 'start' })
  }, [b, focusId])

  // Ascending difficulty (the emit order is alphabetical).
  const ordered = useMemo(
    () => (b ? [...b.dungeons.file.dungeons].sort((a, c) => a.bonusExpRate - c.bonusExpRate || a.id.localeCompare(c.id)) : []),
    [b],
  )

  let body: React.ReactNode
  if (loadError) {
    body = <div className="text-center text-destructive">{loadError}</div>
  } else if (!b) {
    body = <CatalogPageLoading />
  } else {
    body = (
      <div className="space-y-6">
        {ordered.map((d) => (
          <DungeonCard key={d.id} d={d} b={b} />
        ))}
      </div>
    )
  }

  return (
    <ContentPage active="/dungeons" title={t('dungeon.title')} heading maxWidth="max-w-5xl">
      <CatalogDataProvider items={b?.items} pals={b?.pals}>
        {body}
      </CatalogDataProvider>
    </ContentPage>
  )
}
