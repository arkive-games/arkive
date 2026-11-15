import { useMemo, useState } from 'react'
import { Check, Copy, Download, FilePlus, LockKeyhole, Plus, Upload, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useOptionalAuth } from '@gamemap/auth'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Input, SearchInput, TooltipProvider, useDocumentTitle,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { GzSelect } from '../../components/GzSelect'
import { IconTile } from '../equipment/PickerModal'
import { plainText } from '../fellows/data'
import { iconUrl } from '../../lib/urls'
import { useRemoteData } from '../../lib/useRemoteData'
import { treeFor, treesFor } from '../score/talents'
import { loadBuildData, skillIcon, type BuildData, type Skill } from './data'
import { relicServerOf, sealedGroup, availableSkill, changeTalent, compatibleAction, emptyBuild, equipSkill, exportBuild, importBuild, normalizeNodes, rememberedTalentTreeId, SEALED_SLOTS, type BuildDraft, type ComboNode } from './model'
import { SELECT_CLASS } from './ConditionEditor'
import { ComboEditor } from './ComboEditor'
import { SkillHint } from './SkillHint'
import { ArtifactHint } from './ArtifactHint'
import { CharacterProvider, useCharacter, useSection } from '../characters/CharacterProvider'
import { CharacterBar } from '../characters/CharacterBar'
import { validConditions } from './rules'
import '../score/score.css'
import './builds.css'

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
  return <ContentPage active="/tools/build" title={t('builds.title')} wide>
    {character.id && (character.status === 'missing' || (character.status === 'error' && !character.character))
      ? <div className="space-y-3"><p role="alert">{t(character.status === 'missing' ? 'characters.missingTitle' : 'characters.loadErrorTitle')}</p><Button variant="outline" onClick={() => void navigate({ to: '/tools/build' })}>{t('characters.backToDraft')}</Button></div>
      : remote.loading || character.status === 'loading' ? <p role="status">{t('builds.loading')}</p> : remote.error || !remote.data
      ? <div role="alert" className="space-y-3"><p>{t('builds.loadError')}</p><Button onClick={() => window.location.reload()}>{t('builds.retry')}</Button></div>
      : <div className="build-workspace" data-testid="build-workspace"><BuildEditor data={remote.data} /></div>}
  </ContentPage>
}

