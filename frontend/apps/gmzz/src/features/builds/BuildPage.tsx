import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Copy, Download, FilePlus, Plus, Trash2, Upload, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMemory } from '@gamemap/state-memory'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Input, SearchInput, useDocumentTitle,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { IconTile } from '../equipment/PickerModal'
import { plainText } from '../fellows/data'
import { iconUrl } from '../../lib/urls'
import { useRemoteData } from '../../lib/useRemoteData'
import { treeFor, treesFor } from '../score/talents'
import { loadBuildData, skillIcon, type BuildData, type Skill } from './data'
import { buildDraft } from './memory'
import { availableSkill, changeTalent, emptyBuild, equipSkill, exportBuild, importBuild, normalizeNodes, rememberedTalentTreeId, SKILL_SLOTS, SEALED_SLOTS, type BuildDraft, type ComboNode } from './model'
import { ConditionEditor, SELECT_CLASS } from './ConditionEditor'
import { validConditions } from './rules'

type Picker = { kind: 'skill' | 'sealed'; slot: number }
type Confirm = { title: string; body: string; label: string; run: () => void }

export default function BuildPage() {
  const { t } = useTranslation()
  const remote = useRemoteData(loadBuildData)
  useDocumentTitle(t('builds.title') + ' - ' + t('siteTitle'))
  return <ContentPage active="/tools/build" title={t('builds.title')} heading wide>
    {remote.loading ? <p role="status">{t('builds.loading')}</p> : remote.error || !remote.data
      ? <div role="alert" className="space-y-3"><p>{t('builds.loadError')}</p><Button onClick={() => window.location.reload()}>{t('builds.retry')}</Button></div>
      : <BuildEditor data={remote.data} />}
  </ContentPage>
}

