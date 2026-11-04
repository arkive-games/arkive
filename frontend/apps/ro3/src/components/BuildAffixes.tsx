import { useState } from 'react'
import content from '../locales/zh-CN.json'
import type { SoulSubOption } from '../lib/buildView'
import { PickerDialog, type Candidate } from './BuildBlocks'

const m = content.builds.manual

export function AffixEditor({ title, selected, options, limit, onChange }: {
  title: string; selected: number[]; options: Candidate[]; limit?: number; onChange: (ids: number[]) => void
}) {
  const full = limit !== undefined && selected.length >= limit
  return <section className="bm-affixes">
    <header><b>{title}</b><span>{selected.length}{limit === undefined ? ` · ${m.limitUnknown}` : `/${limit}`}</span></header>
    {limit !== undefined && selected.length > limit ? <p className="bm-error">{m.overLimit}</p> : null}
    {selected.map((id, index) => {
      const option = options.find(o => o.id === id)
      return <div className="bm-affix-row" key={`${id}-${index}`}><span>{option?.label ?? `#${id} · ${content.builds.editor.unknown}`}{option?.detail ? <small>{option.detail}</small> : null}</span>
        <button type="button" className="bm-chip" aria-label={`${m.remove} ${option?.label ?? id}`} onClick={() => onChange(selected.filter((_, i) => i !== index))}>{m.remove}</button></div>
    })}
    {!selected.length ? <p className="bm-note">{m.noAffixes}</p> : null}
    <PickerDialog what={title} disabled={full || !options.length} items={options.map(o => ({ ...o, disabled: selected.includes(o.id) }))} onPick={id => {
      if (!full && !selected.includes(id) && options.some(o => o.id === id)) onChange([...selected, id])
    }}>{m.addAffix}</PickerDialog>
  </section>
}

/** Pool rows remain distinct, but their repeated attribute names appear only once. */
export function SoulAffixEditor({ selected, options, onChange }: { selected: number[]; options: SoulSubOption[]; onChange: (ids: number[]) => void }) {
  const [attribute, setAttribute] = useState(0)
  const groups = [...new Map(options.map(o => [o.attributeId, { id: o.attributeId, label: o.label }])).values()]
  const rolls = options.filter(o => o.attributeId === attribute)
  return <section className="bm-affixes">
    <header><b>{content.builds.editor.sub}</b><span>{selected.length} · {m.limitUnknown}</span></header>
    {selected.map((id, index) => {
      const option = options.find(o => o.id === id)
      return <div className="bm-affix-row" key={`${id}-${index}`}><span>{option?.label ?? `#${id} · ${content.builds.editor.unknown}`}<small>{option?.value ?? m.valueUnknown}</small></span>
        <button type="button" className="bm-chip" aria-label={`${m.remove} ${option?.label ?? id}`} onClick={() => onChange(selected.filter((_, i) => i !== index))}>{m.remove}</button></div>
    })}
    {!selected.length ? <p className="bm-note">{m.noAffixes}</p> : null}
    <div className="bm-affix-add">
      <PickerDialog what={content.builds.editor.sub} items={groups} onPick={setAttribute}>{m.addAffix}</PickerDialog>
      {rolls.length ? <label>{groups.find(g => g.id === attribute)?.label}<select aria-label={m.roll} value="" onChange={event => {
        const id = Number(event.target.value)
        if (!selected.includes(id) && rolls.some(o => o.id === id)) { onChange([...selected, id]); setAttribute(0) }
      }}><option value="" disabled>{m.choose.replace('{what}', m.roll)}</option>{rolls.map(o => <option key={o.id} value={o.id} disabled={selected.includes(o.id)}>{o.value}{rolls.filter(other => other.value === o.value).length > 1 ? ` · #${o.id}` : ''}</option>)}</select></label> : null}
    </div>
    <p className="bm-note">{m.rawValueNote}</p>
  </section>
}
