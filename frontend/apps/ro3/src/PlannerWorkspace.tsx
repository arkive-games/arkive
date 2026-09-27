import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { LockKeyhole } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTitle, Input } from '@gamemap/ui'
import { SearchField } from './components/wiki'
import content from './locales/zh-CN.json'
import { localizedText } from './cardCatalog'
import { loadPetWikiData } from './creatureData'
import { loadCardCatalogData, loadEquipmentWikiData, loadProfessionWikiData, loadSoulWikiData, loadTalentWikiData } from './wikiData'
import { BUILD_SLOTS, CAREER_ROOTS, careerRoot, careerJobs, careerTalentEffects, equipmentAllowed, loadBuildRules, slotAllows, type BuildRulesDocument, type BuildSlotKey } from './lib/buildRules'
import { emptyPlanner, migratePlanner, readPlannerStorage, savePlannerBuilds, type PlannerBuild } from './lib/plannerModel'
import { clampAttribute } from './lib/buildState'
import { applicableMarkStages, sumMarks } from './lib/soulMarks'
import { resourceUrl } from './lib/urls'
import { qualityColor, qualityLabel } from './lib/quality'
import './planner.css'

const t = content.builds.editor
const text = (v?: { 'zh-CN'?: string }) => v?.['zh-CN'] || t.unknown
interface PlannerData {
  rules?: BuildRulesDocument
  profession?: Awaited<ReturnType<typeof loadProfessionWikiData>>
  equipment?: Awaited<ReturnType<typeof loadEquipmentWikiData>>
  cards?: Awaited<ReturnType<typeof loadCardCatalogData>>
  pets?: Awaited<ReturnType<typeof loadPetWikiData>>
  talents?: Awaited<ReturnType<typeof loadTalentWikiData>>
  souls?: Awaited<ReturnType<typeof loadSoulWikiData>>
}
interface Choice { id: number; label: string; icon?: string; selected?: boolean; disabled?: boolean }
interface Picker { title: string; choices: Choice[]; choose: (id: number) => void; note?: string }

function AttributeInput({ value, disabled, onCommit }: { value: number; disabled: boolean; onCommit: (value: number) => void }) {
  const [pending, setPending] = useState<string | null>(null)
  return <Input type="number" min={1} max={999} disabled={disabled} value={pending ?? value}
    onChange={event => { const raw = event.target.value; setPending(raw); if (raw !== '') onCommit(clampAttribute(Number(raw))) }}
    onBlur={() => { if (pending !== null) onCommit(clampAttribute(Number(pending))); setPending(null) }} />
}

function Panel({ title, children, area, note }: { title: string; children: ReactNode; area: string; note?: ReactNode }) {
  return <section className={`planner-panel planner-area-${area}`}><header><h3>{title}</h3>{note}</header><div className="planner-panel-body">{children}</div></section>
}
function Slot({ label, icon, onClick, disabled, note, active = false, quality, locked }: { label: string; icon?: string; onClick: () => void; disabled?: boolean; note?: ReactNode; active?: boolean; quality?: number; locked?: string }) {
  return <button type="button" className={`planner-slot${active ? ' is-selected' : ''}`} onClick={onClick} disabled={disabled} style={quality ? { borderColor: qualityColor(quality) } : undefined}>
    <span className={`planner-art${locked ? ' is-locked' : ''}`} title={locked}>{icon ? <img src={resourceUrl(icon)} alt="" loading="lazy" /> : <span aria-hidden="true">＋</span>}{locked ? <span className="planner-lock"><LockKeyhole aria-hidden="true" /><span className="sr-only">{locked}</span></span> : null}</span><span>{label}</span>{note ? <small>{note}</small> : null}
  </button>
}

