import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Crown, LayoutGrid, Skull, Sparkles, Swords, X } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { Notice } from './components/wiki'
import { HeaderAction } from './components/SectionNav'
import { LevelStepper } from './components/LevelStepper'
import { Badge, Chip, DetailBlock, DetailPanel, Facet, FacetGroup, Pager, PillTab, PillTrack, SearchBox, SearchToggle, UnderlineTab, ValueList } from './components/Board'
import { useFit, usePointer, useWide } from './components/boardHooks'
import { loadDropPool, loadMonsterWikiData, type DropPool, type MonsterRank, type MonsterWikiData, type MvpRecord } from './creatureData'
import { loadItems, type ItemSummary } from './wikiData'
import {
  defaultVariant,
  dropChance,
  filterMonsterGroups,
  groupMonsters,
  pageCount,
  stripPlaceholder,
  type MonsterFilter,
  type MonsterGroup,
} from './wikiBoards'
import { qualityColor } from './lib/quality'
import { resourceUrl } from './lib/urls'
import content from './locales/zh-CN.json'

const text = content.wiki.monsters

const PAGE_SIZE = 96
const RANKS: MonsterRank[] = ['normal', 'elite', 'mvp', 'boss']
const RANK_ICONS = { normal: LayoutGrid, elite: Sparkles, mvp: Crown, boss: Skull }
const RANK_COLORS: Partial<Record<MonsterRank, string>> = { elite: 'var(--arkive-nav-active)', mvp: '#b17b28', boss: '#c8402f' }
const ELEMENTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const ELEMENT_COLORS: Record<number, string> = {
  1: '#9aa0a6', 2: '#3fae7a', 3: '#a0743a', 4: '#e0583a', 5: '#3a8de0',
  6: '#8a5ad0', 7: '#d9a520', 8: '#5a4a7a', 9: '#c05aa8', 10: '#6b7a6b',
}
const SIZES = [1, 2, 3]
const SECONDARY_STATS = ['atk', 'matk', 'maxsp', 'def', 'mdef'] as const

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))

