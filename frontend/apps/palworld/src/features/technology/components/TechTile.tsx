import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  cn,
  HoverCard,
  HoverCardTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@gamemap/ui'
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
 *
 * On a phone that hover card is unreachable and the tile has no other action —
 * `TechDetails` is rendered nowhere else, so cost, materials and unlocks were
 * simply not readable from the tech tree. There the tile opens a bottom sheet
 * with the same details instead. It keeps the HoverCard on desktop rather than
 * using the shared `Hint`, because a tooltip cannot be moused into and the
 * details contain links.
 */
export function TechTile({ tech, resolvers, highlighted = false }: TechTileProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)
  // Rotating a phone crosses the mobile breakpoint (390x844 is 844px wide in
  // landscape), and a surviving open state would reopen the sheet by itself on
  // the way back to portrait.
  useEffect(() => {
    if (!isMobile) setSheetOpen(false)
  }, [isMobile])
  const ancient = tech.isBoss
  const type = techType(tech)
  const name = resolvers.name(tech)
  const image = resolvers.image(tech)
  const typeLabel = type === 'item' ? t('tech.typeItem') : t('tech.typeStructure')
  const glyphSize = isMobile ? 40 : 72

  const tile = (
        <button
          type="button"
          id={`tech-${tech.id}`}
          data-testid="tech-tile"
          aria-label={name}
          // Inert on desktop (the hover card does the work); on a phone the tap
          // is the only way in, so it opens the sheet.
          onClick={isMobile ? () => setSheetOpen(true) : undefined}
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
              'flex items-center py-0.5 text-xs font-medium uppercase',
              isMobile ? 'gap-0.5 px-1' : 'gap-2 px-2',
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

          <span className={cn('flex min-h-0 flex-1 items-center justify-center', isMobile ? 'p-1' : 'p-2')}>
            {image ? (
              image.kind === 'item' ? (
                <ItemGlyph icon={image.icon} size={glyphSize} />
              ) : (
                <BuildingGlyph icon={image.icon} size={glyphSize} />
              )
            ) : (
              <span className={cn('rounded bg-secondary', isMobile ? 'size-10' : 'size-16')} aria-hidden />
            )}
          </span>

          <span className={cn('block truncate text-center text-xs font-medium leading-tight', isMobile ? 'px-1 pb-1' : 'px-2 pb-1.5')}>
            {name}
          </span>
        </button>
  )

  if (isMobile) {
    return (
      <>
        {tile}
        {/* Mounted only while open. The tech tree renders all 588 tiles at once
            (no incremental reveal), so a permanently-mounted dialog root per
            tile would be 588 of them; the cost is losing the close animation. */}
        {sheetOpen ? (
          <Sheet open onOpenChange={setSheetOpen}>
            <SheetContent
              side="bottom"
              data-testid="tech-tile-sheet"
              className="max-h-[85dvh]"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
            >
              <SheetHeader>
                <SheetTitle>{name}</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <TechDetails tech={tech} resolvers={resolvers} />
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
      </>
    )
  }

  return (
    <HoverCard openDelay={120} closeDelay={120}>
      <HoverCardTrigger asChild>{tile}</HoverCardTrigger>

      <HoverCardBody side="right" className="w-80">
        <TechDetails tech={tech} resolvers={resolvers} />
      </HoverCardBody>
    </HoverCard>
  )
}