function BuildEditor({ data }: { data: BuildData }) {
  const { t } = useTranslation()
  const tr = (key: string) => t('builds.' + key)
  const [draft, setDraft] = useSection('builds')
  const { id: characterId, readOnly, resetDraft, updateMeta } = useCharacter()
  const navigate = useNavigate()
  const auth = useOptionalAuth()
  const [picker, setPicker] = useState<Picker | null>(null)
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<'import' | 'export' | 'rename' | null>(null)
  const [renamed, setRenamed] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState('')
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<BuildDraft | null>(null)
  const [onlyCombo, setOnlyCombo] = useState(false)
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [preset, setPreset] = useState(0)
  const [copied, setCopied] = useState(false)
  const [workspace, setWorkspace] = useState<'loadout' | 'combo'>('loadout')
  const { catalog } = data
  const relicServer = relicServerOf(draft)
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
        sealed: draft.sealed, relicServer: draft.relicServer, slots: Object.fromEntries(Object.entries(draft.slots).filter(([slot]) => ['17', '20'].includes(slot))) })
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
      data-testid={`build-skill-${slot}`} className={`build-slot ${id ? 'is-equipped' : ''}`}>
      {skill ? <IconTile quality={null} src={skillIcon(skill.icon)} label={skill.name.slice(0, 1)} className="size-12" /> : <span className="build-empty-art"><Plus className="size-5" aria-hidden /></span>}
      <span className="build-slot-name">{id ? skillName(id) : tr('empty')}</span>
    </button>
    return <div key={slot} className="build-slot-wrap">
      <div className="build-slot-label"><span>{slotName(slot)}</span>
        {id && !readOnly && <button type="button" title={tr('clear')} aria-label={tr('clear') + ' ' + slotName(slot)} className="build-remove" onClick={() => setDraft(equipSkill(draft, slot, 0, familyOf))}><X className="size-3.5" /></button>}
      </div>
      {skill ? <SkillHint skill={skill} treeId={talentTree?.id} owner={owner(skill)} interactive>{tile}</SkillHint> : tile}
    </div>
  }
  function fixedTile(skill: Skill | undefined, label: string) {
    const tile = <button type="button" aria-label={skill?.name ?? label} className="build-fixed-skill">
      <IconTile quality={null} src={skill ? skillIcon(skill.icon) : undefined} label={skill?.name.slice(0, 1) ?? '-'} className="size-9 build-skill-icon [&]:border-0 [&]:bg-transparent" />
      <span>{skill?.name ?? label}</span>
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
    pickerRows = data.relics.artifacts.filter((artifact) => artifact.groupId === sealedGroup(picker.slot)).map((artifact) => ({ id: artifact.id, name: artifact.name, description: plainText(artifact.description), icon: artifact.icon ? iconUrl(artifact.icon) : undefined, quality: artifact.quality }))
  }
  const needle = query.trim().toLocaleLowerCase()
  const filteredRows = pickerRows.filter((row) => !needle || (row.name + ' ' + row.description).toLocaleLowerCase().includes(needle))
  return <TooltipProvider delayDuration={150}><div className="build-editor" data-workspace={workspace}>
    <div className="build-plan-surface">
      <h1>{tr('title')}</h1>
      <CharacterBar surface="build" planName={draft.name || undefined} onRename={() => { setRenamed(draft.name); setRenameError(''); setDialog('rename') }} menuItems={<>
        <Button size="sm" variant="outline" data-testid="build-new" onClick={() => setConfirm({ title: tr('resetTitle'), body: tr('resetBody'), label: tr('confirm'), run: () => { resetDraft(null); setPreset(0); if (characterId) void navigate({ to: '/tools/build' }) } })}><FilePlus className="size-4" />{tr('new')}</Button>
        <Button size="sm" variant="outline" disabled={readOnly} data-testid="build-import" onClick={() => { setText(''); setPreview(null); setNotice(''); setDialog('import') }}><Upload className="size-4" />{tr('import')}</Button>
        <Button size="sm" variant="outline" disabled={!canExport} data-testid="build-export" onClick={() => { setCopied(false); setNotice(''); setDialog('export') }}><Download className="size-4" />{tr('export')}</Button>
      </>}>
        <div className="build-plan-fields">
        <div className="build-field"><span>{tr('pathway')}</span>
          <GzSelect disabled={readOnly} label={tr('pathway')} testId="build-pathway" value={String(draft.professionId)} onChange={(value) => changeProfession(Number(value))}
            options={catalog.professions.some((profession) => profession.id === draft.professionId) ? catalog.professions.map((profession) => ({ value: String(profession.id), label: profession.name })) : [{ value: String(draft.professionId), label: String(draft.professionId) }, ...catalog.professions.map((profession) => ({ value: String(profession.id), label: profession.name }))]} />
        </div>
        {talentTree && <div className="build-field"><span>{tr('talent')}</span>
          <GzSelect disabled={readOnly} label={tr('talent')} testId="build-talent" value={String(talentTree.id)} onChange={(value) => { setDraft(changeTalent(draft, Number(value), catalog.skills)); setNotice(tr('talentChanged')) }}
            options={talentTrees.map((tree) => ({ value: String(tree.id), label: `${tree.name} · ${tr('maxTalent')}` }))} />
        </div>}
        </div>
      </CharacterBar>
    </div>
    <div className="build-mobile-switch" role="group" aria-label={tr('title')}>
      {(['loadout', 'combo'] as const).map((view) => <button key={view} type="button" aria-pressed={workspace === view} aria-controls={`build-${view}-region`} data-testid={`build-view-${view}`} onClick={() => setWorkspace(view)}>{tr(view)}{view === 'combo' && <span className="tabular-nums">{draft.nodes.length}</span>}</button>)}
    </div>
    <div className="build-workbench">
    <div className="build-loadout-region" id="build-loadout-region">
    <div className="build-loadout-surface">
    <section aria-label={tr('loadout')} className="build-loadout-section">
      <div className="build-section-heading"><h2>{tr('loadout')}</h2></div>
      <div aria-label={tr('sequence')} className="build-skill-group">
        <div className="build-skill-grid">
          {[1, 2, 3, 4, 17, 20].map(slotTile)}
          {fixedRoles.map((role, index) => <div key={role} className="build-fixed-tile">
            <span className="build-fixed-label">{tr(role)}</span>{fixedTile(fixedSkills[index], tr(role))}
          </div>)}
          {otherSkills.map((skill) => <div key={skill.id} className="build-fixed-tile"><span className="build-fixed-label">{tr('otherSkills')}</span>{fixedTile(skill, skill.name)}</div>)}
        </div>
      </div>
      <div aria-label={tr('sealed')} className="build-relic-section">
      <div className="build-section-heading"><h3>{tr('sealed')}</h3>
        <div className="build-relic-mode" role="group" aria-label={t('relic.server')}>
          {(['local', 'cross'] as const).map((server) => <button key={server} type="button" disabled={readOnly} aria-pressed={relicServer === server} data-testid={`build-server-${server}`} onClick={() => setDraft({ ...draft, relicServer: server })}>{t(server === 'local' ? 'relic.serverLocal' : 'relic.serverCross')}</button>)}
        </div>
      </div>
      <div className="build-relic-list">{SEALED_SLOTS.map((slot) => {
        const id = draft.sealed[String(slot)]
        const artifact = data.relics.artifacts.find((item) => item.id === id)
        const label = data.relics.groupNames[String(sealedGroup(slot))] ?? t('builds.sealedSlot', { n: slot })
        const locked = relicServer === 'local' && slot > 3
        if (locked) return <div key={slot} className="build-relic-row build-relic-locked" data-testid={`build-relic-locked-${slot}`} aria-label={t('builds.crossSlotLocked')}><span className="build-fixed-label">{label}</span><LockKeyhole className="size-6" aria-hidden /><span>{tr('locked')}</span></div>
        return <div key={slot} className="build-relic-row">
          <ArtifactHint artifact={artifact} interactive={!readOnly}><button className="build-relic" data-testid={`build-relic-${slot}`} aria-label={t('builds.select', { name: label })} onClick={() => { if (!readOnly) picked('sealed', slot) }}>
            {artifact ? <IconTile quality={artifact.quality} src={artifact.icon ? iconUrl(artifact.icon) : undefined} label={artifact.name.slice(0, 1)} className="size-11" /> : <span className="build-empty-art"><Plus className="size-5" aria-hidden /></span>}
            <span className="build-relic-name"><small>{label}</small><strong>{artifact?.name ?? (id ? t('builds.unknown', { id }) : tr('empty'))}</strong></span>
          </button></ArtifactHint>
          {id && !readOnly && <button title={tr('clear')} aria-label={tr('clear') + ' ' + label} className="build-remove" onClick={() => { const sealed = { ...draft.sealed }; delete sealed[String(slot)]; setDraft({ ...draft, sealed }) }}><X className="size-3.5" /></button>}
        </div>
      })}</div>
      </div>
    </section>
    </div>
    </div>
    <section aria-label={tr('combo')} className="build-combo-region" id="build-combo-region">
      <div className="build-combo-surface">
      <div className="build-section-heading"><div className="build-heading-title"><h2>{tr('combo')}</h2><span className="build-count">{t('builds.nodeCount', { n: draft.nodes.length, max: catalog.limits.nodes })}</span></div>
        {!readOnly && presets.length > 0 && <div className="build-presets">
          <GzSelect label={tr('preset')} testId="build-preset" value={String(preset)} onChange={(value) => setPreset(Number(value))} options={presets.map((_, at) => ({ value: String(at), label: `${tr('preset')} ${at + 1}` }))} />
          <Button size="sm" variant="outline" data-testid="build-apply-preset" onClick={() => { const run = () => mutateNodes(normalizeNodes(presets[preset])); if (draft.nodes.length) setConfirm({ title: tr('presetTitle'), body: tr('presetBody'), label: tr('usePreset'), run }); else run() }}>{tr('usePreset')}</Button>
        </div>}
      </div>
      <ComboEditor data={data} draft={draft} treeId={talentTree?.id} readOnly={readOnly} onChange={mutateNodes} />
      <label className="build-combo-section build-description"><span>{tr('descriptionLabel')}</span><textarea readOnly={readOnly} className={SELECT_CLASS + ' block min-h-20 w-full resize-y'} maxLength={catalog.limits.description} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      </div>
    </section>
    </div>
    <p role="status" className="text-xs text-muted-foreground">{notice}</p>
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
    <Dialog open={dialog === 'rename'} onOpenChange={(open) => { if (!open) setDialog(null) }}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{tr('rename')}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault()
          if (readOnly || renaming) return
          setRenaming(true)
          setRenameError('')
          try {
            const name = renamed.trim()
            if (characterId) await updateMeta({ name })
            setDraft((current) => ({ ...current, name }))
            setDialog(null)
          } catch { setRenameError(t('characters.failed')) }
          finally { setRenaming(false) }
        }}>
          <label className="build-field"><span>{tr('name')}</span><Input autoFocus data-testid="build-name" value={renamed} maxLength={catalog.limits.name} disabled={renaming} onChange={(event) => setRenamed(event.target.value)} /></label>
          {renameError && <p role="alert" className="text-sm text-destructive">{renameError}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={renaming} onClick={() => setDialog(null)}>{tr('cancel')}</Button><Button type="submit" disabled={readOnly || renaming || !renamed.trim()}>{t('characters.save')}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={dialog === 'import' || dialog === 'export'} onOpenChange={(open) => { if (!open) setDialog(null) }}>
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
