import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Search, Shield, X } from 'lucide-react'
import { resourceUrl } from './lib/urls'
import { loadEquipmentWikiData, type EquipmentRecord } from './wikiData'
import content from './locales/zh-CN.json'

type EquipmentData = Awaited<ReturnType<typeof loadEquipmentWikiData>>

const QUALITY_LABELS: Record<number, string> = { 1: '普通', 2: '优秀', 3: '精良', 4: '史诗', 5: '传说', 6: '神话' }
const SLOT_LABELS: Record<string, string> = { weapon: '武器', offhand: '副手', armor: '铠甲', cloak: '披风', shoes: '鞋子', accessory: '饰品', headwear: '头饰' }

function text(value: { 'zh-CN'?: string } | undefined, fallback: string) { return value?.['zh-CN'] || fallback }
function qualityClass(quality?: number) { return `quality-${quality ?? 1}` }
function rangeValue(row: number[]) { return row.length > 2 && row[1] !== row[2] ? `${row[1]}–${row[2]}` : String(row[1] ?? '-') }

interface EquipmentGroup {
  key: string
  records: EquipmentRecord[]
}

function groupEquipment(records: EquipmentRecord[]): EquipmentGroup[] {
  const groups = new Map<string, EquipmentRecord[]>()
  for (const record of records) {
    const key = `${record.name?.['zh-CN'] ?? record.iID}|${record.slot ?? ''}|${record.icon ?? ''}`
    const group = groups.get(key) ?? []
    group.push(record)
    groups.set(key, group)
  }
  const result: EquipmentGroup[] = []
  for (const [key, group] of groups) {
    const qualityCounts = new Map<number, number>()
    for (const record of group) {
      const quality = record.item?.iQuality ?? 0
      qualityCounts.set(quality, (qualityCounts.get(quality) ?? 0) + 1)
    }
    if (Math.max(...qualityCounts.values()) <= 1) {
      result.push({ key, records: [...group].sort((a, b) => (a.item?.iQuality ?? 0) - (b.item?.iQuality ?? 0)) })
    } else {
      for (const record of group) result.push({ key: `${key}|${record.iID}`, records: [record] })
    }
  }
  return result
}

