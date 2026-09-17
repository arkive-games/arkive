import { useEffect, useMemo, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { ContentPage } from '@/components/ContentPage'
import {
  attributeMap,
  formatAttributeValue,
  loadAutoChessAttributes,
  loadAutoChessBonds,
  loadAutoChessPieces,
  plainText,
  type AutoChessAttribute,
  type AutoChessBond,
  type AutoChessPiece,
  type AutoChessStar,
} from '@/features/autochess/data'
import { Chip, FilterRow } from '@/features/autochess/Filters'
import { useAutoChess } from '@/features/autochess/useAutoChess'

/** Cost is the mode's own rarity axis, so it carries the colour. */
const COST_CLASS: Record<number, string> = {
  1: 'border-border bg-card',
  2: 'border-emerald-400/60 bg-emerald-50/40 dark:border-emerald-700 dark:bg-emerald-950/20',
  3: 'border-sky-400/60 bg-sky-50/40 dark:border-sky-700 dark:bg-sky-950/20',
  4: 'border-violet-400/70 bg-violet-50/40 dark:border-violet-700 dark:bg-violet-950/20',
  5: 'border-amber-400/70 bg-amber-50/45 dark:border-amber-700 dark:bg-amber-950/20',
}

const COST_BADGE_CLASS: Record<number, string> = {
  1: 'border-border text-muted-foreground',
  2: 'border-emerald-400/70 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300',
  3: 'border-sky-400/70 text-sky-700 dark:border-sky-700 dark:text-sky-300',
  4: 'border-violet-400/70 text-violet-700 dark:border-violet-700 dark:text-violet-300',
  5: 'border-amber-400/80 text-amber-700 dark:border-amber-700 dark:text-amber-300',
}

export default function AutoChessPiecesPage() {
  const { t } = useTranslation()
  const pieces = useAutoChess(loadAutoChessPieces)
  const bonds = useAutoChess(loadAutoChessBonds)
  const attributes = useAutoChess(loadAutoChessAttributes)

  const [cost, setCost] = useState(0)
  const [bondId, setBondId] = useState(0)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    document.title = `${t('autochess.pieces.title')} - ${t('siteTitle')}`
  }, [t])

  const bondsById = useMemo(
    () => new Map((bonds.data ?? []).map((bond) => [bond.id, bond])),
    [bonds.data],
  )
  const attrs = useMemo(() => attributeMap(attributes.data ?? []), [attributes.data])

  // Memoised, not `pieces.data ?? []` inline: a fresh [] every render would
  // change the identity every dependent useMemo keys on, so none of them would
  // ever hit.
  const all = useMemo(() => pieces.data ?? [], [pieces.data])
  const costs = useMemo(() => [...new Set(all.map((piece) => piece.cost))].sort((a, b) => a - b), [all])

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return all.filter((piece) => {
      if (cost && piece.cost !== cost) return false
      if (bondId && !piece.bondIds.includes(bondId)) return false
      if (!needle) return true
      const haystack = [
        piece.name,
        piece.role,
        piece.positionDescription,
        ...piece.stars.map((star) => `${star.skill.name} ${star.skill.description}`),
        ...piece.bondIds.map((id) => bondsById.get(id)?.name ?? ''),
      ]
        .join(' ')
        .toLocaleLowerCase()
      return haystack.includes(needle)
    })
  }, [all, cost, bondId, query, bondsById])

  if (pieces.error || bonds.error || attributes.error) {
    return (
      <ContentPage active="/autochess" title={t('autochess.pieces.title')} heading wide>
        <p className="text-sm text-muted-foreground">{t('autochess.loadError')}</p>
      </ContentPage>
    )
  }
  if (pieces.loading || bonds.loading || attributes.loading) {
    return (
      <ContentPage active="/autochess" title={t('autochess.pieces.title')} heading wide>
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </ContentPage>
    )
  }

  return (
    <ContentPage active="/autochess" title={t('autochess.pieces.title')} heading wide>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('autochess.pieces.description', { count: all.length })}
      </p>

      <div className="mb-4 flex flex-col gap-3">
        <FilterRow label={t('autochess.pieces.costFilter')}>
          <Chip active={cost === 0} onClick={() => setCost(0)}>{t('autochess.all')}</Chip>
          {costs.map((value) => (
            <Chip key={value} active={cost === value} onClick={() => setCost(value)}>
              {t('autochess.pieces.cost', { cost: value })}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label={t('autochess.pieces.bondFilter')}>
          <Chip active={bondId === 0} onClick={() => setBondId(0)}>{t('autochess.all')}</Chip>
          {(bonds.data ?? []).map((bond) => (
            <Chip key={bond.id} active={bondId === bond.id} onClick={() => setBondId(bond.id)}>
              {bond.name}
            </Chip>
          ))}
        </FilterRow>

        <label className="relative block">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('autochess.pieces.searchPlaceholder')}
            aria-label={t('autochess.pieces.searchPlaceholder')}
          />
        </label>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {t('autochess.pieces.resultCount', { count: filtered.length })}
      </p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((piece) => (
          <PieceCard
            key={piece.baseId}
            piece={piece}
            bondsById={bondsById}
            attrs={attrs}
            open={openId === piece.baseId}
            onToggle={() => setOpenId(openId === piece.baseId ? null : piece.baseId)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('autochess.empty')}</p>
      ) : null}
    </ContentPage>
  )
}

