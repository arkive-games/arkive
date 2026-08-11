import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, CircleHelp, PackageOpen } from 'lucide-react'
import { loadItems, type ItemEntry, type ItemSource, type ItemsBundle } from '../lib/catalog'
import { itemIconUrl } from '../lib/assets'
import type { MarkerLootKind } from '../lib/markerLoot'
import { ChanceBadge } from '../features/items/ItemSources'

const VISIBLE_LOOT_COUNT = 4

export interface MarkerLootEntry {
  item: ItemEntry
  source: ItemSource
}

export interface MarkerLootGroup {
  grade: number
  entries: MarkerLootEntry[]
}

/**
 * Reverse the item-source index for one marker loot pool. Rare items lead,
 * with the best per-roll chance breaking ties so the compact popup stays useful.
 */
export function markerLootForArea(
  items: ItemsBundle,
  area: string,
  kind: MarkerLootKind,
): MarkerLootEntry[] {
  const entries: MarkerLootEntry[] = []
  for (const item of items.items) {
    const source = item.sources?.find((s) => s.kind === kind && s.area === area)
    if (source) entries.push({ item, source })
  }
  return entries.sort((a, b) =>
    b.item.rarity - a.item.rarity
    || (b.source.chance ?? -1) - (a.source.chance ?? -1)
    || (b.source.grade ?? 0) - (a.source.grade ?? 0)
    || a.item.sortId - b.item.sortId,
  )
}

export function groupMarkerLootByGrade(entries: MarkerLootEntry[]): MarkerLootGroup[] {
  const groups = new Map<number, MarkerLootEntry[]>()
  for (const entry of entries) {
    const grade = entry.source.grade ?? 0
    const group = groups.get(grade)
    if (group) group.push(entry)
    else groups.set(grade, [entry])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([grade, groupedEntries]) => ({ grade, entries: groupedEntries }))
}

function UnavailableLoot() {
  const { t } = useTranslation()
  return (
    <div
      data-testid="marker-loot-unavailable"
      className="mt-3 flex items-start gap-2 border-t border-border/80 pt-3 text-xs leading-relaxed text-muted-foreground"
    >
      <CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>{t('mapControls.lootUnavailable')}</span>
    </div>
  )
}

export function MarkerLootSummary({ lootArea, kind }: { lootArea?: string; kind: MarkerLootKind }) {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const [items, setItems] = useState<ItemsBundle | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!lootArea) return
    let cancelled = false
    setItems(null)
    setFailed(false)
    loadItems(lng)
      .then((bundle) => {
        if (!cancelled) setItems(bundle)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [lng, lootArea])

  const loot = useMemo(
    () => (items && lootArea ? markerLootForArea(items, lootArea, kind) : []),
    [items, lootArea, kind],
  )
  const visibleLootGroups = useMemo(
    () => groupMarkerLootByGrade(loot.slice(0, VISIBLE_LOOT_COUNT)),
    [loot],
  )

  if (!lootArea) return <UnavailableLoot />

  const areaLabel = items
    ? items.areaLabels[lootArea] ?? t(`bp.area.${lootArea}`, lootArea)
    : lootArea
  const itemText = items?.text ?? {}

  return (
    <section data-testid="marker-loot-summary" className="mt-3 border-t border-border/80 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <PackageOpen className="size-4 shrink-0 text-primary" aria-hidden />
            {t('pal.section.drops')}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground" data-testid="marker-loot-area">
            <span data-testid="marker-loot-kind">{t(`bp.kind.${kind}`)}</span>
            {' / '}{areaLabel}
            <span className="ml-1 font-mono opacity-70">{lootArea}</span>
          </div>
        </div>
        {items && loot.length ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {t('resultsCount', { count: loot.length })}
          </span>
        ) : null}
      </div>

      {!items && !failed ? (
        <div className="mt-2 divide-y divide-border/70" aria-label={t('catalogLoading')}>
          <div className="h-6 animate-pulse bg-secondary/60" />
          {Array.from({ length: VISIBLE_LOOT_COUNT }, (_, i) => (
            <div key={i} className="h-10 animate-pulse bg-secondary/40" />
          ))}
        </div>
      ) : failed || !loot.length ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {failed ? t('loadError') : t('mapControls.lootUnavailable')}
        </p>
      ) : (
        <div className="mt-2 space-y-1.5" data-testid="marker-loot-items">
          {visibleLootGroups.map((group) => (
            <div key={group.grade} data-testid="marker-loot-grade-group">
              <div className="flex min-h-6 items-center bg-secondary/45 px-2">
                <span className="text-xs text-muted-foreground">
                  {t('mapControls.lootTier', { n: group.grade })}
                </span>
              </div>
              <div className="divide-y divide-border/70">
                {group.entries.map(({ item, source }) => (
                  <Link
                    key={item.id}
                    to="/items/$id"
                    params={{ id: item.id }}
                    data-testid="marker-loot-item"
                    className="flex min-h-9 items-center gap-2 py-1.5 text-xs transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded bg-secondary/70">
                      {item.icon ? (
                        <img src={itemIconUrl(item.icon)} alt="" className="size-5 object-contain" />
                      ) : (
                        <PackageOpen className="size-4 text-muted-foreground" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {itemText[item.id]?.name ?? item.id}
                    </span>
                    {source.chance != null ? <ChanceBadge pct={source.chance} /> : null}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        to="/regions/$id"
        params={{ id: lootArea }}
        data-testid="marker-loot-region-link"
        className="mt-2 inline-flex min-h-7 items-center gap-0.5 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('bp.viewRegion')}
        <ChevronRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  )
}
