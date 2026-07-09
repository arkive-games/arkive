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
          title={name}
          className="group flex aspect-square w-full flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm transition hover:border-primary/60 hover:bg-accent"
        >
          <span className="flex items-center bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span className="min-w-0 max-w-full truncate text-left">
              {buildingTypeLabel(building.typeA, typeLabels)}
            </span>
          </span>
          <span className="flex min-h-0 flex-1 items-center justify-center p-2">
            {building.icon ? (
              <BuildingGlyph icon={building.icon} size={72} />
            ) : (
              <span className="size-16 rounded bg-secondary" aria-hidden />
            )}
          </span>
          <span className="block truncate px-2 pb-1.5 text-center text-xs font-medium leading-tight">{name}</span>
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
