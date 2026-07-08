import { Link } from '@tanstack/react-router'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@gamemap/ui'
import { CHIP, ItemGlyph, BuildingGlyph } from '../../catalog/components'
import type { TechEntry } from '../../../lib/catalog'
import type { TechResolvers } from '../techModel'
import { TechDetails } from './TechDetails'

export interface TechChipProps {
  tech: TechEntry
  resolvers: TechResolvers
  /** Wrap the chip in a hover card showing the tech's details (default true). */
  withHoverCard?: boolean
}

/**
 * A cross-link chip to a technology: its icon + name, linking to the tech on the
 * tech page (`/technology?tech=<id>`). By default it opens a hover card with the
 * tech's full details; pass `withHoverCard={false}` when the chip itself lives
 * inside another hover card (no nested cards).
 */
export function TechChip({ tech, resolvers, withHoverCard = true }: TechChipProps) {
  const name = resolvers.name(tech)
  const image = resolvers.image(tech)

  const chip = (
    <Link
      to="/technology"
      search={{ tech: tech.id }}
      className={CHIP}
      aria-label={name}
      title={name}
    >
      {image ? (
        image.kind === 'item' ? (
          <ItemGlyph icon={image.icon} />
        ) : (
          <BuildingGlyph icon={image.icon} />
        )
      ) : null}
      {name}
    </Link>
  )

  if (!withHoverCard) return chip

  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-80">
        <TechDetails
          tech={tech}
          name={name}
          description={resolvers.description(tech)}
          requireTechName={resolvers.requireTechName(tech)}
          iname={resolvers.iname}
          bname={resolvers.bname}
          itemIcon={resolvers.itemIcon}
          buildingIcon={resolvers.buildingIcon}
        />
      </HoverCardContent>
    </HoverCard>
  )
}
