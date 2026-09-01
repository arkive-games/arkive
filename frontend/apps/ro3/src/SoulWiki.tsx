import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Gem, Search, X } from 'lucide-react'
import { resourceUrl } from './lib/urls'
import { loadSoulWikiData, type SoulRecord } from './wikiData'
import content from './locales/zh-CN.json'

type SoulData = Awaited<ReturnType<typeof loadSoulWikiData>>
const QUALITY_LABELS: Record<number, string> = { 1: '普通', 2: '优秀', 3: '精良', 4: '史诗', 5: '传说', 6: '神话' }
function text(value: { 'zh-CN'?: string } | undefined, fallback: string) { return value?.['zh-CN'] || fallback }
function qualityClass(quality?: number) { return `quality-${quality ?? 1}` }
function valueOf(attribute: { min?: number; max?: number; iMin?: number; iMax?: number }) { const min = attribute.min ?? attribute.iMin; const max = attribute.max ?? attribute.iMax; return min === undefined ? '—' : max !== undefined && max !== min ? `${min}–${max}` : String(min) }

export function SoulWiki() {
  const [data, setData] = useState<SoulData | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [quality, setQuality] = useState('')
  const [resonance, setResonance] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  useEffect(() => { let active = true; loadSoulWikiData().then((next) => { if (active) { setData(next); setError(false) } }).catch(() => { if (active) setError(true) }); return () => { active = false } }, [])
  const records = useMemo(() => {
    const source = data?.souls.souls ?? []
    const normalized = query.trim().toLowerCase()
    return source.filter((record) => (!quality || String(record.quality ?? '') === quality) && (!normalized || `${record.iID} ${text(record.name, '')}`.toLowerCase().includes(normalized)))
  }, [data, quality, query])
  const active = records.find((record) => record.iID === selectedId) ?? records[0] ?? null
  return <div className="ro3-shell ro3-database soul-wiki" role="tabpanel">
    <header className="database-header"><div><span className="database-eyebrow"><Gem aria-hidden="true" />灵魂残响资料库</span><h2>灵魂残响</h2><p>查看残响属性、阶段印记与灵魂共振，整理可用于职业配置的完整资料。</p></div><div className="database-stat"><strong>{data?.souls.counts.souls ?? '—'}</strong><span>件残响</span></div></header>
    <div className="database-toolbar"><label className="wiki-search"><Search aria-hidden="true" /><span className="sr-only">搜索灵魂残响</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索残响名称或编号" />{query ? <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X aria-hidden="true" /></button> : null}</label><label><span>品质</span><select value={quality} onChange={(event) => setQuality(event.target.value)}><option value="">全部品质</option>{Object.entries(QUALITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>共振</span><select value={resonance} onChange={(event) => setResonance(event.target.value)}><option value="">全部共振</option>{(data?.souls.resonance ?? []).map((row) => <option value={row.iID} key={row.iID}>{text(row.name, `共振 ${row.iID}`)}</option>)}</select></label></div>
    <div className="database-layout"><section className="database-grid" aria-label="灵魂残响列表">{error ? <div className="wiki-empty">{content.wiki.dataError}</div> : !data ? <div className="wiki-empty">{content.wiki.loading}</div> : records.length ? records.map((record) => <SoulTile key={record.iID} record={record} active={active?.iID === record.iID} onSelect={setSelectedId} />) : <div className="wiki-empty">没有匹配的灵魂残响。</div>}</section><SoulDetail record={active} data={data} resonanceFilter={resonance} /></div>
  </div>
}

function SoulTile({ record, active, onSelect }: { record: SoulRecord; active: boolean; onSelect: (id: number) => void }) { return <button type="button" className={`soul-tile ${qualityClass(record.quality)}${active ? ' is-active' : ''}`} onClick={() => onSelect(record.iID)}><span className="soul-tile-art">{record.icon ? <img src={resourceUrl(record.icon)} alt="" loading="lazy" /> : <Gem aria-hidden="true" />}</span><span className="soul-tile-name">{text(record.name, `残响 ${record.iID}`)}</span><span className="soul-tile-meta">{QUALITY_LABELS[record.quality ?? 1] ?? `品质 ${record.quality}`} · 战力 {record.seasonPower ?? 0}</span></button> }

