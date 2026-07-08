import { createContext, useContext, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@gamemap/ui'
import type {
  ItemsBundle,
  BuildingsBundle,
  TechBundle,
  ItemEntry,
  BuildingEntry,
} from '../../../lib/catalog'
import type { PalsBundle, PalEntry } from '../../../lib/pals'
import { palIconUrl } from '../../../lib/assets'
import { itemTypeLabel, buildingTypeLabel } from '../labels'
import { CHIP, ItemGlyph, BuildingGlyph } from './ui'

// --- context -----------------------------------------------------------------
// Chips render their own hover card by pulling the loaded bundles from context,
// so pages just wrap their content in <CatalogDataProvider> once. A chip that is
// itself inside a hover card reads `nested` and renders plain (no nested cards).

export interface CatalogData {
  items?: ItemsBundle
  buildings?: BuildingsBundle
  tech?: TechBundle
  pals?: PalsBundle
}

const DataContext = createContext<CatalogData>({})
const NestedContext = createContext(false)

export function CatalogDataProvider({ children, ...data }: CatalogData & { children: ReactNode }) {
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>
}

export const useCatalogData = () => useContext(DataContext)
export const useNested = () => useContext(NestedContext)

/** A HoverCardContent whose subtree is marked "inside a hover card" so any chips
 *  it contains render plain (no recursively-nested hover cards). */
export function HoverCardBody({
  children,
  className,
  side,
  align = 'start',
}: {
  children: ReactNode
  className?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
}) {
  return (
    <HoverCardContent side={side} align={align} className={className}>
      <NestedContext.Provider value={true}>{children}</NestedContext.Provider>
    </HoverCardContent>
  )
}

// --- compact summaries (hover-card bodies) -----------------------------------

function PropsLine({ rows }: { rows: Array<[string, ReactNode]> }) {
  if (!rows.length) return null
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {rows.map(([label, value]) => (
        <span key={label}>
          {label}: <span className="text-foreground tabular-nums">{value}</span>
        </span>
      ))}
    </div>
  )
}

