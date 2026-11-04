import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Minus, Plus, Search, X } from 'lucide-react'
import { cn, Dialog, DialogContent, DialogTitle, DialogTrigger } from '@gamemap/ui'
import content from '../locales/zh-CN.json'
import { clampStat } from '../lib/buildState'
import { qualityColor, qualityLabel } from '../lib/quality'
import { resourceUrl } from '../lib/urls'

const m = content.builds.manual

export function Block({ icon, title, area, wide, children, actions }: { icon: ReactNode; title: string; count?: string; area?: string; wide?: boolean; children: ReactNode; actions?: ReactNode }) {
  return <section className={cn('bm-blk', wide && 'wide')} style={area ? { gridArea: area } : undefined}>
    <header className="bm-plate"><i>{icon}</i><h2>{title}</h2>{actions ? <div className="bm-block-actions">{actions}</div> : null}</header>
    <div className="bm-body">{children}</div>
  </section>
}

export function ItemIcon({ icon, quality, empty }: { icon?: string; quality?: number; empty?: boolean }) {
  return <span className="bm-ico" style={quality ? { '--q': qualityColor(quality) } as CSSProperties : undefined}>
    {icon ? <img src={resourceUrl(icon)} alt="" loading="lazy" /> : empty ? <Plus aria-hidden="true" /> : null}
  </span>
}

export interface TileSpec {
  key: string
  label: string
  icon?: string
  quality?: number
  empty?: boolean
  disabled?: boolean
  onRemove?: () => void
  /** Card stubs under an equipment tile. */
  extra?: ReactNode
}

function TileFace({ tile }: { tile: TileSpec }) {
  return <>
    <ItemIcon icon={tile.icon} quality={tile.quality} empty={tile.empty} />
    <span className="bm-nm">{tile.label}</span>
    {tile.extra}
  </>
}

/** Tiles with one shared detail panel; a sliding pointer marks the tile it belongs to. */
export function TileBlock({ tiles, groups, readOnly, className, renderInfo, initialIndex = -1 }: {
  tiles: TileSpec[]
  groups?: Array<{ label: string; from: number; to: number }>
  readOnly?: boolean
  initialIndex?: number
  className?: string
  renderInfo?: (index: number, swapping: boolean, startSwap: () => void) => ReactNode
}) {
  const [cur, setCur] = useState(initialIndex)
  const [swapping, setSwapping] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const info = useRef<HTMLDivElement>(null)
  const active = cur >= 0 && cur < tiles.length ? cur : -1

  // The pointer follows the tile's centre, so it re-aims after every render, resize and tile scroll.
  useLayoutEffect(() => aim(root.current, info.current, active))
  useEffect(() => {
    const node = root.current
    if (!node) return
    const update = () => aim(node, info.current, active)
    window.addEventListener('resize', update)
    const strips = [...node.querySelectorAll('.bm-tiles')]
    strips.forEach(s => s.addEventListener('scroll', update, { passive: true }))
    return () => {
      window.removeEventListener('resize', update)
      strips.forEach(s => s.removeEventListener('scroll', update))
    }
  }, [active])

  const tile = (spec: TileSpec, index: number) => readOnly
    ? <div key={spec.key} className={cn('bm-tile', spec.empty && 'empty')} title={spec.label}><TileFace tile={spec} /></div>
    : <div key={spec.key} className="bm-tile-wrap">
      <button type="button" data-tile={index} disabled={spec.disabled} aria-expanded={active === index}
        className={cn('bm-tile', spec.empty && 'empty', active === index && 'sel')} title={spec.label}
        onClick={() => { setSwapping(false); setCur(active === index ? -1 : index) }}><TileFace tile={spec} /></button>
      {spec.onRemove ? <button type="button" className="bm-icon-remove" aria-label={`${m.remove} ${spec.label}`} title={`${m.remove} ${spec.label}`} onClick={spec.onRemove}><X aria-hidden="true" /></button> : null}
    </div>
  const panel = !readOnly && active >= 0 && renderInfo ? renderInfo(active, swapping, () => setSwapping(true)) : null

  return <div ref={root} className={cn('flex flex-col gap-2', className)}>
    {groups
      ? <div className="bm-groups">{groups.map(g => <div key={g.label} className="bm-group"><span>{g.label}</span><div className="bm-tiles">{tiles.slice(g.from, g.to).map((spec, i) => tile(spec, g.from + i))}</div></div>)}</div>
      : <div className="bm-tiles">{tiles.map(tile)}</div>}
    {panel ? <div ref={info} className="bm-info">{panel}</div> : null}
  </div>
}

function aim(root: HTMLElement | null, info: HTMLElement | null, index: number) {
  if (!root || !info || index < 0) return
  const tile = root.querySelector<HTMLElement>(`[data-tile="${index}"]`)
  if (!tile) return
  const box = info.getBoundingClientRect()
  const rect = tile.getBoundingClientRect()
  const x = Math.min(box.width - 16, Math.max(16, rect.left + rect.width / 2 - box.left))
  info.style.setProperty('--ax', `${x}px`)
}

export interface Candidate { id: number; label: string; icon?: string; quality?: number; disabled?: boolean; detail?: string }

