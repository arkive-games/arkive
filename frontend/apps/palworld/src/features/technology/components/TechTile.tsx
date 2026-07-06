import { useTranslation } from 'react-i18next'
import { cn, HoverCard, HoverCardTrigger, HoverCardContent } from '@gamemap/ui'
import { ItemGlyph, BuildingGlyph } from '../../catalog/components'
import type { TechEntry } from '../../../lib/catalog'
import { techType, type TechImageRef } from '../techModel'
import { TechDetails } from './TechDetails'

/** The icon shown on a tile, resolved to a concrete icon texture id. */
export interface ResolvedTechImage {
  kind: TechImageRef['kind']
  icon: string
}

/** Lookups the tile needs to render itself and its hover-card details. */
export interface TechResolvers {
  name: (tech: TechEntry) => string
  description: (tech: TechEntry) => string | undefined
  image: (tech: TechEntry) => ResolvedTechImage | null
  requireTechName: (tech: TechEntry) => string | undefined
  iname: (id: string) => string
  bname: (id: string) => string
  itemIcon: (id: string) => string | undefined
  buildingIcon: (id: string) => string | undefined
}

export interface TechTileProps {
  tech: TechEntry
  resolvers: TechResolvers
}

/**
 * A square technology tile: type badge on top, a large icon in the middle, and
 * the name + tech-point cost at the bottom. Hovering (or focusing) the tile
 * opens a hover card with full details; the pointer can move into the card to
 * click its unlock links.
 */
export function TechTile({ tech, resolvers }: TechTileProps) {
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
          data-testid="tech-tile"
          aria-label={name}
          title={name}
          className={cn(
            'group flex aspect-square w-36 flex-col overflow-hidden rounded-md border bg-card text-left shadow-sm transition',
            'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            ancient
              ? 'border-purple-400/60 hover:border-purple-400'
              : 'border-sky-400/50 hover:border-sky-400',
          )}
        >
          <span
            className={cn(
              'px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              ancient
                ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300'
                : 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
            )}
          >
            {typeLabel}
          </span>

          <span className="flex min-h-0 flex-1 items-center justify-center p-2">
            {image ? (
              image.kind === 'item' ? (
                <ItemGlyph icon={image.icon} size={96} />
              ) : (
                <BuildingGlyph icon={image.icon} size={96} />
              )
            ) : (
              <span className="size-16 rounded bg-secondary" aria-hidden />
            )}
          </span>

          <span className="flex items-end justify-between gap-1 px-2 pb-1.5">
            <span className="line-clamp-2 text-xs font-medium leading-tight">{name}</span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {t('tech.cost', { count: tech.cost })}
            </span>
          </span>
        </button>
      </HoverCardTrigger>

      <HoverCardContent side="right" align="start" className="w-80">
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
