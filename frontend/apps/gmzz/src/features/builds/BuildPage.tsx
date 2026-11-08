import { useMemo, useState } from 'react'
import { Check, Copy, Download, FilePlus, Upload, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useOptionalAuth } from '@gamemap/auth'
import { useMemory } from '@gamemap/state-memory'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Input, SearchInput, TooltipProvider, useDocumentTitle,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { IconTile } from '../equipment/PickerModal'
import { plainText } from '../fellows/data'
import { iconUrl } from '../../lib/urls'
import { useRemoteData } from '../../lib/useRemoteData'
import { treeFor, treesFor } from '../score/talents'
import { loadBuildData, skillIcon, type BuildData, type Skill } from './data'
import { buildDraft } from './memory'
import { availableSkill, changeTalent, compatibleAction, emptyBuild, equipSkill, exportBuild, importBuild, normalizeNodes, rememberedTalentTreeId, SEALED_SLOTS, type BuildDraft, type ComboNode } from './model'
import { SELECT_CLASS } from './ConditionEditor'
import { ComboEditor } from './ComboEditor'
import { SkillHint } from './SkillHint'
import { ArtifactHint } from './ArtifactHint'
import { CharacterProvider, useCharacter, useSection } from '../characters/CharacterProvider'
import { CharacterBar } from '../characters/CharacterBar'
import { validConditions } from './rules'
import '../score/score.css'

type Picker = { kind: 'skill' | 'sealed'; slot: number }
type Confirm = { title: string; body: string; label: string; run: () => void }

export default function BuildPage() {
  return <CharacterProvider id={null} surface="build"><BuildView /></CharacterProvider>
}

export function SavedBuildPage() {
  const { id } = useParams({ strict: false }) as { id: string }
  return <CharacterProvider key={id} id={id} surface="build"><BuildView /></CharacterProvider>
}

function BuildView() {
  const { t } = useTranslation()
  const character = useCharacter()
  const navigate = useNavigate()
  const remote = useRemoteData(loadBuildData)
  useDocumentTitle(t('builds.title') + ' - ' + t('siteTitle'))
  return <ContentPage active="/tools/build" title={t('builds.title')} heading wide>
    {character.id && (character.status === 'missing' || (character.status === 'error' && !character.character))
      ? <div className="space-y-3"><p role="alert">{t(character.status === 'missing' ? 'characters.missingTitle' : 'characters.loadErrorTitle')}</p><Button variant="outline" onClick={() => void navigate({ to: '/tools/build' })}>{t('characters.backToDraft')}</Button></div>
      : remote.loading || character.status === 'loading' ? <p role="status">{t('builds.loading')}</p> : remote.error || !remote.data
      ? <div role="alert" className="space-y-3"><p>{t('builds.loadError')}</p><Button onClick={() => window.location.reload()}>{t('builds.retry')}</Button></div>
      : <><div className="mb-6 max-w-xl [--gz-card:var(--card)] [--gz-ink:var(--foreground)] [--gz-sub:var(--muted-foreground)] [--gz-faint:var(--muted-foreground)] [--gz-line:var(--border)] [--b3:124,96,214]"><CharacterBar surface="build" /></div><BuildEditor data={remote.data} /></>}
  </ContentPage>
}