export function ItemSummary({ item }: { item: ItemEntry }) {
  const { t } = useTranslation()
  const { items, pals } = useCatalogData()
  const name = items?.text[item.id]?.name ?? item.id
  const description = items?.text[item.id]?.description
  const elementLabel = item.element ? (pals?.enums.elements[item.element] ?? item.element) : undefined

  const rows: Array<[string, ReactNode]> = []
  if (item.rarity) rows.push([t('item.rarity'), item.rarity])
  if (elementLabel) rows.push([t('item.element'), elementLabel])
  if (item.weight) rows.push([t('item.weight'), item.weight])
  if (item.maxStack) rows.push([t('item.stack'), item.maxStack])

  return (
    <div className="flex flex-col gap-2 text-left">
      <div className="flex items-center gap-2">
        {item.icon ? <ItemGlyph icon={item.icon} size={32} /> : null}
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">{name}</div>
          <div className="text-xs text-muted-foreground">
            {itemTypeLabel(item.typeA, items?.typeLabels)}
          </div>
        </div>
      </div>
      <PropsLine rows={rows} />
      {description ? (
        <p className="line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  )
}

export function BuildingSummary({ building }: { building: BuildingEntry }) {
  const { t } = useTranslation()
  const { buildings } = useCatalogData()
  const name = buildings?.text[building.id]?.name ?? building.id
  const description = buildings?.text[building.id]?.description
  const energy = building.energyType ? building.energyType.replace(/^E[A-Za-z]+::/, '') : ''

  const rows: Array<[string, ReactNode]> = []
  if (building.rank) rows.push([t('building.rank'), building.rank])
  if (building.work) rows.push([t('building.work'), building.work])
  if (energy) rows.push([t('building.energy'), energy])

  return (
    <div className="flex flex-col gap-2 text-left">
      <div className="flex items-center gap-2">
        {building.icon ? <BuildingGlyph icon={building.icon} size={32} /> : null}
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">{name}</div>
          <div className="text-xs text-muted-foreground">
            {buildingTypeLabel(building.typeA, buildings?.typeLabels)}
          </div>
        </div>
      </div>
      <PropsLine rows={rows} />
      {description ? (
        <p className="line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  )
}

export function PalSummary({ pal }: { pal: PalEntry }) {
  const { pals } = useCatalogData()
  const name = pals?.text[pal.id]?.name ?? pal.id
  const description = pals?.text[pal.id]?.description
  const elements = pal.elements.map((e) => pals?.enums.elements[e] ?? e).join(' · ')

  return (
    <div className="flex flex-col gap-2 text-left">
      <div className="flex items-center gap-2">
        {pal.icon ? (
          <img src={palIconUrl(pal.icon)} alt="" loading="lazy" className="size-8 shrink-0 object-contain" />
        ) : null}
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">{name}</div>
          {elements ? <div className="text-xs text-muted-foreground">{elements}</div> : null}
        </div>
      </div>
      {description ? (
        <p className="line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  )
}

// --- chip wrapper + chips ----------------------------------------------------

type ChipKind = 'item' | 'building' | 'pal'

/** Wraps a chip trigger in the matching hover card. Renders the bare trigger
 *  when nested inside another hover card, or when the target isn't loaded. */
function ChipHover({ kind, id, children }: { kind: ChipKind; id: string; children: ReactNode }) {
  const nested = useNested()
  const { items, buildings, pals } = useCatalogData()

  let body: ReactNode = null
  if (!nested) {
    if (kind === 'item') {
      const e = items?.byId.get(id)
      if (e) body = <ItemSummary item={e} />
    } else if (kind === 'building') {
      const e = buildings?.byId.get(id)
      if (e) body = <BuildingSummary building={e} />
    } else {
      const e = pals?.byId.get(id)
      if (e) body = <PalSummary pal={e} />
    }
  }

  if (!body) return <>{children}</>
  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardBody className="w-72">{body}</HoverCardBody>
    </HoverCard>
  )
}

/** Cross-link chip to an item detail page (icon + name) with an item hover card. */
export function ItemLink({ id, name, icon }: { id: string; name: string; icon?: string }) {
  return (
    <ChipHover kind="item" id={id}>
      <Link to="/items/$id" params={{ id }} className={CHIP}>
        {icon ? <ItemGlyph icon={icon} /> : null}
        {name}
      </Link>
    </ChipHover>
  )
}

/** Cross-link chip to a building detail page (icon + name) with a building hover card. */
export function BuildingLink({ id, name, icon }: { id: string; name: string; icon?: string }) {
  return (
    <ChipHover kind="building" id={id}>
      <Link to="/buildings/$id" params={{ id }} className={CHIP}>
        {icon ? <BuildingGlyph icon={icon} /> : null}
        {name}
      </Link>
    </ChipHover>
  )
}

/** Cross-link chip to a pal detail page (icon + name) with a pal hover card. */
export function PalLink({ id, name, icon }: { id: string; name: string; icon?: string }) {
  return (
    <ChipHover kind="pal" id={id}>
      <Link to="/pals/$id" params={{ id }} className={CHIP}>
        {icon ? (
          <img src={palIconUrl(icon)} alt="" loading="lazy" className="size-5 shrink-0 object-contain" />
        ) : null}
        {name}
      </Link>
    </ChipHover>
  )
}

/** A build/craft material: item link + required count, with an item hover card. */
export function MaterialRow({ id, name, count }: { id: string; name: string; count: number }) {
  return (
    <ChipHover kind="item" id={id}>
      <Link
        to="/items/$id"
        params={{ id }}
        className="flex items-center gap-2 py-1.5 text-sm transition first:pt-0 last:pb-0 hover:text-primary"
      >
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">×{count}</span>
      </Link>
    </ChipHover>
  )
}
