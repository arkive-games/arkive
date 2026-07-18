import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { HoverCard, HoverCardTrigger } from '@gamemap/ui'
import { formatChance } from '../../lib/dungeons'
import { loadAreas, type AreaInfo } from '../../lib/areas'
import type { ItemSource, ItemEntry, ItemsBundle } from '../../lib/catalog'
import type { PalsBundle } from '../../lib/pals'
import type { MerchantsBundle } from '../../lib/merchants'
import type { RecyclerFile } from '../../lib/recycler'
import {
  CatalogSection,
  CHIP,
  HoverCardBody,
  ItemGlyph,
  ItemLink,
  PalLink,
  useNested,
} from '../catalog/components'

// Display order of the acquisition-channel rows (mirrors the tools emitter's
// KIND_ORDER); the relic-recycler inverse row renders after all of these.
const KIND_ORDER = [
  'chest', 'fishing', 'salvage', 'supply', 'camp', 'oilrig',
  'treasureMap', 'raid', 'shrine', 'merchant', 'arena',
] as const

/** Static (non-link) sibling of the CHIP styling for source facts. */
const FACT_CHIP =
  'inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm'

export function ChanceBadge({ pct }: { pct: number }) {
  return (
    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-primary">
      {formatChance(pct)}%
    </span>
  )
}

export function TierBadge({ grade }: { grade?: number }) {
  const { t } = useTranslation()
  if (!grade) return null
  return (
    <span className="shrink-0 text-xs text-muted-foreground">
      {t('dungeon.chestTier', { n: grade })}
    </span>
  )
}

/** Localized area name: game world-map name (islands, oil rigs) when the
 *  labels file has one, else the app-side biome noun. */
export function useAreaLabel(items: ItemsBundle) {
  const { t } = useTranslation()
  return (area: string) => items.areaLabels[area] ?? t(`bp.area.${area}`, area)
}

/** The areas.json loot index, loaded once per session. Best-effort: `null`
 *  while loading or when the data host has no index yet — area chips then
 *  degrade to plain (non-link) facts. */
