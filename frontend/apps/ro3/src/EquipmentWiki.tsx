import { Fragment, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { Notice } from './components/wiki'
import { HeaderAction } from './components/SectionNav'
import { Badge, Chip, DetailBlock, DetailPanel, Facet, FacetGroup, PillTab, PillTrack, SearchBox, SearchToggle, UnderlineTab, ValueList } from './components/Board'
import { useFit, usePointer, useWide } from './components/boardHooks'
import { loadEquipmentWikiData, type EquipmentAttributeRecord, type EquipmentRecord } from './wikiData'
import {
  attributeFormat,
  attributeValue,
  EQUIPMENT_SLOTS,
  filterEquipmentGroups,
  groupEquipment,
  SPECIAL_LEVEL,
  type EquipmentFilter,
  type EquipmentGroup,
} from './wikiBoards'
import { qualityColor, qualityLabel } from './lib/quality'
import { resourceUrl } from './lib/urls'
import content from './locales/zh-CN.json'

const text = content.wiki.equipment

type EquipmentData = Awaited<ReturnType<typeof loadEquipmentWikiData>>

const LEVELS = [1, 20, 30, 40, 50, 70, 90, SPECIAL_LEVEL]
const QUALITIES = [2, 3, 4, 5, 6]

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))

const slotIcon = (slot: string) => resourceUrl(`icons/other/icon_equip_${slot}_02.webp`)

export function EquipmentWiki() {
  const [data, setData] = useState<EquipmentData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [filter, setFilter] = useState<EquipmentFilter>({ slot: 'all', level: null, quality: null, query: '' })
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    let active = true
    loadEquipmentWikiData()
      .then((next) => { if (active) setData(next) })
      .catch(() => { if (active) setDataError(true) })
    return () => { active = false }
  }, [])

  const groups = useMemo(() => groupEquipment(data?.equipment.equipment ?? []), [data])
  const filtered = useMemo(() => filterEquipmentGroups(groups, filter), [groups, filter])
  const change = (next: Partial<EquipmentFilter>) => setFilter((previous) => ({ ...previous, ...next }))
  const slotCount = (slot: string) => groups.filter((group) => group.slot === slot).length

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <HeaderAction>
        <SearchToggle
          open={searchOpen}
          label={text.searchToggle}
          onToggle={() => {
            // A folded search box must not keep filtering out of sight.
            if (searchOpen) change({ query: '' })
            setSearchOpen(!searchOpen)
          }}
        />
      </HeaderAction>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <PillTrack label={text.slotLabel}>
          <PillTab selected={filter.slot === 'all'} onClick={() => change({ slot: 'all' })} count={data ? groups.length : undefined}>
            {text.all}
          </PillTab>
          {EQUIPMENT_SLOTS.map((slot) => (
            <PillTab key={slot} selected={filter.slot === slot} onClick={() => change({ slot })} count={data ? slotCount(slot) : undefined}>
              <img src={slotIcon(slot)} alt="" className="hidden size-5 object-contain md:block" />
              {text.slots[slot]}
            </PillTab>
          ))}
        </PillTrack>
        <SearchBox open={searchOpen} query={filter.query} onQuery={(query) => change({ query })} label={text.searchLabel} placeholder={text.searchPlaceholder} />
      </div>

      <section aria-label={text.title} className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border pr-2.5 md:px-1.5 md:pr-3.5">
          <div role="group" aria-label={text.levelLabel} className="flex min-w-0 overflow-x-auto [scrollbar-width:none]">
            <UnderlineTab selected={filter.level === null} onClick={() => change({ level: null })}>{text.levelAll}</UnderlineTab>
            {LEVELS.map((level) => (
              <UnderlineTab key={level} selected={filter.level === level} onClick={() => change({ level })}>
                {level === SPECIAL_LEVEL ? text.special : fill(text.level, { level })}
              </UnderlineTab>
            ))}
          </div>
          {data ? (
            <span aria-live="polite" className="ml-auto hidden shrink-0 text-xs tabular-nums text-muted-foreground md:block">
              {fill(text.resultCount, { count: filtered.length })}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-x-3 gap-y-1.5 overflow-x-auto border-b border-dashed border-border px-2.5 py-2 [scrollbar-width:none] md:flex-wrap md:overflow-visible md:px-3.5">
          <FacetGroup label={text.qualityLabel}>
            {QUALITIES.map((quality) => (
              <Facet key={quality} selected={filter.quality === quality} onClick={() => change({ quality: filter.quality === quality ? null : quality })}>
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: qualityColor(quality) }} />
                {qualityLabel(quality)}
              </Facet>
            ))}
          </FacetGroup>
          {filter.quality !== null ? (
            <button
              type="button"
              onClick={() => change({ quality: null })}
              className="flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-[color:var(--arkive-nav-active)] transition-colors hover:bg-[color:var(--arkive-filter-active)] md:h-8"
            >
              <X aria-hidden="true" className="size-3.5" />
              {text.clear}
            </button>
          ) : null}
        </div>

        {dataError ? <div className="p-3"><Notice>{content.wiki.dataError}</Notice></div> : !data ? <div className="p-3"><Notice>{content.wiki.loading}</Notice></div> : (
          <EquipmentBoard groups={filtered} data={data} quality={filter.quality} />
        )}
      </section>
    </div>
  )
}

