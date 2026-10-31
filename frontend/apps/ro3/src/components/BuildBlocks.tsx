import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Minus, Plus, Search } from 'lucide-react'
import { cn } from '@gamemap/ui'
import content from '../locales/zh-CN.json'
import { clampStat } from '../lib/buildState'
import { qualityColor } from '../lib/quality'
import { resourceUrl } from '../lib/urls'

const m = content.builds.manual

export function Block({ icon, title, count, area, wide, children }: { icon: ReactNode; title: string; count?: string; area?: string; wide?: boolean; children: ReactNode }) {
  return <section className={cn('bm-blk', wide && 'wide')} style={area ? { gridArea: area } : undefined}>
    <header className="bm-plate"><i>{icon}</i><div><h2>{title}</h2>{count ? <small>{count}</small> : null}</div></header>
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
export function TileBlock({ tiles, groups, readOnly, className, renderInfo }: {
  tiles: TileSpec[]
  groups?: Array<{ label: string; from: number; to: number }>
  readOnly?: boolean
  className?: string
  renderInfo?: (index: number, swapping: boolean, startSwap: () => void) => ReactNode
}) {
  const [cur, setCur] = useState(-1)
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
    : <button key={spec.key} type="button" data-tile={index} disabled={spec.disabled} aria-expanded={active === index}
      className={cn('bm-tile', spec.empty && 'empty', active === index && 'sel')} title={spec.label}
      onClick={() => { setSwapping(false); setCur(active === index ? -1 : index) }}><TileFace tile={spec} /></button>
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

export interface Candidate { id: number; label: string; icon?: string; quality?: number; disabled?: boolean }

const PICKER_LIMIT = 240

/** An inline search over candidates; picking one calls back with its id. */
export function Picker({ what, items, onPick, talent }: { what: string; items: Candidate[]; onPick: (id: number) => void; talent?: boolean }) {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase('zh-CN')
  const shown = (needle ? items.filter(i => i.label.toLocaleLowerCase('zh-CN').includes(needle)) : items).slice(0, PICKER_LIMIT)
  const label = m.searchWhat.replace('{what}', what)
  return <div className={cn('bm-picker', talent && 'bm-tal')}>
    <label className="bm-search"><input value={query} onChange={e => setQuery(e.target.value)} placeholder={label} aria-label={label} /><span><Search aria-hidden="true" /></span></label>
    {shown.length
      ? <div className="bm-cands">{shown.map(item => <button key={item.id} type="button" className="bm-tile" disabled={item.disabled} title={item.label} onClick={() => onPick(item.id)}>
        <ItemIcon icon={item.icon} quality={item.quality} /><span className="bm-nm">{item.label}</span>
      </button>)}</div>
      : <p className="bm-note">{m.noMatch}</p>}
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
  const top = Math.max(99, ...values)
  return <div className="bm-stats">{labels.map((label, i) => <div key={label} className="bm-stat">
    <span>{label}</span>
    <span className="bm-bar"><i style={{ '--w': `${Math.round(values[i] / top * 100)}%` } as CSSProperties} /></span>
    {onChange ? <StatStep label={label} value={values[i]} onChange={v => onChange(i, v)} /> : <b>{values[i]}</b>}
  </div>)}</div>
}
