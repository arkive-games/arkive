import { useTranslation } from 'react-i18next'
import type { ItemsBundle } from '../../lib/catalog'
import type { PalsBundle } from '../../lib/pals'
import {
  itemChance,
  entryShare,
  formatChance,
  type DungeonsBundle,
  type LotterySlot,
  type RewardEntry,
  type RewardTier,
} from '../../lib/dungeons'
import { ItemLink, PalLink } from '../catalog/components'

export interface Bundles {
  dungeons: DungeonsBundle
  items: ItemsBundle
  pals: PalsBundle
}

/** Reward tiers → display label key (Easy01/Medium01/Hard01/Hard03). */
export const TIER_KEY: Record<string, 'easy' | 'medium' | 'hard' | 'bonus'> = {
  Easy01: 'easy', Medium01: 'medium', Hard01: 'hard', Hard02: 'hard', Hard03: 'bonus',
}

/** PickupItem_Lotus_<Stat>_NN → lotusStat label key. */
const LOTUS_STAT: Record<string, 'workspeed' | 'attack' | 'hp' | 'stamina' | 'weight'> = {
  Workspeed: 'workspeed', Attack: 'attack', HP: 'hp', Stamina: 'stamina', Weight: 'weight',
}

/** Chest-tier badge colors, loosely following the game's chest materials
 *  (wood → copper → silver → gold for the locked blueprint chests). */
export function gradeBadgeClass(grade: number): string {
  if (grade >= 6) return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  if (grade >= 4) return 'bg-slate-400/20 text-slate-600 dark:text-slate-300'
  if (grade >= 3) return 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
  return 'bg-secondary text-muted-foreground'
}

export function ChanceBadge({ pct }: { pct: number }) {
  return (
    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-primary">
      {formatChance(pct)}%
    </span>
  )
}

/** One lottery rendered as its independent rolls; each roll lists the weighted
 *  item pool with per-roll chances, count ranges and chest-tier badges.
 *  `columns` flows the items in responsive CSS multi-columns (full-width
 *  sections); the probability footnote is the section's job (rendered once
 *  per page, not per table). */
export function LotteryTable({
  slots,
  b,
  columns = false,
}: {
  slots: LotterySlot[]
  b: Bundles
  columns?: boolean
}) {
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
          <ul className={columns ? 'gap-x-6 sm:columns-2 xl:columns-3' : 'space-y-1'}>
            {slot.items.map((it, ii) => (
              <li
                key={`${it.item}-${ii}`}
                className={`flex flex-wrap items-center gap-1.5${columns ? ' mb-1 break-inside-avoid' : ''}`}
              >
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
    </div>
  )
}

/** Weighted pal pool (egg pools, cage pools) as an expandable chip list. */
export function PalPool({
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

/** One boss-room reward entry: kind label + tier share, with the underlying
 *  loot shown inline (chest lottery expanded by default; egg/cage pools stay
 *  collapsible). A chest that reuses the dungeon's interior chest lottery
 *  (`interiorLottery`) renders a one-line reference instead of repeating the
 *  full table. */
export function RewardEntryRow({
  tier,
  entry,
  b,
  interiorLottery,
}: {
  tier: RewardTier
  entry: RewardEntry
  b: Bundles
  interiorLottery?: string
}) {
  const { t } = useTranslation()
  const share = entryShare(tier, entry)
  const isJunk = entry.kind === 'chest' && entry.object === 'TreasureBox_RequiredLongHold'
  const isMushroom = entry.kind === 'pickup'
  const kindKey = isJunk ? 'junk' : isMushroom ? 'mushroom' : entry.kind
  const label = t(`dungeon.kind.${kindKey}`)

  let detail: React.ReactNode = null
  if (entry.lottery && entry.lottery === interiorLottery) {
    detail = (
      <div className="mt-1 text-xs text-muted-foreground" data-testid="dungeon-reward-shared-chest">
        {t('dungeon.sameAsChest')}
      </div>
    )
  } else if (entry.lottery && b.dungeons.file.lotteries[entry.lottery]) {
    detail = (
      <div className="mt-2">
        <LotteryTable slots={b.dungeons.file.lotteries[entry.lottery]} b={b} columns />
      </div>
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