export function useAreas(): Record<string, AreaInfo> | null {
  const [areas, setAreas] = useState<Record<string, AreaInfo> | null>(null)
  useEffect(() => {
    let cancelled = false
    loadAreas()
      .then((f) => {
        if (!cancelled) setAreas(f.areas)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return areas
}

/** Marker subtype (areas.json / markers.json) -> acquisition-channel kind
 *  (bp.kind.* label) for the loot subtypes the region features cover. */
export const LOOT_SUBTYPE_KIND: Record<string, string> = {
  chest: 'chest',
  fishing: 'fishing',
  supply: 'supply',
  camp: 'camp',
  oilrigTreasure: 'oilrig',
}

/** Hovercard body for a region chip: localized region name + how many loot
 *  spots of each kind the map data holds there. */
function RegionSummary({ area, info, label }: { area: string; info: AreaInfo; label: string }) {
  const { t } = useTranslation()
  const counts = new Map<string, number>()
  for (const subs of Object.values(info.maps)) {
    for (const [sub, n] of Object.entries(subs)) counts.set(sub, (counts.get(sub) ?? 0) + n)
  }
  return (
    <div className="flex flex-col gap-2 text-left">
      <div>
        <div className="text-sm font-semibold leading-tight">{label}</div>
        <div className="font-mono text-xs text-muted-foreground">{area}</div>
      </div>
      <div className="flex flex-col gap-1">
        {[...counts].map(([sub, n]) => (
          <div key={sub} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-muted-foreground">{t(`bp.kind.${LOOT_SUBTYPE_KIND[sub] ?? sub}`)}</span>
            <span className="tabular-nums">×{n}</span>
          </div>
        ))}
      </div>
      <span className="text-xs text-primary">{t('bp.viewRegion')} →</span>
    </div>
  )
}

/** Area fact chip for chest/fishing/supply/camp/oilrig sources. When the loot
 *  index knows the area, the chip links to the region detail page and carries
 *  a hovercard with the area's loot-spot counts; otherwise a plain fact. */
function RegionChip({
  s,
  info,
  label,
}: {
  s: ItemSource
  info: AreaInfo | undefined
  label: string
}) {
  const nested = useNested()
  const body = (
    <>
      {label}
      <TierBadge grade={s.grade} />
      {s.chance != null ? <ChanceBadge pct={s.chance} /> : null}
    </>
  )
  if (!info) return <span className={FACT_CHIP}>{body}</span>
  const link = (
    <Link to="/regions/$id" params={{ id: s.area! }} className={CHIP} data-testid="bp-region-chip">
      {body}
    </Link>
  )
  if (nested) return link
  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>{link}</HoverCardTrigger>
      <HoverCardBody className="w-60">
        <RegionSummary area={s.area!} info={info} label={label} />
      </HoverCardBody>
    </HoverCard>
  )
}

function SourceChip({
  s,
  itemName,
  items,
  pals,
  areas,
  merchants,
}: {
  s: ItemSource
  /** Localized name of the schematic (shrine markers are labelled by it). */
  itemName: string
  items: ItemsBundle
  pals: PalsBundle
  /** Loot index (areas.json) — null while loading / unavailable. */
  areas: Record<string, AreaInfo> | null
  merchants: MerchantsBundle | null
}) {
  const { t } = useTranslation()
  const areaLabel = useAreaLabel(items)
  switch (s.kind) {
    case 'treasureMap': {
      const id = s.item!
      return (
        <span className="inline-flex items-center gap-1.5">
          <ItemLink id={id} name={items.text[id]?.name ?? id} icon={items.byId.get(id)?.icon} />
          {s.chance != null ? <ChanceBadge pct={s.chance} /> : null}
        </span>
      )
    }
    case 'salvage':
      return (
        <span className={FACT_CHIP}>
          {t('bp.rank', { n: s.rank })}
          {s.chance != null ? <ChanceBadge pct={s.chance} /> : null}
        </span>
      )
    case 'raid': {
      const pid = s.pal!
      // Reward quantity range (emitted only when >1); collapse min==max to "×N".
      const qty =
        s.min != null && s.max != null && (s.min > 1 || s.max > 1)
          ? s.min === s.max
            ? `×${s.max}`
            : `×${s.min}–${s.max}`
          : null
      return (
        <span className="inline-flex items-center gap-1.5">
          <PalLink id={pid} name={pals.text[pid]?.name ?? pid} icon={pals.byId.get(pid)?.icon} />
          {qty ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{qty}</span>
          ) : null}
          {s.anyOne ? (
            <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {t('bp.guaranteed')}
            </span>
          ) : s.chance != null ? (
            <ChanceBadge pct={s.chance} />
          ) : null}
        </span>
      )
    }
    case 'shrine':
      // Shrine map markers are labelled by the schematic's name, so the map's
      // marker search finds exactly the shrines granting this schematic.
      return (
        <Link
          to="/"
          search={{ map: 'MainWorld', q: itemName }}
          className={CHIP}
          data-testid="bp-shrine-chip"
        >
          {t('dungeon.viewOnMap')}
          {(s.count ?? 1) > 1 ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">×{s.count}</span>
          ) : null}
        </Link>
      )
    case 'merchant': {
      const cur = s.currency ?? 'Money'
      const icon = items.byId.get(cur)?.icon
      const mid = s.merchant ?? ''
      const m = merchants?.byId.get(mid)
      const label = m ? t(`merchant.name.${m.nameKey}`, mid) : mid
      const price = (
        <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
          {icon ? <ItemGlyph icon={icon} size={16} /> : null}
          <span className="tabular-nums">{s.price}</span>
        </span>
      )
      // Link to the merchant page when we can resolve it; otherwise a static fact.
      return m ? (
        <Link to="/merchants/$id" params={{ id: mid }} className={CHIP} title={items.text[cur]?.name ?? cur}>
          {label}
          {price}
        </Link>
      ) : (
        <span className={FACT_CHIP} title={items.text[cur]?.name ?? cur}>
          {label}
          {price}
        </span>
      )
    }
    case 'arena': {
      const qty =
        s.min != null && s.max != null && (s.min > 1 || s.max > 1)
          ? s.min === s.max
            ? `×${s.max}`
            : `×${s.min}–${s.max}`
          : null
      return (
        <span className={FACT_CHIP}>
          {t(`bp.arenaRank.${s.rank}`, String(s.rank))}
          {qty ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{qty}</span>
          ) : null}
          <span className="shrink-0 text-xs text-muted-foreground">
            {s.repeat ? t('bp.repeatClear') : t('bp.firstClear')}
          </span>
        </span>
      )
    }
    default:
      // chest / fishing / supply / camp / oilrig — an area fact with tier +
      // odds, linking to the region page when the loot index knows the area.
      return <RegionChip s={s} info={areas?.[s.area!]} label={areaLabel(s.area!)} />
  }
}

