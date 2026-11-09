import { createContext, useContext, useId, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, Search, X } from 'lucide-react'
import { cn } from '@gamemap/ui'
import content from '../locales/zh-CN.json'
import { clampStat } from '../lib/buildState'
import { qualityColor, qualityLabel } from '../lib/quality'
import { resourceUrl } from '../lib/urls'

const m = content.builds.manual
const SelectionContext = createContext<{ active: string | null; setActive: (id: string | null) => void } | null>(null)
const CloseSelectionContext = createContext<(() => void) | null>(null)

/** Only one editor block owns an expanded selection panel at a time. */
export function SelectionScope({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<string | null>(null)
  return <SelectionContext.Provider value={{ active, setActive }}>{children}</SelectionContext.Provider>
}

export function SelectionPanel({ choices, children }: { choices: ReactNode; children?: ReactNode }) {
  const [editing, setEditing] = useState(false)
  return <>
    {children ? <button type="button" className="bm-chip bm-edit-affixes" aria-expanded={editing} onClick={() => setEditing(value => !value)}>{editing ? m.back : m.editAffixes}</button> : null}
    {editing ? children : choices}
  </>
}

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
  const scope = useContext(SelectionContext)
  const owner = useId()
  const [cur, setCur] = useState(initialIndex)
  const [swapping, setSwapping] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const info = useRef<HTMLDivElement>(null)
  const [panelHost, setPanelHost] = useState<HTMLDivElement | null>(null)
  const active = (!scope || scope.active === owner) && cur >= 0 && cur < tiles.length ? cur : -1
  const close = () => {
    setCur(-1)
    scope?.setActive(null)
    root.current?.querySelector<HTMLButtonElement>(`[data-tile="${active}"]`)?.focus()
  }

  // A portal host occupies its own grid row after the owner's complete row.
  useLayoutEffect(() => {
    if (active < 0) return
    const block = root.current?.closest<HTMLElement>('.bm-blk')
    const grid = block?.parentElement
    if (!block || !grid?.classList.contains('bm-compact-editor')) return
    const host = document.createElement('div')
    host.className = 'bm-selection-row'
    const place = () => {
      const blocks = [...grid.children].filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('bm-blk'))
      // Measure the original rows without the expanded panel affecting packing.
      host.style.display = 'none'
      const top = block.getBoundingClientRect().top
      const row = blocks.filter(candidate => Math.abs(candidate.getBoundingClientRect().top - top) < 2)
      const last = row.at(-1) ?? block
      if (last.nextElementSibling !== host) last.after(host)
      host.style.display = ''
      aim(root.current, info.current, active)
    }
    place()
    setPanelHost(host)
    const observer = new ResizeObserver(place)
    observer.observe(grid)
    window.addEventListener('resize', place)
    return () => { observer.disconnect(); window.removeEventListener('resize', place); host.remove(); setPanelHost(null) }
  }, [active])

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
        onClick={() => { setSwapping(false); setCur(active === index ? -1 : index); scope?.setActive(active === index ? null : owner) }}><TileFace tile={spec} /></button>
      {spec.onRemove ? <button type="button" className="bm-icon-remove" aria-label={`${m.remove} ${spec.label}`} title={`${m.remove} ${spec.label}`} onClick={spec.onRemove}><X aria-hidden="true" /></button> : null}
    </div>
  const panel = !readOnly && active >= 0 && renderInfo ? renderInfo(active, swapping, () => setSwapping(true)) : null

  const content = panel ? <CloseSelectionContext.Provider value={close}><div key={active} ref={info} className="bm-info" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
    {panel}
  </div></CloseSelectionContext.Provider> : null

  return <div ref={root} className={cn('flex flex-col gap-2', className)}>
    {groups
      ? <div className="bm-groups">{groups.map(g => <div key={g.label} className="bm-group"><span>{g.label}</span><div className="bm-tiles">{tiles.slice(g.from, g.to).map((spec, i) => tile(spec, g.from + i))}</div></div>)}</div>
      : <div className="bm-tiles">{tiles.map(tile)}</div>}
    {panelHost ? createPortal(content, panelHost) : content}
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
export function Picker({ what, items, onPick, talent }: { what: string; items: Candidate[]; onPick: (id: number) => void; talent?: boolean }) {
  const closeSelection = useContext(CloseSelectionContext)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const needle = query.trim().toLocaleLowerCase('zh-CN')
  const matches = needle ? items.filter(i => `${i.label} ${i.detail ?? ''}`.toLocaleLowerCase('zh-CN').includes(needle)) : items
  const pages = Math.max(1, Math.ceil(matches.length / 12))
  const current = Math.min(page, pages - 1)
  const shown = matches.slice(current * 12, (current + 1) * 12)
  const label = m.searchWhat.replace('{what}', what)
  const turn = (next: number) => setPage(next)
  return <div className={cn('bm-picker', talent && 'bm-tal')}>
    <label className="bm-search"><input value={query} onChange={e => { setQuery(e.target.value); turn(0) }} placeholder={label} aria-label={label} /><span><Search aria-hidden="true" /></span></label>
    {shown.length
      ? <div className="bm-cands">{shown.map(item => <button key={item.id} type="button" className="bm-candidate" disabled={item.disabled} aria-label={[item.label, item.quality ? qualityLabel(item.quality) : ''].filter(Boolean).join(' · ')} title={[item.label, item.quality ? qualityLabel(item.quality) : '', item.detail].filter(Boolean).join('\n')} onClick={() => { onPick(item.id); closeSelection?.() }}>
        {item.icon ? <span className="bm-candidate-art"><ItemIcon icon={item.icon} quality={item.quality} /></span> : null}
        <span className="bm-candidate-copy"><b>{item.label}</b></span>
      </button>)}</div>
      : <p className="bm-note">{m.noMatch}</p>}
    <nav className="bm-pagination" aria-label={what}>
      <button type="button" className="bm-chip" disabled={current === 0} onClick={() => turn(current - 1)}>{m.previousPage}</button>
      <span aria-live="polite">{m.pageCount.replace('{count}', String(matches.length)).replace('{page}', String(current + 1)).replace('{pages}', String(pages))}</span>
      <button type="button" className="bm-chip" disabled={current + 1 >= pages} onClick={() => turn(current + 1)}>{m.nextPage}</button>
      {closeSelection ? <button type="button" className="bm-chip bm-picker-close" onClick={closeSelection}>{m.close}</button> : null}
    </nav>
  </div>
}

export function InlinePicker({ what, items, onPick, children, disabled }: {
  what: string; items: Candidate[]; onPick: (id: number) => void; children?: ReactNode; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return <div className="bm-inline-picker">
    <button type="button" className="bm-chip" aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)}>{open ? m.closePicker : children ?? m.choose.replace('{what}', what)}</button>
    {open ? <CloseSelectionContext.Provider value={() => setOpen(false)}><Picker what={what} items={items} onPick={id => { onPick(id); setOpen(false) }} /></CloseSelectionContext.Provider> : null}
  </div>
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
  return <div className="bm-stats">{labels.map((label, i) => <div key={label} className="bm-stat">
    <span>{label}</span>
    {onChange ? <StatStep label={label} value={values[i]} onChange={v => onChange(i, v)} /> : <b>{values[i]}</b>}
  </div>)}</div>
}
