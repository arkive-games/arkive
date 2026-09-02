import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, Edit3, Gem, PawPrint, Save, Shield, Sparkles, Swords, Upload, Zap } from 'lucide-react'
import { resourceUrl } from './lib/urls'
import { loadEquipmentWikiData, loadSoulWikiData, loadTalentWikiData, loadWikiData, type EquipmentRecord, type SoulRecord, type SkillIndexEntry } from './wikiData'
import { loadPetWikiData, type PetRecord } from './creatureData'
import { localizedText, type WikiCard } from './cardCatalog'
import content from './locales/zh-CN.json'

type BuildMode = 'view' | 'edit'
type BuildData = Awaited<ReturnType<typeof loadWikiData>> & {
  equipment: Awaited<ReturnType<typeof loadEquipmentWikiData>>
  souls: Awaited<ReturnType<typeof loadSoulWikiData>>
  pets: Awaited<ReturnType<typeof loadPetWikiData>>
  talents: Awaited<ReturnType<typeof loadTalentWikiData>>
}

interface BuildDraft {
  id: string
  title: string
  profession: string
  summary: string
  attributes: Record<string, number>
  skillIds: number[]
  equipmentIds: number[]
  cardIds: number[]
  petIds: number[]
  talentIds: number[]
  soulIds: number[]
}

const STORAGE_KEY = 'ro3-build-planner'
const ATTRIBUTE_KEYS = ['力量', '敏捷', '体质', '智力', '灵巧', '幸运']
const CLASS_OPTIONS = content.filters.classes.filter((item) => item.key).map((item) => item.label)
const EMPTY_BUILD: BuildDraft = {
  id: 'local-default', title: '未命名流派', profession: CLASS_OPTIONS[0] ?? '剑士', summary: '', attributes: Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, 1])), skillIds: [], equipmentIds: [], cardIds: [], petIds: [], talentIds: [], soulIds: [],
}

function readBuilds(): BuildDraft[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as BuildDraft[]
    return Array.isArray(parsed) && parsed.length ? parsed : [EMPTY_BUILD]
  } catch { return [EMPTY_BUILD] }
}