function SoulDetail({ record, data, resonanceFilter }: { record: SoulRecord | null; data: SoulData | null; resonanceFilter: string }) {
  if (!record || !data) return <aside className="database-detail"><div className="database-detail-empty">选择一件残响查看详情</div></aside>
  const doc = data.souls
  const attrMap = new Map(doc.attributes.map((attr) => [attr.iID, text(attr.name, `属性 ${attr.iID}`)]))
  const marks = [...(record.initialMarks ?? []), ...(record.marks ?? [])]
  const resonanceRows = doc.resonanceActivation.filter((row) => !resonanceFilter || String(row.iJobResonanceId ?? row.iResonanceID ?? row.iId ?? row.iID) === resonanceFilter)
  return <aside className={`database-detail ${qualityClass(record.quality)}`}><div className="database-detail-heading"><span className="database-detail-icon">{record.icon ? <img src={resourceUrl(record.icon)} alt="" /> : <Gem aria-hidden="true" />}</span><div><span className="database-kicker">{QUALITY_LABELS[record.quality ?? 1] ?? '残响'} · 战力 {record.seasonPower ?? 0}</span><h3>{text(record.name, `残响 ${record.iID}`)}</h3><p>残响编号 {record.iID}</p></div></div><SoulSection title="主属性"><AttributeList attributes={record.primaryAttributes ?? []} attrMap={attrMap} /></SoulSection><SoulSection title="升级属性"><AttributeList attributes={record.primaryAttributeLevelUp ?? []} attrMap={attrMap} /></SoulSection>{marks.length ? <SoulSection title="阶段印记"><div className="soul-mark-list">{marks.map((mark, index) => { const effectIds = 'specialEffectIds' in mark ? mark.specialEffectIds ?? [] : []; const effect = doc.specialGroups.find((candidate) => effectIds.includes(candidate.iID)) ?? doc.markEffects.find((candidate) => candidate.iID === mark.markId || candidate.iMarkID === mark.markId); return <div key={`${mark.threshold}-${index}`}><strong>{mark.threshold ?? '—'} 层</strong><span>{effect ? text(effect.desc ?? effect.name, `印记 ${mark.markId ?? effect.iID}`) : mark.markId ? `印记 ${mark.markId}` : '暂无效果'}</span></div> })}</div></SoulSection> : null}<SoulSection title="副属性池"><div className="detail-chip-list">{(record.subAttributes ?? []).map((attribute, index) => <span key={`${attribute.attributeId ?? attribute.iSubAttriID}-${index}`}>{attrMap.get(attribute.attributeId ?? attribute.iSubAttriID ?? 0) ?? `属性 ${attribute.attributeId ?? attribute.iSubAttriID ?? '—'}`} <b>{valueOf(attribute)}</b></span>)}</div></SoulSection><SoulSection title="灵魂共振"><div className="detail-effect-list">{resonanceRows.length ? resonanceRows.slice(0, 8).map((row, index) => <div key={`${row.iId ?? row.iID}-${index}`}><strong>{row.iJobProfess ? `职业 ${row.iJobProfess}` : '阶段激活'}</strong><small>{row.iJobResonanceSkills?.length ? `技能 ${row.iJobResonanceSkills.join('、')}` : text(row.desc ?? row.name, `规则 ${row.iId ?? row.iID}`)}</small></div>) : <div><strong>共振规则</strong><small>暂无匹配的激活规则</small></div>}</div><div className="soul-resonance-strip">{doc.resonance.map((row, index) => <span key={`${row.iID}-${index}`}><img src={resourceUrl(row.icon ?? '')} alt="" />{text(row.name, `共振 ${row.iID}`)}</span>)}</div></SoulSection></aside>
}

function AttributeList({ attributes, attrMap }: { attributes: NonNullable<SoulRecord['primaryAttributes']>; attrMap: Map<number, string> }) { return <div className="detail-chip-list">{attributes.map((attribute, index) => { const id = attribute.attributeId ?? attribute.iAttributeID ?? attribute.iSubAttriID ?? 0; return <span key={`${id}-${index}`}>{attrMap.get(id) ?? attribute.name?.['zh-CN'] ?? `属性 ${id}`} <b>{valueOf(attribute)}</b></span> })}</div> }
function SoulSection({ title, children }: { title: string; children: ReactNode }) { return <section className="database-detail-section"><h4>{title}</h4>{children}</section> }
