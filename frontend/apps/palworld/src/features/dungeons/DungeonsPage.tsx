import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearch } from '@tanstack/react-router'
import { Fish, Skull, Swords } from 'lucide-react'
import { ContentPage } from '../../components/ContentPage'
import { loadItems, type ItemsBundle } from '../../lib/catalog'
import { loadPals, type PalsBundle } from '../../lib/pals'
import {
  loadDungeons,
  itemChance,
  entryShare,
  formatChance,
  type DungeonsBundle,
  type DungeonEntry,
  type LotterySlot,
  type RewardEntry,
  type RewardTier,
} from '../../lib/dungeons'
import {
  CatalogSection,
  CatalogPageLoading,
  CatalogDataProvider,
  ItemLink,
  PalLink,
} from '../catalog/components'

interface Bundles {
  dungeons: DungeonsBundle
  items: ItemsBundle
  pals: PalsBundle
}

/** Reward tiers → display label key (Easy01/Medium01/Hard01/Hard03). */
const TIER_KEY: Record<string, 'easy' | 'medium' | 'hard' | 'bonus'> = {
  Easy01: 'easy', Medium01: 'medium', Hard01: 'hard', Hard02: 'hard', Hard03: 'bonus',
}

/** PickupItem_Lotus_<Stat>_NN → lotusStat label key. */
const LOTUS_STAT: Record<string, 'workspeed' | 'attack' | 'hp' | 'stamina' | 'weight'> = {
  Workspeed: 'workspeed', Attack: 'attack', HP: 'hp', Stamina: 'stamina', Weight: 'weight',
}

/** Chest-tier badge colors, loosely following the game's chest materials
 *  (wood → copper → silver → gold for the locked blueprint chests). */
function gradeBadgeClass(grade: number): string {
  if (grade >= 6) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  if (grade >= 4) return 'bg-slate-400/20 text-slate-600 dark:text-slate-300'
  if (grade >= 3) return 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
  return 'bg-secondary text-muted-foreground'
}

function ChanceBadge({ pct }: { pct: number }) {
  return (
    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-primary">
      {formatChance(pct)}%
    </span>
  )
}

/** One lottery rendered as its independent rolls; each roll lists the weighted
 *  item pool with per-roll chances, count ranges and chest-tier badges. */
function LotteryTable({ slots, b }: { slots: LotterySlot[]; b: Bundles }) {
  const { t } = useTranslation()
  const iname = (iid: string) => b.items.text[iid]?.name ?? iid
  return (
    <div className="space-y-3">
      {slots.map((slot, si) => (
        <div key={si}>
          {slots.length > 1 ? (
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t('dungeon.roll', { n: si + 1, pct: formatChance(slot.prob) })}
            </div>
          ) : null}
          <ul className="space-y-1">
            {slot.items.map((it, ii) => (
              <li key={`${it.item}-${ii}`} className="flex flex-wrap items-center gap-1.5">
                <ChanceBadge pct={itemChance(slot, it)} />
                <ItemLink id={it.item} name={iname(it.item)} icon={b.items.byId.get(it.item)?.icon} />
                {it.max > 1 || it.min > 1 ? (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    ×{it.min === it.max ? it.min : `${it.min}–${it.max}`}
                  </span>
                ) : null}
                {it.grade >= 3 ? (
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${gradeBadgeClass(it.grade)}`}>
                    {t('dungeon.chestTier', { n: it.grade })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{t('dungeon.lootNote')}</p>
    </div>
  )
}

/** Weighted pal pool (egg pools, cage pools) as an expandable chip list. */
function PalPool({
  summary,
  pals,
  b,
}: {
  summary: string
  pals: { pal: string; weight: number; lvMin?: number; lvMax?: number }[]
  b: Bundles
}) {
  const total = pals.reduce((s, p) => s + p.weight, 0)
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer select-none text-xs text-primary hover:underline">
        {summary}
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {pals.map((p, i) => (
          <span key={`${p.pal}-${i}`} className="inline-flex items-center gap-1">
            {total > 0 ? <ChanceBadge pct={(p.weight / total) * 100} /> : null}
            <PalLink id={p.pal} name={b.pals.text[p.pal]?.name ?? p.pal} icon={b.pals.byId.get(p.pal)?.icon} />
            {p.lvMin != null ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                Lv.{p.lvMin === p.lvMax ? p.lvMin : `${p.lvMin}–${p.lvMax}`}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </details>
  )
}

/** One boss-room reward entry: kind label + tier share, expanding to the
 *  underlying loot (chest lottery / egg pool / cage pool / mimic pals). */
function RewardEntryRow({ tier, entry, b }: { tier: RewardTier; entry: RewardEntry; b: Bundles }) {
  const { t } = useTranslation()
  const share = entryShare(tier, entry)
  const isJunk = entry.kind === 'chest' && entry.object === 'TreasureBox_RequiredLongHold'
  const isMushroom = entry.kind === 'pickup'
  const kindKey = isJunk ? 'junk' : isMushroom ? 'mushroom' : entry.kind
  const label = t(`dungeon.kind.${kindKey}`)

  let detail: React.ReactNode = null
  if (entry.lottery && b.dungeons.file.lotteries[entry.lottery]) {
    detail = (
      <details className="mt-1.5">
        <summary className="cursor-pointer select-none text-xs text-primary hover:underline">
          {t('dungeon.chestLoot')}
        </summary>
        <div className="mt-2">
          <LotteryTable slots={b.dungeons.file.lotteries[entry.lottery]} b={b} />
        </div>
      </details>
    )
  } else if (entry.eggPool && b.dungeons.file.eggPools[entry.eggPool]) {
    const pool = b.dungeons.file.eggPools[entry.eggPool]
    detail = <PalPool summary={t('dungeon.poolCount', { count: pool.length })} pals={pool} b={b} />
  } else if (entry.cagePool && b.dungeons.file.cagePools[entry.cagePool]) {
    const pool = b.dungeons.file.cagePools[entry.cagePool]
    detail = <PalPool summary={t('dungeon.poolCount', { count: pool.length })} pals={pool} b={b} />
  } else if (entry.pals?.length) {
    detail = (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {entry.pals.map((p, i) => (
          <span key={`${p.pal}-${i}`} className="inline-flex items-center gap-1">
            <PalLink id={p.pal} name={b.pals.text[p.pal]?.name ?? p.pal} icon={b.pals.byId.get(p.pal)?.icon} />
            <span className="text-xs tabular-nums text-muted-foreground">
              Lv.{p.lvMin === p.lvMax ? p.lvMin : `${p.lvMin}–${p.lvMax}`}
            </span>
          </span>
        ))}
      </div>
    )
  } else if (entry.objects?.length) {
    // Stat lotus: name the flavors (PickupItem_Lotus_<Stat>_NN).
    const stats = [...new Set(
      entry.objects
        .map((o) => /^PickupItem_Lotus_([A-Za-z]+)/.exec(o.object)?.[1])
        .filter((s): s is string => !!s && s in LOTUS_STAT),
    )]
    detail = stats.length ? (
      <div className="mt-1 text-xs text-muted-foreground">
        {stats.map((s) => t(`dungeon.lotusStat.${LOTUS_STAT[s]}`)).join(' / ')}
      </div>
    ) : null
  }

  return (
    <li className="rounded-md border border-border/60 bg-secondary/20 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <ChanceBadge pct={share} />
        <span className="text-sm font-medium">{label}</span>
      </div>
      {detail}
    </li>
  )
}

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