export function MonsterWiki() {
  const [data, setData] = useState<MonsterWikiData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [items, setItems] = useState<Map<number, ItemSummary>>()
  const [filter, setFilter] = useState<MonsterFilter>({ rank: 'all', band: null, element: null, race: null, size: null, query: '' })
  const [searchOpen, setSearchOpen] = useState(false)
  const [paging, setPaging] = useState({ key: '', page: 0 })
  const board = useRef<HTMLElement>(null)

  useEffect(() => {
    let active = true
    loadMonsterWikiData()
      .then((next) => { if (active) setData(next) })
      .catch(() => { if (active) setDataError(true) })
    loadItems()
      .then((next) => { if (active) setItems(next) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const groups = useMemo(() => groupMonsters(data?.monsters ?? []), [data])
  const mvps = useMemo(() => new Map((data?.mvps ?? []).flatMap((mvp) => mvp.name?.['zh-CN'] ? [[mvp.name['zh-CN'], mvp] as const] : [])), [data])
  const filtered = useMemo(() => filterMonsterGroups(groups, filter), [groups, filter])
  const races = useMemo(() => Object.entries(data?.catalog.enums.race ?? {}).map(([id, name]) => [Number(id), name['zh-CN'] ?? id] as const), [data])

  // A new filter starts again from the first page.
  const filterKey = JSON.stringify(filter)
  const count = pageCount(filtered.length, PAGE_SIZE)
  const page = paging.key === filterKey ? Math.min(paging.page, count - 1) : 0
  const shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const change = (next: Partial<MonsterFilter>) => setFilter((previous) => ({ ...previous, ...next }))
  const facetCount = [filter.element, filter.race, filter.size].filter((value) => value !== null).length
  const rankCount = (rank: MonsterRank) => groups.filter((group) => group.rank === rank).length

  const turnPage = (next: number) => {
    setPaging({ key: filterKey, page: next })
    // The next page starts at the board's top, not wherever the last one was left.
    const top = board.current?.getBoundingClientRect().top ?? 0
    if (top < 0) board.current?.scrollIntoView({ block: 'start' })
  }

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
        <PillTrack label={text.rankLabel}>
          <PillTab selected={filter.rank === 'all'} onClick={() => change({ rank: 'all' })} count={data ? groups.length : undefined}>
            {text.all}
          </PillTab>
          {RANKS.map((rank) => {
            const Icon = RANK_ICONS[rank]
            return (
              <PillTab key={rank} selected={filter.rank === rank} onClick={() => change({ rank })} count={data ? rankCount(rank) : undefined}>
                <Icon aria-hidden="true" className="hidden size-4 md:block" />
                {text.rankTabs[rank]}
              </PillTab>
            )
          })}
        </PillTrack>
        <SearchBox open={searchOpen} query={filter.query} onQuery={(query) => change({ query })} label={text.searchLabel} placeholder={text.searchPlaceholder} />
      </div>

      <section ref={board} aria-label={text.title} className="scroll-mt-4 rounded-lg border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border pr-2.5 md:px-1.5 md:pr-3.5">
          <div role="group" aria-label={text.bandLabel} className="flex min-w-0 overflow-x-auto [scrollbar-width:none]">
            <UnderlineTab selected={filter.band === null} onClick={() => change({ band: null })}>{text.allLevels}</UnderlineTab>
            {text.bands.map((band) => (
              <UnderlineTab
                key={band.label}
                selected={filter.band?.[0] === band.min && filter.band[1] === band.max}
                onClick={() => change({ band: [band.min, band.max] })}
              >
                {band.label}
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
          <FacetGroup label={text.element}>
            {ELEMENTS.map((element) => (
              <Facet key={element} selected={filter.element === element} onClick={() => change({ element: filter.element === element ? null : element })}>
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: ELEMENT_COLORS[element] }} />
                {(text.elementShort as Record<string, string>)[String(element)]}
              </Facet>
            ))}
          </FacetGroup>
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
          <FacetGroup label={text.race}>
            {races.map(([race, name]) => (
              <Facet key={race} selected={filter.race === race} onClick={() => change({ race: filter.race === race ? null : race })}>{name}</Facet>
            ))}
          </FacetGroup>
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
          <FacetGroup label={text.size}>
            {SIZES.map((size) => (
              <Facet key={size} selected={filter.size === size} onClick={() => change({ size: filter.size === size ? null : size })}>
                {(text.sizeShort as Record<string, string>)[String(size)]}
              </Facet>
            ))}
          </FacetGroup>
          {facetCount > 0 ? (
            <button
              type="button"
              onClick={() => change({ element: null, race: null, size: null })}
              className="flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-[color:var(--arkive-nav-active)] transition-colors hover:bg-[color:var(--arkive-filter-active)] md:h-8"
            >
              <X aria-hidden="true" className="size-3.5" />
              {text.clear}
            </button>
          ) : null}
        </div>

        {dataError ? <div className="p-3"><Notice>{content.wiki.dataError}</Notice></div> : !data ? <div className="p-3"><Notice>{content.wiki.loading}</Notice></div> : (
          <>
            <MonsterBoard groups={shown} data={data} mvps={mvps} items={items} wideCards={filter.rank === 'mvp'} />
            <Pager page={page} count={count} onPage={turnPage} labels={text.pager} />
          </>
        )}
      </section>
    </div>
  )
}

/** The creatures as a grid of heads, with one panel for the picked one (see the card board). */
function MonsterBoard({ groups, data, mvps, items, wideCards }: {
  groups: MonsterGroup[]
  data: MonsterWikiData
  mvps: Map<string, MvpRecord>
  items?: Map<number, ItemSummary>
  wideCards: boolean
}) {
  const wide = useWide()
  const [selected, setSelected] = useState<string>()
  const [variants, setVariants] = useState<Record<string, number>>({})
  const [gridRef, fit] = useFit(wideCards ? 13.5 : wide ? 6.75 : 5.25)
  const columns = wideCards ? Math.max(1, Math.min(fit || 3, 4)) : Math.max(3, Math.min(fit || 6, 10))
  const selectedIndex = groups.findIndex((group) => group.name === selected)
  const activeIndex = selectedIndex >= 0 ? selectedIndex : wide && groups.length > 0 ? 0 : -1
  const active = activeIndex >= 0 ? groups[activeIndex] : undefined
  const { panelRef, areaRef, pointerRef } = usePointer(`${active?.name}-${wide}-${columns}-${wideCards}`)
  const rowEnd = Math.min(groups.length - 1, (Math.floor(activeIndex / columns) + 1) * columns - 1)

  useEffect(() => {
    if (wide || selected === undefined) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(undefined) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [wide, selected])

  if (groups.length === 0) return <div className="p-3"><Notice>{text.empty}</Notice></div>

  const select = (group: MonsterGroup) => setSelected(!wide && group.name === active?.name ? undefined : group.name)

  const panel = active ? (
    <DetailPanel panelRef={panelRef} pointerRef={pointerRef}>
      <MonsterDetail
        group={active}
        data={data}
        mvp={mvps.get(active.name)}
        items={items}
        index={variants[active.name] ?? defaultVariant(active)}
        onIndex={(next) => setVariants((previous) => ({ ...previous, [active.name]: next }))}
      />
    </DetailPanel>
  ) : null

  return (
    <div className="grid gap-2.5 p-2.5 md:p-3.5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-4">
      <div ref={areaRef} className="min-w-0">
        <div ref={gridRef} className="grid gap-1.5 md:gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {groups.map((group, index) => (
            <Fragment key={group.name}>
              {wideCards
                ? <MvpCard group={group} mvp={mvps.get(group.name)} mapNames={data.mapNames} selected={group.name === active?.name} onSelect={() => select(group)} />
                : <MonsterTile group={group} selected={group.name === active?.name} onSelect={() => select(group)} />}
              {!wide && index === rowEnd ? <div className="col-span-full pb-1 pt-2">{panel}</div> : null}
            </Fragment>
          ))}
        </div>
      </div>
      {wide ? <div className="sticky top-4 min-w-0">{panel}</div> : null}
    </div>
  )
}

function levelText(group: MonsterGroup) {
  return group.minLevel === group.maxLevel
    ? fill(text.levelSingle, { level: group.minLevel })
    : fill(text.levelRange, { min: group.minLevel, max: group.maxLevel })
}

const TILE = 'group flex flex-col items-center gap-1 rounded-lg p-1.5 text-center transition-colors'
const TILE_SELECTED = 'bg-[color:var(--arkive-filter-active)] ring-2 ring-[color:var(--arkive-nav-active)]'

function MonsterTile({ group, selected, onSelect }: { group: MonsterGroup; selected: boolean; onSelect: () => void }) {
  const color = RANK_COLORS[group.rank]
  return (
    <button type="button" aria-pressed={selected} onClick={onSelect} className={cn(TILE, selected ? TILE_SELECTED : 'hover:bg-muted')}>
      <span className="relative block aspect-square w-full max-w-20 rounded-xl bg-muted transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:-translate-y-0.5">
        <img src={resourceUrl(group.icon)} alt="" loading="lazy" className="size-full rounded-xl object-contain" />
        {color ? (
          <span className="absolute -right-1 -top-1 rounded-md px-1 text-xs font-bold leading-4 text-white" style={{ backgroundColor: color }}>
            {text.rankTabs[group.rank]}
          </span>
        ) : null}
      </span>
      <span className="w-full truncate text-xs font-semibold md:text-sm">{group.name}</span>
      <span className="-mt-1 text-xs tabular-nums text-muted-foreground">{levelText(group)}</span>
    </button>
  )
}

function MvpCard({ group, mvp, mapNames, selected, onSelect }: {
  group: MonsterGroup
  mvp?: MvpRecord
  mapNames: Map<number, string>
  selected: boolean
  onSelect: () => void
}) {
  const map = mvp?.mapId ? mapNames.get(mvp.mapId) : undefined
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn('group flex items-center gap-2.5 overflow-hidden rounded-lg bg-muted bg-cover bg-center p-2 text-left transition-shadow', selected ? TILE_SELECTED : 'hover:shadow-md')}
      style={mvp?.background ? { backgroundImage: `linear-gradient(90deg, rgba(255,255,255,0.92) 40%, rgba(255,255,255,0.35)), url(${resourceUrl(mvp.background)})` } : undefined}
    >
      <img src={resourceUrl(mvp?.headIcon ?? group.icon)} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl bg-card/70 object-contain" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-bold">{group.name}</span>
        <span className="truncate text-xs text-foreground/75">
          {map ? fill(text.mvpLine, { level: mvp?.level ?? group.maxLevel, map }) : levelText(group)}
        </span>
        {mvp?.respawnSeconds ? (
          <span className="text-xs font-semibold text-[color:#b17b28]">{fill(text.mvpRespawnLine, { minutes: Math.round(mvp.respawnSeconds / 60) })}</span>
        ) : null}
      </span>
    </button>
  )
}

