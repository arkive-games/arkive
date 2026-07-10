import { Link } from '@tanstack/react-router'
import { HoverCard, HoverCardTrigger } from '@gamemap/ui'
import { CHIP, ItemGlyph, BuildingGlyph, HoverCardBody, useNested } from '../../catalog/components'
import type { TechEntry } from '../../../lib/catalog'
import type { TechResolvers } from '../techModel'
import { TechDetails } from './TechDetails'

export interface TechChipProps {
  tech: TechEntry
  resolvers: TechResolvers
}

/**
 * A cross-link chip to a technology: its icon + name, linking to the tech on the
 * tech page (`/technology?tech=<id>`). It opens a hover card with the tech's
 * details — unless it is itself inside a hover card (no nested cards).
 */
export function TechChip({ tech, resolvers }: TechChipProps) {
  const nested = useNested()
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

  if (nested) return chip

  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
      <HoverCardBody className="w-80">
        <TechDetails tech={tech} resolvers={resolvers} />
      </HoverCardBody>
    </HoverCard>
  )
}
