import { useTranslation } from 'react-i18next'
import { cn } from '@gamemap/ui'
import { ItemGlyph, BuildingGlyph } from '../../catalog/components'
import type { TechType, TechImageRef } from '../techModel'

/** The icon shown on a tile, resolved to a concrete icon texture id. */
export interface ResolvedTechImage {
  kind: TechImageRef['kind']
  icon: string
}

export interface TechTileProps {
  name: string
  type: TechType
  cost: number
  ancient: boolean
  /** Resolved icon (item/building), or null when no texture is available. */
  image: ResolvedTechImage | null
  onSelect: () => void
}

/**
 * A single technology tile: type badge on top, icon in the middle, name and
 * tech-point cost at the bottom. Clicking opens the details dialog.
 */
export function TechTile({ name, type, cost, ancient, image, onSelect }: TechTileProps) {
  const { t } = useTranslation()
  const typeLabel = type === 'item' ? t('tech.typeItem') : t('tech.typeStructure')

  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="tech-tile"
      aria-label={name}
      title={name}
      className={cn(
        'group flex w-full flex-col overflow-hidden rounded-md border bg-card text-left shadow-sm transition',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ancient ? 'border-purple-400/60 hover:border-purple-400' : 'border-sky-400/50 hover:border-sky-400',
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

      <span className="flex items-center justify-center px-2 py-2">
        <span className="flex size-12 items-center justify-center">
          {image ? (
            image.kind === 'item' ? (
              <ItemGlyph icon={image.icon} size={44} />
            ) : (
              <BuildingGlyph icon={image.icon} size={44} />
            )
          ) : (
            <span className="size-9 rounded bg-secondary" aria-hidden />
          )}
        </span>
      </span>

      <span className="flex items-center justify-between gap-1 px-2 pb-1.5">
        <span className="line-clamp-2 text-xs font-medium leading-tight">{name}</span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {t('tech.cost', { count: cost })}
        </span>
      </span>
    </button>
  )
}
