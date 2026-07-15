import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { formatChance } from '../../lib/dungeons'
import type { BlueprintSource, ItemEntry, ItemsBundle } from '../../lib/catalog'
import type { PalsBundle } from '../../lib/pals'
import type { RecyclerFile } from '../../lib/recycler'
import { CatalogSection, CHIP, ItemGlyph, ItemLink, PalLink } from '../catalog/components'

// Display order of the acquisition-channel rows (mirrors the tools emitter's
// KIND_ORDER); the relic-recycler inverse row renders after all of these.
const KIND_ORDER = [
  'chest', 'fishing', 'salvage', 'supply', 'camp', 'oilrig',
  'treasureMap', 'raid', 'shrine', 'merchant', 'arena',
] as const

/** Static (non-link) sibling of the CHIP styling for source facts. */
const FACT_CHIP =
  'inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-1 text-sm'

function ChanceBadge({ pct }: { pct: number }) {
  return (
    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-primary">
      {formatChance(pct)}%
    </span>
  )
}

function TierBadge({ grade }: { grade?: number }) {
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
function useAreaLabel(items: ItemsBundle) {
  const { t } = useTranslation()
  return (area: string) => items.areaLabels[area] ?? t(`bp.area.${area}`, area)
}

function SourceChip({
  s,
  itemName,
  items,
  pals,
}: {
  s: BlueprintSource
  /** Localized name of the schematic (shrine markers are labelled by it). */
  itemName: string
  items: ItemsBundle
  pals: PalsBundle
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
      return (
        <span className="inline-flex items-center gap-1.5">
          <PalLink id={pid} name={pals.text[pid]?.name ?? pid} icon={pals.byId.get(pid)?.icon} />
          {s.chance != null ? <ChanceBadge pct={s.chance} /> : null}
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
      const shop = s.shop ?? ''
      return (
        <span className={FACT_CHIP} title={items.text[cur]?.name ?? cur}>
          {t(`bp.shop.${shop}`, shop)}
          <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
            {icon ? <ItemGlyph icon={icon} size={16} /> : null}
            <span className="tabular-nums">{s.price}</span>
          </span>
        </span>
      )
    }
    case 'arena':
      return (
        <span className={FACT_CHIP}>
          {t(`bp.arenaRank.${s.rank}`, String(s.rank))}
          <span className="shrink-0 text-xs text-muted-foreground">
            {s.repeat ? t('bp.repeatClear') : t('bp.firstClear')}
          </span>
        </span>
      )
    default:
      // chest / fishing / supply / camp / oilrig — an area fact with tier + odds.
      return (
        <span className={FACT_CHIP}>
          {areaLabel(s.area!)}
          <TierBadge grade={s.grade} />
          {s.chance != null ? <ChanceBadge pct={s.chance} /> : null}
        </span>
      )
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

/** Acquisition rows for a blueprint item's "How to obtain" section: one row
 *  per channel kind, plus the relic-recycler inverse ("recycle these relics").
 *  Renders the no-source note when the schematic has no channel at all. */
export function BlueprintSourceRows({
  item,
  items,
  pals,
  recycler,
  className,
}: {
  item: ItemEntry
  items: ItemsBundle
  pals: PalsBundle
  recycler: RecyclerFile | null
  className?: string
}) {
  const { t } = useTranslation()
  const byKind = new Map<string, BlueprintSource[]>()
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