function BuildEditor({ data }: { data: BuildData }) {
  const { t } = useTranslation()
  const tr = (key: string) => t('builds.' + key)
  const [draft, setDraft, clearDraft, status] = useMemory(buildDraft)
  const [picker, setPicker] = useState<Picker | null>(null)
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<'import' | 'export' | null>(null)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<BuildDraft | null>(null)
  const [onlyCombo, setOnlyCombo] = useState(false)
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [preset, setPreset] = useState(0)
  const [copied, setCopied] = useState(false)
  const { catalog } = data
  const talentTrees = treesFor(data.talents, draft.professionId)
  const talentTree = useMemo(() => treeFor(data.talents, draft.professionId, rememberedTalentTreeId(draft) ?? null), [data.talents, draft])
  const skillById = useMemo(() => new Map(catalog.skills.map((skill) => [skill.id, skill])), [catalog.skills])
  const skills = catalog.skills.filter((skill) => availableSkill(skill, draft.professionId, talentTree?.id))
  const fixedSkills = skills.filter((skill) => [1, 3, 9].includes(skill.type)).sort((a, b) => a.order - b.order || a.id - b.id)
  const presets = catalog.presets[String(draft.professionId)] ?? []
  const skillName = (id: number) => skillById.get(id)?.name ?? t('builds.unknown', { id })
  const slotName = (slot: number) => slot === 17 ? tr('fellow') : slot === 20 ? tr('puppet') : t('builds.skillSlot', { n: slot })
  const familyOf = (id: number) => skillById.get(id)?.family ?? id
  const availableActions = skills.filter((skill) => [2, 3, 9].includes(skill.type) && skill.autoCast)
  const defaultAction = (): ComboNode => [{ ActionName: 2, ActionParam: 1 }, []]
  const picked = (kind: Picker['kind'], slot: number) => { setPicker({ kind, slot }); setQuery('') }
  const mutateNodes = (nodes: ComboNode[]) => setDraft({ ...draft, nodes })
  const changeNode = (index: number, node: ComboNode) => mutateNodes(draft.nodes.map((item, at) => at === index ? node : item))
  const canExport = draft.nodes.length > 0 && draft.name.length <= catalog.limits.name && draft.description.length <= catalog.limits.description
    && draft.nodes.every((node) => validConditions(node, catalog, draft.professionId))
  const exported = useMemo(() => {
    if (!canExport) return ''
    try { return exportBuild(draft, onlyCombo, talentTree) } catch { return '' }
  }, [draft, onlyCombo, canExport, talentTree])
  function changeProfession(id: number) {
    const run = () => {
      setDraft({ ...emptyBuild(), name: draft.name, description: draft.description, professionId: id,
        sealed: draft.sealed, slots: Object.fromEntries(Object.entries(draft.slots).filter(([slot]) => ['17', '20'].includes(slot))) })
      setPreset(0)
    }
    if (draft.nodes.length || Object.keys(draft.slots).some((slot) => !['17', '20'].includes(slot))) setConfirm({ title: tr('changeTitle'), body: tr('changeBody'), label: tr('confirmChange'), run })
    else run()
  }
  function owner(skill: Skill): string {
    return data.fellows.find((fellow) => fellow.skill.id === skill.id)?.name ?? data.partners.find((partner) => partner.skill.id === skill.id)?.name ?? ''
  }
  function SkillDetails({ skill }: { skill: Skill }) {
    const effects = (skill.talentEffects ?? []).filter((effect) => effect.treeId === talentTree?.id)
    return <><div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {owner(skill) && <span>{owner(skill)}</span>}{skill.cooldown != null && <span>{t('builds.cooldown', { n: skill.cooldown })}</span>}
      {skill.tags.map((tag) => <span key={tag}>{tag}</span>)}
    </div><p className="whitespace-pre-line text-sm leading-relaxed">{plainText(skill.description || skill.brief)}</p>
      {effects.map((effect) => <div key={effect.nodeId} className="space-y-1 border-l-2 border-primary/40 pl-3">
        <p className="text-xs font-semibold text-primary">{t('builds.talentEffect', { name: effect.name })}</p>
        <p className="whitespace-pre-line text-sm leading-relaxed">{plainText(effect.description)}</p>
      </div>)}
    </>
  }
  function slotTile(slot: number) {
    const id = draft.slots[String(slot)]
    const skill = skillById.get(id)
    return <div key={slot} className="min-w-0 space-y-2">
      <div className="flex h-7 items-center justify-between gap-2 text-xs font-medium text-muted-foreground"><span>{slotName(slot)}</span>
        {id && <button type="button" title={tr('clear')} aria-label={tr('clear') + ' ' + slotName(slot)} className="grid size-7 place-items-center rounded hover:bg-muted" onClick={() => setDraft(equipSkill(draft, slot, 0, familyOf))}><X className="size-3.5" /></button>}
      </div>
      <button type="button" aria-label={t('builds.select', { name: slotName(slot) })} onClick={() => picked('skill', slot)}
        className="flex min-h-20 w-full items-center gap-3 rounded-md border border-border bg-background p-3 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-ring">
        <IconTile quality={null} src={skill ? skillIcon(skill.icon) : undefined} label={id ? String(id) : '+'} className="size-12" />
        <span className="min-w-0 break-words text-sm font-semibold">{id ? skillName(id) : tr('empty')}</span>
      </button>
    </div>
  }
  const selectedSkills = SKILL_SLOTS.flatMap((slot) => skillById.get(draft.slots[String(slot)]) ?? [])
  let pickerRows: { id: number; name: string; description: string; icon?: string; quality: number | null }[] = []
  if (picker?.kind === 'skill') {
    const type = picker.slot === 17 ? 7 : picker.slot === 20 ? 8 : 2
    pickerRows = catalog.skills.filter((skill) => skill.type === type && availableSkill(skill, draft.professionId, talentTree?.id))
      .sort((a, b) => a.order - b.order || a.id - b.id)
      .map((skill) => ({ id: skill.id, name: skill.name, description: [owner(skill), plainText(skill.brief || skill.description)].filter(Boolean).join(' '), icon: skillIcon(skill.icon), quality: null }))
  } else if (picker) {
    pickerRows = data.relics.artifacts.filter((artifact) => artifact.groupId === picker.slot).map((artifact) => ({ id: artifact.id, name: artifact.name, description: plainText(artifact.description), icon: artifact.icon ? iconUrl(artifact.icon) : undefined, quality: artifact.quality }))
  }
  const needle = query.trim().toLocaleLowerCase()
  const filteredRows = pickerRows.filter((row) => !needle || (row.name + ' ' + row.description).toLocaleLowerCase().includes(needle))
  return <div className="space-y-7 pb-5">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="flex min-w-0 flex-wrap gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">{tr('pathway')}
          <select className={SELECT_CLASS} value={draft.professionId} onChange={(event) => changeProfession(Number(event.target.value))}>
            {!catalog.professions.some((profession) => profession.id === draft.professionId) && <option value={draft.professionId}>{draft.professionId}</option>}
            {catalog.professions.map((profession) => <option key={profession.id} value={profession.id}>{profession.name}</option>)}
          </select>
        </label>
        {talentTree && <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">{tr('talent')}
          <select aria-label={tr('talent')} className={SELECT_CLASS} value={talentTree.id} onChange={(event) => setDraft(changeTalent(draft, Number(event.target.value), catalog.skills))}>
            {talentTrees.map((tree) => <option key={tree.id} value={tree.id}>{tree.name} · {tr('maxTalent')}</option>)}
          </select>
        </label>}
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">{tr('name')}
          <Input className="w-48 max-w-full" value={draft.name} maxLength={catalog.limits.name} placeholder={tr('unnamed')} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => setConfirm({ title: tr('resetTitle'), body: tr('resetBody'), label: tr('confirm'), run: () => { clearDraft(); setPreset(0) } })}><FilePlus className="size-4" />{tr('new')}</Button>
        <Button variant="outline" size="sm" onClick={() => { setText(''); setPreview(null); setNotice(''); setDialog('import') }}><Upload className="size-4" />{tr('import')}</Button>
        <Button size="sm" disabled={!canExport} title={!canExport ? tr('exportError') : undefined} onClick={() => { setCopied(false); setNotice(''); setDialog('export') }}><Download className="size-4" />{tr('export')}</Button>
      </div>
    </div>
    <section aria-label={tr('loadout')} className="space-y-4">
      <h2 className="text-lg font-semibold">{tr('loadout')}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{SKILL_SLOTS.map(slotTile)}</div>
      {selectedSkills.length > 0 && <details className="border-b border-border pb-4"><summary className="cursor-pointer text-sm text-muted-foreground">{tr('details')}</summary>
        <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{selectedSkills.map((skill) => <article key={skill.id} className="min-w-0 space-y-1"><h3 className="text-sm font-semibold">{skill.name}</h3><SkillDetails skill={skill} /></article>)}</div>
      </details>}
    </section>
    <section aria-label={tr('fixedSkills')} className="space-y-4 border-t border-border pt-5">
      <h2 className="text-lg font-semibold">{tr('fixedSkills')}</h2>
      <div className="grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">{fixedSkills.map((skill) => <article key={skill.id} className="min-w-0 space-y-2" aria-label={skill.name}>
        <div className="flex items-center gap-3">
          <IconTile quality={null} src={skillIcon(skill.icon)} label={skill.name.slice(0, 1)} className="size-10" />
          <div className="min-w-0"><h3 className="break-words text-sm font-semibold">{skill.name}</h3><p className="text-xs text-muted-foreground">{tr(skill.type === 1 ? 'basicAttack' : skill.type === 9 ? 'tacticalSkill' : 'specialSkill')}</p></div>
        </div>
        <SkillDetails skill={skill} />
      </article>)}</div>
    </section>
    <section aria-label={tr('sealed')} className="space-y-3">
      <h2 className="text-lg font-semibold">{tr('sealed')}</h2>
      <div className="grid gap-3 md:grid-cols-3">{SEALED_SLOTS.map((slot) => {
        const id = draft.sealed[String(slot)]
        const artifact = data.relics.artifacts.find((item) => item.id === id)
        const label = data.relics.groupNames[String(slot)] ?? t('builds.sealedSlot', { n: slot })
        return <div key={slot} className="min-w-0">
          <div className="mb-1 flex h-7 items-center justify-between text-xs text-muted-foreground"><span>{label}</span>{id && <button title={tr('clear')} aria-label={tr('clear') + ' ' + label} className="grid size-7 place-items-center hover:bg-muted" onClick={() => { const sealed = { ...draft.sealed }; delete sealed[String(slot)]; setDraft({ ...draft, sealed }) }}><X className="size-3.5" /></button>}</div>
          <button className="flex min-h-20 w-full items-center gap-3 rounded-md border border-border p-3 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-ring" aria-label={t('builds.select', { name: label })} onClick={() => picked('sealed', slot)}>
            <IconTile quality={artifact?.quality ?? null} src={artifact?.icon ? iconUrl(artifact.icon) : undefined} label="+" className="size-12" />
            <span className="min-w-0 break-words text-sm font-semibold">{artifact?.name ?? (id ? t('builds.unknown', { id }) : tr('empty'))}</span>
          </button>
          {artifact && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{plainText(artifact.description)}</p>}
        </div>
      })}</div>
    </section>
    <section aria-label={tr('combo')} className="space-y-4 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-baseline gap-3"><h2 className="text-lg font-semibold">{tr('combo')}</h2><span className="text-xs tabular-nums text-muted-foreground">{t('builds.nodeCount', { n: draft.nodes.length, max: catalog.limits.nodes })}</span></div>
        {presets.length > 0 && <div className="flex min-w-0 flex-wrap items-center gap-2">
          <select aria-label={tr('preset')} className={SELECT_CLASS} value={preset} onChange={(event) => setPreset(Number(event.target.value))}>{presets.map((_, at) => <option key={at} value={at}>{t('builds.presetNumber', { n: at + 1 })}</option>)}</select>
          <Button size="sm" variant="outline" onClick={() => { const run = () => mutateNodes(normalizeNodes(presets[preset])); if (draft.nodes.length) setConfirm({ title: tr('presetTitle'), body: tr('presetBody'), label: tr('usePreset'), run }); else run() }}>{tr('usePreset')}</Button>
        </div>}
      </div>
      <ol className="divide-y divide-border border-y border-border">{draft.nodes.map((node, index) => {
        const [action, groups] = node
        const actionKey = action.ActionName + ':' + action.ActionParam
        const knownAction = action.ActionName === 1 ? availableActions.some((skill) => skill.id === action.ActionParam) : action.ActionName === 2 ? SKILL_SLOTS.includes(action.ActionParam as typeof SKILL_SLOTS[number]) : action.ActionName === 3 && action.ActionParam <= 4
        return <li key={index} className="space-y-3 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-7 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
            <select aria-label={t('builds.action', { n: index + 1 })} className={SELECT_CLASS + ' flex-1 sm:max-w-sm'} value={actionKey} onChange={(event) => { const [ActionName, ActionParam] = event.target.value.split(':').map(Number); changeNode(index, [{ ...action, ActionName, ActionParam }, groups]) }}>
              {!knownAction && <option value={actionKey}>{action.ActionName === 1 ? skillName(action.ActionParam) : actionKey}</option>}
              <optgroup label={tr('slotAction')}>{SKILL_SLOTS.map((slot) => <option key={slot} value={'2:' + slot}>{slotName(slot)}{draft.slots[String(slot)] ? ' · ' + skillName(draft.slots[String(slot)]) : ''}</option>)}</optgroup>
              <optgroup label={tr('skillAction')}>{availableActions.map((skill) => <option key={skill.id} value={'1:' + skill.id}>{skill.name}</option>)}</optgroup>
              <optgroup label={tr('relicAction')}>{[1, 2, 3, 4].map((id) => <option key={id} value={'3:' + id}>{t('builds.relicAbility', { n: id })}</option>)}</optgroup>
            </select>
            <div className="ml-auto flex shrink-0 gap-1">
              <Button size="icon" variant="ghost" title={tr('moveUp')} aria-label={tr('moveUp')} disabled={index === 0} onClick={() => { const nodes = [...draft.nodes]; [nodes[index - 1], nodes[index]] = [nodes[index], nodes[index - 1]]; mutateNodes(nodes) }}><ArrowUp className="size-4" /></Button>
              <Button size="icon" variant="ghost" title={tr('moveDown')} aria-label={tr('moveDown')} disabled={index === draft.nodes.length - 1} onClick={() => { const nodes = [...draft.nodes]; [nodes[index + 1], nodes[index]] = [nodes[index], nodes[index + 1]]; mutateNodes(nodes) }}><ArrowDown className="size-4" /></Button>
              <Button size="icon" variant="ghost" title={tr('duplicate')} aria-label={tr('duplicate')} disabled={draft.nodes.length >= catalog.limits.nodes} onClick={() => mutateNodes([...draft.nodes.slice(0, index + 1), structuredClone(node), ...draft.nodes.slice(index + 1)])}><Copy className="size-4" /></Button>
              <Button size="icon" variant="ghost" title={tr('remove')} aria-label={tr('remove')} onClick={() => mutateNodes(draft.nodes.filter((_, at) => at !== index))}><Trash2 className="size-4" /></Button>
            </div>
          </div>
          <div className="sm:pl-9"><ConditionEditor groups={groups} catalog={catalog} professionId={draft.professionId} onChange={(next) => changeNode(index, [action, next])} /></div>
          {!validConditions(node, catalog, draft.professionId) && <p role="alert" className="text-xs text-destructive">{tr('invalidConditions')}</p>}
        </li>
      })}</ol>
      {!draft.nodes.length && <p className="py-5 text-center text-sm text-muted-foreground">{tr('emptyCombo')}</p>}
      <Button variant="outline" disabled={draft.nodes.length >= catalog.limits.nodes} onClick={() => mutateNodes([...draft.nodes, defaultAction()])}><Plus className="size-4" />{tr('add')}</Button>
      <label className="block space-y-2 text-xs text-muted-foreground"><span>{tr('descriptionLabel')}</span><textarea className={SELECT_CLASS + ' block min-h-20 w-full resize-y'} maxLength={catalog.limits.description} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
    </section>
    <p role="status" className="text-xs text-muted-foreground">{notice || (status === 'failed' ? tr('saveError') : status === 'saved' ? tr('saved') : '')}</p>
    <Dialog open={picker !== null} onOpenChange={(open) => { if (!open) setPicker(null) }}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{picker?.kind === 'skill' ? slotName(picker.slot) : tr('sealed')}</DialogTitle></DialogHeader>
        <SearchInput value={query} onChange={setQuery} placeholder={tr('search')} aria-label={tr('search')} />
        <div className="min-h-0 overflow-y-auto overscroll-contain"><div className={picker?.kind === 'skill' ? 'grid grid-cols-2 gap-2 sm:grid-cols-4' : 'divide-y divide-border'}>{filteredRows.map((row) => <button key={row.id} className={'relative flex w-full items-center rounded hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring ' + (picker?.kind === 'skill' ? 'min-h-24 flex-col justify-center gap-2 p-2 text-center' : 'min-h-16 gap-3 p-3 text-left')} onClick={() => {
          if (!picker) return
          if (picker.kind === 'skill') setDraft(equipSkill(draft, picker.slot, row.id, familyOf))
          else setDraft({ ...draft, sealed: { ...draft.sealed, [picker.slot]: row.id } })
          setPicker(null)
        }} aria-label={t('builds.select', { name: row.name })}>
          <IconTile quality={row.quality} src={row.icon} label={row.name.slice(0, 1)} className="size-12" />
          <div className={'min-w-0 space-y-1 ' + (picker?.kind === 'skill' ? 'w-full' : 'flex-1')}><h3 className="break-words text-sm font-semibold">{row.name}</h3>{picker?.kind === 'sealed' && <p className="text-sm leading-relaxed text-muted-foreground">{row.description}</p>}</div>
          {(picker?.kind === 'skill' ? draft.slots[String(picker.slot)] : draft.sealed[String(picker?.slot)]) === row.id && <Check className={'size-4 shrink-0 text-primary ' + (picker?.kind === 'skill' ? 'absolute right-2 top-2' : '')} />}
        </button>)}</div>{!filteredRows.length && <p className="p-8 text-center text-sm text-muted-foreground">{tr('noResults')}</p>}</div>
      </DialogContent>
    </Dialog>
    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>{dialog === 'import' ? tr('importTitle') : tr('exportTitle')}</DialogTitle><DialogDescription>{draft.name || tr('unnamed')}</DialogDescription></DialogHeader>
        {dialog === 'import' ? <>
          <label className="space-y-2 text-sm"><span>{tr('paste')}</span><textarea aria-label={tr('paste')} className={SELECT_CLASS + ' mt-2 min-h-40 w-full resize-y font-mono text-xs'} value={text} maxLength={100000} onChange={(event) => { setText(event.target.value); setPreview(null); setNotice('') }} /></label>
          {preview && <div className="space-y-2 border-y border-border py-3"><p className="text-sm font-semibold">{preview.name || tr('unnamed')}</p><p className="text-xs text-muted-foreground">{t('builds.importSummary', { pathway: catalog.professions.find((profession) => profession.id === preview.professionId)?.name ?? preview.professionId, skills: Object.keys(preview.slots).length, relics: Object.keys(preview.sealed).length, nodes: preview.nodes.length })}</p></div>}
          {notice && <p role="alert" className="text-sm text-destructive">{notice}</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={!text.trim()} onClick={() => { try { setPreview(importBuild(text, draft)); setNotice('') } catch { setPreview(null); setNotice(tr('importError')) } }}>{tr('preview')}</Button>
            <Button disabled={!preview} onClick={() => { if (preview) setDraft(preview); setPreset(0); setDialog(null); setNotice(tr('imported')) }}>{tr('apply')}</Button></div>
        </> : <>
          <div className="flex flex-wrap gap-4 text-sm">{[false, true].map((value) => <label key={String(value)} className="flex items-center gap-2"><input type="radio" name="export-mode" checked={onlyCombo === value} onChange={() => { setOnlyCombo(value); setCopied(false) }} />{tr(value ? 'onlyCombo' : 'full')}</label>)}</div>
          <textarea aria-label={tr('paste')} className={SELECT_CLASS + ' min-h-40 w-full resize-y font-mono text-xs'} readOnly value={exported} onFocus={(event) => event.target.select()} />
          {notice && <p role="status" className="text-sm">{notice}</p>}
          <Button disabled={!exported} onClick={async () => { try { await navigator.clipboard.writeText(exported); setCopied(true); setNotice('') } catch { setNotice(tr('copyError')) } }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{tr(copied ? 'copied' : 'copy')}</Button>
        </>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirm?.title}</AlertDialogTitle><AlertDialogDescription>{confirm?.body}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{tr('cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => confirm?.run()}>{confirm?.label}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>
}
