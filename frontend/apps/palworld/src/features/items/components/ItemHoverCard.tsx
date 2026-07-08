import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@gamemap/ui'
import type { ItemEntry, TypeLabels } from '../../../lib/catalog'
import { itemTypeLabel } from '../../catalog/labels'
import { ItemGlyph } from '../../catalog/components'

export interface ItemDetailsProps {
  item: ItemEntry
  name: string
  typeLabels: TypeLabels
  description?: string
  /** Localized element name (resolved from enums by the caller), if any. */
  elementLabel?: string
}

/** Compact item summary — the body shown inside the item hover card. */
export function ItemDetails({ item, name, typeLabels, description, elementLabel }: ItemDetailsProps) {
  const { t } = useTranslation()

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
          <div className="text-xs text-muted-foreground">{itemTypeLabel(item.typeA, typeLabels)}</div>
        </div>
      </div>

      {rows.length ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {rows.map(([label, value]) => (
            <span key={label}>
              {label}: <span className="text-foreground tabular-nums">{value}</span>
            </span>
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

export interface ItemHoverCardProps extends ItemDetailsProps {
  /** The trigger (an item link/row); click still navigates. */
  children: ReactNode
}

/** Wraps a trigger in a hover card that shows the item's compact details. */
export function ItemHoverCard({ children, ...details }: ItemHoverCardProps) {
  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-72">
        <ItemDetails {...details} />
      </HoverCardContent>
    </HoverCard>
  )
}