/** Search and pagination keep every candidate reachable without growing the page. */
export function Picker({ what, items, onPick, talent, portrait }: { what: string; items: Candidate[]; onPick: (id: number) => void; talent?: boolean; portrait?: boolean }) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const needle = query.trim().toLocaleLowerCase('zh-CN')
  const matches = needle ? items.filter(i => `${i.label} ${i.detail ?? ''}`.toLocaleLowerCase('zh-CN').includes(needle)) : items
  const pages = Math.max(1, Math.ceil(matches.length / 24))
  const current = Math.min(page, pages - 1)
  const shown = matches.slice(current * 24, (current + 1) * 24)
  const label = m.searchWhat.replace('{what}', what)
  const results = useRef<HTMLDivElement>(null)
  const turn = (next: number) => { setPage(next); results.current?.scrollTo({ top: 0 }) }
  return <div className={cn('bm-picker', talent && 'bm-tal', portrait && 'bm-portrait-picker')}>
    <label className="bm-search"><input value={query} onChange={e => { setQuery(e.target.value); turn(0) }} placeholder={label} aria-label={label} /><span><Search aria-hidden="true" /></span></label>
    {shown.length
      ? <div ref={results} className="bm-cands">{shown.map(item => <button key={item.id} type="button" className="bm-candidate" disabled={item.disabled} title={item.label} onClick={() => onPick(item.id)}>
        {item.icon ? <span className="bm-candidate-art"><ItemIcon icon={item.icon} quality={item.quality} /></span> : null}
        <span className="bm-candidate-copy"><b>{item.label}</b>{item.quality ? <small>{qualityLabel(item.quality)}</small> : null}{item.detail ? <small>{item.detail}</small> : null}</span>
      </button>)}</div>
      : <p className="bm-note">{m.noMatch}</p>}
    <nav className="bm-pagination" aria-label={what}>
      <button type="button" className="bm-chip" disabled={current === 0} onClick={() => turn(current - 1)}>{m.previousPage}</button>
      <span aria-live="polite">{m.pageCount.replace('{count}', String(matches.length)).replace('{page}', String(current + 1)).replace('{pages}', String(pages))}</span>
      <button type="button" className="bm-chip" disabled={current + 1 >= pages} onClick={() => turn(current + 1)}>{m.nextPage}</button>
    </nav>
  </div>
}

export function PickerDialog({ what, items, onPick, portrait, children, disabled }: {
  what: string; items: Candidate[]; onPick: (id: number) => void; portrait?: boolean; children?: ReactNode; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button type="button" className="bm-chip" disabled={disabled}>{children ?? m.choose.replace('{what}', what)}</button></DialogTrigger>
    <DialogContent size="lg" className="bm-picker-dialog" aria-describedby={undefined} closeButtonProps={{ 'aria-label': m.closePicker }}>
      <DialogTitle>{m.choose.replace('{what}', what)}</DialogTitle>
      <Picker what={what} items={items} portrait={portrait} onPick={id => { onPick(id); setOpen(false) }} />
    </DialogContent>
  </Dialog>
}

/** The name row of a filled slot's panel, with change and remove. */
export function InfoHead({ name, quality, tag, onSwap, onRemove }: { name: string; quality?: number; tag?: string; onSwap?: () => void; onRemove?: () => void }) {
  return <div className="t">
    <span>{name}</span>
    {tag ? <span className="bm-qtag" style={{ '--q': qualityColor(quality) } as CSSProperties}>{tag}</span> : null}
    {onSwap ? <button type="button" className="bm-chip push" onClick={onSwap}>{content.builds.editor.replace}</button> : null}
    {onRemove ? <button type="button" className={cn('bm-chip', !onSwap && 'push')} onClick={onRemove}>{m.remove}</button> : null}
  </div>
}

function StatStep({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [pending, setPending] = useState<string | null>(null)
  return <span className="bm-step">
    <button type="button" aria-label={`${m.decrease}${label}`} onClick={() => onChange(clampStat(value - 1))}><Minus aria-hidden="true" /></button>
    <input type="number" min={1} max={99} aria-label={label} value={pending ?? value}
      onChange={e => { const raw = e.target.value; setPending(raw); if (raw !== '') onChange(clampStat(Number(raw))) }}
      onBlur={() => setPending(null)} />
    <button type="button" aria-label={`${m.increase}${label}`} onClick={() => onChange(clampStat(value + 1))}><Plus aria-hidden="true" /></button>
  </span>
}

/** Six stats as bars; with `onChange` each gets a stepper. */
export function Stats({ values, onChange }: { values: number[]; onChange?: (index: number, value: number) => void }) {
  const labels = content.builds.editor.attributesList
  const top = Math.max(99, ...values)
  return <div className="bm-stats">{labels.map((label, i) => <div key={label} className="bm-stat">
    <span>{label}</span>
    <span className="bm-bar"><i style={{ '--w': `${Math.round(values[i] / top * 100)}%` } as CSSProperties} /></span>
    {onChange ? <StatStep label={label} value={values[i]} onChange={v => onChange(i, v)} /> : <b>{values[i]}</b>}
  </div>)}</div>
}
