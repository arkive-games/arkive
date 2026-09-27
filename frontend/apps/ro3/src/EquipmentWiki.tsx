import { useEffect, useMemo, useState } from 'react'
import { Shield } from 'lucide-react'
import { resourceUrl } from './lib/urls'
import { QUALITY_LABELS, qualityColor, qualityLabel } from './lib/quality'
import { SELECT_CLASS } from './lib/styles'
import { loadEquipmentWikiData, type EquipmentRecord } from './wikiData'
import {
  AttributeChips,
  CatalogLayout,
  DetailSection,
  EffectList,
  Notice,
  RecordHeader,
  RecordTile,
  SearchField,
} from './components/wiki'
import content from './locales/zh-CN.json'

type EquipmentData = Awaited<ReturnType<typeof loadEquipmentWikiData>>

const SLOT_LABELS: Record<string, string> = { weapon: '武器', offhand: '副手', armor: '铠甲', cloak: '披风', shoes: '鞋子', accessory: '饰品', headwear: '头饰' }

function text(value: { 'zh-CN'?: string } | undefined, fallback: string) { return value?.['zh-CN'] || fallback }
function rangeValue(row: number[]) { return row.length > 2 && row[1] !== row[2] ? `${row[1]}–${row[2]}` : String(row[1] ?? '-') }
function isPlaceholderEquipment(record: EquipmentRecord) {
  return record.icon === 'icons/equipment/item_null.webp' || record.item?.kIcon === 'item_null.png' || record.name?.['zh-CN'] === '待定'
}

interface EquipmentGroup {
  key: string
  records: EquipmentRecord[]
}