function BuildEditor({ data }: { data: BuildData }) {
  const { t } = useTranslation()
  const tr = (key: string) => t('builds.' + key)
  const [draft, setDraft] = useSection('builds')
  const [, , , status] = useMemory(buildDraft)
  const { id: characterId, readOnly } = useCharacter()
  const navigate = useNavigate()
  const auth = useOptionalAuth()
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
  const fixedRoles = ['basicAttack', 'decontrol', 'finisher'] as const
  const fixedSkills = fixedRoles.map((role) => skills.filter((skill) => skill.fixedRole === role).sort((a, b) => a.order - b.order || a.id - b.id)[0])
  const otherSkills = skills.filter((skill) => skill.professionId === draft.professionId && [1, 3, 9].includes(skill.type) && !fixedSkills.some((fixed) => fixed?.id === skill.id)).sort((a, b) => a.order - b.order || a.id - b.id)
  const presets = catalog.presets[String(draft.professionId)] ?? []
  const skillName = (id: number) => skillById.get(id)?.name ?? t('builds.unknown', { id })
  const slotName = (slot: number) => slot === 17 ? tr('fellow') : slot === 20 ? tr('puppet') : t('builds.skillSlot', { n: slot })
  const familyOf = (id: number) => skillById.get(id)?.family ?? id
  const picked = (kind: Picker['kind'], slot: number) => { setPicker({ kind, slot }); setQuery('') }
  const mutateNodes = (nodes: ComboNode[]) => setDraft({ ...draft, nodes })
  const canExport = draft.nodes.length > 0 && draft.name.length <= catalog.limits.name && draft.description.length <= catalog.limits.description
    && draft.nodes.every((node) => validConditions(node, catalog, draft.professionId) && compatibleAction(node, draft, catalog.skills, talentTree?.id))
  const exported = useMemo(() => {
    if (!canExport) return ''
    try {
      const author = auth?.user?.name || 'Arkive'
      return t(onlyCombo ? 'builds.gameComboMessage' : 'builds.gameSchemeMessage', { name: author }) + '\n' + exportBuild(draft, onlyCombo, talentTree, author)
    } catch { return '' }
  }, [draft, onlyCombo, canExport, talentTree, auth?.user?.name, t])
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
  function slotTile(slot: number) {
    const id = draft.slots[String(slot)]
    const skill = skillById.get(id)
    const tile = <button type="button" aria-label={t('builds.select', { name: slotName(slot) })} onClick={() => { if (!readOnly) picked('skill', slot) }}
      className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-md p-2 text-center hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
      <span className="grid size-16 shrink-0 place-items-center"><IconTile quality={null} src={skill ? skillIcon(skill.icon) : undefined} label={id ? String(id) : '+'} className="size-12" /></span>
      <span className="min-w-0 break-words text-sm font-semibold">{id ? skillName(id) : tr('empty')}</span>
    </button>
    return <div key={slot} className="min-w-0 space-y-2">
      <div className="relative flex h-7 items-center justify-between gap-1 text-xs font-medium text-muted-foreground lg:justify-center"><span>{slotName(slot)}</span>
        {id && !readOnly && <button type="button" title={tr('clear')} aria-label={tr('clear') + ' ' + slotName(slot)} className="grid size-6 shrink-0 place-items-center rounded hover:bg-muted lg:absolute lg:right-0" onClick={() => setDraft(equipSkill(draft, slot, 0, familyOf))}><X className="size-3.5" /></button>}
      </div>
      {skill ? <SkillHint skill={skill} treeId={talentTree?.id} owner={owner(skill)} interactive>{tile}</SkillHint> : tile}
    </div>
  }
  function fixedTile(skill: Skill | undefined, label: string) {
    const tile = <button type="button" aria-label={skill?.name ?? label} className="flex min-h-24 w-full cursor-help flex-col items-center justify-center gap-2 rounded-md p-2 text-center hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
      <span className="grid size-16 shrink-0 place-items-center"><IconTile quality={null} src={skill ? skillIcon(skill.icon) : undefined} label={skill?.name.slice(0, 1) ?? '-'} className={skill?.fixedRole === 'basicAttack' ? 'size-16 [&]:border-0 [&]:bg-transparent' : 'size-12'} /></span>
      <span className="min-w-0 break-words text-sm font-semibold">{skill?.name ?? label}</span>
    </button>
    return skill ? <SkillHint skill={skill} treeId={talentTree?.id} owner={owner(skill)}>{tile}</SkillHint> : tile
  }
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
  return <TooltipProvider delayDuration={150}><div className="space-y-7 pb-5">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="flex min-w-0 flex-wrap gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">{tr('pathway')}
          <select disabled={readOnly} className={SELECT_CLASS} value={draft.professionId} onChange={(event) => changeProfession(Number(event.target.value))}>
            {!catalog.professions.some((profession) => profession.id === draft.professionId) && <option value={draft.professionId}>{draft.professionId}</option>}
            {catalog.professions.map((profession) => <option key={profession.id} value={profession.id}>{profession.name}</option>)}
          </select>
        </label>
        {talentTree && <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">{tr('talent')}
          <select disabled={readOnly} aria-label={tr('talent')} className={SELECT_CLASS} value={talentTree.id} onChange={(event) => { setDraft(changeTalent(draft, Number(event.target.value), catalog.skills)); setNotice(tr('talentChanged')) }}>
            {talentTrees.map((tree) => <option key={tree.id} value={tree.id}>{tree.name} · {tr('maxTalent')}</option>)}
          </select>
        </label>}
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">{tr('name')}
          <Input readOnly={readOnly} className="w-48 max-w-full" value={draft.name} maxLength={catalog.limits.name} placeholder={tr('unnamed')} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => setConfirm({ title: tr('resetTitle'), body: tr('resetBody'), label: tr('confirm'), run: () => { buildDraft.clear(); setPreset(0); if (characterId) void navigate({ to: '/tools/build' }) } })}><FilePlus className="size-4" />{tr('new')}</Button>
        <Button disabled={readOnly} variant="outline" size="sm" onClick={() => { setText(''); setPreview(null); setNotice(''); setDialog('import') }}><Upload className="size-4" />{tr('import')}</Button>
        <Button size="sm" disabled={!canExport} title={!canExport ? tr('exportError') : undefined} onClick={() => { setCopied(false); setNotice(''); setDialog('export') }}><Download className="size-4" />{tr('export')}</Button>
      </div>
    </div>
    <section aria-label={tr('loadout')} className="space-y-4">
      <h2 className="text-lg font-semibold">{tr('loadout')}</h2>
      <div aria-label={tr('loadout')} className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {[1, 2, 3, 4].map(slotTile)}
        {fixedRoles.map((role, index) => <div key={role} className="min-w-0 space-y-2"><div className="flex h-7 items-center justify-center text-xs font-medium text-muted-foreground">{tr(role)}</div>{fixedTile(fixedSkills[index], tr(role))}</div>)}
        {[17, 20].map(slotTile)}
      </div>
      {otherSkills.length > 0 && <div aria-label={tr('otherSkills')} className="grid grid-cols-3 gap-2 border-t border-border pt-3 sm:grid-cols-5 lg:grid-cols-9">{otherSkills.map((skill) => <div key={skill.id} className="min-w-0">{fixedTile(skill, skill.name)}</div>)}</div>}
    </section>
    <section aria-label={tr('sealed')} className="space-y-3">
      <h2 className="text-lg font-semibold">{tr('sealed')}</h2>
      <div className="grid gap-3 md:grid-cols-3">{SEALED_SLOTS.map((slot) => {
        const id = draft.sealed[String(slot)]
        const artifact = data.relics.artifacts.find((item) => item.id === id)
        const label = data.relics.groupNames[String(slot)] ?? t('builds.sealedSlot', { n: slot })
        return <div key={slot} className="min-w-0">
          <div className="mb-1 flex h-7 items-center justify-between text-xs text-muted-foreground"><span>{label}</span>{id && !readOnly && <button title={tr('clear')} aria-label={tr('clear') + ' ' + label} className="grid size-7 place-items-center hover:bg-muted" onClick={() => { const sealed = { ...draft.sealed }; delete sealed[String(slot)]; setDraft({ ...draft, sealed }) }}><X className="size-3.5" /></button>}</div>
          <ArtifactHint artifact={artifact} interactive={!readOnly}><button className="flex min-h-20 w-full items-center gap-3 rounded-md border border-border p-3 text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-ring" aria-label={t('builds.select', { name: label })} onClick={() => { if (!readOnly) picked('sealed', slot) }}>
            <IconTile quality={artifact?.quality ?? null} src={artifact?.icon ? iconUrl(artifact.icon) : undefined} label="+" className="size-12" />
            <span className="min-w-0 break-words text-sm font-semibold">{artifact?.name ?? (id ? t('builds.unknown', { id }) : tr('empty'))}</span>
          </button></ArtifactHint>
        </div>
      })}</div>
    </section>
    <section aria-label={tr('combo')} className="space-y-4 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-baseline gap-3"><h2 className="text-lg font-semibold">{tr('combo')}</h2><span className="text-xs tabular-nums text-muted-foreground">{t('builds.nodeCount', { n: draft.nodes.length, max: catalog.limits.nodes })}</span></div>
        {!readOnly && presets.length > 0 && <div className="flex min-w-0 flex-wrap items-center gap-2">
          <select aria-label={tr('preset')} className={SELECT_CLASS} value={preset} onChange={(event) => setPreset(Number(event.target.value))}>{presets.map((_, at) => <option key={at} value={at}>{t('builds.presetNumber', { n: at + 1 })}</option>)}</select>
          <Button size="sm" variant="outline" onClick={() => { const run = () => mutateNodes(normalizeNodes(presets[preset])); if (draft.nodes.length) setConfirm({ title: tr('presetTitle'), body: tr('presetBody'), label: tr('usePreset'), run }); else run() }}>{tr('usePreset')}</Button>
        </div>}
      </div>
      <ComboEditor data={data} draft={draft} treeId={talentTree?.id} readOnly={readOnly} onChange={mutateNodes} />
      <label className="block space-y-2 text-xs text-muted-foreground"><span>{tr('descriptionLabel')}</span><textarea readOnly={readOnly} className={SELECT_CLASS + ' block min-h-20 w-full resize-y'} maxLength={catalog.limits.description} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
    </section>
    <p role="status" className="text-xs text-muted-foreground">{notice || (!characterId ? status === 'failed' ? tr('saveError') : status === 'saved' ? tr('saved') : '' : '')}</p>
    <Dialog open={picker !== null} onOpenChange={(open) => { if (!open) setPicker(null) }}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl" aria-describedby={undefined}
        onEscapeKeyDown={(event) => { if (event.target instanceof Element && event.target.closest('[data-slot="sheet-content"]')) event.preventDefault() }}>
        <DialogHeader><DialogTitle>{picker?.kind === 'skill' ? slotName(picker.slot) : tr('sealed')}</DialogTitle></DialogHeader>
        <SearchInput value={query} onChange={setQuery} placeholder={tr('search')} aria-label={tr('search')} />
        <div className="min-h-0 overflow-y-auto overscroll-contain"><div className={picker?.kind === 'skill' ? 'grid grid-cols-2 gap-2 sm:grid-cols-4' : 'divide-y divide-border'}>{filteredRows.map((row) => {
          const tile = <button key={row.id} className={'relative flex w-full items-center rounded hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring ' + (picker?.kind === 'skill' ? 'min-h-24 flex-col justify-center gap-2 p-2 text-center' : 'min-h-16 gap-3 p-3 text-left')} onClick={() => {
          if (!picker) return
          if (picker.kind === 'skill') setDraft(equipSkill(draft, picker.slot, row.id, familyOf))
          else setDraft({ ...draft, sealed: { ...draft.sealed, [picker.slot]: row.id } })
          setPicker(null)
        }} aria-label={t('builds.select', { name: row.name })}>
          <IconTile quality={row.quality} src={row.icon} label={row.name.slice(0, 1)} className="size-12" />
          <div className={'min-w-0 space-y-1 ' + (picker?.kind === 'skill' ? 'w-full' : 'flex-1')}><h3 className="break-words text-sm font-semibold">{row.name}</h3>{picker?.kind === 'sealed' && <p className="text-sm leading-relaxed text-muted-foreground">{row.description}</p>}</div>
          {(picker?.kind === 'skill' ? draft.slots[String(picker.slot)] : draft.sealed[String(picker?.slot)]) === row.id && <Check className={'size-4 shrink-0 text-primary ' + (picker?.kind === 'skill' ? 'absolute left-2 top-2' : '')} />}
        </button>
          const skill = picker?.kind === 'skill' ? skillById.get(row.id) : undefined
          const artifact = picker?.kind === 'sealed' ? data.relics.artifacts.find((item) => item.id === row.id) : undefined
          return skill ? <SkillHint key={row.id} skill={skill} treeId={talentTree?.id} owner={owner(skill)} interactive>{tile}</SkillHint> : <ArtifactHint key={row.id} artifact={artifact} interactive>{tile}</ArtifactHint>
        })}</div>{!filteredRows.length && <p className="p-8 text-center text-sm text-muted-foreground">{tr('noResults')}</p>}</div>
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
  </div></TooltipProvider>
}