export function PlannerWorkspace({ onUnavailable: _onUnavailable }: { onUnavailable: () => void }) {
  void _onUnavailable
  const [data, setData] = useState<PlannerData | null>(null)
  const [retry, setRetry] = useState(0)
  const [builds, setBuilds] = useState<PlannerBuild[]>([])
  const [draft, setDraft] = useState<PlannerBuild>(() => emptyPlanner('local-default'))
  const [editing, setEditing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [savedNotice, setSavedNotice] = useState(false)
  useEffect(() => {
    if (!savedNotice) return
    const timer = window.setTimeout(() => setSavedNotice(false), 3000)
    return () => window.clearTimeout(timer)
  }, [savedNotice])
  const [picker, setPicker] = useState<Picker | null>(null)
  const [query, setQuery] = useState('')
  const [selectedSlot, setSelectedSlot] = useState<BuildSlotKey | null>(null)
  const [selectedSoul, setSelectedSoul] = useState<number | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ message: string; run: () => void } | null>(null)
  const [recoverOpen, setRecoverOpen] = useState(false)
  useEffect(() => {
    let active = true
    Promise.allSettled([loadBuildRules(), loadProfessionWikiData(), loadEquipmentWikiData(), loadCardCatalogData(), loadPetWikiData(), loadTalentWikiData(), loadSoulWikiData()]).then(results => {
      if (!active) return
      const value = <T,>(r: PromiseSettledResult<T>) => r.status === 'fulfilled' ? r.value : undefined
      const next: PlannerData = { rules: value(results[0]), profession: value(results[1]), equipment: value(results[2]), cards: value(results[3]), pets: value(results[4]), talents: value(results[5]), souls: value(results[6]) }
      setData(next)
      const stored = readPlannerStorage(window.localStorage)
      const usedIds = new Set<string>()
      const migrated = stored.records.map((v, index) => {
        const build = migratePlanner(v, next.equipment?.equipment.equipment ?? [], t.attributesList)
        const base = build.id
        let suffix = 0
        while (usedIds.has(build.id)) build.id = `${base}-recovered-${index}-${suffix++}`
        usedIds.add(build.id)
        return build
      })
      const initial = migrated[0] ?? emptyPlanner('local-default')
      if (stored.malformed) initial.recovery.push({ raw: stored.raw })
      setBuilds(migrated)
      setDraft(initial)
    })
    return () => { active = false }
  }, [retry])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const rules = draft.rulesVariant === 'shared' ? data?.rules?.shared : data?.rules?.variants[draft.rulesVariant]
  const job = rules?.jobs.find(j => j.id === draft.jobId)
  const branch = rules?.branches.find(b => b.id === draft.branchId && job?.branchIds.includes(b.id))
  const lineage = useMemo(() => careerJobs(rules, draft.jobId), [rules, draft.jobId])
  const canEdit = editing && Boolean(job && rules && data?.profession)
  const careerLabel = rules?.jobs.find(j => j.id === careerRoot(draft.jobId))?.name
  // Recovery is available on demand; opening a saved build never interrupts the user.
  const equipment = useMemo(() => data?.equipment?.equipment.equipment ?? [], [data])
  const equipmentMap = useMemo(() => new Map(equipment.map(e => [e.iID, e])), [equipment])
  const patch = (p: Partial<PlannerBuild>) => { setDraft(current => ({ ...current, ...p })); setDirty(true); setError('') }
  const slotConfig = (key: BuildSlotKey) => draft.equipment.find(e => e.slot === key)!
  const allowedEquipment = (key: BuildSlotKey) => job ? equipment.filter(e => lineage.some(j => equipmentAllowed(e, j) && slotAllows(e, key, j)) && e.name && e.item?.kIcon !== 'item_null.png') : []
  const main = equipmentMap.get(slotConfig('main').id)
  const offReason = main?.item?.iEquipPart === 1 ? t.lockedTwoHand : job && !allowedEquipment('off').length ? t.lockedJob : ''
  const skills = useMemo(() => {
    if (!data?.profession || !job || !rules) return []
    const pairs = lineage.flatMap(j => rules.branches.filter(b => j.branchIds.includes(b.id)).map(b => ({ rank: j.rank, branch: b })))
    const ids = new Set(data.profession.jobSkills.jobSkills.filter(r => pairs.some(p => p.branch.professionId === r.iProfessionID && p.rank === r.iJobRank)).flatMap(r => (r.kDescData ?? []).map(id => Math.trunc(id / 100))))
    pairs.forEach(p => p.branch.suggestedSkills.forEach(id => ids.add(Math.trunc(id / 100))))
    return data.profession.skills.skills.filter(s => ids.has(s.iSkillID))
  }, [data, job, rules, lineage])
  const skillMap = new Map(data?.profession?.skills.skills.map(s => [s.iSkillID, s]) ?? [])
  const cardMap = new Map(data?.cards?.cards.map(c => [c.id, c]) ?? [])
  const petMap = new Map(data?.pets?.catalog.pets.map(p => [p.id, p]) ?? [])
  const soulMap = new Map(data?.souls?.souls.souls.map(s => [s.iID, s]) ?? [])
  const stages = applicableMarkStages(rules?.markStages ?? [], draft.rulesVariant)
  const markIds = [...new Set(stages.map(s => s.markId))]
  const markTotals = sumMarks(draft.souls)
  const talentNodes = data?.talents?.talents.seasonTalents.nodes ?? []
  const talentLevels = data?.talents?.talents.seasonTalents.levels ?? []
  const jobTalentEffects = careerTalentEffects(rules, draft.jobId)
  const talentChoices = talentNodes.filter(n => jobTalentEffects.some(e => e.group === n.iLevelGroupId))
  const talentInfo = (id: number) => {
    const node = talentNodes.find(n => n.iId === id)
    const effect = jobTalentEffects.filter(e => e.group === node?.iLevelGroupId).sort((a, b) => a.level - b.level)[0]
    const level = talentLevels.find(l => l.iId === effect?.id)
    return { label: text(level?.name ?? node?.name), icon: level?.icon }
  }
  const openPicker = (p: Picker) => { setQuery(''); setPicker(p) }
  const ask = (message: string, run: () => void) => setConfirmAction({ message, run })
  const updateEquipment = (key: BuildSlotKey, p: Partial<PlannerBuild['equipment'][number]>) => patch({ equipment: draft.equipment.map(e => e.slot === key ? { ...e, ...p } : e) })
  const chooseEquipment = (key: BuildSlotKey) => openPicker({ title: t.replace, choices: allowedEquipment(key).map(e => ({ id: e.iID, label: `${text(e.name)} · ${qualityLabel(e.item?.iQuality)} · T${e.iRank ?? '—'}`, icon: e.icon })), choose: id => {
    const run = () => {
      const changed = { ...slotConfig(key), id, normal: [], special: [], cards: [] }
      const previous = slotConfig(key)
      const recovery = previous.id || previous.cards.some(Boolean) ? [...draft.recovery, previous] : [...draft.recovery]
      const next = draft.equipment.map(e => e.slot === key ? changed : { ...e })
      if (key === 'main' && equipmentMap.get(id)?.item?.iEquipPart === 1) {
        const off = next.find(e => e.slot === 'off')!
        if (off.id) { recovery.push({ ...off }); Object.assign(off, { id: 0, normal: [], special: [], cards: [] }) }
      }
      patch({ equipment: next, recovery }); setPicker(null)
    }
    ask(t.confirmEquipment, run)
  } })
  const chooseCard = (key: BuildSlotKey, index: number) => {
    const slot = BUILD_SLOTS.find(s => s.key === key)!
    openPicker({ title: t.cards, choices: [{ id: 0, label: t.clear }, ...(data?.cards?.cards.filter(c => c.part === slot.cardPart).map(c => ({ id: c.id, label: localizedText(c.name) || t.unknown, icon: c.icon })) ?? [])], choose: id => {
      const cards = Array.from({ length: Math.max(draft.cardSlots[key].length, index + 1) }, (_, i) => draft.cardSlots[key][i] ?? 0)
      cards[index] = id; patch({ cardSlots: { ...draft.cardSlots, [key]: cards } }); setPicker(null)
    } })
  }
  const chooseSkill = (index: number) => openPicker({ title: t.skills, note: t.skillNote, choices: [{ id: 0, label: t.clear }, ...skills.map(s => ({ id: s.iSkillID, label: text(s.name), icon: s.icon, disabled: draft.skills.some((id, i) => i !== index && id === s.iSkillID) }))], choose: id => { const next = Array.from({ length: 6 }, (_, i) => draft.skills[i] ?? 0); next[index] = id; patch({ skills: next }); setPicker(null) } })
  const choosePet = (field: 'combat' | 'assist', index: number) => openPicker({ title: t.pets, choices: [{ id: 0, label: t.clear }, ...(data?.pets?.catalog.pets.filter(p => p.show).map(p => ({ id: p.id, label: localizedText(p.name) || t.unknown, icon: p.art.head, disabled: draft[field].some((id, i) => id === p.id && i !== index) })) ?? [])], choose: id => { const next = [...draft[field]]; while (next.length <= index) next.push(0); next[index] = id; patch({ [field]: next }); setPicker(null) } })
  const chooseSoul = (index: number) => openPicker({ title: t.souls, choices: [{ id: 0, label: t.clear }, ...(data?.souls?.souls.souls.map(s => ({ id: s.iID, label: text(s.name), icon: s.icon })) ?? [])], choose: id => { const next = [...draft.souls]; while (next.length <= index) next.push({ id: 0, sub: [], marks: [] }); next[index] = { id, sub: [], marks: [] }; patch({ souls: next }); setPicker(null) } })
  const changeJob = (id: number, branchId?: number, variant = draft.rulesVariant) => {
    const nextRules = variant === 'shared' ? data?.rules?.shared : data?.rules?.variants[variant]
    const nextJob = nextRules?.jobs.find(j => j.id === id)
    const nextBranch = nextRules?.branches.find(b => b.id === (branchId ?? nextJob?.branchIds[0]))
    if (!nextJob || !nextBranch) return
    if (careerRoot(id) === careerRoot(draft.jobId)
      && [1210, 1310, 1410].includes(id) === [1210, 1310, 1410].includes(draft.jobId)
      && variant === draft.rulesVariant) return
    if (!draft.jobId) {
      patch({ jobId: id, branchId: nextBranch.id, rulesVariant: variant })
      return
    }
    const nextLineage = careerJobs(nextRules, id)
    const affected: string[] = []
    const prepare = () => {
      const recovery = [...draft.recovery]
      const nextEquipment = draft.equipment.map(c => { const e = equipmentMap.get(c.id); if (!c.id || e && nextLineage.some(j => equipmentAllowed(e, j) && slotAllows(e, c.slot, j))) return c; affected.push(`${t.equipment}: ${text(e?.name)}`); recovery.push(c); return { ...c, id: 0, normal: [], special: [], cards: [] } })
      const pairs = nextLineage.flatMap(j => nextRules!.branches.filter(b => j.branchIds.includes(b.id)).map(b => ({ rank: j.rank, branch: b })))
      const valid = new Set(data?.profession?.jobSkills.jobSkills.filter(r => pairs.some(p => p.branch.professionId === r.iProfessionID && p.rank === r.iJobRank)).flatMap(r => (r.kDescData ?? []).map(v => Math.trunc(v / 100))) ?? [])
      pairs.forEach(p => p.branch.suggestedSkills.forEach(v => valid.add(Math.trunc(v / 100))))
      const removed = draft.skills.filter(id => id && !valid.has(id)); if (removed.length) recovery.push({ skills: removed })
      removed.forEach(id => affected.push(`${t.skills}: ${text(skillMap.get(id)?.name)}`))
      const groups = new Set(careerTalentEffects(nextRules, id).map(e => e.group))
      const keptTalents = draft.talents.filter(id => groups.has(talentNodes.find(n => n.iId === id)?.iLevelGroupId ?? -1))
      const removedTalents = draft.talents.filter(id => !keptTalents.includes(id))
      if (removedTalents.length) { recovery.push({ talents: removedTalents }); removedTalents.forEach(id => affected.push(`${t.talents}: ${talentInfo(id).label}`)) }
      const nextSouls = draft.souls.map(s => {
        if (!s.resonance || data?.souls?.souls.resonanceActivation.some(r => nextLineage.some(j => j.id === r.iJob) && r.iJobResonanceId === s.resonance)) return s
        affected.push(t.resonance); recovery.push({ soul: s }); return { ...s, resonance: undefined }
      })
      return { jobId: id, branchId: nextBranch.id, rulesVariant: variant, equipment: nextEquipment, skills: draft.skills.map(id => valid.has(id) ? id : 0), talents: keptTalents, souls: nextSouls, recovery }
    }
    const next = prepare()
    if (affected.length) ask(`${t.confirmJob}\n${affected.join('\n')}`, () => patch(next))
    else patch(next)
  }
  const save = () => {
    const next = builds.some(b => b.id === draft.id) ? builds.map(b => b.id === draft.id ? draft : b) : [...builds, draft]
    if (!savePlannerBuilds(next, window.localStorage)) { setError(content.builds.saveError); return }
    setBuilds(next); setDirty(false); setEditing(false); setSavedNotice(true)
  }
  if (!data) return <p className="py-8 text-sm text-muted-foreground">{content.wiki.loading}</p>
  const selectedConfig = selectedSlot ? slotConfig(selectedSlot) : null
  const selectedItem = selectedConfig ? equipmentMap.get(selectedConfig.id) : undefined
  const selectedSoulConfig = selectedSoul === null ? null : draft.souls[selectedSoul]
  const selectedSoulItem = selectedSoulConfig ? soulMap.get(selectedSoulConfig.id) : undefined
  return <div className="ro3-planner">
    <div className="planner-toolbar"><select aria-label={t.name} value={draft.id} onChange={e => { const next = builds.find(b => b.id === e.target.value); if (!next) return; const run = () => { setDraft(next); setDirty(false) }; if (dirty) ask(t.confirmLeave, run); else run() }}><option value={draft.id}>{draft.title || t.unnamed}</option>{builds.filter(b => b.id !== draft.id).map(b => <option key={b.id} value={b.id}>{b.title || t.unnamed}</option>)}</select><span>{dirty ? t.dirty : savedNotice ? t.saved : ''}</span><Button variant="outline" onClick={() => { const run = () => { setDraft(emptyPlanner()); setEditing(true); setDirty(false) }; if (dirty) ask(t.confirmLeave, run); else run() }}>{t.new}</Button><Button variant="outline" onClick={() => setEditing(v => !v)}>{editing ? t.view : t.edit}</Button>{editing ? <Button disabled={!editing} onClick={save}>{t.save}</Button> : null}</div>
    <Dialog open={Boolean(error)} onOpenChange={v => { if (!v) setError('') }}><DialogContent aria-describedby={undefined}><DialogTitle>{error}</DialogTitle></DialogContent></Dialog>
    {!rules ? <div className="planner-notice"><Button variant="outline" onClick={() => { const run = () => { setDirty(false); setRetry(v => v + 1) }; if (dirty) ask(t.confirmLeave, run); else run() }}>{t.retry}</Button></div> : null}
    {draft.original !== undefined || draft.recovery.length > 0 ? <div><Button size="sm" variant="ghost" onClick={() => setRecoverOpen(true)}>{t.review}</Button></div> : null}
    <div className="planner-setup"><label>{t.job}<select aria-label={t.job} disabled={!editing || !rules} value={careerRoot(draft.jobId)} onChange={e => changeJob(Number(e.target.value))}><option value={0}>{t.jobRequired}</option>{CAREER_ROOTS.map(id => rules?.jobs.find(j => j.id === id)).filter((j): j is NonNullable<typeof j> => Boolean(j)).map(j => <option key={j.id} value={j.id}>{j.name || t.unknown}</option>)}</select></label>{careerRoot(draft.jobId) === 1100 ? <label>{t.branch}<select aria-label={t.branch} disabled={!editing} value={[1210,1310,1410].includes(draft.jobId) ? 1210 : 1200} onChange={e => changeJob(Number(e.target.value))}>{[1200,1210].map(id => <option key={id} value={id}>{rules?.jobs.find(j => j.id === id)?.name || t.unknown}</option>)}</select></label> : null}<label>{t.name}<Input value={draft.title} disabled={!editing} onChange={e => patch({ title: e.target.value })} /></label></div>
    <div className="planner-grid">
      <Panel title={t.skills} area="skills" note={<small>6</small>}><div className="planner-six">{Array.from({ length: 6 }, (_, i) => { const s = skillMap.get(draft.skills[i]); return <Slot key={i} label={s ? text(s.name) : draft.skills[i] ? t.unknown : t.choose} icon={s?.icon} disabled={!canEdit} onClick={() => chooseSkill(i)} /> })}</div></Panel>
      <Panel title={t.attributes} area="attributes" note={<small>≤ 999</small>}><div className="planner-attributes">{t.attributesList.map((label, i) => <label key={label}>{label}<AttributeInput key={`${draft.id}-${editing}`} disabled={!canEdit} value={draft.attributes[i]} onCommit={value => patch({ attributes: draft.attributes.map((v, index) => index === i ? value : v) })} /></label>)}</div></Panel>
      <Panel title={t.equipment} area="equipment"><div className="planner-seven">{BUILD_SLOTS.map(slot => { const c = slotConfig(slot.key), e = equipmentMap.get(c.id); const lock = slot.key === 'off' ? offReason : ''; return <Slot key={slot.key} locked={lock} label={lock ? t.slots[slot.label] : (e ? text(e.name) : c.id ? t.unknown : t.choose)} icon={e?.icon} quality={e?.item?.iQuality} active={selectedSlot === slot.key} note={<>{t.slots[slot.label]}{e?.iRank ? ` · T${e.iRank}` : ''}</>} onClick={() => setSelectedSlot(slot.key)} /> })}</div></Panel>
      <Panel title={t.talents} area="talents" note={<small>{careerLabel}</small>}><div className="planner-talents">{draft.talents.map(id => <Slot key={id} {...talentInfo(id)} disabled={!canEdit} onClick={() => patch({ talents: draft.talents.filter(v => v !== id) })} />)}{canEdit && data.talents ? <Button variant="outline" onClick={() => openPicker({ title: t.talents, note: t.talentNote, choices: talentChoices.map(n => ({ id: n.iId, ...talentInfo(n.iId), selected: draft.talents.includes(n.iId) })), choose: id => { patch({ talents: draft.talents.includes(id) ? draft.talents.filter(v => v !== id) : [...draft.talents, id] }); setPicker(null) } })}>{t.choose}</Button> : null}</div><p className="planner-note">{t.talentNote}</p></Panel>
      <Panel title={t.pets} area="pets">{(['combat', 'assist'] as const).map(field => <div className="planner-pet-row" key={field}><small>{t[field]}</small><div className="planner-five">{Array.from({ length: Math.max(field === 'combat' ? 4 : 5, draft[field].length) }, (_, i) => { const p = petMap.get(draft[field][i]); return <Slot key={i} label={p ? localizedText(p.name) || t.unknown : draft[field][i] ? t.unknown : t.choose} icon={p?.art.head} disabled={!canEdit || !data.pets} onClick={() => choosePet(field, i)} /> })}</div></div>)}</Panel>
      <Panel title={t.cards} area="cards"><div className="planner-card-groups">{BUILD_SLOTS.map(slot => { const cards = draft.cardSlots[slot.key]; const grid = data.equipment?.attrs.slots?.find(s => s.iID === slot.grid); const count = [1, 2, 3, 4].filter(i => grid?.[`kSocketOpen${i}`]).length; return <div key={slot.key} className={`planner-card-group${selectedSlot === slot.key ? ' is-selected' : ''}`}><button type="button" onClick={() => setSelectedSlot(slot.key)}>{t.slots[slot.label]}</button><div>{Array.from({ length: Math.max(count, cards.length) }, (_, i) => { const card = cardMap.get(cards[i]); const invalid = Boolean(cards[i] && (!card || card.part !== slot.cardPart || i >= count)); return <button key={i} type="button" aria-label={`${t.slots[slot.label]} ${t.cards} ${i + 1}`} title={invalid ? t.invalidCard : card ? localizedText(card.name) : t.choose} className={`planner-card${invalid ? ' is-invalid' : ''}`} disabled={!editing || !data.cards || !data.equipment || i >= count} onClick={() => chooseCard(slot.key, i)}>{card?.icon ? <img src={resourceUrl(card.icon)} alt={localizedText(card.name)} /> : '+'}</button> })}</div></div> })}</div></Panel>
      <Panel title={t.souls} area="souls"><div className="planner-five">{Array.from({ length: Math.max(5, draft.souls.length) }, (_, i) => { const s = soulMap.get(draft.souls[i]?.id); return <Slot key={i} label={s ? text(s.name) : draft.souls[i]?.id ? t.unknown : t.choose} icon={s?.icon} onClick={() => setSelectedSoul(i)} /> })}</div><p className="planner-note">{t.soulNote}</p></Panel>
    </div>
    <Dialog open={selectedSlot !== null} onOpenChange={v => { if (!v) setSelectedSlot(null) }}><DialogContent size="lg" className="max-h-[85dvh] overflow-y-auto" aria-describedby={undefined}><DialogTitle>{selectedSlot ? t.slots[BUILD_SLOTS.find(s => s.key === selectedSlot)!.label] : t.equipment}</DialogTitle>{selectedSlot && selectedConfig ? <div className="planner-detail"><p>{selectedItem ? text(selectedItem.name) : selectedConfig.id ? t.unknown : t.empty}</p>{selectedSlot === 'off' && offReason ? <p>{offReason}</p> : canEdit && data.equipment ? <Button onClick={() => chooseEquipment(selectedSlot)}>{t.replace}</Button> : null}{selectedItem ? <><p>{qualityLabel(selectedItem.item?.iQuality)} · T{selectedItem.iRank ?? '—'}</p>{canEdit ? <label>{t.quality}<select aria-label={t.quality} value={selectedItem.iID} onChange={e => { const id = Number(e.target.value); ask(t.confirmEquipment, () => patch({ equipment: draft.equipment.map(c => c.slot === selectedSlot ? { ...c, id, normal: [], special: [] } : c), recovery: [...draft.recovery, selectedConfig] })) }}>{allowedEquipment(selectedSlot).filter(e => e.name?.['zh-CN'] === selectedItem.name?.['zh-CN'] && e.iRank === selectedItem.iRank).map(e => <option key={e.iID} value={e.iID}>{qualityLabel(e.item?.iQuality)}</option>)}</select></label> : null}{(['normal', 'special'] as const).map(kind => { const options: Choice[] = kind === 'normal' ? (data.equipment?.attrs.entryGroups.filter(e => e.iGroup === selectedItem.iEntries).map(e => ({ id: e.iID, label: text(data.equipment?.attrs.attributes.find(a => a.iID === e.iAttriID)?.name) })) ?? []) : (data.equipment?.attrs.specialEffects.filter(e => { const groups = selectedItem.kSpecial?.map(v => v[0]) ?? []; return data.equipment?.attrs.specialGroups.some(g => groups.includes(g.iGroup ?? -1) && g.iSpecialID === e.iID) }).map(e => ({ id: e.iID, label: text(e.name ?? e.desc) })) ?? []); return <section key={kind}><h4>{t[kind]}</h4><div className="planner-chips">{selectedConfig[kind].map(id => <Button key={id} variant="outline" size="sm" disabled={!canEdit} onClick={() => updateEquipment(selectedSlot, { [kind]: selectedConfig[kind].filter(v => v !== id) })}>{options.find(v => v.id === id)?.label || t.unknown} ×</Button>)}{canEdit ? <Button size="sm" variant="outline" onClick={() => openPicker({ title: t[kind], note: t.affixNote, choices: options.map(o => ({ ...o, selected: selectedConfig[kind].includes(o.id) })), choose: id => { updateEquipment(selectedSlot, { [kind]: selectedConfig[kind].includes(id) ? selectedConfig[kind].filter(v => v !== id) : [...selectedConfig[kind], id] }); setPicker(null) } })}>{t.choose}</Button> : null}</div></section> })}<p className="planner-note">{t.affixNote}</p></> : null}</div> : null}</DialogContent></Dialog>
    <Dialog open={selectedSoul !== null} onOpenChange={v => { if (!v) setSelectedSoul(null) }}><DialogContent size="lg" className="max-h-[85dvh] overflow-y-auto" aria-describedby={undefined}><DialogTitle>{t.souls}</DialogTitle><p>{selectedSoulItem ? text(selectedSoulItem.name) : t.empty}</p>{canEdit && data.souls && selectedSoul !== null ? <Button onClick={() => chooseSoul(selectedSoul)}>{t.replace}</Button> : null}{selectedSoulItem && selectedSoulConfig && selectedSoul !== null ? <>{(['sub'] as const).map(kind => { const chosen = selectedSoulConfig.sub; const options: Choice[] = kind === 'sub' ? (selectedSoulItem.subAttributes ?? []).map(a => ({ id: a.iID ?? a.attributeId ?? 0, label: text(data.souls?.souls.attributes.find(v => v.iID === (a.attributeId ?? a.iSubAttriID))?.name) })) : [...new Set(selectedSoulItem.marks?.flatMap(m => m.specialEffectIds ?? []) ?? [])].map(id => ({ id, label: text(data.souls?.souls.markEffects.find(m => m.iID === id)?.desc) })); return <section key={kind}><h4>{t[kind]}</h4><div className="planner-chips">{chosen.map(id => <span key={id}>{options.find(o => o.id === id)?.label || t.unknown}</span>)}{canEdit ? <Button variant="outline" onClick={() => openPicker({ title: t[kind], choices: options.map(o => ({ ...o, selected: chosen.includes(o.id) })), choose: id => { patch({ souls: draft.souls.map((s, i) => i === selectedSoul ? { ...s, [kind]: chosen.includes(id) ? chosen.filter(v => v !== id) : [...chosen, id] } : s) }); setPicker(null) } })}>{t.choose}</Button> : null}</div></section> })}<section><h4>{t.marks}</h4><p className="planner-note">{t.markNote}</p>{selectedSoulConfig.marks.length ? <p className="planner-note">{t.markLegacy}</p> : null}{markIds.map((markId, markIndex) => <div key={markId} className="planner-mark"><label>{stages.find(s => s.markId === markId)?.icon ? <img src={resourceUrl(stages.find(s => s.markId === markId)!.icon!)} alt="" className="size-8" /> : null}{t.markNumber.replace('{number}', String(markIndex + 1))}<Input type="number" min={0} step={1} aria-label={`${t.markNumber.replace('{number}', String(markIndex + 1))} ${t.markCount}`} disabled={!canEdit} value={selectedSoulConfig.markCounts?.find(m => m.markId === markId)?.count ?? 0} onChange={e => { const count = Number(e.target.value); if (!Number.isSafeInteger(count) || count < 0) return; const counts = (selectedSoulConfig.markCounts ?? []).filter(m => m.markId !== markId); if (count) counts.push({ markId, count }); patch({ souls: draft.souls.map((s, i) => i === selectedSoul ? { ...s, markCounts: counts } : s) }) }} /></label><p>{t.markTotal}: {markTotals.get(markId) ?? 0}</p>{stages.filter(s => s.markId === markId).map(stage => <div key={`${stage.stage}-${stage.threshold}`}><strong>{t.stage} {stage.stage} · {t.threshold} {stage.threshold} · {(markTotals.get(markId) ?? 0) >= stage.threshold ? t.active : t.inactive}</strong>{stage.effects.map(id => <p key={id}>{text(data.souls?.souls.markEffects.find(e => e.iID === id)?.desc ?? data.souls?.souls.markEffects.find(e => e.iID === id)?.name)}</p>)}</div>)}</div>)}</section><label>{t.resonance}<select disabled={!canEdit} value={selectedSoulConfig.resonance ?? 0} onChange={e => patch({ souls: draft.souls.map((s, i) => i === selectedSoul ? { ...s, resonance: Number(e.target.value) || undefined } : s) })}><option value={0}>{t.none}</option>{data.souls?.souls.resonance.filter(r => data.souls?.souls.resonanceActivation.some(a => a.iJob === job?.id && a.iJobProfess === branch?.id && a.iJobResonanceId === (r.resonanceId ?? r.iID))).map(r => <option key={r.iID} value={r.resonanceId ?? r.iID}>{text(r.name)}</option>)}</select></label></> : null}</DialogContent></Dialog>
    <Dialog open={picker !== null} onOpenChange={v => { if (!v) setPicker(null) }}><DialogContent size="lg" className="max-h-[85dvh] overflow-y-auto" aria-describedby={undefined}><DialogTitle>{picker?.title}</DialogTitle>{picker?.note ? <p className="text-sm text-muted-foreground">{picker.note}</p> : null}<SearchField value={query} onChange={setQuery} label={content.builds.search} placeholder={content.builds.search} /><div className="planner-options">{picker?.choices.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase())).map((o, i) => <button key={`${o.id}-${i}`} type="button" aria-pressed={o.selected} disabled={o.disabled} onClick={() => picker.choose(o.id)}>{o.icon ? <img src={resourceUrl(o.icon)} alt="" loading="lazy" /> : null}<span>{o.label}</span></button>)}</div>{!picker?.choices.length ? <p>{t.noOptions}</p> : null}</DialogContent></Dialog>
    <Dialog open={confirmAction !== null} onOpenChange={v => { if (!v) setConfirmAction(null) }}><DialogContent aria-describedby={undefined}><DialogTitle>{confirmAction?.message}</DialogTitle><Button onClick={() => { confirmAction?.run(); setConfirmAction(null) }}>{t.choose}</Button></DialogContent></Dialog>
    <Dialog open={recoverOpen} onOpenChange={setRecoverOpen}><DialogContent aria-describedby={undefined}><DialogTitle>{t.review}</DialogTitle><p>{t.recover}</p><Button onClick={() => { const blob = new Blob([JSON.stringify({ original: draft.original, recovery: draft.recovery }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'ro3-build-recovery.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>{t.recoverDownload}</Button></DialogContent></Dialog>
  </div>
}