function displayName(value: { 'zh-CN'?: string } | undefined, fallback: string) { return value?.['zh-CN'] || fallback }
function uniqueByVisual(records: EquipmentRecord[]) {
  const seen = new Set<string>()
  return records.filter((record) => {
    if (!record.item || record.name?.['zh-CN'] === '待定' || record.item.kIcon === 'item_null.png') return false
    const key = `${record.name?.['zh-CN'] ?? record.iID}|${record.slot ?? ''}|${record.icon ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function BuildPlanner({ onUnavailable }: { onUnavailable: () => void }) {
  const [mode, setMode] = useState<BuildMode>('view')
  const [builds, setBuilds] = useState<BuildDraft[]>(() => readBuilds())
  const [selectedId, setSelectedId] = useState(() => readBuilds()[0]?.id ?? EMPTY_BUILD.id)
  const [draft, setDraft] = useState<BuildDraft>(() => readBuilds()[0] ?? EMPTY_BUILD)
  const [data, setData] = useState<BuildData | null>(null)
  const [dataError, setDataError] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([loadWikiData(), loadEquipmentWikiData(), loadSoulWikiData(), loadPetWikiData(), loadTalentWikiData()])
      .then(([wiki, equipment, souls, pets, talents]) => { if (active) { setData({ ...wiki, equipment, souls, pets, talents }); setDataError(false) } })
      .catch(() => { if (active) setDataError(true) })
    return () => { active = false }
  }, [])

  const equipment = useMemo(() => uniqueByVisual(data?.equipment.equipment.equipment ?? []), [data])
  const skills = data?.skills.skills ?? []
  const cards = data?.cards.cards ?? []
  const pets = data?.pets.catalog.pets.filter((pet) => pet.show) ?? []
  const talents = data?.talents.talents.seasonTalents.nodes.filter((node) => node.iType !== 0).slice(0, 80) ?? []
  const souls = data?.souls.souls.souls ?? []
  const selectedBuild = builds.find((build) => build.id === selectedId) ?? draft

  const updateDraft = (patch: Partial<BuildDraft>) => setDraft((current) => ({ ...current, ...patch }))
  const toggleId = (field: keyof Pick<BuildDraft, 'skillIds' | 'equipmentIds' | 'cardIds' | 'petIds' | 'talentIds' | 'soulIds'>, id: number, limit: number) => {
    const values = draft[field]
    updateDraft({ [field]: values.includes(id) ? values.filter((value) => value !== id) : values.length < limit ? [...values, id] : values } as Partial<BuildDraft>)
  }
  const saveDraft = () => {
    const next = builds.some((build) => build.id === draft.id) ? builds.map((build) => build.id === draft.id ? draft : build) : [...builds, draft]
    setBuilds(next); setSelectedId(draft.id); localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setMode('view')
  }
  const createBuild = () => { const next = { ...EMPTY_BUILD, id: `local-${Date.now()}`, title: '新建流派' }; setDraft(next); setSelectedId(next.id); setMode('edit') }

  return <section className="build-planner" aria-label="流派手册">
    <header className="build-planner-header"><div><span className="database-eyebrow"><Swords aria-hidden="true" />玩家流派手册</span><h2>职业 BD</h2><p>整理技能、属性、装备与养成配置，保存属于自己的职业方案。</p></div><div className="build-planner-actions"><div className="build-mode-tabs" role="tablist"><button type="button" className={mode === 'view' ? 'is-active' : undefined} onClick={() => setMode('view')}><BookOpen aria-hidden="true" />查看 BD</button><button type="button" className={mode === 'edit' ? 'is-active' : undefined} onClick={() => setMode('edit')}><Edit3 aria-hidden="true" />编辑 BD</button></div><button type="button" className="build-new-button" onClick={createBuild}><Sparkles aria-hidden="true" />新建</button></div></header>
    {dataError ? <div className="build-empty">{content.wiki.dataError}</div> : !data ? <div className="build-empty">{content.wiki.loading}</div> : mode === 'view' ? <BuildViewer build={selectedBuild} builds={builds} data={data} onSelect={(id) => { setSelectedId(id); setDraft(builds.find((build) => build.id === id) ?? EMPTY_BUILD) }} onEdit={() => setMode('edit')} onUnavailable={onUnavailable} /> : <BuildEditor draft={draft} data={{ skills, cards, equipment, pets, talents, souls }} updateDraft={updateDraft} toggleId={toggleId} onSave={saveDraft} onUnavailable={onUnavailable} />}
  </section>
}

function BuildViewer({ build, builds, data, onSelect, onEdit, onUnavailable }: { build: BuildDraft; builds: BuildDraft[]; data: BuildData; onSelect: (id: string) => void; onEdit: () => void; onUnavailable: () => void }) {
  const skillMap = new Map(data.skills.skills.map((skill) => [skill.iSkillID, skill]))
  const cardMap = new Map(data.cards.cards.map((card) => [card.id, card]))
  const equipment = uniqueByVisual(data.equipment.equipment.equipment)
  const equipmentMap = new Map(equipment.map((item) => [item.iID, item]))
  const petMap = new Map(data.pets.catalog.pets.map((pet) => [pet.id, pet]))
  const soulMap = new Map(data.souls.souls.souls.map((soul) => [soul.iID, soul]))
  return <div className="build-view-layout"><aside className="build-library"><div className="build-library-head"><strong>我的流派</strong><span>{builds.length}</span></div>{builds.map((item) => <button type="button" key={item.id} className={item.id === build.id ? 'is-active' : undefined} onClick={() => onSelect(item.id)}><span>{item.title}</span><small>{item.profession}</small></button>)}<button type="button" className="build-publish-button" onClick={onUnavailable} disabled><Upload aria-hidden="true" />发布流派<span>暂无功能</span></button></aside><div className="build-view-main"><div className="build-view-title"><div><span>{build.profession}</span><h3>{build.title}</h3><p>{build.summary || '作者尚未添加流派说明。'}</p></div><button type="button" onClick={onEdit}><Edit3 aria-hidden="true" />编辑方案</button></div><div className="build-stat-strip"><span><Swords aria-hidden="true" />{build.skillIds.length} 项技能</span><span><Shield aria-hidden="true" />{build.equipmentIds.length} 件装备</span><span><BookOpen aria-hidden="true" />{build.cardIds.length} 张卡片</span><span><PawPrint aria-hidden="true" />{build.petIds.length} 只宠物</span><span><Gem aria-hidden="true" />{build.soulIds.length} 件残响</span></div><BuildSection icon={Swords} title="技能选择"><div className="build-chip-grid">{build.skillIds.map((id) => { const skill = skillMap.get(id); return <BuildChip key={id} icon={skill?.icon} label={displayName(skill?.name, `技能 ${id}`)} meta={`技能 ${id}`} /> })}{build.skillIds.length === 0 ? <span className="build-section-empty">暂无技能配置</span> : null}</div></BuildSection><BuildSection icon={Zap} title="属性加点"><div className="build-attribute-grid">{Object.entries(build.attributes).map(([key, value]) => <div key={key}><span>{key}</span><strong>{value}</strong></div>)}</div></BuildSection><BuildSection icon={Shield} title="装备"><div className="build-chip-grid">{build.equipmentIds.map((id) => { const item = equipmentMap.get(id); return <BuildChip key={id} icon={item?.icon} label={displayName(item?.name, `装备 ${id}`)} meta={item?.slot ?? '装备'} /> })}{build.equipmentIds.length === 0 ? <span className="build-section-empty">暂无装备配置</span> : null}</div></BuildSection><BuildSection icon={BookOpen} title="卡片"><div className="build-chip-grid">{build.cardIds.map((id) => { const card = cardMap.get(id); return <BuildChip key={id} icon={card?.icon} label={localizedText(card?.name) || `卡片 ${id}`} meta={`品质 ${card?.quality ?? '-'}`} /> })}{build.cardIds.length === 0 ? <span className="build-section-empty">暂无卡片配置</span> : null}</div></BuildSection><BuildSection icon={PawPrint} title="宠物"><div className="build-chip-grid">{build.petIds.map((id) => { const pet = petMap.get(id); return <BuildChip key={id} icon={pet?.art.encyclopedia} label={localizedText(pet?.name) || `宠物 ${id}`} meta={`品质 ${pet?.quality ?? '-'}`} /> })}{build.petIds.length === 0 ? <span className="build-section-empty">暂无宠物配置</span> : null}</div></BuildSection><BuildSection icon={Sparkles} title="天赋"><div className="build-chip-grid">{build.talentIds.map((id) => <BuildChip key={id} label={`天赋节点 ${id}`} meta="季节天赋" />)}{build.talentIds.length === 0 ? <span className="build-section-empty">暂无天赋配置</span> : null}</div></BuildSection><BuildSection icon={Gem} title="灵魂残响"><div className="build-chip-grid">{build.soulIds.map((id) => { const soul = soulMap.get(id); return <BuildChip key={id} icon={soul?.icon} label={displayName(soul?.name, `残响 ${id}`)} meta={`品质 ${soul?.quality ?? '-'}`} /> })}{build.soulIds.length === 0 ? <span className="build-section-empty">暂无残响配置</span> : null}</div></BuildSection></div></div>
}

function BuildEditor({ draft, data, updateDraft, toggleId, onSave, onUnavailable }: { draft: BuildDraft; data: { skills: SkillIndexEntry[]; cards: WikiCard[]; equipment: EquipmentRecord[]; pets: PetRecord[]; talents: Array<{ iId: number; name?: { 'zh-CN'?: string } }>; souls: SoulRecord[] }; updateDraft: (patch: Partial<BuildDraft>) => void; toggleId: (field: keyof Pick<BuildDraft, 'skillIds' | 'equipmentIds' | 'cardIds' | 'petIds' | 'talentIds' | 'soulIds'>, id: number, limit: number) => void; onSave: () => void; onUnavailable: () => void }) {
  return <div className="build-editor"><div className="build-editor-form"><label>流派名称<input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="例如：敏捷暴击游侠" /></label><label>职业<select value={draft.profession} onChange={(event) => updateDraft({ profession: event.target.value })}>{CLASS_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label><label>流派说明<textarea value={draft.summary} onChange={(event) => updateDraft({ summary: event.target.value })} placeholder="描述玩法定位、适用场景和操作思路" rows={3} /></label></div><EditorSection icon={Zap} title="属性加点" hint="可分配的属性方案"><div className="editor-attribute-grid">{ATTRIBUTE_KEYS.map((key) => <label key={key}><span>{key}</span><input type="number" min={1} max={999} value={draft.attributes[key] ?? 1} onChange={(event) => updateDraft({ attributes: { ...draft.attributes, [key]: Math.max(1, Number(event.target.value) || 1) } })} /></label>)}</div></EditorSection><EditorPicker icon={Swords} title="技能选择" selected={draft.skillIds} limit={6} items={data.skills.slice(0, 120).map((skill) => ({ id: skill.iSkillID, name: displayName(skill.name, `技能 ${skill.iSkillID}`), icon: skill.icon }))} onToggle={(id) => toggleId('skillIds', id, 6)} /><EditorPicker icon={Shield} title="装备" selected={draft.equipmentIds} limit={8} items={data.equipment.slice(0, 180).map((item) => ({ id: item.iID, name: displayName(item.name, `装备 ${item.iID}`), icon: item.icon }))} onToggle={(id) => toggleId('equipmentIds', id, 8)} /><EditorPicker icon={BookOpen} title="卡片" selected={draft.cardIds} limit={12} items={data.cards.slice(0, 180).map((card) => ({ id: card.id, name: localizedText(card.name) || `卡片 ${card.id}`, icon: card.icon }))} onToggle={(id) => toggleId('cardIds', id, 12)} /><EditorPicker icon={PawPrint} title="宠物" selected={draft.petIds} limit={4} items={data.pets.slice(0, 100).map((pet) => ({ id: pet.id, name: localizedText(pet.name) || `宠物 ${pet.id}`, icon: pet.art.encyclopedia }))} onToggle={(id) => toggleId('petIds', id, 4)} /><EditorPicker icon={Sparkles} title="天赋" selected={draft.talentIds} limit={5} items={data.talents.map((talent) => ({ id: talent.iId, name: displayName(talent.name, `天赋节点 ${talent.iId}`) }))} onToggle={(id) => toggleId('talentIds', id, 5)} /><EditorPicker icon={Gem} title="灵魂残响" selected={draft.soulIds} limit={5} items={data.souls.slice(0, 40).map((soul) => ({ id: soul.iID, name: displayName(soul.name, `残响 ${soul.iID}`), icon: soul.icon }))} onToggle={(id) => toggleId('soulIds', id, 5)} /><div className="build-editor-footer"><button type="button" className="build-save-button" onClick={onSave}><Save aria-hidden="true" />保存到我的流派</button><button type="button" className="build-publish-button" onClick={onUnavailable} disabled><Upload aria-hidden="true" />发布流派<span>暂无功能</span></button></div></div>
}

function BuildSection({ icon: Icon, title, children }: { icon: typeof Swords; title: string; children: React.ReactNode }) { return <section className="build-section"><header><span><Icon aria-hidden="true" />{title}</span></header>{children}</section> }
function EditorSection({ icon: Icon, title, hint, children }: { icon: typeof Swords; title: string; hint: string; children: React.ReactNode }) { return <section className="build-editor-section"><header><span><Icon aria-hidden="true" />{title}</span><small>{hint}</small></header>{children}</section> }
function BuildChip({ icon, label, meta }: { icon?: string; label: string; meta: string }) { return <span className="build-chip">{icon ? <img src={resourceUrl(icon)} alt="" /> : <span className="build-chip-placeholder"><Sparkles aria-hidden="true" /></span>}<span><strong>{label}</strong><small>{meta}</small></span></span> }
function EditorPicker({ icon: Icon, title, selected, limit, items, onToggle }: { icon: typeof Swords; title: string; selected: number[]; limit: number; items: Array<{ id: number; name: string; icon?: string }>; onToggle: (id: number) => void }) { return <EditorSection icon={Icon} title={title} hint={`已选 ${selected.length} / ${limit}`}><div className="editor-picker-grid">{items.map((item) => <button type="button" key={item.id} className={selected.includes(item.id) ? 'is-selected' : undefined} onClick={() => onToggle(item.id)}><span className="editor-picker-art">{item.icon ? <img src={resourceUrl(item.icon)} alt="" loading="lazy" /> : <Sparkles aria-hidden="true" />}</span><span>{item.name}</span>{selected.includes(item.id) ? <Check aria-hidden="true" /> : null}</button>)}</div></EditorSection> }
