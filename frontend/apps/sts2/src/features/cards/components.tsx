import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button, cn } from '@gamemap/ui'
import type { Bundle, Card, Character } from '../../lib/data'
import { iconUrl } from '../../lib/urls'
import { CardText } from '../../lib/cardText'
import { toggle, type CardFilter } from './useFilteredCards'

/** Deck accent colour, taken from the game's own card pool. */
export function usePoolColors(bundle: Bundle | null): Record<string, string> {
  const colors: Record<string, string> = {}
  for (const c of bundle?.characters ?? []) {
    if (c.pool && c.color) colors[c.pool] = c.color
  }
  return colors
}

/** Cost pip. -1 means the card is unplayable (curses, statuses). */
export function CostBadge({ cost, className }: { cost: number; className?: string }) {
  const { t } = useTranslation()
  const label = cost < 0 ? t('card.unplayable') : String(cost)
  return (
    <span
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-sm font-bold tabular-nums text-secondary-foreground',
        className,
      )}
      title={t('card.cost')}
    >
      {label}
    </span>
  )
}

/** Card art, or a neutral placeholder for the handful of cards with none yet. */
export function CardArt({ card, className }: { card: Card; className?: string }) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)

  if (!card.icon || failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-md border border-dashed border-border bg-muted px-2 text-center text-xs text-muted-foreground',
          className,
        )}
      >
        {t('card.noArt')}
      </div>
    )
  }

  return (
    <img
      src={iconUrl(card.icon)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('object-contain', className)}
    />
  )
}

export function CardTile({ card, name, poolColor }: { card: Card; name: string; poolColor?: string }) {
  return (
    <Link
      to="/cards/$id"
      params={{ id: card.id }}
      data-testid="card-tile"
      className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-2 shadow-sm transition hover:border-primary/60 hover:bg-accent/10"
      style={poolColor ? { borderTopColor: poolColor, borderTopWidth: 3 } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <CostBadge cost={card.cost} />
        <span className="text-right text-xs leading-normal text-muted-foreground">{card.rarity}</span>
      </div>
      <CardArt card={card} className="h-24 w-full" />
      <span className="line-clamp-2 text-center text-xs font-medium leading-tight">{name}</span>
    </Link>
  )
}

/** Rendered card rules text, with the numbers spliced into the template. */
export function CardDescription({
  card,
  bundle,
  upgraded = false,
  className,
}: {
  card: Card
  bundle: Bundle
  upgraded?: boolean
  className?: string
}) {
  const description = bundle.cardText[card.id]?.description
  if (!description) return null
  return (
    <p className={cn('text-sm leading-relaxed', className)}>
      <CardText text={description} vars={card.vars} upgraded={upgraded} keyPrefix={card.id} />
    </p>
  )
}

function Chip({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  color?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-accent/10',
      )}
      style={active && color ? { backgroundColor: color, borderColor: color, color: '#fff' } : undefined}
    >
      {children}
    </button>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

export function CardFilters({
  bundle,
  filter,
  onChange,
}: {
  bundle: Bundle
  filter: CardFilter
  onChange: (f: CardFilter) => void
}) {
  const { t } = useTranslation()
  const colors = usePoolColors(bundle)
  const { pools, types, rarities, costs } = bundle.filters

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <Group label={t('card.filters.pool')}>
        {pools.map((p) => (
          <Chip
            key={p}
            active={filter.pools.includes(p)}
            color={colors[p]}
            onClick={() => onChange({ ...filter, pools: toggle(filter.pools, p) })}
          >
            {p}
          </Chip>
        ))}
      </Group>
      <Group label={t('card.filters.type')}>
        {types.map((x) => (
          <Chip key={x} active={filter.types.includes(x)} onClick={() => onChange({ ...filter, types: toggle(filter.types, x) })}>
            {x}
          </Chip>
        ))}
      </Group>
      <Group label={t('card.filters.rarity')}>
        {rarities.map((x) => (
          <Chip key={x} active={filter.rarities.includes(x)} onClick={() => onChange({ ...filter, rarities: toggle(filter.rarities, x) })}>
            {x}
          </Chip>
        ))}
      </Group>
      <Group label={t('card.filters.cost')}>
        {costs.map((x) => (
          <Chip key={x} active={filter.costs.includes(x)} onClick={() => onChange({ ...filter, costs: toggle(filter.costs, x) })}>
            {x}
          </Chip>
        ))}
      </Group>
    </div>
  )
}

export function PageLoading() {
  const { t } = useTranslation()
  return <div className="mt-12 text-center text-sm text-muted-foreground">{t('loading')}</div>
}

export function NotFound() {
  const { t } = useTranslation()
  return <div className="mt-12 text-center text-sm text-muted-foreground">{t('notFound')}</div>
}

/** Character portrait + name, used by both the roster and card detail. */
export function CharacterBadge({ character, name }: { character: Character; name: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      {character.icon ? (
        <img src={iconUrl(character.icon)} alt="" loading="lazy" className="size-6 object-contain" />
      ) : null}
      <span style={character.color ? { color: character.color } : undefined} className="font-medium">
        {name}
      </span>
    </span>
  )
}

export function ClearFiltersButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      {t('card.clearFilters')}
    </Button>
  )
}
