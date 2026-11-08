import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, useIsMobile } from '@gamemap/ui'
import { IconTile } from '../equipment/PickerModal'
import { iconUrl } from '../../lib/urls'
import { skillIcon, type BuildData } from './data'
import { availableSkill, compatibleAction, SKILL_SLOTS, type BuildDraft, type ComboNode } from './model'
import { ConditionEditor, SELECT_CLASS } from './ConditionEditor'
import { SkillHint } from './SkillHint'
import { ArtifactHint } from './ArtifactHint'
import { validConditions } from './rules'

export function ComboEditor({ data, draft, treeId, readOnly = false, onChange }: {
  data: BuildData; draft: BuildDraft; treeId?: number; readOnly?: boolean; onChange: (nodes: ComboNode[]) => void
}) {
  const { t } = useTranslation()
  const tr = (key: string) => t('builds.' + key)
  const mobile = useIsMobile()
  const columns = mobile ? 3 : 5
  const actionLabel = readOnly ? 'builds.viewAction' : 'builds.editAction'
  const [editing, setEditing] = useState<{ index: number; node: ComboNode } | null>(null)
  const { catalog } = data
  const skills = catalog.skills.filter((skill) => availableSkill(skill, draft.professionId, treeId) && skill.autoCast && [1, 2, 3, 9].includes(skill.type))
  const slotName = (slot: number) => slot === 17 ? tr('fellow') : slot === 20 ? tr('puppet') : t('builds.skillSlot', { n: slot })
  function details(node: ComboNode) {
    const [action] = node
    const id = action.ActionName === 1 ? action.ActionParam : action.ActionName === 2 ? draft.slots[String(action.ActionParam)] : undefined
    const skill = catalog.skills.find((item) => item.id === id)
    const relicAction = action.ActionName === 3 ? catalog.relicActions.find((item) => item.id === action.ActionParam) : undefined
    const relic = relicAction ? data.relics.artifacts.find((item) => item.id === relicAction.artifactId) : undefined
    const name = action.ActionName === 2 && [17, 20].includes(action.ActionParam) ? slotName(action.ActionParam)
      : skill?.name ?? relicAction?.name ?? (action.ActionName === 2 ? slotName(action.ActionParam) : action.ActionName === 3 ? t('builds.relicAbility', { n: action.ActionParam }) : t('builds.unknown', { id: action.ActionParam }))
    return { name, skill, relic, icon: skill ? skillIcon(skill.icon) : relicAction?.icon ? skillIcon(relicAction.icon) : relic?.icon ? iconUrl(relic.icon) : undefined }
  }
  const open = (index: number) => setEditing({ index, node: structuredClone(draft.nodes[index]) })
  const conditionSummary = (node: ComboNode) => node[1].length ? t('builds.conditionCount', { n: node[1].reduce((count, group) => count + group.length, 0) }) : tr('always')
  function move(index: number, offset: number) {
    const nodes = [...draft.nodes]
    ;[nodes[index], nodes[index + offset]] = [nodes[index + offset], nodes[index]]
    onChange(nodes)
  }
  const selected = editing ? editing.node[0].ActionName + ':' + editing.node[0].ActionParam : ''
  const known = editing && (editing.node[0].ActionName === 1 ? skills.some((skill) => skill.id === editing.node[0].ActionParam)
    : editing.node[0].ActionName === 2 ? SKILL_SLOTS.some((slot) => slot === editing.node[0].ActionParam)
      : editing.node[0].ActionName === 3 && catalog.relicActions.some((item) => item.id === editing.node[0].ActionParam))
  return <>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
      <div className="min-w-0">
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">{tr('timeline')}</h3>
        <ol aria-label={tr('timeline')} className="grid auto-rows-36 md:auto-rows-40" style={{ gridTemplateColumns: 'repeat(' + columns + ', minmax(0, 1fr))' }}>
          {draft.nodes.map((node, index) => {
            const row = Math.floor(index / columns)
            const offset = index % columns
            const column = row % 2 ? columns - offset - 1 : offset
            const { name, skill, relic, icon } = details(node)
            const invalid = !compatibleAction(node, draft, catalog.skills, treeId)
            const tile = <button type="button" aria-label={t(actionLabel, { n: index + 1 }) + ' · ' + name} onClick={() => open(index)}
              className="relative z-10 flex w-full min-w-0 flex-col items-center gap-2 rounded p-1 focus-visible:outline-2 focus-visible:outline-ring">
              <span className="relative"><IconTile src={icon} quality={null} label={name.slice(0, 1)} className={'size-14 md:size-16 [&]:rounded-full [&]:border-2 ' + (invalid ? 'border-destructive' : 'border-border hover:border-primary')} />
                <span className="absolute -left-1 -top-1 grid size-5 place-items-center rounded-full bg-foreground text-xs tabular-nums text-background">{index + 1}</span></span>
              <span className={'w-full break-words text-xs font-medium md:text-sm ' + (invalid ? 'text-destructive' : '')}>{name}</span>
            </button>
            return <li key={index} className="relative min-w-0" style={{ gridRow: row + 1, gridColumn: column + 1 }}>
              {index < draft.nodes.length - 1 && (offset === columns - 1
                ? <span aria-hidden className="absolute left-1/2 top-28 flex h-7 -translate-x-1/2 flex-col items-center text-muted-foreground"><span className="h-3 border-l border-border" /><ChevronDown className="size-4" /></span>
                : <span aria-hidden className={'absolute top-8 flex h-4 w-full items-center text-muted-foreground ' + (row % 2 ? '-left-1/2' : 'left-1/2')}><span className="w-full border-t border-border" />{row % 2 ? <ChevronLeft className="absolute left-1/2 size-4 -translate-x-1/2 bg-background" /> : <ChevronRight className="absolute left-1/2 size-4 -translate-x-1/2 bg-background" />}</span>)}
              {skill ? <SkillHint skill={skill} treeId={treeId} owner="" interactive>{tile}</SkillHint> : <ArtifactHint artifact={relic} interactive>{tile}</ArtifactHint>}
            </li>
          })}
        </ol>
        {!draft.nodes.length && <p className="py-10 text-center text-sm text-muted-foreground">{tr('emptyCombo')}</p>}
      </div>
      <div className="min-w-0 lg:border-l lg:border-border lg:pl-6">
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground">{tr('commands')}</h3>
        <ol aria-label={tr('commands')} className="space-y-2">{draft.nodes.map((node, index) => {
          const { name } = details(node)
          const valid = compatibleAction(node, draft, catalog.skills, treeId) && validConditions(node, catalog, draft.professionId)
          return <li key={index} className={'min-w-0 rounded-md border bg-background ' + (valid ? 'border-border' : 'border-destructive')}>
            <button type="button" aria-label={t(actionLabel, { n: index + 1 }) + ' · ' + name} className="flex w-full min-w-0 items-center gap-3 rounded-t-md p-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={() => open(index)}>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1 break-words text-sm"><span className="font-mono text-muted-foreground">/cast </span>{name}</span>{readOnly ? <Eye className="size-4 shrink-0 text-muted-foreground" /> : <Pencil className="size-4 shrink-0 text-muted-foreground" />}
            </button>
            <div className="flex items-center justify-between gap-1 border-t border-border px-2 py-1">
              <span className={'min-w-0 break-words pl-1 text-xs ' + (valid ? 'text-muted-foreground' : 'text-destructive')}>{valid ? conditionSummary(node) : tr('unavailableAction')}</span>
              {!readOnly && <div className="flex shrink-0">
                <Button size="icon" className="size-8" variant="ghost" title={tr('moveUp')} aria-label={tr('moveUp')} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" /></Button>
                <Button size="icon" className="size-8" variant="ghost" title={tr('moveDown')} aria-label={tr('moveDown')} disabled={index === draft.nodes.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" /></Button>
                <Button size="icon" className="size-8" variant="ghost" title={tr('duplicate')} aria-label={tr('duplicate')} disabled={draft.nodes.length >= catalog.limits.nodes} onClick={() => onChange([...draft.nodes.slice(0, index + 1), structuredClone(node), ...draft.nodes.slice(index + 1)])}><Copy className="size-3.5" /></Button>
                <Button size="icon" className="size-8" variant="ghost" title={tr('remove')} aria-label={tr('remove')} onClick={() => onChange(draft.nodes.filter((_, at) => at !== index))}><Trash2 className="size-3.5" /></Button>
              </div>}
            </div>
          </li>
        })}</ol>
        {!readOnly && <Button className="mt-3" variant="outline" disabled={draft.nodes.length >= catalog.limits.nodes} onClick={() => setEditing({ index: draft.nodes.length, node: [{ ActionName: 2, ActionParam: 1 }, []] })}><Plus className="size-4" />{tr('add')}</Button>}
      </div>
    </div>
    <Dialog open={editing !== null} onOpenChange={(value) => { if (!value) setEditing(null) }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}
        onEscapeKeyDown={(event) => { if (event.target instanceof Element && event.target.closest('[data-slot="sheet-content"]')) event.preventDefault() }}>
        <DialogHeader><DialogTitle>{t(actionLabel, { n: (editing?.index ?? 0) + 1 })}</DialogTitle></DialogHeader>
        {editing && <>
          <label className="space-y-2 text-sm"><span>{tr('skillAction')}</span>
            <select disabled={readOnly} aria-label={t('builds.action', { n: editing.index + 1 })} className={SELECT_CLASS + ' mt-2 w-full'} value={selected} onChange={(event) => {
              const [ActionName, ActionParam] = event.target.value.split(':').map(Number)
              setEditing({ ...editing, node: [{ ...editing.node[0], ActionName, ActionParam }, editing.node[1]] })
            }}>
              {!known && <option value={selected}>{details(editing.node).name}</option>}
              <optgroup label={tr('slotAction')}>{SKILL_SLOTS.map((slot) => <option key={slot} value={'2:' + slot}>{slotName(slot)}{draft.slots[String(slot)] ? ' · ' + catalog.skills.find((skill) => skill.id === draft.slots[String(slot)])?.name : ''}</option>)}</optgroup>
              <optgroup label={tr('skillAction')}>{skills.map((skill) => <option key={skill.id} value={'1:' + skill.id}>{skill.name}</option>)}</optgroup>
              <optgroup label={tr('relicAction')}>{catalog.relicActions.map((item) => <option key={item.id} value={'3:' + item.id}>{item.name}</option>)}</optgroup>
            </select>
          </label>
          <div className="space-y-2 border-t border-border pt-4"><h3 className="text-sm font-semibold">{tr('conditions')}</h3>
            <fieldset disabled={readOnly}><ConditionEditor groups={editing.node[1]} catalog={catalog} professionId={draft.professionId} treeId={treeId} onChange={(groups) => setEditing({ ...editing, node: [editing.node[0], groups] })} /></fieldset>
          </div>
          {!compatibleAction(editing.node, draft, catalog.skills, treeId) && <p role="alert" className="text-sm text-destructive">{tr('unavailableAction')}</p>}
          {!validConditions(editing.node, catalog, draft.professionId) && <p role="alert" className="text-sm text-destructive">{tr('invalidConditions')}</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>{tr('cancel')}</Button>{!readOnly && <Button disabled={!compatibleAction(editing.node, draft, catalog.skills, treeId) || !validConditions(editing.node, catalog, draft.professionId)} onClick={() => {
            const nodes = [...draft.nodes]
            nodes[editing.index] = editing.node
            onChange(nodes)
            setEditing(null)
          }}>{tr('saveAction')}</Button>}</div>
        </>}
      </DialogContent>
    </Dialog>
  </>
}