function EquipmentBoard({ groups, data, quality }: { groups: EquipmentGroup[]; data: EquipmentData; quality: number | null }) {
  const wide = useWide()
  const [selected, setSelected] = useState<string>()
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [gridRef, fit] = useFit(wide ? 6.75 : 5.25)
  const columns = Math.max(3, Math.min(fit || 6, 10))
  const selectedIndex = groups.findIndex((group) => group.key === selected)
  const activeIndex = selectedIndex >= 0 ? selectedIndex : wide && groups.length > 0 ? 0 : -1
  const active = activeIndex >= 0 ? groups[activeIndex] : undefined
  const { panelRef, areaRef, pointerRef } = usePointer(`${active?.key}-${wide}-${columns}`)
  const rowEnd = Math.min(groups.length - 1, (Math.floor(activeIndex / columns) + 1) * columns - 1)
  const attributes = useMemo(() => {
    const names = new Map<number, EquipmentAttributeRecord>(data.equipment.attributes.map((attribute) => [attribute.iID, attribute]))
    for (const attribute of data.attrs.attributes) names.set(attribute.iID, { ...names.get(attribute.iID), ...attribute })
    return names
  }, [data])

  useEffect(() => {
    if (wide || selected === undefined) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(undefined) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [wide, selected])

  if (groups.length === 0) return <div className="p-3"><Notice>{text.empty}</Notice></div>

  const select = (group: EquipmentGroup) => setSelected(!wide && group.key === active?.key ? undefined : group.key)
  // The quality being filtered on, else the one a player last picked, else the best.
  const qualityOf = (group: EquipmentGroup) =>
    picked[group.key] ?? (quality !== null && group.qualities.includes(quality) ? quality : group.qualities[group.qualities.length - 1])

  const panel = active ? (
    <DetailPanel panelRef={panelRef} pointerRef={pointerRef}>
      <EquipmentDetail
        group={active}
        data={data}
        attributes={attributes}
        quality={qualityOf(active)}
        onQuality={(next) => setPicked((previous) => ({ ...previous, [active.key]: next }))}
      />
    </DetailPanel>
  ) : null

  return (
    <div className="grid gap-2.5 p-2.5 md:p-3.5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-4">
      <div ref={areaRef} className="min-w-0">
        <div ref={gridRef} className="grid gap-1.5 md:gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {groups.map((group, index) => (
            <Fragment key={group.key}>
              <EquipmentTile group={group} selected={group.key === active?.key} onSelect={() => select(group)} />
              {!wide && index === rowEnd ? <div className="col-span-full pb-1 pt-2">{panel}</div> : null}
            </Fragment>
          ))}
        </div>
      </div>
      {wide ? <div className="sticky top-4 min-w-0">{panel}</div> : null}
    </div>
  )
}