// One tile per item: the table repeats an item once for each quality it can
// drop in, and a grid of identical icons differing only by quality helps no one.
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
    result.push({ key, records: [...group].sort((a, b) => (a.item?.iQuality ?? 0) - (b.item?.iQuality ?? 0) || a.iID - b.iID) })
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
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)

  useEffect(() => {
    let active = true
    loadEquipmentWikiData().then((next) => { if (active) { setData(next); setError(false) } }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [])

  const records = useMemo(() => {
    const source = data?.equipment.equipment.filter((record) => record.item && record.name && !isPlaceholderEquipment(record)) ?? []
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
  const select = (id: number) => {
    setSelectedId(id)
    setMobileDetailOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">查阅装备基础属性与可用词条，为职业配置挑选合适的装备。</p>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchField className="md:flex-1" value={query} onChange={setQuery} label="搜索装备" placeholder="搜索装备名称或编号" />
        <div className="grid grid-cols-3 gap-2 md:flex">
          <select className={SELECT_CLASS} aria-label="部位" value={slot} onChange={(event) => setSlot(event.target.value)}>
            <option value="">全部部位</option>
            {Object.entries(SLOT_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          <select className={SELECT_CLASS} aria-label="品质" value={quality} onChange={(event) => setQuality(event.target.value)}>
            <option value="">全部品质</option>
            {Object.entries(QUALITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          <select className={SELECT_CLASS} aria-label="最低等级" value={level} onChange={(event) => setLevel(event.target.value)}>
            <option value="">等级不限</option>
            {[1, 20, 40, 60, 80].map((value) => <option value={value} key={value}>{value} 级以上</option>)}
          </select>
        </div>
      </div>

      <CatalogLayout
        detailLabel={active ? text(active.name, `装备 ${active.iID}`) : content.wiki.tabs.equipment}
        detail={(
          <>
            {active ? <select className={SELECT_CLASS} aria-label={content.wiki.variant} value={active.iID} onChange={(event) => setSelectedId(Number(event.target.value))}>
              {(groups.find((group) => group.records.some((record) => record.iID === active.iID))?.records ?? []).map((record) => (
                <option key={record.iID} value={record.iID}>{qualityLabel(record.item?.iQuality)} · {record.iID}</option>
              ))}
            </select> : null}
            <EquipmentDetail record={active} data={data} />
          </>
        )}
        open={mobileDetailOpen}
        onClose={() => setMobileDetailOpen(false)}
        list={(
          <>
            <p className="text-sm text-muted-foreground">共 {data ? groups.length : '—'} 个图鉴条目</p>
            {error ? <Notice>{content.wiki.dataError}</Notice> : !data ? <Notice>{content.wiki.loading}</Notice> : groups.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2.5" aria-label="装备列表">
                {groups.map((group) => (
                  <EquipmentTile key={group.key} records={group.records} active={group.records.some((record) => active?.iID === record.iID)} onSelect={select} />
                ))}
              </div>
            ) : <Notice>没有匹配的装备。</Notice>}
          </>
        )}
      />
    </div>
  )
}

function EquipmentTile({ records, active, onSelect }: { records: EquipmentRecord[]; active: boolean; onSelect: (id: number) => void }) {
  const record = records[records.length - 1]
  const quality = record.item?.iQuality
  const qualities = [...new Set(records.map((variant) => variant.item?.iQuality).filter((value): value is number => value !== undefined))]
  return (
    <RecordTile
      active={active}
      onClick={() => onSelect(record.iID)}
      accent={qualityColor(quality)}
      icon={record.icon ? <img src={resourceUrl(record.icon)} alt="" loading="lazy" className="size-full object-contain" /> : <Shield aria-hidden="true" className="size-6 text-muted-foreground" />}
      name={text(record.name, `装备 ${record.iID}`)}
      meta={(
        <>
          {SLOT_LABELS[record.slot ?? ''] ?? record.slot ?? '未知部位'} ·{' '}
          {qualities.length > 1 ? (
            <span className="inline-flex gap-0.5" aria-label={`包含 ${qualities.length} 种品质`}>
              {qualities.map((value) => <i key={value} className="size-2 rounded-full" style={{ background: qualityColor(value) }} />)}
            </span>
          ) : qualityLabel(quality)}
        </>
      )}
    />
  )
}

function EquipmentDetail({ record, data }: { record: EquipmentRecord | null; data: EquipmentData | null }) {
  if (!record || !data) return <Notice>选择一件装备查看详情</Notice>
  const item = record.item
  const attrMap = new Map((data.attrs.attributes.length ? data.attrs.attributes : data.equipment.attributes).map((attr) => [attr.iID, text(attr.name, attr.kVariable ?? `属性 ${attr.iID}`)]))
  const entryRows = data.attrs.entryGroups.filter((entry) => entry.iGroup === record.iEntries)
  const specialRows = (record.kSpecial ?? []).map(([id, weight]) => {
    const group = data.attrs.specialGroups.find((candidate) => candidate.iID === id)
    const effect = data.attrs.specialEffects.find((candidate) => candidate.iID === group?.iSpecialID || candidate.iID === id)
    return { id, weight, label: text(effect?.desc ?? group?.desc ?? effect?.name ?? group?.name, `特殊词条 ${id}`) }
  })
  return (
    <>
      <RecordHeader
        icon={record.icon ? resourceUrl(record.icon) : undefined}
        fallback={<Shield aria-hidden="true" className="size-6 text-muted-foreground" />}
        kicker={`${qualityLabel(item?.iQuality)} · ${SLOT_LABELS[record.slot ?? ''] ?? '未知部位'}`}
        kickerColor={qualityColor(item?.iQuality)}
        name={text(record.name, `装备 ${record.iID}`)}
        note={`装备编号 ${record.iID} · ${item?.iLevelNeed ?? 0} 级可用`}
      />
      <DetailSection title="基础属性">
        <AttributeChips values={(record.kBasicAttribute ?? []).map((row) => ({ key: row[0], label: attrMap.get(row[0]) ?? `属性 ${row[0]}`, value: rangeValue(row) }))} />
      </DetailSection>
      {record.kFixedEntries?.length ? (
        <DetailSection title="固定词条">
          <AttributeChips values={record.kFixedEntries.map(([id, grade]) => ({ key: `${id}-${grade}`, label: attrMap.get(id) ?? `属性 ${id}`, value: `等级 ${grade}` }))} />
        </DetailSection>
      ) : null}
      <DetailSection title="普通词条池">
        {entryRows.length ? (
          <AttributeChips values={entryRows.map((entry) => ({ key: entry.iID, label: attrMap.get(entry.iAttriID ?? 0) ?? `属性 ${entry.iAttriID ?? entry.iID}`, value: `${entry.iMin ?? 0}–${entry.iMax ?? 0}` }))} />
        ) : <p className="text-sm text-muted-foreground">暂无可解析词条</p>}
      </DetailSection>
      {specialRows.length || record.kFixedSpecialAttribute?.length ? (
        <DetailSection title="特殊效果">
          <EffectList rows={[
            ...specialRows.map((row) => ({ key: row.id, title: row.label, note: `权重 ${row.weight / 1000}` })),
            ...(record.kFixedSpecialAttribute ?? []).map((id) => ({ key: `fixed-${id}`, title: `特殊效果 ${id}`, note: '固定' })),
          ]} />
        </DetailSection>
      ) : null}
      {record.desc?.['zh-CN'] ? (
        <DetailSection title="装备说明"><p className="text-sm leading-relaxed text-muted-foreground">{record.desc['zh-CN']}</p></DetailSection>
      ) : null}
    </>
  )
}
