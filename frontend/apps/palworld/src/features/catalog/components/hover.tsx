import { createContext, useContext, useState, type ReactNode } from 'react'
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
import { resolveCharacterNames, type Element, type PalsBundle, type PalEntry, type WorkType } from '../../../lib/pals'
import { palIconUrl, workIconUrl } from '../../../lib/assets'
import { itemTypeLabel, buildingTypeLabel, energyLabel } from '../labels'
// Imported from the atoms file directly (not ../../pals/components) to avoid a
// module cycle: that index re-exports PalTable/PalCard, which import from here.
import { ElementBadge } from '../../pals/components/atoms'
import { filterStrings } from '../../pals/filterStrings'
import { techImage, buildingUnlockLevel } from '../../technology/techModel'
import { CHIP, ItemGlyph, BuildingGlyph, HoverCardHeader } from './ui'

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

/** Plain (never-nested) tech chip: icon + name linking into the tech tree. Kept
 *  local instead of reusing TechChip to avoid a module cycle (TechChip imports
 *  from catalog/components); inside a hover card chips render bare anyway. */
function TechMiniChip({ id }: { id: string }) {
  const { items, buildings, tech } = useCatalogData()
  const entry = tech?.byId.get(id)
  const name = tech?.text[id]?.name ?? id

  let glyph: ReactNode = null
  const ref = entry ? techImage(entry) : null
  if (ref) {
    const icon =
      ref.kind === 'item' ? items?.byId.get(ref.id)?.icon : buildings?.byId.get(ref.id)?.icon
    if (icon) glyph = ref.kind === 'item' ? <ItemGlyph icon={icon} /> : <BuildingGlyph icon={icon} />
  }
  if (!glyph && entry?.icon) glyph = <ItemGlyph icon={entry.icon} />

  return (
    <Link to="/technology" search={{ tech: id }} className={CHIP}>
      {glyph}
      {name}
    </Link>
  )
}

/** Dropped-by cap in the compact item card. Common materials are dropped by
 *  dozens of pals (Leather: 78) — the full list lives on the detail page. */
const DROPPED_BY_MAX = 6

