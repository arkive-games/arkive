import { useEffect, useMemo, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '@/components/ContentPage'
import { Chip, FilterBar, FilterRow, SearchField } from '@/components/Filters'
import { useRemoteData } from '@/lib/useRemoteData'
import { attributeMap, filterPieces, loadAutoChessAttributes, loadAutoChessBonds, loadAutoChessPieces, membersByBond, plainText } from './data'
import { BondTag, PieceIcon, PieceStats } from './PieceDetails'
import { PIECE_COST_BORDER } from './quality'

// TagColor 2 still uses an unverified hue; the other role styles are client-matched.
const ROLE_CLASS: Record<number, string> = {
  0: 'bg-emerald-600/90 text-white', 1: 'bg-sky-600/90 text-white',
  2: 'bg-violet-600/90 text-white', 3: 'bg-amber-500/90 text-black', 4: 'bg-rose-600/90 text-white',
}

const EMPTY_FILTERS = { cost: 0, bondId: 0, role: '', query: '' }

function focusPiece(id: number) {
  const target = document.getElementById(`piece-${id}`)
  target?.focus({ preventScroll: true })
  target?.scrollIntoView({ block: 'start' })
}

export default function AutoChessPiecesPage() {
  const { t } = useTranslation()
  const pieces = useRemoteData(loadAutoChessPieces)
  const bonds = useRemoteData(loadAutoChessBonds)
  const attributes = useRemoteData(loadAutoChessAttributes)
  const selected = useSearch({ from: '/autochess/chess' }).piece
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, piece: selected })
  // Adjust before committing a query change so history navigation also reveals its target.
  if (filters.piece !== selected) setFilters({ ...EMPTY_FILTERS, piece: selected })
  const { cost, bondId, role, query } = filters.piece === selected ? filters : EMPTY_FILTERS
  const updateFilters = (patch: Partial<typeof EMPTY_FILTERS>) => setFilters({ ...filters, ...patch, piece: selected })
  const setCost = (value: number) => updateFilters({ cost: value })
  const setBondId = (value: number) => updateFilters({ bondId: value })
  const setRole = (value: string) => updateFilters({ role: value })
  const setQuery = (value: string) => updateFilters({ query: value })
  const all = useMemo(() => pieces.data ?? [], [pieces.data])
  const bondsById = useMemo(() => new Map((bonds.data ?? []).map((bond) => [bond.id, bond])), [bonds.data])
  const members = useMemo(() => membersByBond(all), [all])
  const attrs = useMemo(() => attributeMap(attributes.data ?? []), [attributes.data])
  const costs = useMemo(() => [...new Set(all.map((piece) => piece.cost))].sort((a, b) => b - a), [all])
  const roles = useMemo(() => [...new Set(all.map((piece) => piece.role))], [all])
  const filtered = useMemo(() => filterPieces(all, bondsById, query, cost, bondId, role), [all, bondsById, query, cost, bondId, role])
  const reset = () => updateFilters(EMPTY_FILTERS)
  const selectPiece = (id: number) => { reset(); requestAnimationFrame(() => focusPiece(id)) }

  useEffect(() => { document.title = `${t('autochess.pieces.title')} - ${t('siteTitle')}` }, [t])
  useEffect(() => {
    if (!selected || pieces.loading || bonds.loading || attributes.loading) return
    const frame = requestAnimationFrame(() => focusPiece(selected))
    return () => cancelAnimationFrame(frame)
  }, [selected, pieces.loading, bonds.loading, attributes.loading])

  return <ContentPage active="/autochess/chess" title={t('autochess.pieces.title')} heading wide>
    {pieces.error || bonds.error || attributes.error ? <p role="alert" className="text-sm text-muted-foreground">{t('autochess.loadError')}</p>
      : pieces.loading || bonds.loading || attributes.loading ? <p role="status" className="text-sm text-muted-foreground">{t('loading')}</p> : <>
        <div className="mb-3 flex flex-col gap-2">
          <FilterRow label={t('autochess.pieces.costFilter')}>
            <Chip active={!cost} onClick={() => setCost(0)}>{t('autochess.all')}</Chip>
            {costs.map((value) => <Chip key={value} active={cost === value} onClick={() => setCost(value)}>{t('autochess.pieces.costTab', { cost: value })}</Chip>)}
          </FilterRow>
          <FilterRow label={t('autochess.pieces.bondFilter')}>
            <Chip active={!bondId} onClick={() => setBondId(0)}>{t('autochess.all')}</Chip>
            {(bonds.data ?? []).filter((bond) => members.has(bond.id)).map((bond) => <Chip key={bond.id} active={bondId === bond.id} onClick={() => setBondId(bond.id)}>{bond.name}</Chip>)}
          </FilterRow>
          <FilterRow label={t('autochess.pieces.roleFilter')}>
            <Chip active={!role} onClick={() => setRole('')}>{t('autochess.all')}</Chip>
            {roles.map((value) => <Chip key={value} active={role === value} onClick={() => setRole(value)}>{value}</Chip>)}
          </FilterRow>
        </div>
        <FilterBar count={t('autochess.pieces.resultCount', { count: filtered.length })}>
          <SearchField value={query} onChange={setQuery} placeholder={t('autochess.pieces.searchPlaceholder')} />
          {(cost || bondId || role || query) ? <button type="button" onClick={reset} className="text-sm text-primary hover:underline">{t('autochess.clearFilters')}</button> : null}
        </FilterBar>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((piece) => <article key={piece.baseId} id={`piece-${piece.baseId}`} tabIndex={-1} data-piece-id={piece.baseId} className={`min-w-0 scroll-mt-24 overflow-hidden rounded-md border bg-card focus:outline-none ${PIECE_COST_BORDER[piece.cost] ?? 'border-border'} ${selected === piece.baseId ? 'ring-2 ring-ring' : ''}`}>
            <div className={`px-3 py-1 text-xs font-medium ${ROLE_CLASS[piece.roleColor] ?? 'bg-muted text-foreground'}`}>{piece.role}</div>
            <div className="flex flex-col gap-2 p-3">
              <header className="flex items-center gap-2.5"><PieceIcon piece={piece} /><h2 className="min-w-0 flex-1 break-words text-base font-semibold">{piece.name}</h2><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t('autochess.pieces.cost', { cost: piece.cost })}</span></header>
              <div className="flex flex-wrap gap-1">{piece.bondIds.map((id) => {
                const bond = bondsById.get(id)
                return bond ? <BondTag key={id} bond={bond} members={members.get(id) ?? []} attrs={attrs} onSelect={selectPiece} /> : null
              })}</div>
              <p className="text-sm text-muted-foreground">{plainText(piece.positionDescription)}</p>
              <PieceStats piece={piece} attrs={attrs} />
            </div>
          </article>)}
        </div>
        {!filtered.length && <p role="status" className="py-8 text-center text-sm text-muted-foreground">{t('autochess.empty')}</p>}
      </>}
  </ContentPage>
}
