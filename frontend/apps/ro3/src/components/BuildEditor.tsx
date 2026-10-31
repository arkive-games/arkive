import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { BarChart3, ChevronDown, ChevronLeft, Flame, PawPrint, Shield, Star, Zap } from 'lucide-react'
import { cn } from '@gamemap/ui'
import content from '../locales/zh-CN.json'
import { localizedText } from '../cardCatalog'
import { BUILD_SLOTS, careerJobs, careerRoot, careerTalentEffects, equipmentAllowed, slotAllows, type BuildSlotKey } from '../lib/buildRules'
import { affixOptions, allowedEquipment, cardEffect, jobEmblem, rootBranches, rootEmblem, rootTint, ROOTS, ruleSet, skillPool, socketCount, soulSubOptions, talentChoices, talentInfo, type ManualData } from '../lib/buildView'
import type { PlannerBuild, PlannerEquipment } from '../lib/plannerModel'
import { qualityColor, qualityLabel } from '../lib/quality'
import { resourceUrl } from '../lib/urls'
import { Block, InfoHead, Picker, Stats, TileBlock, type TileSpec } from './BuildBlocks'

const m = content.builds.manual
const t = content.builds.editor
const EMPTY_SLOT = { id: 0, normal: [], special: [], cards: [] }

/** A dropdown that closes on an outside click or Escape. */
function Dropdown({ button, className, menuClass, children }: { button: (open: boolean, toggle: () => void) => ReactNode; className?: string; menuClass?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return <div ref={root} className={cn('bm-dd', className)}>
    {button(open, () => setOpen(v => !v))}
    {open ? <div className={cn('bm-ddmenu', menuClass)}>{children(() => setOpen(false))}</div> : null}
  </div>
}

export function BuildEditor({ draft, data, plans, dirty, error, onChange, onSave, onOpen, onBack, backLabel }: {
  draft: PlannerBuild
  data: ManualData | null
  plans: PlannerBuild[]
  dirty: boolean
  error: string
  onChange: (patch: Partial<PlannerBuild>) => void
  onSave: () => void
  onOpen: (build: PlannerBuild) => void
  onBack: () => void
  backLabel: string
}) {
  const rules = ruleSet(data, draft.rulesVariant)
  const root = careerRoot(draft.jobId)
  const job = rules?.jobs.find(j => j.id === draft.jobId)
  const branch = rules?.branches.find(b => b.id === draft.branchId)
  const lineage = careerJobs(rules, draft.jobId)
  const equipment = data?.equipment?.equipment.equipment ?? []
  const equipmentMap = new Map(equipment.map(e => [e.iID, e]))
  const skillMap = new Map(data?.profession?.skills.skills.map(s => [s.iSkillID, s]) ?? [])
  const cardMap = new Map(data?.cards?.cards.map(c => [c.id, c]) ?? [])
  const petMap = new Map(data?.pets?.catalog.pets.map(p => [p.id, p]) ?? [])
  const soulMap = new Map(data?.souls?.souls.souls.map(s => [s.iID, s]) ?? [])
  const pool = skillPool(data, rules, draft.jobId)
  const [cardPick, setCardPick] = useState<string | null>(null)
  const missing = !data?.rules || !data.profession || !data.equipment || !data.cards || !data.pets || !data.talents || !data.souls

  const slotConfig = (key: BuildSlotKey): PlannerEquipment => draft.equipment.find(e => e.slot === key) ?? { slot: key, ...EMPTY_SLOT }
  const setSlot = (key: BuildSlotKey, next: Partial<PlannerEquipment>) => onChange({ equipment: draft.equipment.map(e => e.slot === key ? { ...e, ...next } : e) })
  const twoHanded = equipmentMap.get(slotConfig('main').id)?.item?.iEquipPart === 1

  /** Switch job and branch; anything the new job cannot use moves to the recovery record. */
  const changeJob = (jobId: number, branchId: number) => {
    if (jobId === draft.jobId && branchId === draft.branchId) return
    if (!draft.jobId || !rules) { onChange({ jobId, branchId }); return }
    const nextLineage = careerJobs(rules, jobId)
    const recovery = [...draft.recovery]
    const nextEquipment = draft.equipment.map(c => {
      const record = equipmentMap.get(c.id)
      if (!c.id || record && nextLineage.some(j => equipmentAllowed(record, j) && slotAllows(record, c.slot, j))) return c
      recovery.push(c)
      return { ...c, ...EMPTY_SLOT }
    })
    const valid = skillPool(data, rules, jobId)
    const removedSkills = draft.skills.filter(id => id && !valid.has(id))
    if (removedSkills.length) recovery.push({ skills: removedSkills })
    const groups = new Set(careerTalentEffects(rules, jobId).map(e => e.group))
    const nodes = data?.talents?.talents.seasonTalents.nodes ?? []
    const talents = draft.talents.filter(id => groups.has(nodes.find(n => n.iId === id)?.iLevelGroupId ?? -1))
    const removedTalents = draft.talents.filter(id => !talents.includes(id))
    if (removedTalents.length) recovery.push({ talents: removedTalents })
    const souls = draft.souls.map(s => {
      if (!s.resonance || data?.souls?.souls.resonanceActivation.some(r => nextLineage.some(j => j.id === r.iJob) && r.iJobResonanceId === s.resonance)) return s
      recovery.push({ soul: s })
      return { ...s, resonance: undefined }
    })
    onChange({ jobId, branchId, equipment: nextEquipment, skills: draft.skills.map(id => valid.has(id) ? id : 0), talents, souls, recovery })
  }

  const chooseEquipment = (key: BuildSlotKey, id: number) => {
    const previous = slotConfig(key)
    const recovery = previous.id || previous.cards.some(Boolean) ? [...draft.recovery, previous] : [...draft.recovery]
    const next = draft.equipment.map(e => e.slot === key ? { ...e, id, normal: [], special: [], cards: [] } : e)
    if (key === 'main' && equipmentMap.get(id)?.item?.iEquipPart === 1) {
      const off = next.findIndex(e => e.slot === 'off')
      if (off >= 0 && next[off].id) { recovery.push({ ...next[off] }); next[off] = { ...next[off], ...EMPTY_SLOT } }
    }
    onChange({ equipment: next, recovery })
  }
  const setCard = (key: BuildSlotKey, index: number, id: number) => {
    const current = draft.cardSlots[key] ?? []
    const cards = Array.from({ length: Math.max(current.length, index + 1) }, (_, i) => current[i] ?? 0)
    cards[index] = id
    while (cards.length && !cards[cards.length - 1]) cards.pop()
    onChange({ cardSlots: { ...draft.cardSlots, [key]: cards } })
    setCardPick(null)
  }
  const setSkill = (index: number, id: number) => onChange({ skills: Array.from({ length: 6 }, (_, i) => i === index ? id : draft.skills[i] ?? 0) })
  const setPet = (field: 'combat' | 'assist', index: number, id: number) => {
    const next = [...draft[field]]
    while (next.length <= index) next.push(0)
    next[index] = id
    onChange({ [field]: next })
  }
  const setSoul = (index: number, soul: PlannerBuild['souls'][number]) => {
    const next = [...draft.souls]
    while (next.length <= index) next.push({ id: 0, sub: [], marks: [] })
    next[index] = soul
    onChange({ souls: next })
  }
  const toggle = (list: number[], id: number) => list.includes(id) ? list.filter(v => v !== id) : [...list, id]

  const roots = ROOTS.filter(r => rules?.jobs.some(j => j.id === r.id))
  const branches = rootBranches(rules, root)
  const total = draft.attributes.reduce((sum, v) => sum + v, 0)
  const tal = talentChoices(data, rules, draft.jobId)

  const skillTiles: TileSpec[] = Array.from({ length: 6 }, (_, i) => {
    const skill = skillMap.get(draft.skills[i] ?? 0)
    return { key: String(i), label: skill?.name?.['zh-CN'] || (draft.skills[i] ? t.unknown : m.skill), icon: skill?.icon, empty: !skill, disabled: !job }
  })
  const talentTiles: TileSpec[] = [
    ...draft.talents.map(id => { const info = talentInfo(data, rules, draft.jobId, id); return { key: String(id), label: info.label || t.unknown, icon: info.icon } }),
    { key: 'add', label: m.talent, empty: true, disabled: !job || !tal.length },
  ]
  const gearTiles: TileSpec[] = BUILD_SLOTS.map(slot => {
    const record = equipmentMap.get(slotConfig(slot.key).id)
    const sockets = socketCount(data, slot.key)
    const ids = draft.cardSlots[slot.key] ?? []
    return {
      key: slot.key,
      label: record?.name?.['zh-CN'] ?? t.slots[slot.label],
      icon: record?.icon,
      quality: record?.item?.iQuality,
      empty: !record,
      disabled: !job || slot.key === 'off' && twoHanded,
      extra: sockets ? <span className="bm-cards">{Array.from({ length: sockets }, (_, i) => {
        const card = cardMap.get(ids[i])
        return card ? <img key={i} src={resourceUrl(card.icon)} alt="" style={{ '--q': qualityColor(card.quality) } as CSSProperties} /> : <i key={i} />
      })}</span> : null,
    }
  })
  const soulTiles: TileSpec[] = Array.from({ length: 5 }, (_, i) => {
    const soul = soulMap.get(draft.souls[i]?.id ?? 0)
    return { key: String(i), label: soul?.name?.['zh-CN'] ?? m.soul, icon: soul?.icon, quality: soul?.quality, empty: !soul }
  })
  const petSlots = [...Array.from({ length: 4 }, (_, i) => ['combat', i] as const), ...Array.from({ length: 5 }, (_, i) => ['assist', i] as const)]
  const petTiles: TileSpec[] = petSlots.map(([field, i]) => {
    const pet = petMap.get(draft[field][i] ?? 0)
    return { key: `${field}-${i}`, label: pet ? localizedText(pet.name) || t.unknown : m.pet, icon: pet?.art.head, quality: pet?.quality, empty: !pet }
  })

  return <div style={{ '--tint': rootTint(draft.jobId) } as CSSProperties}>
    <nav className="bm-crumb">
      <button type="button" className="bm-back" aria-label={m.back} onClick={onBack}><ChevronLeft aria-hidden="true" /></button>
      <button type="button" onClick={onBack}>{backLabel}</button><span>/</span><b>{draft.title || t.unnamed}</b>
    </nav>
    <header className="bm-ehead">
      <div className="bm-erow">
        <label className="bm-name"><input value={draft.title} placeholder={m.namePlaceholder} aria-label={t.name} onChange={e => onChange({ title: e.target.value })} /></label>
        <Dropdown button={(open, toggleOpen) => <button type="button" className={cn('bm-ddbtn', !root && 'nb')} aria-expanded={open} disabled={!rules} onClick={toggleOpen}>
          {root ? <img src={rootEmblem(root)} alt="" /> : null}{rules?.jobs.find(j => j.id === root)?.name ?? m.pickJob}<ChevronDown aria-hidden="true" />
        </button>}>{close => roots.map(r => {
          const first = rootBranches(rules, r.id)[0]
          return <button key={r.id} type="button" className={cn(r.id === root && 'on')} disabled={!first} onClick={() => { if (first && r.id !== root) changeJob(first.job.id, first.branch.id); close() }}>
            <img src={rootEmblem(r.id)} alt="" />{rules?.jobs.find(j => j.id === r.id)?.name}
          </button>
        })}</Dropdown>
        <Dropdown menuClass="one" button={(open, toggleOpen) => <button type="button" className="bm-ddbtn nb" aria-expanded={open} disabled={!branches.length} onClick={toggleOpen}>
          <small>{m.branch}</small>{branch?.name ?? m.pickBranch}<ChevronDown aria-hidden="true" />
        </button>}>{close => branches.map(({ job: j, branch: b }) => <button key={`${j.id}-${b.id}`} type="button" className={cn(b.id === draft.branchId && j.id === draft.jobId && 'on')} onClick={() => { changeJob(j.id, b.id); close() }}>
          <img src={jobEmblem(j.id)} alt="" />{b.name}<small>{j.name}</small>
        </button>)}</Dropdown>
        <span className={cn('bm-status', !dirty && 'saved')}><i />{dirty ? m.unsaved : m.saved}</span>
        {plans.length ? <Dropdown className="bm-planpick" menuClass="one right" button={(open, toggleOpen) => <button type="button" className="bm-ddbtn nb" aria-expanded={open} onClick={toggleOpen}>
          {m.mine}<small>{m.plans.replace('{n}', String(plans.length))}</small><ChevronDown aria-hidden="true" />
        </button>}>{close => plans.map(p => <button key={p.id} type="button" className={cn(p.id === draft.id && 'on')} onClick={() => { onOpen(p); close() }}>
          <img src={jobEmblem(p.jobId)} alt="" />{p.title || t.unnamed}
        </button>)}</Dropdown> : null}
        <button type="button" className="bm-pill warm" onClick={onSave}>{t.save}</button>
      </div>
      <textarea className="bm-intro-ed" rows={2} value={draft.summary} placeholder={m.introPlaceholder} aria-label={m.introPlaceholder} onChange={e => onChange({ summary: e.target.value })} />
      {error ? <p className="bm-error" role="alert">{error}</p> : null}
      {missing ? <p className="bm-note">{m.loadError}</p> : null}
    </header>

    <div className="bm-blocks">
      <Block icon={<Zap />} title={t.skills} count={m.items.replace('{n}', String(draft.skills.filter(Boolean).length))}>
        <TileBlock tiles={skillTiles} renderInfo={(i, swapping, swap) => {
          const skill = skillMap.get(draft.skills[i] ?? 0)
          if (skill && !swapping) return <InfoHead name={skill.name?.['zh-CN'] || t.unknown} onSwap={swap} onRemove={() => setSkill(i, 0)} />
          const items = data?.profession?.skills.skills.filter(s => pool.has(s.iSkillID)).map(s => ({ id: s.iSkillID, label: s.name?.['zh-CN'] || t.unknown, icon: s.icon, disabled: draft.skills.some((id, k) => k !== i && id === s.iSkillID) })) ?? []
          return <Picker what={m.skill} items={items} onPick={id => setSkill(i, id)} />
        }} />
      </Block>
      <Block icon={<BarChart3 />} title={t.attributes} count={m.total.replace('{n}', String(total))}>
        <Stats values={draft.attributes} onChange={(i, v) => onChange({ attributes: draft.attributes.map((x, k) => k === i ? v : x) })} />
        <div className="bm-pts"><span>{m.total.replace('{n}', String(total))}</span><button type="button" className="bm-chip" onClick={() => onChange({ attributes: draft.attributes.map(() => 1) })}>{m.reset}</button></div>
      </Block>
      <Block wide icon={<Shield />} title={m.gear} count={m.gearCount}>
        <TileBlock tiles={gearTiles} renderInfo={(i, swapping, swap) => {
          const slot = BUILD_SLOTS[i]
          const config = slotConfig(slot.key)
          const record = equipmentMap.get(config.id)
          if (!record || swapping) {
            const items = allowedEquipment(equipment, lineage, slot.key).map(e => ({ id: e.iID, label: `${e.name?.['zh-CN'] ?? ''} T${e.iRank ?? '-'}`, icon: e.icon, quality: e.item?.iQuality }))
            return <Picker what={t.slots[slot.label]} items={items} onPick={id => chooseEquipment(slot.key, id)} />
          }
          const affixes = affixOptions(data, record)
          const ids = draft.cardSlots[slot.key] ?? []
          const sockets = Math.max(socketCount(data, slot.key), ids.length)
          const pickKey = cardPick?.startsWith(`${slot.key}:`) ? Number(cardPick.slice(slot.key.length + 1)) : -1
          return <>
            <InfoHead name={record.name?.['zh-CN'] ?? t.unknown} quality={record.item?.iQuality} tag={`${qualityLabel(record.item?.iQuality)}${record.iRank ? ` T${record.iRank}` : ''}`} onSwap={swap} onRemove={() => chooseEquipment(slot.key, 0)} />
            {(['normal', 'special'] as const).map(kind => affixes[kind].length ? <div key={kind} className="flex flex-col gap-1">
              <span className="bm-note">{t[kind]}</span>
              <div className="bm-chiprow">{affixes[kind].map(o => <button key={o.id} type="button" className={cn('bm-chip', config[kind].includes(o.id) && 'on')} aria-pressed={config[kind].includes(o.id)} onClick={() => setSlot(slot.key, { [kind]: toggle(config[kind], o.id) })}>{o.label}</button>)}</div>
            </div> : null)}
            {sockets ? <div className="bm-crds">{Array.from({ length: sockets }, (_, k) => {
              const card = cardMap.get(ids[k])
              return card
                ? <div key={k} className="bm-crd" style={{ '--q': qualityColor(card.quality) } as CSSProperties}><img src={resourceUrl(card.icon)} alt="" /><div><b>{localizedText(card.name) || t.unknown}</b><small>{cardEffect(data, card)}</small></div><button type="button" className="bm-x" aria-label={m.removeCard} onClick={() => setCard(slot.key, k, 0)}>×</button></div>
                : <button key={k} type="button" className={cn('bm-chip', pickKey === k && 'on')} style={{ alignSelf: 'flex-start' }} onClick={() => setCardPick(pickKey === k ? null : `${slot.key}:${k}`)}>{m.addCard}</button>
            })}</div> : null}
            {pickKey >= 0 ? <div className="bm-cardpick"><Picker what={m.card} items={(data?.cards?.cards ?? []).filter(c => c.part === slot.cardPart).map(c => ({ id: c.id, label: localizedText(c.name) || t.unknown, icon: c.icon, quality: c.quality }))} onPick={id => setCard(slot.key, pickKey, id)} /></div> : null}
          </>
        }} />
      </Block>
      <Block icon={<Star />} title={t.talents} count={m.items.replace('{n}', String(draft.talents.length))}>
        <TileBlock className="bm-tal" tiles={talentTiles} renderInfo={i => {
          const id = draft.talents[i]
          if (id !== undefined) return <InfoHead name={talentInfo(data, rules, draft.jobId, id).label || t.unknown} onRemove={() => onChange({ talents: draft.talents.filter(v => v !== id) })} />
          return <Picker talent what={m.talent} items={tal.filter(c => !draft.talents.includes(c.id)).map(c => ({ ...c, label: c.label || t.unknown }))} onPick={pick => onChange({ talents: [...draft.talents, pick] })} />
        }} />
      </Block>
      <Block icon={<Flame />} title={t.souls} count={m.soulCount}>
        <TileBlock tiles={soulTiles} renderInfo={(i, swapping, swap) => {
          const config = draft.souls[i]
          const soul = soulMap.get(config?.id ?? 0)
          if (!soul || !config || swapping) {
            const items = (data?.souls?.souls.souls ?? []).filter(s => s.name?.['zh-CN']).map(s => ({ id: s.iID, label: s.name?.['zh-CN'] ?? '', icon: s.icon, quality: s.quality }))
            return <Picker what={m.soul} items={items} onPick={id => setSoul(i, id === config?.id ? config : { id, sub: [], marks: [] })} />
          }
          const subs = soulSubOptions(data, soul)
          return <>
            <InfoHead name={soul.name?.['zh-CN'] ?? t.unknown} quality={soul.quality} tag={qualityLabel(soul.quality)} onSwap={swap} onRemove={() => setSoul(i, { id: 0, sub: [], marks: [] })} />
            {subs.length ? <div className="flex flex-col gap-1">
              <span className="bm-note">{t.sub}</span>
              <div className="bm-chiprow">{subs.map(o => <button key={o.id} type="button" className={cn('bm-chip', config.sub.includes(o.id) && 'on')} aria-pressed={config.sub.includes(o.id)} onClick={() => setSoul(i, { ...config, sub: toggle(config.sub, o.id) })}>{o.label}</button>)}</div>
            </div> : null}
          </>
        }} />
      </Block>
      <Block icon={<PawPrint />} title={t.pets} count={m.petCount}>
        <TileBlock tiles={petTiles} groups={[{ label: t.combat, from: 0, to: 4 }, { label: t.assist, from: 4, to: 9 }]} renderInfo={(i, swapping, swap) => {
          const [field, index] = petSlots[i]
          const pet = petMap.get(draft[field][index] ?? 0)
          if (pet && !swapping) return <InfoHead name={localizedText(pet.name) || t.unknown} quality={pet.quality} tag={qualityLabel(pet.quality)} onSwap={swap} onRemove={() => setPet(field, index, 0)} />
          const items = (data?.pets?.catalog.pets ?? []).filter(p => p.show).map(p => ({ id: p.id, label: localizedText(p.name) || t.unknown, icon: p.art.head, quality: p.quality, disabled: draft[field].some((id, k) => k !== index && id === p.id) }))
          return <Picker what={m.pet} items={items} onPick={id => setPet(field, index, id)} />
        }} />
      </Block>
    </div>
  </div>
}