function EquipmentTile({ group, selected, onSelect }: { group: EquipmentGroup; selected: boolean; onSelect: () => void }) {
  const best = group.qualities[group.qualities.length - 1]
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'group flex flex-col items-center gap-1 rounded-lg p-1.5 text-center transition-colors',
        selected ? 'bg-[color:var(--arkive-filter-active)] ring-2 ring-[color:var(--arkive-nav-active)]' : 'hover:bg-muted',
      )}
    >
      <span className="relative block aspect-square w-full max-w-20 overflow-hidden rounded-xl bg-muted transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:-translate-y-0.5">
        <img src={resourceUrl(group.icon)} alt="" loading="lazy" className="size-full object-contain p-1" />
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1" style={{ backgroundColor: qualityColor(best) }} />
      </span>
      <span className="w-full truncate text-xs font-semibold md:text-sm">{group.name}</span>
      <span aria-hidden="true" className="-mt-0.5 flex gap-0.5">
        {group.qualities.map((quality) => <span key={quality} className="size-1.5 rounded-full" style={{ backgroundColor: qualityColor(quality) }} />)}
      </span>
    </button>
  )
}

function EquipmentDetail({ group, data, attributes, quality, onQuality }: {
  group: EquipmentGroup
  data: EquipmentData
  attributes: Map<number, EquipmentAttributeRecord>
  quality: number
  onQuality: (quality: number) => void
}) {
  const row: EquipmentRecord = group.variants.find((variant) => (variant.item?.iQuality ?? 1) === quality) ?? group.variants[group.variants.length - 1]
  const shown = row.item?.iQuality ?? 1
  const format = (id: number) => {
    const known = attributes.get(id)
    return known ? attributeFormat(known) : { label: fill(text.attributeId, { id }), percent: false }
  }
  const range = (id: number, min?: number, max?: number) => {
    const { percent } = format(id)
    if (min === undefined) return '-'
    return max !== undefined && max !== min ? `${attributeValue(min, percent)}–${attributeValue(max, percent)}` : attributeValue(min, percent)
  }
  const basic: Array<[string, string]> = (row.kBasicAttribute ?? []).map(([id, min, max]) => [format(id).label, range(id, min, max)])
  const pool = row.iEntries ? data.attrs.entryGroups.filter((entry) => entry.iGroup === row.iEntries && entry.iAttriID !== undefined) : []
  const description = row.desc?.['zh-CN']

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <img src={resourceUrl(group.icon)} alt="" className="size-12 shrink-0 rounded-xl bg-card object-contain p-1 shadow-[0_0_0_1px_var(--border)]" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h3 className="text-base font-bold leading-tight md:text-lg" style={{ color: qualityColor(shown) }}>{group.name}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Badge>{text.slots[group.slot]}</Badge>
            <Badge>{group.level === SPECIAL_LEVEL ? text.special : fill(text.usable, { level: group.level })}</Badge>
          </div>
        </div>
      </div>

      {group.qualities.length > 1 ? (
        <div role="group" aria-label={text.qualityPicker} className="flex flex-wrap gap-1">
          {group.qualities.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={value === shown}
              onClick={() => onQuality(value)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors',
                value === shown ? 'bg-foreground text-background' : 'bg-card text-foreground/75 shadow-[0_0_0_1px_var(--border)] hover:text-foreground',
              )}
            >
              <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: qualityColor(value) }} />
              {qualityLabel(value)}
            </button>
          ))}
        </div>
      ) : null}

      {basic.length > 0 ? <ValueList label={text.basic} rows={basic} /> : null}

      {row.kFixedEntries?.length ? (
        <DetailBlock label={text.fixed}>
          <div className="flex flex-wrap gap-1">
            {row.kFixedEntries.map(([id, level]) => <Chip key={`${id}-${level}`} value={fill(text.fixedLevel, { level })}>{format(id).label}</Chip>)}
          </div>
        </DetailBlock>
      ) : null}

      {pool.length > 0 ? (
        <DetailBlock label={text.randomPool} note={fill(text.poolCount, { count: pool.length })}>
          <div className="flex flex-wrap gap-1">
            {pool.map((entry) => <Chip key={entry.iID} value={range(entry.iAttriID!, entry.iMin, entry.iMax)}>{format(entry.iAttriID!).label}</Chip>)}
          </div>
        </DetailBlock>
      ) : null}

      {description ? (
        <DetailBlock label={text.description}>
          <p className="text-sm leading-relaxed text-foreground/75">{description}</p>
        </DetailBlock>
      ) : null}
    </div>
  )
}
