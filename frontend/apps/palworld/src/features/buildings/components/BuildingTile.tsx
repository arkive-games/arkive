import { Link } from '@tanstack/react-router'
import { HoverCard, HoverCardTrigger } from '@gamemap/ui'
import type { BuildingEntry, BuildingsBundle, TechBundle } from '../../../lib/catalog'
import { buildingTypeLabel } from '../../catalog/labels'
import { BuildingGlyph, HoverCardBody } from '../../catalog/components'
import type { TechResolvers } from '../../technology/techModel'
import { BuildingDetails } from './BuildingDetails'

export interface BuildingTileProps {
  building: BuildingEntry
  name: string
  typeLabels: BuildingsBundle['typeLabels']
  iname: (id: string) => string
  tech: TechBundle
  techResolvers: TechResolvers
}

/**
 * A building card: a type title on top, the icon, and the name. Clicking
 * navigates to the building detail page; hovering (or focusing) opens a hover
 * card with the build materials, unlocking technology, and properties. The
 * pointer can move into the card to click its material / tech links.
 */
export function BuildingTile({
  building,
  name,
  typeLabels,
  iname,
  tech,
  techResolvers,
}: BuildingTileProps) {
  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <Link
          to="/buildings/$id"
          params={{ id: building.id }}
          data-testid="building-card"
          className="group flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-3 text-center shadow-sm transition hover:border-primary/60 hover:bg-accent"
        >
          <span className="w-full truncate text-xs uppercase tracking-wide text-muted-foreground">
            {buildingTypeLabel(building.typeA, typeLabels)}
          </span>
          {building.icon ? (
            <BuildingGlyph icon={building.icon} size={48} />
          ) : (
            <div className="size-12" />
          )}
          <span className="line-clamp-2 text-xs font-medium leading-tight">{name}</span>
        </Link>
      </HoverCardTrigger>

      <HoverCardBody className="w-72">
        <BuildingDetails
          building={building}
          name={name}
          typeLabels={typeLabels}
          iname={iname}
          tech={tech}
          techResolvers={techResolvers}
        />
      </HoverCardBody>
    </HoverCard>
  )
}
