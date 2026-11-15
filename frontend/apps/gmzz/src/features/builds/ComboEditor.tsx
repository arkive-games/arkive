import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowRight, Copy, Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@gamemap/ui'
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
    <div className="build-combo-editor">
      <details className="build-combo-section build-sequence" open>
        <summary>{tr('timeline')}<span className="build-count">{draft.nodes.length}</span></summary>
        <ol aria-label={tr('timeline')} className="build-sequence-grid" data-testid="build-sequence">
          {draft.nodes.map((node, index) => {
            const { name, skill, relic, icon } = details(node)
            const invalid = !compatibleAction(node, draft, catalog.skills, treeId)
            const tile = <button type="button" aria-label={t(actionLabel, { n: index + 1 }) + ' · ' + name} onClick={() => open(index)}
              className={`build-sequence-node ${invalid ? 'is-invalid' : ''}`}>
              <span className="build-sequence-art"><IconTile src={icon} quality={null} label={name.slice(0, 1)} className="size-10 [&]:border-0" />
                <span className="build-sequence-number">{index + 1}</span></span>
              <span className="build-sequence-name">{name}</span>
            </button>
            return <li key={index} className="build-sequence-item">
              {index < draft.nodes.length - 1 && <ArrowRight className="build-sequence-arrow" aria-hidden />}
              {skill ? <SkillHint skill={skill} treeId={treeId} owner="" interactive>{tile}</SkillHint> : <ArtifactHint artifact={relic} interactive>{tile}</ArtifactHint>}
            </li>
          })}
        </ol>
        {!draft.nodes.length && <p className="build-combo-empty">{tr('emptyCombo')}</p>}
      </details>
      <div className="build-combo-section build-command-section">
        <h3>{tr('commands')}</h3>
        <ol aria-label={tr('commands')} className="build-commands" data-testid="build-commands">{draft.nodes.map((node, index) => {
          const { name, icon } = details(node)
          const valid = compatibleAction(node, draft, catalog.skills, treeId) && validConditions(node, catalog, draft.professionId)
          return <li key={index} className={`build-command ${valid ? '' : 'is-invalid'}`}>
            <button type="button" data-testid={`build-action-${index}`} aria-label={t(actionLabel, { n: index + 1 }) + ' · ' + name + ' · ' + (valid ? conditionSummary(node) : tr('unavailableAction'))} className="build-command-main" onClick={() => open(index)}>
              <span className="build-command-number">{String(index + 1).padStart(2, '0')}</span>
              <IconTile src={icon} quality={null} label={name.slice(0, 1)} className="size-9 build-skill-icon [&]:border-0" />
              <span className="build-command-copy"><strong>{name}</strong><small>{valid ? conditionSummary(node) : tr('unavailableAction')}</small></span>
              {readOnly ? <Eye className="size-4 shrink-0 text-muted-foreground" /> : <Pencil className="size-4 shrink-0 text-muted-foreground" />}
            </button>
              {!readOnly && <div className="build-command-actions">
                <Button size="icon" className="size-8" variant="ghost" title={tr('moveUp')} aria-label={tr('moveUp')} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" /></Button>
                <Button size="icon" className="size-8" variant="ghost" title={tr('moveDown')} aria-label={tr('moveDown')} disabled={index === draft.nodes.length - 1} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" /></Button>
                <Button size="icon" className="size-8" variant="ghost" title={tr('duplicate')} aria-label={tr('duplicate')} disabled={draft.nodes.length >= catalog.limits.nodes} onClick={() => onChange([...draft.nodes.slice(0, index + 1), structuredClone(node), ...draft.nodes.slice(index + 1)])}><Copy className="size-3.5" /></Button>
                <Button size="icon" className="size-8" variant="ghost" title={tr('remove')} aria-label={tr('remove')} onClick={() => onChange(draft.nodes.filter((_, at) => at !== index))}><Trash2 className="size-3.5" /></Button>
              </div>}
          </li>
        })}</ol>
        {!readOnly && <Button className="build-add-action" data-testid="build-add-action" variant="outline" disabled={draft.nodes.length >= catalog.limits.nodes} onClick={() => setEditing({ index: draft.nodes.length, node: [{ ActionName: 2, ActionParam: 1 }, []] })}><Plus className="size-4" />{tr('add')}</Button>}
      </div>
    </div>
    <Dialog open={editing !== null} onOpenChange={(value) => { if (!value) setEditing(null) }}>
      <DialogContent className="build-action-dialog flex max-h-[min(85dvh,48rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl" aria-describedby={undefined}
        onEscapeKeyDown={(event) => { if (event.target instanceof Element && event.target.closest('[data-slot="sheet-content"]')) event.preventDefault() }}>
        <DialogHeader className="build-action-dialog-header"><DialogTitle>{t(actionLabel, { n: (editing?.index ?? 0) + 1 })}</DialogTitle></DialogHeader>
        {editing && <>
        <div className="build-action-dialog-body">
          <label className="build-action-dialog-action-field text-sm"><span>{tr('skillAction')}</span>
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
        </div>
          <div className="build-action-dialog-footer"><Button variant="outline" onClick={() => setEditing(null)}>{tr('cancel')}</Button>{!readOnly && <Button disabled={!compatibleAction(editing.node, draft, catalog.skills, treeId) || !validConditions(editing.node, catalog, draft.professionId)} onClick={() => {
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
