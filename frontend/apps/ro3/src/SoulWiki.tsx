import { Fragment, useEffect, useMemo, useState } from 'react'
import { cn } from '@gamemap/ui'
import { Notice } from './components/wiki'
import { HeaderAction } from './components/SectionNav'
import { LevelStepper } from './components/LevelStepper'
import { Badge, Chip, DetailBlock, DetailPanel, PillTab, PillTrack, SearchBox, SearchToggle, UnderlineTab } from './components/Board'
import { useFit, usePointer, useWide } from './components/boardHooks'
import { loadSoulWikiData, type EquipmentAttributeRecord, type SoulRecord } from './wikiData'
import { attributeFormat, attributeValue, DEFAULT_SOUL_CAP, PLACEHOLDER_NAME, soulLevelCaps, soulPrimaryAt, soulSubPool } from './wikiBoards'
import { qualityColor, qualityLabel } from './lib/quality'
import { resourceUrl } from './lib/urls'
import content from './locales/zh-CN.json'

const text = content.wiki.souls

type SoulData = Awaited<ReturnType<typeof loadSoulWikiData>>
type SoulView = 'souls' | 'resonance'

const QUALITIES = [3, 4, 5]

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))

export function SoulWiki() {
  const [data, setData] = useState<SoulData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [quality, setQuality] = useState<number | null>(null)
  const [view, setView] = useState<SoulView>('souls')
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    let active = true
    loadSoulWikiData()
      .then((next) => { if (active) setData(next) })
      .catch(() => { if (active) setDataError(true) })
    return () => { active = false }
  }, [])

  const souls = useMemo(() => (data?.souls.souls ?? []).filter((soul) => soul.name?.['zh-CN'] && soul.icon), [data])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return souls.filter((soul) => (quality === null || soul.quality === quality) && (!needle || (soul.name?.['zh-CN'] ?? '').toLowerCase().includes(needle)))
  }, [souls, quality, query])
  const resonance = useMemo(() => (data?.souls.resonance ?? []).filter((row) => row.name?.['zh-CN']), [data])

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <HeaderAction>
        <SearchToggle
          open={searchOpen}
          label={text.searchToggle}
          onToggle={() => {
            // A folded search box must not keep filtering out of sight.
            if (searchOpen) setQuery('')
            setSearchOpen(!searchOpen)
          }}
        />
      </HeaderAction>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <PillTrack label={text.qualityTabsLabel}>
          <PillTab selected={quality === null} onClick={() => setQuality(null)} count={data ? souls.length : undefined}>{text.all}</PillTab>
          {QUALITIES.map((value) => (
            <PillTab key={value} selected={quality === value} onClick={() => setQuality(value)} count={data ? souls.filter((soul) => soul.quality === value).length : undefined}>
              <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: qualityColor(value) }} />
              {qualityLabel(value)}
            </PillTab>
          ))}
        </PillTrack>
        <SearchBox open={searchOpen} query={query} onQuery={setQuery} label={text.searchLabel} placeholder={text.searchPlaceholder} />
      </div>

      <section aria-label={text.title} className="rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border pr-2.5 md:px-1.5 md:pr-3.5">
          <div role="group" aria-label={text.viewLabel} className="flex min-w-0 overflow-x-auto [scrollbar-width:none]">
            {(['souls', 'resonance'] as const).map((value) => (
              <UnderlineTab key={value} selected={view === value} onClick={() => setView(value)}>{text.views[value]}</UnderlineTab>
            ))}
          </div>
          {data ? (
            <span aria-live="polite" className="ml-auto hidden shrink-0 text-xs tabular-nums text-muted-foreground md:block">
              {fill(text.resultCount, { count: view === 'souls' ? filtered.length : resonance.length })}
            </span>
          ) : null}
        </div>

        {dataError ? <div className="p-3"><Notice>{content.wiki.dataError}</Notice></div> : !data ? <div className="p-3"><Notice>{content.wiki.loading}</Notice></div> : view === 'souls' ? (
          <SoulBoard souls={filtered} data={data} />
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2 p-2.5 md:p-3.5">
            {resonance.map((row) => (
              <li key={row.iID} className="flex items-center gap-2.5 rounded-lg bg-muted/60 p-2">
                {row.icon ? <img src={resourceUrl(row.icon)} alt="" loading="lazy" className="size-11 shrink-0 object-contain" /> : null}
                <span className="flex min-w-0 flex-col">
                  <b className="truncate text-sm font-bold">{row.name?.['zh-CN']}</b>
                  {row.power != null ? (
                    <span className="text-xs tabular-nums text-muted-foreground">{fill(text.resonancePower, { value: row.power.toLocaleString('zh-CN') })}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SoulBoard({ souls, data }: { souls: SoulRecord[]; data: SoulData }) {
  const wide = useWide()
  const [selected, setSelected] = useState<number>()
  const [levels, setLevels] = useState<Record<number, number>>({})
  const [gridRef, fit] = useFit(wide ? 6.75 : 5.25)
  const columns = Math.max(3, Math.min(fit || 6, 10))
  const selectedIndex = souls.findIndex((soul) => soul.iID === selected)
  const activeIndex = selectedIndex >= 0 ? selectedIndex : wide && souls.length > 0 ? 0 : -1
  const active = activeIndex >= 0 ? souls[activeIndex] : undefined
  const { panelRef, areaRef, pointerRef } = usePointer(`${active?.iID}-${wide}-${columns}`)
  const rowEnd = Math.min(souls.length - 1, (Math.floor(activeIndex / columns) + 1) * columns - 1)
  const caps = useMemo(() => soulLevelCaps(data.souls.levels), [data])
  const attributes = useMemo(() => new Map(data.souls.attributes.map((attribute) => [attribute.iID, attribute])), [data])

  useEffect(() => {
    if (wide || selected === undefined) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(undefined) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [wide, selected])

  if (souls.length === 0) return <div className="p-3"><Notice>{text.empty}</Notice></div>

  const select = (soul: SoulRecord) => setSelected(!wide && soul.iID === active?.iID ? undefined : soul.iID)

  let panel = null
  if (active) {
    const cap = caps.get(active.quality ?? 0) ?? DEFAULT_SOUL_CAP
    panel = (
      <DetailPanel panelRef={panelRef} pointerRef={pointerRef}>
        <SoulDetail
          soul={active}
          data={data}
          attributes={attributes}
          cap={cap}
          level={Math.min(levels[active.iID] ?? cap, cap)}
          onLevel={(next) => setLevels((previous) => ({ ...previous, [active.iID]: next }))}
        />
      </DetailPanel>
    )
  }

  return (
    <div className="grid gap-2.5 p-2.5 md:p-3.5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-4">
      <div ref={areaRef} className="min-w-0">
        <div ref={gridRef} className="grid gap-1.5 md:gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {souls.map((soul, index) => (
            <Fragment key={soul.iID}>
              <SoulTile soul={soul} selected={soul.iID === active?.iID} onSelect={() => select(soul)} />
              {!wide && index === rowEnd ? <div className="col-span-full pb-1 pt-2">{panel}</div> : null}
            </Fragment>
          ))}
        </div>
      </div>
      {wide ? <div className="sticky top-4 min-w-0">{panel}</div> : null}
    </div>
  )
}

function SoulTile({ soul, selected, onSelect }: { soul: SoulRecord; selected: boolean; onSelect: () => void }) {
  const color = qualityColor(soul.quality)
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
      <span
        className="block aspect-square w-full max-w-20 rounded-full transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:-translate-y-0.5"
        style={{ backgroundImage: `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${color} 30%, transparent), color-mix(in srgb, ${color} 8%, var(--muted)) 70%)` }}
      >
        <img src={resourceUrl(soul.icon ?? '')} alt="" loading="lazy" className="size-full object-contain p-1" />
      </span>
      <span className="w-full truncate text-xs font-semibold md:text-sm">{soul.name?.['zh-CN']}</span>
      <span className="-mt-1 text-xs font-bold tabular-nums" style={{ color }}>{qualityLabel(soul.quality)}</span>
    </button>
  )
}

function SoulDetail({ soul, data, attributes, cap, level, onLevel }: {
  soul: SoulRecord
  data: SoulData
  attributes: Map<number, EquipmentAttributeRecord>
  cap: number
  level: number
  onLevel: (level: number) => void
}) {
  const color = qualityColor(soul.quality)
  const effects = useMemo(() => new Map(data.souls.markEffects.map((effect) => [effect.iID, effect.desc?.['zh-CN'] || effect.name?.['zh-CN'] || ''])), [data])
  const format = (id: number) => {
    const known = attributes.get(id)
    return known ? attributeFormat(known) : { label: fill(text.attributeId, { id }), percent: false }
  }
  const primary = soulPrimaryAt(soul, level)
  const slots = (soul.initialMarks ?? []).flatMap((mark) => mark.threshold !== undefined ? [mark.threshold] : [])
  const marks = (soul.marks ?? []).map((mark) => ({
    ...mark,
    lines: [...new Set((mark.specialEffectIds ?? []).map((id) => effects.get(id) ?? '').filter((line) => line && !PLACEHOLDER_NAME.test(line)))],
  }))
  const pool = soulSubPool(soul)
  const description = soul.desc?.['zh-CN']

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <img
          src={resourceUrl(soul.icon ?? '')}
          alt=""
          className="size-12 shrink-0 rounded-full object-contain p-0.5"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, var(--card))` }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h3 className="text-base font-bold leading-tight md:text-lg">{soul.name?.['zh-CN']}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Badge>
              <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: color }} />
              {qualityLabel(soul.quality)}
            </Badge>
            {soul.seasonPower != null ? <Badge>{fill(text.seasonPower, { value: soul.seasonPower })}</Badge> : null}
          </div>
        </div>
        {cap > 1 ? (
          <LevelStepper
            index={level - 1}
            last={cap - 1}
            current={level}
            top={cap}
            onChange={(index) => onLevel(index + 1)}
            labels={{ group: text.levelPicker, down: text.levelDown, up: text.levelUp }}
          />
        ) : null}
      </div>

      {primary.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h4 className="text-xs font-semibold text-muted-foreground">{text.primary}</h4>
          <dl className="flex flex-col divide-y divide-border rounded-lg bg-card px-3 shadow-[0_0_0_1px_var(--border)]">
            {primary.map(({ id, value, step }) => {
              const { label, percent } = format(id)
              return (
                <div key={id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <dt className="text-sm text-foreground/80">{label}</dt>
                  <dd className="flex items-baseline gap-1.5">
                    <b className="text-base font-bold tabular-nums text-[color:var(--ro3-stage)]">{attributeValue(value, percent)}</b>
                    {step ? <span className="text-xs tabular-nums text-muted-foreground">{fill(text.perLevel, { value: attributeValue(step, percent) })}</span> : null}
                  </dd>
                </div>
              )
            })}
          </dl>
        </section>
      ) : null}

      {slots.length > 0 ? (
        <DetailBlock label={text.markSlots} note={text.markSlotsNote}>
          <div className="flex flex-wrap gap-1.5">
            {slots.map((threshold, index) => {
              const open = level >= threshold
              return (
                <span
                  key={`${threshold}-${index}`}
                  className={cn(
                    'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                    open ? 'bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <span aria-hidden="true" className={cn('size-2 rounded-full', open ? 'bg-[color:var(--arkive-nav-active)]' : 'bg-muted-foreground/40')} />
                  {fill(text.markSlot, { level: threshold })}
                </span>
              )
            })}
          </div>
        </DetailBlock>
      ) : null}

      {marks.length > 0 ? (
        <DetailBlock label={text.markEffects} note={text.markEffectsNote}>
          <ul className="flex flex-col gap-2">
            {marks.map((mark, index) => (
              <li key={`${mark.markId}-${mark.threshold}-${index}`} className="flex gap-2">
                {mark.icon ? <img src={resourceUrl(mark.icon)} alt="" className="size-8 shrink-0 object-contain" /> : null}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-baseline gap-2 text-sm font-bold">
                    {fill(text.markCollect, { count: mark.threshold ?? 0 })}
                    {mark.seasonPower ? <span className="text-xs font-semibold tabular-nums text-[color:var(--ro3-stage)]">{fill(text.markPower, { value: mark.seasonPower })}</span> : null}
                  </span>
                  {mark.lines.map((line) => <p key={line} className="text-xs leading-relaxed text-foreground/75">{line}</p>)}
                </div>
              </li>
            ))}
          </ul>
        </DetailBlock>
      ) : null}

      {pool.length > 0 ? (
        <DetailBlock label={text.subPool} note={fill(text.poolCount, { count: pool.length })}>
          <div className="flex flex-wrap gap-1">
            {pool.map(({ id, min, max }) => {
              const { label, percent } = format(id)
              const value = min === undefined ? undefined : max !== undefined && max !== min
                ? `${attributeValue(min, percent)}–${attributeValue(max, percent)}`
                : attributeValue(min, percent)
              return <Chip key={id} value={value}>{label}</Chip>
            })}
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
