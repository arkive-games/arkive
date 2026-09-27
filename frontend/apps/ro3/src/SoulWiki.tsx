import { useEffect, useMemo, useState } from 'react'
import { Gem } from 'lucide-react'
import { resourceUrl } from './lib/urls'
import { QUALITY_LABELS, qualityColor, qualityLabel } from './lib/quality'
import { SELECT_CLASS } from './lib/styles'
import { loadSoulWikiData, type SoulRecord } from './wikiData'
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

type SoulData = Awaited<ReturnType<typeof loadSoulWikiData>>

function text(value: { 'zh-CN'?: string } | undefined, fallback: string) { return value?.['zh-CN'] || fallback }
function valueOf(attribute: { min?: number; max?: number; iMin?: number; iMax?: number }) {
  const min = attribute.min ?? attribute.iMin
  const max = attribute.max ?? attribute.iMax
  return min === undefined ? '—' : max !== undefined && max !== min ? `${min}–${max}` : String(min)
}

export function SoulWiki() {
  const [data, setData] = useState<SoulData | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [quality, setQuality] = useState('')
  const [resonance, setResonance] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)

  useEffect(() => {
    let active = true
    loadSoulWikiData().then((next) => { if (active) { setData(next); setError(false) } }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [])

  const records = useMemo(() => {
    const source = data?.souls.souls ?? []
    const normalized = query.trim().toLowerCase()
    return source.filter((record) => (!quality || String(record.quality ?? '') === quality) && (!normalized || `${record.iID} ${text(record.name, '')}`.toLowerCase().includes(normalized)))
  }, [data, quality, query])
  const active = records.find((record) => record.iID === selectedId) ?? records[0] ?? null
  const select = (id: number) => {
    setSelectedId(id)
    setMobileDetailOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">查看残响属性、阶段印记与灵魂共振，整理可用于职业配置的完整资料。</p>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <SearchField className="md:flex-1" value={query} onChange={setQuery} label="搜索灵魂残响" placeholder="搜索残响名称或编号" />
        <div className="grid grid-cols-2 gap-2 md:flex">
          <select className={SELECT_CLASS} aria-label="品质" value={quality} onChange={(event) => setQuality(event.target.value)}>
            <option value="">全部品质</option>
            {Object.entries(QUALITY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          <select className={SELECT_CLASS} aria-label="共振" value={resonance} onChange={(event) => setResonance(event.target.value)}>
            <option value="">全部共振</option>
            {(data?.souls.resonance ?? []).map((row) => <option value={row.iID} key={row.iID}>{text(row.name, `共振 ${row.iID}`)}</option>)}
          </select>
        </div>
      </div>

      <CatalogLayout
        detailLabel={active ? text(active.name, `残响 ${active.iID}`) : content.wiki.tabs.souls}
        detail={<SoulDetail record={active} data={data} resonanceFilter={resonance} />}
        open={mobileDetailOpen}
        onClose={() => setMobileDetailOpen(false)}
        list={(
          <>
            <p className="text-sm text-muted-foreground">共 {data ? records.length : '—'} 件残响</p>
            {error ? <Notice>{content.wiki.dataError}</Notice> : !data ? <Notice>{content.wiki.loading}</Notice> : records.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2.5" aria-label="灵魂残响列表">
                {records.map((record) => (
                  <RecordTile
                    key={record.iID}
                    active={active?.iID === record.iID}
                    onClick={() => select(record.iID)}
                    accent={qualityColor(record.quality)}
                    icon={record.icon ? <img src={resourceUrl(record.icon)} alt="" loading="lazy" className="size-full object-contain" /> : <Gem aria-hidden="true" className="size-6 text-muted-foreground" />}
                    name={text(record.name, `残响 ${record.iID}`)}
                    meta={`${qualityLabel(record.quality)} · 战力 ${record.seasonPower ?? 0}`}
                  />
                ))}
              </div>
            ) : <Notice>没有匹配的灵魂残响。</Notice>}
          </>
        )}
      />
    </div>
  )
}

function SoulDetail({ record, data, resonanceFilter }: { record: SoulRecord | null; data: SoulData | null; resonanceFilter: string }) {
  if (!record || !data) return <Notice>选择一件残响查看详情</Notice>
  const doc = data.souls
  const attrMap = new Map(doc.attributes.map((attr) => [attr.iID, text(attr.name, `属性 ${attr.iID}`)]))
  const marks = [...(record.initialMarks ?? []), ...(record.marks ?? [])]
  const resonanceRows = doc.resonanceActivation.filter((row) => !resonanceFilter || String(row.iJobResonanceId ?? row.iResonanceID ?? row.iId ?? row.iID) === resonanceFilter)
  return (
    <>
      <RecordHeader
        icon={record.icon ? resourceUrl(record.icon) : undefined}
        fallback={<Gem aria-hidden="true" className="size-6 text-muted-foreground" />}
        kicker={`${qualityLabel(record.quality)} · 战力 ${record.seasonPower ?? 0}`}
        kickerColor={qualityColor(record.quality)}
        name={text(record.name, `残响 ${record.iID}`)}
        note={`残响编号 ${record.iID}`}
      />
      <DetailSection title="主属性"><SoulAttributes attributes={record.primaryAttributes ?? []} attrMap={attrMap} /></DetailSection>
      <DetailSection title="升级属性"><SoulAttributes attributes={record.primaryAttributeLevelUp ?? []} attrMap={attrMap} /></DetailSection>
      {marks.length ? (
        <DetailSection title="阶段印记">
          <EffectList rows={marks.flatMap((mark, index) => {
            const effectIds = 'specialEffectIds' in mark ? mark.specialEffectIds ?? [] : []
            return (effectIds.length ? effectIds : [0]).map((id) => {
              const effect = doc.markEffects.find((candidate) => candidate.iID === id)
              return {
                key: `${index}-${id}`,
                title: <><b className="font-semibold text-[color:var(--arkive-nav-active)]">{mark.threshold ?? '—'} 层</b>{'　'}{effect ? text(effect.desc ?? effect.name, `印记 ${id}`) : id ? `印记 ${id}` : mark.markId ? `印记 ${mark.markId}` : '暂无效果'}</>,
              }
            })
          })} />
        </DetailSection>
      ) : null}
      <DetailSection title="副属性池">
        <AttributeChips values={(record.subAttributes ?? []).map((attribute, index) => ({
          key: `${attribute.attributeId ?? attribute.iSubAttriID}-${index}`,
          label: attrMap.get(attribute.attributeId ?? attribute.iSubAttriID ?? 0) ?? `属性 ${attribute.attributeId ?? attribute.iSubAttriID ?? '—'}`,
          value: valueOf(attribute),
        }))} />
      </DetailSection>
      <DetailSection title="灵魂共振">
        <EffectList rows={resonanceRows.length ? resonanceRows.map((row, index) => ({
          key: `${row.iId ?? row.iID}-${index}`,
          title: row.iJobProfess ? `职业 ${row.iJobProfess}` : '阶段激活',
          note: row.iJobResonanceSkills?.length ? `技能 ${row.iJobResonanceSkills.join('、')}` : text(row.desc ?? row.name, `规则 ${row.iId ?? row.iID}`),
        })) : [{ key: 'none', title: '共振规则', note: '暂无匹配的激活规则' }]} />
        <div className="flex flex-wrap gap-1.5">
          {doc.resonance.map((row, index) => (
            <span key={`${row.iID}-${index}`} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs">
              {row.icon ? <img src={resourceUrl(row.icon)} alt="" className="size-4 object-contain" /> : null}
              {text(row.name, `共振 ${row.iID}`)}
            </span>
          ))}
        </div>
      </DetailSection>
    </>
  )
}

function SoulAttributes({ attributes, attrMap }: { attributes: NonNullable<SoulRecord['primaryAttributes']>; attrMap: Map<number, string> }) {
  return (
    <AttributeChips values={attributes.map((attribute, index) => {
      const id = attribute.attributeId ?? attribute.iAttributeID ?? attribute.iSubAttriID ?? 0
      return { key: `${id}-${index}`, label: attrMap.get(id) ?? attribute.name?.['zh-CN'] ?? `属性 ${id}`, value: valueOf(attribute) }
    })} />
  )
}