export function EquipmentWiki() {
  const [data, setData] = useState<EquipmentData | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [slot, setSlot] = useState('')
  const [quality, setQuality] = useState('')
  const [level, setLevel] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    loadEquipmentWikiData().then((next) => { if (active) { setData(next); setError(false) } }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [])

  const records = useMemo(() => {
    const source = data?.equipment.equipment.filter((record) => record.item && record.name) ?? []
    const normalized = query.trim().toLowerCase()
    return source.filter((record) => {
      const item = record.item!
      if (slot && record.slot !== slot) return false
      if (quality && String(item.iQuality ?? '') !== quality) return false
      if (level && (item.iLevelNeed ?? 0) < Number(level)) return false
      return !normalized || `${record.iID} ${text(record.name, '')}`.toLowerCase().includes(normalized)
    })
  }, [data, level, quality, query, slot])
  const groups = useMemo(() => groupEquipment(records), [records])

  const active = records.find((record) => record.iID === selectedId) ?? records[0] ?? null

  return (
    <div className="ro3-shell ro3-database equipment-wiki" role="tabpanel">
      <header className="database-header">
        <div><span className="database-eyebrow"><Shield aria-hidden="true" />装备资料库</span><h2>装备图鉴</h2><p>查阅装备基础属性与可用词条，为职业配置挑选合适的装备。</p></div>
        <div className="database-stat"><strong>{data?.equipment.counts.withItem ?? '—'}</strong><span>件装备</span></div>
      </header>
      <div className="database-toolbar">
        <label className="wiki-search"><Search aria-hidden="true" /><span className="sr-only">搜索装备</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索装备名称或编号" />{query ? <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}><X aria-hidden="true" /></button> : null}</label>
        <label><span>部位</span><select value={slot} onChange={(event) => setSlot(event.target.value)}><option value="">全部部位</option>{Object.entries(SLOT_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>品质</span><select value={quality} onChange={(event) => setQuality(event.target.value)}><option value="">全部品质</option>{Object.entries(QUALITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>最低等级</span><select value={level} onChange={(event) => setLevel(event.target.value)}><option value="">不限</option>{[1, 20, 40, 60, 80].map((value) => <option value={value} key={value}>{value}级</option>)}</select></label>
      </div>
      <div className="database-layout">
        <section className="database-grid" aria-label="装备列表">
          {error ? <div className="wiki-empty">{content.wiki.dataError}</div> : !data ? <div className="wiki-empty">{content.wiki.loading}</div> : groups.length ? groups.map((group) => <EquipmentTile key={group.key} records={group.records} active={group.records.some((record) => active?.iID === record.iID)} onSelect={setSelectedId} />) : <div className="wiki-empty">没有匹配的装备。</div>}
        </section>
        <EquipmentDetail record={active} data={data} />
      </div>
    </div>
  )
}

function EquipmentTile({ records, active, onSelect }: { records: EquipmentRecord[]; active: boolean; onSelect: (id: number) => void }) {
  const record = records[records.length - 1]
  const quality = record.item?.iQuality
  return <button type="button" className={`equipment-tile ${qualityClass(quality)}${active ? ' is-active' : ''}`} onClick={() => onSelect(record.iID)}>
    <span className="equipment-tile-art">{record.icon ? <img src={resourceUrl(record.icon)} alt="" loading="lazy" /> : <Shield aria-hidden="true" />}</span>
    <span className="equipment-tile-name">{text(record.name, `装备 ${record.iID}`)}</span>
    <span className="equipment-tile-meta">{SLOT_LABELS[record.slot ?? ''] ?? record.slot ?? '未知部位'} · {records.length > 1 ? <span className="equipment-quality-dots" aria-label={`包含 ${records.length} 种品质`}>{records.map((variant) => <i className={qualityClass(variant.item?.iQuality)} key={variant.iID} />)}</span> : QUALITY_LABELS[quality ?? 1] ?? `品质 ${quality}`}</span>
  </button>
}

function EquipmentDetail({ record, data }: { record: EquipmentRecord | null; data: EquipmentData | null }) {
  if (!record || !data) return <aside className="database-detail"><div className="database-detail-empty">选择一件装备查看详情</div></aside>
  const item = record.item
  const attrMap = new Map((data.attrs.attributes.length ? data.attrs.attributes : data.equipment.attributes).map((attr) => [attr.iID, text(attr.name, attr.kVariable ?? `属性 ${attr.iID}`)]))
  const entryRows = data.attrs.entryGroups.filter((entry) => entry.iGroup === record.iEntries)
  const specialRows = (record.kSpecial ?? []).map(([id, weight]) => {
    const group = data.attrs.specialGroups.find((candidate) => candidate.iID === id)
    const effect = data.attrs.specialEffects.find((candidate) => candidate.iID === group?.iSpecialID || candidate.iID === id)
    return { id, weight, label: text(effect?.desc ?? group?.desc ?? effect?.name ?? group?.name, `特殊词条 ${id}`) }
  })
  return <aside className={`database-detail ${qualityClass(item?.iQuality)}`}>
    <div className="database-detail-heading"><span className="database-detail-icon">{record.icon ? <img src={resourceUrl(record.icon)} alt="" /> : <Shield aria-hidden="true" />}</span><div><span className="database-kicker">{QUALITY_LABELS[item?.iQuality ?? 1] ?? '装备'} · {SLOT_LABELS[record.slot ?? ''] ?? '未知部位'}</span><h3>{text(record.name, `装备 ${record.iID}`)}</h3><p>装备编号 {record.iID} · {item?.iLevelNeed ?? 0}级可用</p></div></div>
    <DetailSection title="基础属性"><div className="detail-chip-list">{(record.kBasicAttribute ?? []).map((row) => <span key={row[0]}>{attrMap.get(row[0]) ?? `属性 ${row[0]}`} <b>{rangeValue(row)}</b></span>)}</div></DetailSection>
    {record.kFixedEntries?.length ? <DetailSection title="固定词条"><div className="detail-chip-list">{record.kFixedEntries.map(([id, grade]) => <span key={`${id}-${grade}`}>{attrMap.get(id) ?? `属性 ${id}`} <b>等级 {grade}</b></span>)}</div></DetailSection> : null}
    <DetailSection title="普通词条池"><div className="detail-chip-list">{entryRows.length ? entryRows.map((entry) => <span key={entry.iID}>{attrMap.get(entry.iAttriID ?? 0) ?? `属性 ${entry.iAttriID ?? entry.iID}`} <b>{entry.iMin ?? 0}–{entry.iMax ?? 0}</b></span>) : <span>暂无可解析词条</span>}</div></DetailSection>
    {specialRows.length || record.kFixedSpecialAttribute?.length ? <DetailSection title="特殊效果"><div className="detail-effect-list">{specialRows.map((row) => <div key={row.id}><strong>{row.label}</strong><small>权重 {row.weight / 1000}</small></div>)}{(record.kFixedSpecialAttribute ?? []).map((id) => <div key={id}><strong>特殊效果 {id}</strong><small>固定</small></div>)}</div></DetailSection> : null}
    {record.desc?.['zh-CN'] ? <DetailSection title="装备说明"><p className="detail-copy">{record.desc['zh-CN']}</p></DetailSection> : null}
  </aside>
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) { return <section className="database-detail-section"><h4>{title}</h4>{children}</section> }
