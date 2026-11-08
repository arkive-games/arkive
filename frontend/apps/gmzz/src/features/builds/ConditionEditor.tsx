import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@gamemap/ui'
import type { Catalog } from './data'
import type { ComboNode, Condition } from './model'
import { availableSkill } from './model'
import { buffOptions, conditionLimits, defaultCondition } from './rules'

export const SELECT_CLASS = 'min-w-0 max-w-full rounded border border-input bg-background px-2 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring'

export function ConditionEditor({ groups, catalog, professionId, treeId, onChange }: {
  groups: ComboNode[1]; catalog: Catalog; professionId: number; treeId?: number; onChange: (value: ComboNode[1]) => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('builds.' + key)
  const available = catalog.conditions.filter((entry) => entry.bEnabled && (!entry.ProfessionUseLimit || entry.ProfessionUseLimit.includes(professionId))
    && (entry.ID !== 7 || catalog.resources.some((resource) => resource.professionId === professionId && resource.supported)))
  function update(group: number, index: number, value: Condition | null) {
    onChange(groups.map((conditions, at) => at !== group ? conditions : conditions.flatMap((condition, pos) => pos !== index ? [condition] : value ? [value] : [])).filter((conditions) => conditions.length))
  }
  return <div className="space-y-2">
    {groups.length === 0 && <span className="text-xs text-muted-foreground">{tr('always')}</span>}
    {groups.map((conditions, group) => <div key={group} className="space-y-2 border-l-2 border-border pl-3">
      {group > 0 && <span className="text-xs font-semibold text-muted-foreground">{tr('or')}</span>}
      {conditions.map(([id, params], index) => {
        const meta = catalog.conditions.find((entry) => entry.ID === id)
        const changeParam = (position: number, value: number) => update(group, index, [id, params.map((item, at) => at === position ? value : item)])
        return <div key={index} className="flex flex-wrap items-center gap-2">
          {index > 0 && <span className="text-xs text-muted-foreground">{tr('and')}</span>}
          <select aria-label={tr('conditions')} className={SELECT_CLASS + ' w-full sm:w-64'} value={id} onChange={(event) => update(group, index, defaultCondition(catalog, Number(event.target.value), professionId))}>
            {!available.some((entry) => entry.ID === id) && <option value={id}>{meta?.EditDescStr ?? t('builds.unknownCondition', { id })}</option>}
            {available.map((entry) => <option key={entry.ID} value={entry.ID}>{entry.EditDescStr}</option>)}
          </select>
          {params.map((value, at) => {
            const type = meta?.ParamType[at] ?? 3
            const label = t('builds.parameter', { n: at + 1 })
            if (meta?.ParamForEdit[at] === false) return null
            if (type === 1) {
              const buffs = buffOptions(catalog, id, professionId)
              return <select key={at} aria-label={tr('paramBuff')} className={SELECT_CLASS + ' w-40'} value={value} onChange={(event) => changeParam(at, Number(event.target.value))}>
                {!buffs.some((buff) => buff.id === value) && <option value={value}>{value}</option>}
                {buffs.map((buff) => <option key={buff.id} value={buff.id}>{buff.name}</option>)}
              </select>
            }
            if (type === 7) {
              const entries = [...catalog.skills.filter((skill) => skill.professionId === professionId && availableSkill(skill, professionId, treeId) && skill.autoCast && ![1, 10].includes(skill.type)).map((skill) => ({ id: skill.id, name: skill.name, slot: 1 })),
                { id: 17, name: tr('fellow'), slot: 2 }, { id: 20, name: tr('puppet'), slot: 2 }]
              return <select key={at} aria-label={tr('paramSlot')} className={SELECT_CLASS + ' w-40'} value={value} onChange={(event) => {
                const entry = entries.find((item) => item.id === Number(event.target.value))!
                update(group, index, [id, params.map((item, position) => position === at ? entry.id : position === 1 ? entry.slot : item)])
              }}>
                {!entries.some((entry) => entry.id === value) && <option value={value}>{value}</option>}
                {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            }
            const options = type === 2 ? ['<', '≤', '=', '≥', '>'].map((name, key) => [key, name] as const)
              : type === 8 ? [[1, tr('exists')], [0, tr('absent')]] as const
                : type === 9 ? [[0, tr('blue')], [1, tr('yellow')]] as const : null
            if (options) return <select key={at} aria-label={label} value={value} className={SELECT_CLASS} onChange={(event) => changeParam(at, Number(event.target.value))}>
              {!options.some(([key]) => key === value) && <option value={value}>{value}</option>}
              {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
            </select>
            const scale = type === 5 ? 100 : 1
            const bounds = meta ? conditionLimits(meta, at, catalog, professionId) : null
            return <label key={at} className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="sr-only">{label}</span>
              <input className={SELECT_CLASS + ' w-24'} aria-label={label} type="number" value={Number((value * scale).toFixed(4))} step={type === 3 ? 1 : 0.1}
                min={bounds ? bounds[1] * scale : undefined} max={bounds ? bounds[0] * scale : undefined}
                onChange={(event) => { if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) {
                  let next = event.target.valueAsNumber / scale
                  if (type === 3) next = Math.trunc(next)
                  if (bounds) next = Math.min(bounds[0], Math.max(bounds[1], next))
                  changeParam(at, next)
                } }} />
              {type === 5 ? '%' : null}
            </label>
          })}
          <Button size="icon" variant="ghost" title={tr('clear')} aria-label={tr('clear')} onClick={() => update(group, index, null)}><X className="size-4" /></Button>
        </div>
      })}
      <Button size="sm" variant="ghost" disabled={conditions.length >= 50} onClick={() => onChange(groups.map((items, at) => at === group ? [...items, defaultCondition(catalog, 5, professionId)] : items))}><Plus className="size-3.5" />{tr('addCondition')}</Button>
    </div>)}
    <Button size="sm" variant="ghost" disabled={groups.length >= 50} onClick={() => onChange([...groups, [defaultCondition(catalog, 5, professionId)]])}><Plus className="size-3.5" />{tr('addGroup')}</Button>
  </div>
}