/** Chance (%) that one run of `recipe` yields `id`: independent slot rolls,
 *  weight-drawn within a slot (the recycler shares the field-lottery math). */
function recyclerChance(recipe: RecyclerFile['recipes'][number], id: string): number {
  let miss = 1
  for (const slot of recipe.slots) {
    const total = slot.items.reduce((s, i) => s + i.weight, 0)
    const hit = slot.items.find((i) => i.item === id)
    if (!hit || total <= 0) continue
    miss *= 1 - (slot.prob / 100) * (hit.weight / total)
  }
  return (1 - miss) * 100
}

/** Acquisition rows for an item's "How to obtain" section: one row per channel
 *  kind, plus the relic-recycler inverse ("recycle these relics"). Renders the
 *  no-source note when a blueprint has no channel at all. */
export function ItemSourceRows({
  item,
  items,
  pals,
  merchants,
  recycler,
  className,
}: {
  item: ItemEntry
  items: ItemsBundle
  pals: PalsBundle
  merchants: MerchantsBundle | null
  recycler: RecyclerFile | null
  className?: string
}) {
  const { t } = useTranslation()
  const areas = useAreas()
  const byKind = new Map<string, ItemSource[]>()
  for (const s of item.sources ?? []) {
    const lst = byKind.get(s.kind)
    if (lst) lst.push(s)
    else byKind.set(s.kind, [s])
  }
  const recyclerInputs = (recycler?.recipes ?? [])
    .filter((r) => r.slots.some((sl) => sl.items.some((i) => i.item === item.id)))
    .map((r) => ({ input: r.input, chance: recyclerChance(r, item.id) }))

  if (!byKind.size && !recyclerInputs.length && !item.noSource) return null
  return (
    <div className={className} data-testid="bp-sources">
      {KIND_ORDER.filter((k) => byKind.has(k)).map((kind) => (
        <div key={kind} className="mb-3 last:mb-0">
          <div className="mb-1.5 text-xs text-muted-foreground">{t(`bp.kind.${kind}`)}</div>
          <div className="flex flex-wrap gap-1.5">
            {byKind.get(kind)!.map((s, i) => (
              <SourceChip
                key={i}
                s={s}
                itemName={items.text[item.id]?.name ?? item.id}
                items={items}
                pals={pals}
                areas={areas}
                merchants={merchants}
              />
            ))}
          </div>
        </div>
      ))}
      {recyclerInputs.length ? (
        <div className="mb-3 last:mb-0">
          <div className="mb-1.5 text-xs text-muted-foreground">{t('bp.kind.recycler')}</div>
          <div className="flex flex-wrap gap-1.5">
            {recyclerInputs.map(({ input, chance }) => (
              <span key={input} className="inline-flex items-center gap-1.5">
                <ItemLink
                  id={input}
                  name={items.text[input]?.name ?? input}
                  icon={items.byId.get(input)?.icon}
                />
                <ChanceBadge pct={chance} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {item.noSource ? (
        <p className="text-sm text-muted-foreground" data-testid="bp-no-source">
          {t('bp.noSource')}
        </p>
      ) : null}
    </div>
  )
}

/** "Unlocks crafting" section: the items whose recipes this schematic
 *  unlocks (inverse of the crafted item's "Requires blueprint" line). */
export function UnlocksCraftSection({ item, items }: { item: ItemEntry; items: ItemsBundle }) {
  const { t } = useTranslation()
  if (!item.unlocksCraft?.length) return null
  return (
    <CatalogSection title={t('bp.unlocksCraft')} testId="bp-unlocks-craft">
      <div className="flex flex-wrap gap-1.5">
        {item.unlocksCraft.map((iid) => (
          <ItemLink
            key={iid}
            id={iid}
            name={items.text[iid]?.name ?? iid}
            icon={items.byId.get(iid)?.icon}
          />
        ))}
      </div>
    </CatalogSection>
  )
}