function MonsterDetail({ group, data, mvp, items, index, onIndex }: {
  group: MonsterGroup
  data: MonsterWikiData
  mvp?: MvpRecord
  items?: Map<number, ItemSummary>
  index: number
  onIndex: (index: number) => void
}) {
  const at = Math.min(index, group.variants.length - 1)
  const variant = group.variants[at]
  const stats = variant.stats ?? {}
  const enums = data.catalog.enums
  const skillNames = useMemo(() => new Map(data.skills.skills.map((skill) => [skill.id, stripPlaceholder(skill.name?.['zh-CN'] ?? '')])), [data])
  const poolId = variant.dropPool ?? variant.normalDropPools?.[0]
  const [drop, setDrop] = useState<{ id: number; pool: DropPool | null }>()

  useEffect(() => {
    if (!poolId) return
    let active = true
    loadDropPool(poolId)
      .then((pool) => { if (active) setDrop({ id: poolId, pool }) })
      .catch(() => { if (active) setDrop({ id: poolId, pool: null }) })
    return () => { active = false }
  }, [poolId])

  const pool = poolId && drop?.id === poolId ? drop.pool : undefined
  const loadingDrops = Boolean(poolId) && drop?.id !== poolId
  const rows: Array<[string, string]> = [
    ...SECONDARY_STATS.flatMap((key): Array<[string, string]> => stats[key] != null ? [[text.statLabels[key], stats[key].toLocaleString('zh-CN')]] : []),
    ...(variant.speed != null ? [[text.speed, String(variant.speed)] as [string, string]] : []),
    ...(variant.attackRange != null ? [[text.attackRange, fill(text.attackRangeValue, { value: variant.attackRange / 100 })] as [string, string]] : []),
  ]
  const maps = [...new Set((variant.maps ?? []).map((id) => data.mapNames.get(id)).filter((name): name is string => Boolean(name)))].slice(0, 4)
  const skills = [...new Set((variant.skills ?? []).map((id) => skillNames.get(id)).filter((name): name is string => Boolean(name)))].slice(0, 6)
  const itemChips = (ids: number[]) => ids.flatMap((id) => {
    const item = items?.get(id)
    return item ? [{ id, ...item }] : []
  }).slice(0, 8)
  const rewards = itemChips(mvp?.awardPreviewItems ?? [])
  const slots = (pool?.slots ?? []).map((slot) => ({ slot, named: itemChips(slot.items.map((entry) => entry.item)) })).filter((entry) => entry.named.length > 0)
  const enumName = (table: Record<string, { 'zh-CN'?: string }>, id?: number) => (id !== undefined ? table[String(id)]?.['zh-CN'] : undefined)
  const rankColor = RANK_COLORS[group.rank]

  return (
    <div className="flex flex-col gap-3">
      {mvp?.background ? (
        <div className="relative h-24 overflow-hidden rounded-lg bg-muted bg-cover bg-center" style={{ backgroundImage: `url(${resourceUrl(mvp.background)})` }}>
          <img src={resourceUrl(mvp.headIcon ?? group.icon)} alt="" className="absolute bottom-1.5 left-2 size-20 object-contain drop-shadow-lg" />
        </div>
      ) : null}

      <div className="flex items-start gap-2">
        {!mvp?.background ? <img src={resourceUrl(group.icon)} alt="" className="size-12 shrink-0 rounded-xl bg-muted object-contain" /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h3 className="text-base font-bold leading-tight md:text-lg">{group.name}</h3>
          <div className="flex flex-wrap gap-1.5">
            <Badge>
              {rankColor ? <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: rankColor }} /> : <Swords aria-hidden="true" className="size-3" />}
              {text.rankTabs[group.rank]}
            </Badge>
            {group.element ? (
              <Badge>
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: ELEMENT_COLORS[group.element] }} />
                {enumName(enums.element, group.element)}
              </Badge>
            ) : null}
            {enumName(enums.race, group.race) ? <Badge>{enumName(enums.race, group.race)}</Badge> : null}
            {enumName(enums.size, group.size) ? <Badge>{enumName(enums.size, group.size)}</Badge> : null}
          </div>
        </div>
        {group.variants.length > 1 ? (
          <div className="shrink-0">
            <LevelStepper
              index={at}
              last={group.variants.length - 1}
              current={variant.level ?? 0}
              top={group.maxLevel}
              onChange={onIndex}
              labels={{ group: text.variantPicker, down: text.variantDown, up: text.variantUp }}
            />
          </div>
        ) : null}
      </div>

      {stats.maxhp != null ? (
        <dl className="rounded-lg bg-card shadow-[0_0_0_1px_var(--border)]">
          <div className="flex items-baseline justify-between gap-2 px-3 py-2">
            <dt className="text-sm text-foreground/80">{text.hp}</dt>
            <dd className="text-xl font-bold tabular-nums text-[color:var(--ro3-stage)]">{stats.maxhp.toLocaleString('zh-CN')}</dd>
          </div>
        </dl>
      ) : null}

      {rows.length > 0 ? <ValueList label={text.stats} rows={rows} /> : null}

      {mvp ? (
        <DetailBlock label={text.mvpInfo}>
          <dl className="grid grid-cols-3 gap-1.5 text-center">
            {([
              [text.map, mvp.mapId ? data.mapNames.get(mvp.mapId) : undefined],
              [text.respawn, mvp.respawnSeconds ? fill(text.minutes, { value: Math.round(mvp.respawnSeconds / 60) }) : undefined],
              [text.fastestKill, mvp.shortestKillSeconds ? fill(text.minutes, { value: Math.round(mvp.shortestKillSeconds / 60) }) : undefined],
            ] as const).map(([label, value]) => (
              <div key={label} className="flex min-w-0 flex-col rounded-md bg-card px-1.5 py-1 shadow-[0_0_0_1px_var(--border)]">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="truncate text-sm font-bold">{value ?? '-'}</dd>
              </div>
            ))}
          </dl>
          {rewards.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-xs font-semibold text-muted-foreground">{text.rewards}</span>
              {rewards.map((item) => <Chip key={item.id} dot={qualityColor(item.quality)}>{item.name}</Chip>)}
            </div>
          ) : null}
        </DetailBlock>
      ) : null}

      {maps.length > 0 ? (
        <DetailBlock label={text.maps}>
          <div className="flex flex-wrap gap-1">{maps.map((name) => <Chip key={name}>{name}</Chip>)}</div>
        </DetailBlock>
      ) : null}

      {skills.length > 0 ? (
        <DetailBlock label={text.skillList}>
          <div className="flex flex-wrap gap-1">{skills.map((name) => <Chip key={name}>{name}</Chip>)}</div>
        </DetailBlock>
      ) : null}

      {loadingDrops ? (
        <DetailBlock label={text.drops}><p className="text-xs text-muted-foreground">{text.dropsLoading}</p></DetailBlock>
      ) : slots.length > 0 ? (
        <DetailBlock label={text.drops}>
          <ul className="flex flex-col gap-2">
            {slots.map(({ slot, named }) => {
              const chance = dropChance(slot.chance)
              const [low, high] = slot.rolls
              return (
                <li key={slot.slot} className="flex flex-col gap-1">
                  <span className="flex items-baseline gap-2 text-xs">
                    <b className="font-bold tabular-nums text-[color:var(--ro3-stage)]">{chance === 'sure' ? text.sureDrop : `${chance}%`}</b>
                    <span className="tabular-nums text-muted-foreground">
                      {low === high ? fill(text.rollsOne, { count: low }) : fill(text.rolls, { min: low, max: high })}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {named.map((item) => <Chip key={item.id} dot={qualityColor(item.quality)}>{item.name}</Chip>)}
                  </span>
                </li>
              )
            })}
          </ul>
        </DetailBlock>
      ) : null}
    </div>
  )
}
