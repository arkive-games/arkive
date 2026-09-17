import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { useAutoChess } from '@/features/autochess/useAutoChess'

/**
 * The client's own `TagColor`, which is what tints the role chip along the top
 * of every card in the game's 棋子图鉴.
 *
 * 0/1/3/4 are read off the game's own screen — 近战战士 green, 远程射手 and
 * 远程法师 blue, 前排坦克 amber, 中排辅助 and 远程辅助 red. **2 is a guess**: only
 * 近战刺客 uses it and no screenshot of that chip was available, so the hue is
 * ours rather than the game's. Everything else on this page is the client's.
 */
const ROLE_CLASS: Record<number, string> = {
  0: 'bg-emerald-600/90 text-white',
  1: 'bg-sky-600/90 text-white',
  2: 'bg-violet-600/90 text-white',
  3: 'bg-amber-500/90 text-black',
  4: 'bg-rose-600/90 text-white',
}

/** Cost is the mode's rarity axis, and the game frames each card by it. */
const COST_CLASS: Record<number, string> = {
  1: 'border-border bg-card',
  2: 'border-emerald-500/50 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20',
  3: 'border-sky-500/50 bg-sky-50/30 dark:border-sky-800 dark:bg-sky-950/20',
  4: 'border-violet-500/50 bg-violet-50/30 dark:border-violet-800 dark:bg-violet-950/20',
  5: 'border-amber-500/60 bg-amber-50/35 dark:border-amber-800 dark:bg-amber-950/20',
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
  const all = useMemo(() => pieces.data ?? [], [pieces.data])

  // Descending, as the game's own tab row runs: 全部, 花费5 … 花费1.
  const costs = useMemo(
    () => [...new Set(all.map((piece) => piece.cost))].sort((a, b) => b - a),
    [all],
  )

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

      {/* The game's own filter geometry: a cost tab row, with the bond filter
          as a single select on the right. Twenty-eight bond chips would push
          the grid below the fold on every load. */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-1 border-b border-border">
          <CostTab active={cost === 0} onClick={() => setCost(0)}>{t('autochess.all')}</CostTab>
          {costs.map((value) => (
            <CostTab key={value} active={cost === value} onClick={() => setCost(value)}>
              {t('autochess.pieces.costTab', { cost: value })}
            </CostTab>
          ))}
        </div>

        <select
          value={bondId}
          onChange={(event) => setBondId(Number(event.target.value))}
          aria-label={t('autochess.pieces.bondFilter')}
          className="h-9 shrink-0 rounded-md border border-border bg-card px-2 text-sm md:w-48"
        >
          <option value={0}>{t('autochess.pieces.allBonds')}</option>
          {(bonds.data ?? []).map((bond) => (
            <option key={bond.id} value={bond.id}>{bond.name}</option>
          ))}
        </select>
      </div>

      <label className="relative mb-4 block">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('autochess.pieces.searchPlaceholder')}
          aria-label={t('autochess.pieces.searchPlaceholder')}
        />
      </label>

      <p className="mb-3 text-sm text-muted-foreground">
        {t('autochess.pieces.resultCount', { count: filtered.length })}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

function CostTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? '-mb-px border-b-2 border-primary px-3 py-1.5 text-sm font-semibold text-primary'
          : '-mb-px border-b-2 border-transparent px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground'
      }
    >
      {children}
    </button>
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

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-lg border shadow-sm ${COST_CLASS[piece.cost] ?? 'border-border bg-card'}`}
    >
      {/* Role chip on its own strip, as the game draws it. There is no portrait
          here: the client's `ChessBaseData.Icon` points into
          ConfigIcon/AutoChess/Avatar, which no container we can mount carries.
          A blank frame would read as a broken image, so the card is built to
          stand without one rather than around a hole. */}
      <div className={`px-3 py-1 text-xs font-medium ${ROLE_CLASS[piece.roleColor] ?? 'bg-muted text-foreground'}`}>
        {piece.role}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">{piece.name}</h2>
          <span className="shrink-0 rounded-full border border-amber-500/70 px-2 py-0.5 text-xs tabular-nums text-amber-700 dark:text-amber-300">
            {t('autochess.pieces.cost', { cost: piece.cost })}
          </span>
        </div>

        <ul className="flex flex-wrap gap-1">
          {piece.bondIds.map((id) => (
            <li key={id} className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
              {bondsById.get(id)?.name ?? id}
            </li>
          ))}
        </ul>

        <p className="text-sm text-muted-foreground">{plainText(piece.positionDescription)}</p>

        {(open ? stars : stars.slice(0, 1)).map((star) => (
          <StarBlock key={star.chessId} star={star} attrs={attrs} />
        ))}

        {stars.length > 1 ? (
          <button
            type="button"
            onClick={onToggle}
            className="mt-auto self-start pt-1 text-sm font-medium text-primary hover:underline"
          >
            {open ? t('autochess.pieces.collapse') : t('autochess.pieces.expand', { count: stars.length })}
          </button>
        ) : null}
      </div>
    </article>
  )
}

function StarBlock({ star, attrs }: { star: AutoChessStar; attrs: Map<number, AutoChessAttribute> }) {
  const { t } = useTranslation()
  return (
    <section className="border-t border-border/70 pt-2">
      <h3 className="text-sm font-semibold">
        {t('autochess.pieces.star', { star: star.starLevel })}
        <span className="ml-2 font-normal text-muted-foreground">
          {t('autochess.pieces.attackRange', { range: star.attackRange })}
        </span>
      </h3>

      <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
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
        <div className="mt-1.5">
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