function PieceCard({
  piece,
  bondsById,
  attrs,
  open,
  onToggle,
}: {
  piece: AutoChessPiece
  bondsById: Map<number, AutoChessBond>
  attrs: Map<number, AutoChessAttribute>
  open: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  // Highest star first: it is the form a player plans around.
  const stars = [...piece.stars].sort((a, b) => b.starLevel - a.starLevel)
  const shown = open ? stars : stars.slice(0, 1)

  return (
    <article className={`rounded-lg border p-4 shadow-sm ${COST_CLASS[piece.cost] ?? 'border-border bg-card'}`}>
      <header className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold">{piece.name}</h2>
        <span className={`rounded border px-1.5 py-0.5 text-xs ${COST_BADGE_CLASS[piece.cost] ?? 'border-border'}`}>
          {t('autochess.pieces.cost', { cost: piece.cost })}
        </span>
        <span className="text-sm text-muted-foreground">{piece.role}</span>
      </header>

      <p className="mt-1 text-sm text-muted-foreground">{plainText(piece.positionDescription)}</p>

      <ul className="mt-2 flex flex-wrap gap-1.5">
        {piece.bondIds.map((id) => (
          <li key={id} className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
            {bondsById.get(id)?.name ?? id}
          </li>
        ))}
      </ul>

      {shown.map((star) => (
        <StarBlock key={star.chessId} star={star} attrs={attrs} />
      ))}

      {stars.length > 1 ? (
        <button
          type="button"
          onClick={onToggle}
          className="mt-3 text-sm font-medium text-primary hover:underline"
        >
          {open ? t('autochess.pieces.collapse') : t('autochess.pieces.expand', { count: stars.length })}
        </button>
      ) : null}
    </article>
  )
}

function StarBlock({
  star,
  attrs,
}: {
  star: AutoChessStar
  attrs: Map<number, AutoChessAttribute>
}) {
  const { t } = useTranslation()
  return (
    <section className="mt-3 border-t border-border/70 pt-3">
      <h3 className="text-sm font-semibold">
        {t('autochess.pieces.star', { star: star.starLevel })}
        <span className="ml-2 font-normal text-muted-foreground">
          {t('autochess.pieces.attackRange', { range: star.attackRange })}
        </span>
      </h3>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
        {star.attributes.map((entry) => {
          const attribute = attrs.get(entry.attributeId)
          if (!attribute) return null
          return (
            <div key={entry.attributeId} className="flex justify-between gap-2">
              <dt className="text-muted-foreground">{attribute.name}</dt>
              <dd className="font-medium tabular-nums">
                {formatAttributeValue(entry.value, attribute.format)}
              </dd>
            </div>
          )
        })}
      </dl>

      {star.skill.name ? (
        <div className="mt-2">
          <p className="text-sm font-medium">{star.skill.name}</p>
          <p className="text-sm text-muted-foreground">{plainText(star.skill.description)}</p>
          {star.skill.valueDescription ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{plainText(star.skill.valueDescription)}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