export function ItemSummary({ item }: { item: ItemEntry }) {
  const { t } = useTranslation()
  const { items, buildings, tech, pals } = useCatalogData()
  const name = items?.text[item.id]?.name ?? item.id
  const description = items?.text[item.id]?.description
  const elementLabel = item.element ? (pals?.enums.elements[item.element] ?? item.element) : undefined

  const props = [
    item.rarity ? `${t('item.rarity')} ${item.rarity}` : '',
    item.weight ? `${t('item.weight')} ${item.weight}` : '',
    item.maxStack ? `${t('item.stack')} ${item.maxStack}` : '',
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-2 text-left">
      <HoverCardHeader
        glyph={item.icon ? <ItemGlyph icon={item.icon} size={32} /> : null}
        name={name}
        id={item.id}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          {t('item.tag')}
        </span>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium">
          {itemTypeLabel(item.typeA, items?.typeLabels)}
        </span>
        {item.element ? (
          <ElementBadge element={item.element as Element} label={elementLabel ?? item.element} size={14} />
        ) : null}
        {props.length ? (
          <span className="text-xs tabular-nums text-muted-foreground">{props.join(' · ')}</span>
        ) : null}
      </div>
      {description ? (
        <p className="line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {item.recipe ? (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span>{t('item.section.craft')}</span>
            <span>
              {t('item.work')}:{' '}
              <span className="text-foreground tabular-nums">{item.recipe.work}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {item.recipe.materials.map((m) => (
              <MaterialChip key={m.item} id={m.item} name={items?.text[m.item]?.name ?? m.item} count={m.count} />
            ))}
          </div>
        </div>
      ) : null}
      {item.recipe?.craftedAt?.length && buildings ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t('item.craftedAt')}</div>
          <div className="flex flex-wrap gap-1.5">
            {item.recipe.craftedAt.map((bid) => (
              <BuildingLink
                key={bid}
                id={bid}
                name={buildings.text[bid]?.name ?? bid}
                icon={buildings.byId.get(bid)?.icon}
              />
            ))}
          </div>
        </div>
      ) : null}
      {item.droppedBy?.length && pals ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t('item.droppedBy')}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {item.droppedBy.slice(0, DROPPED_BY_MAX).map((pid) => (
              <PalLink
                key={pid}
                id={pid}
                name={pals.text[pid]?.name ?? pid}
                icon={pals.byId.get(pid)?.icon}
              />
            ))}
            {item.droppedBy.length > DROPPED_BY_MAX ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                +{item.droppedBy.length - DROPPED_BY_MAX}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {item.unlockTech?.length && tech ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t('item.fromTech')}</div>
          <div className="flex flex-wrap gap-1.5">
            {item.unlockTech.map((tid) => (
              <TechMiniChip key={tid} id={tid} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function BuildingSummary({ building }: { building: BuildingEntry }) {
  const { t } = useTranslation()
  const { buildings, tech } = useCatalogData()
  const name = buildings?.text[building.id]?.name ?? building.id
  const description = buildings?.text[building.id]?.description
  const energy = building.energyType ? energyLabel(building.energyType, buildings?.energyLabels) : ''
  const level = buildingUnlockLevel(building, tech)

  const props = [
    level != null ? `${t('building.level')} ${level}` : '',
    building.work ? `${t('building.work')} ${building.work}` : '',
    energy ? `${t('building.energy')} ${energy}` : '',
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-2 text-left">
      <HoverCardHeader
        glyph={building.icon ? <BuildingGlyph icon={building.icon} size={32} /> : null}
        name={name}
        id={building.id}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {t('building.tag')}
        </span>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium">
          {buildingTypeLabel(building.typeA, buildings?.typeLabels)}
        </span>
        {props.length ? (
          <span className="text-xs tabular-nums text-muted-foreground">{props.join(' · ')}</span>
        ) : null}
      </div>
      {description ? (
        <p className="line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  )
}

/** Compact work-suitability pill: work icon + level. The localized work name
 *  lives in the title tooltip; when the work type has no icon (OilExtraction)
 *  the name stands in for it. */
function WorkBadge({ work, level, label }: { work: WorkType; level: number; label: string }) {
  const [iconOk, setIconOk] = useState(true)
  return (
    <span
      title={label}
      className="inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground"
    >
      {iconOk ? (
        <img
          src={workIconUrl(work)}
          alt={label}
          width={16}
          height={16}
          loading="lazy"
          onError={() => setIconOk(false)}
          className="shrink-0 object-contain"
        />
      ) : (
        <span className="max-w-24 truncate">{label}</span>
      )}
      <span className="tabular-nums">Lv{level}</span>
    </span>
  )
}

export function PalSummary({ pal }: { pal: PalEntry }) {
  const { t, i18n } = useTranslation()
  const { pals } = useCatalogData()
  const fs = filterStrings(i18n.language)
  const name = pals?.text[pal.id]?.name ?? pal.id
  const description = resolveCharacterNames(pals?.text[pal.id]?.description, pals?.text ?? {})
  const workEntries = (Object.entries(pal.work) as [WorkType, number][])
    .filter(([, lvl]) => lvl > 0)
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="flex flex-col gap-2 text-left">
      <div className="flex items-center gap-2">
        {pal.icon ? (
          <img src={palIconUrl(pal.icon)} alt="" loading="lazy" className="size-8 shrink-0 object-contain" />
        ) : null}
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">{name}</div>
          <div className="font-mono text-xs text-muted-foreground">{pal.id}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {pal.elements.map((e) => (
          <ElementBadge key={e} element={e} label={pals?.enums.elements[e] ?? e} size={14} />
        ))}
        {pal.size ? (
          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {t('pal.stat.size')}: {pal.size}
          </span>
        ) : null}
        {pal.reaction && pal.reaction !== 'None' ? (
          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {fs.reaction}: {fs.reactions[pal.reaction] ?? pal.reaction}
          </span>
        ) : null}
      </div>
      {workEntries.length ? (
        <div className="flex flex-wrap gap-1">
          {workEntries.map(([w, lvl]) => (
            <WorkBadge key={w} work={w} level={lvl} label={pals?.enums.work[w] ?? w} />
          ))}
        </div>
      ) : null}
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

/** Wraps any existing pal `<Link>` (or other trigger) in a pal hover card. The
 *  trigger keeps its own styling (`asChild`); renders bare when nested in another
 *  hover card or when the pals bundle isn't in context. Use to enable the card on
 *  pal links that aren't the ready-made `PalLink` chip. */
export function PalHover({ id, children }: { id: string; children: ReactNode }) {
  return (
    <ChipHover kind="pal" id={id}>
      {children}
    </ChipHover>
  )
}

/** Item-flavoured sibling of `PalHover`: wraps any existing item `<Link>` (or
 *  other trigger) in an item hover card. */
export function ItemHover({ id, children }: { id: string; children: ReactNode }) {
  return (
    <ChipHover kind="item" id={id}>
      {children}
    </ChipHover>
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

/** A build/craft material: the standard item chip (icon + name) plus required
 *  count, with an item hover card. `icon` overrides the catalog-context lookup
 *  for pages that don't load the items bundle. */
export function MaterialChip({
  id,
  name,
  count,
  icon,
}: {
  id: string
  name: string
  count: number
  icon?: string
}) {
  const { items } = useCatalogData()
  const glyph = icon ?? items?.byId.get(id)?.icon
  return (
    <ChipHover kind="item" id={id}>
      <Link to="/items/$id" params={{ id }} className={CHIP}>
        {glyph ? <ItemGlyph icon={glyph} /> : null}
        <span className="min-w-0 truncate">{name}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">×{count}</span>
      </Link>
    </ChipHover>
  )
}
