import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { IconChess, IconX } from '@tabler/icons-react'
import { HoverCard, HoverCardContent, HoverCardTrigger, Popover, PopoverContent, PopoverTrigger } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'
import { autoChessPieceIconUrl, autoChessSkillIconUrl, plainText, starAttributeValues, starSkills, starValues, type AutoChessAttribute, type AutoChessBond, type AutoChessPiece } from './data'
import { PIECE_COST_BORDER } from './quality'

export function PieceIcon({ piece, small = false }: { piece: AutoChessPiece; small?: boolean }) {
  const [failed, setFailed] = useState(false)
  const { t } = useTranslation()
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-md border-2 bg-muted ${small ? 'size-10' : 'size-14'} ${PIECE_COST_BORDER[piece.cost] ?? 'border-border'}`}>
    {piece.icon && !failed ? <img src={autoChessPieceIconUrl(piece.icon)} alt="" loading="lazy" onError={() => setFailed(true)} className="size-full object-contain" />
      : <IconChess className="size-6 text-muted-foreground" role="img" aria-label={t('autochess.pieces.missingImage')} />}
  </span>
}

export function PieceStats({ piece, attrs }: { piece: AutoChessPiece; attrs: Map<number, AutoChessAttribute> }) {
  const { t } = useTranslation()
  const ids = [...new Set(piece.stars.flatMap((star) => star.attributes.map((entry) => entry.attributeId)))]
  return <section className="border-t border-border/70 pt-2">
    <h3 className="text-sm font-semibold">{t('autochess.pieces.starOrder')}</h3>
    <dl className="mt-1 space-y-1 text-sm">
      <div className="flex flex-wrap justify-between gap-x-2"><dt className="text-muted-foreground">{t('autochess.pieces.rangeLabel')}</dt><dd className="font-medium tabular-nums">{starValues(piece, (star) => String(star.attackRange))}</dd></div>
      {ids.map((id) => {
        const attribute = attrs.get(id)
        return attribute ? <div key={id} className="flex flex-wrap justify-between gap-x-2" data-chess-attribute={id}>
          <dt className="text-muted-foreground">{attribute.name}</dt><dd className="max-w-full break-words font-medium tabular-nums">{starAttributeValues(piece, attribute)}</dd>
        </div> : null
      })}
    </dl>
    {starSkills(piece).filter((skill) => skill.name).map((skill) => <div key={skill.levels.join('/')} className="mt-2 border-t border-border/60 pt-2">
      <h3 className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
        {piece.skillIcon && <img src={autoChessSkillIconUrl(piece.skillIcon)} alt="" loading="lazy" className="size-5 shrink-0 rounded-sm object-contain" />}
        {skill.name}<span className="text-xs text-muted-foreground">{skill.levels.join('/')}★</span>
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">{skill.description}</p>
      {skill.valueDescription && <p className="mt-1 text-xs text-muted-foreground">{skill.valueDescription}</p>}
    </div>)}
  </section>
}

export function PieceLink({ piece, attrs, onSelect, preview = true }: { piece: AutoChessPiece; attrs: Map<number, AutoChessAttribute>; onSelect?: (id: number) => void; preview?: boolean }) {
  const { t } = useTranslation()
  const link = <Link to="/autochess/chess" search={{ piece: piece.baseId }} onClick={() => onSelect?.(piece.baseId)} className="flex w-24 flex-col items-center gap-1 rounded-md p-1 text-center text-xs text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" aria-label={t('autochess.pieces.viewPiece', { name: piece.name })}>
    <PieceIcon piece={piece} small /><span className="w-full break-words">{piece.name}</span>
  </Link>
  return preview ? <HoverCard openDelay={120}><HoverCardTrigger asChild>{link}</HoverCardTrigger>
    <HoverCardContent side="top" className="w-80 p-3">
      <header className="mb-2 flex items-center gap-2"><PieceIcon piece={piece} small /><div><h3 className="text-sm font-semibold">{piece.name}</h3><p className="text-xs text-muted-foreground">{piece.role} · {t('autochess.pieces.cost', { cost: piece.cost })}</p></div></header>
      <p className="mb-2 text-sm text-muted-foreground">{plainText(piece.positionDescription)}</p>
      <PieceStats piece={piece} attrs={attrs} />
    </HoverCardContent>
  </HoverCard> : link
}

export function BondTag({ bond, members, attrs, onSelect }: { bond: AutoChessBond; members: AutoChessPiece[]; attrs: Map<number, AutoChessAttribute>; onSelect: (id: number) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hoverOpened = useRef(false)
  const content = useRef<HTMLDivElement>(null)
  const cancelClose = () => { clearTimeout(timer.current) }
  const scheduleClose = () => {
    cancelClose()
    timer.current = setTimeout(() => {
      if (!content.current?.contains(document.activeElement)) setOpen(false)
    }, 200)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return <Popover open={open} onOpenChange={(value) => { cancelClose(); hoverOpened.current = false; setOpen(value) }}>
    <PopoverTrigger asChild><button type="button" onPointerEnter={(event) => { if (event.pointerType === 'touch') return; cancelClose(); hoverOpened.current = true; setOpen(true) }} onPointerLeave={(event) => { if (event.pointerType !== 'touch') scheduleClose() }} className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground">{bond.name}</button></PopoverTrigger>
    <PopoverContent ref={content} side="bottom" align="start" collisionPadding={8} onPointerEnter={cancelClose} onPointerLeave={(event) => { if (event.pointerType !== 'touch') scheduleClose() }} onFocusCapture={cancelClose}
      onOpenAutoFocus={(event) => { if (hoverOpened.current) event.preventDefault() }}
      onCloseAutoFocus={(event) => { if (hoverOpened.current) event.preventDefault() }}
      className="max-h-[var(--radix-popover-content-available-height)] w-96 max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain p-3">
      <header className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{bond.name}</h3><button type="button" onClick={() => setOpen(false)} aria-label={t('autochess.close')} title={t('autochess.close')} className="flex size-7 shrink-0 items-center justify-center rounded hover:bg-muted"><IconX className="size-4" /></button></header>
      <p className="mt-1 text-sm text-muted-foreground">{plainText(bond.description)}</p>
      <ol className="mt-2 space-y-1">{bond.tiers.map((tier) => <li key={tier.activateNum} className="flex items-start gap-2 text-sm"><span className="shrink-0 font-medium tabular-nums">{tier.activateNum}</span><span className="text-muted-foreground">{plainText(tier.description)}</span></li>)}</ol>
      <p className="mt-2 border-t border-border pt-2 text-xs font-medium text-muted-foreground">{t('autochess.bonds.members')}</p>
      <div className="mt-1 flex flex-wrap gap-1">{members.map((piece) => <PieceLink key={piece.baseId} piece={piece} attrs={attrs} preview={false} onSelect={(id) => { setOpen(false); onSelect(id) }} />)}</div>
    </PopoverContent>
  </Popover>
}
