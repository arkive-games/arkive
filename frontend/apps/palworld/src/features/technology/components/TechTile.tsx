import { useTranslation } from 'react-i18next'
import { cn, HoverCard, HoverCardTrigger } from '@gamemap/ui'
import { ItemGlyph, BuildingGlyph, HoverCardBody } from '../../catalog/components'
import type { TechEntry } from '../../../lib/catalog'
import { techType, type TechResolvers } from '../techModel'
import { TechDetails } from './TechDetails'

export interface TechTileProps {
  tech: TechEntry
  resolvers: TechResolvers
  /** When true, draw an attention ring — used when deep-linked via ?tech=<id>. */
  highlighted?: boolean
}

/**
 * A square technology tile: type badge on top, a large icon in the middle, and
 * the name + tech-point cost at the bottom. Hovering (or focusing) the tile
 * opens a hover card with full details; the pointer can move into the card to
 * click its unlock links.
 */
export function TechTile({ tech, resolvers, highlighted = false }: TechTileProps) {
  const { t } = useTranslation()
  const ancient = tech.isBoss
  const type = techType(tech)
  const name = resolvers.name(tech)
  const image = resolvers.image(tech)
  const typeLabel = type === 'item' ? t('tech.typeItem') : t('tech.typeStructure')

  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          id={`tech-${tech.id}`}
          data-testid="tech-tile"
          aria-label={name}
          title={name}
          className={cn(
            'group flex aspect-square w-full flex-col overflow-hidden rounded-md border bg-card shadow-sm transition',
            'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            ancient
              ? 'border-purple-400/60 hover:border-purple-400'
              : 'border-sky-400/50 hover:border-sky-400',
            highlighted && 'ring-2 ring-amber-400 ring-offset-2 ring-offset-background',
          )}
        >
          <span
            className={cn(
              'flex items-center gap-2 px-2 py-0.5 text-xs font-medium uppercase tracking-wide',
              ancient
                ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300'
                : 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
            )}
          >
            <span className="min-w-0 flex-1 truncate text-left">{typeLabel}</span>
            <span className="shrink-0 normal-case tabular-nums">
              {t('tech.cost', { count: tech.cost })}
            </span>
          </span>

          <span className="flex min-h-0 flex-1 items-center justify-center p-2">
            {image ? (
              image.kind === 'item' ? (
                <ItemGlyph icon={image.icon} size={72} />
              ) : (
                <BuildingGlyph icon={image.icon} size={72} />
              )
            ) : (
              <span className="size-16 rounded bg-secondary" aria-hidden />
            )}
          </span>

          <span className="block truncate px-2 pb-1.5 text-center text-xs font-medium leading-tight">
            {name}
          </span>
        </button>
      </HoverCardTrigger>

      <HoverCardBody side="right" className="w-80">
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
      </HoverCardBody>
    </HoverCard>
  )
}
