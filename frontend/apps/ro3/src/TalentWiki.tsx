import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ChevronRight, GitFork, Heart, LockKeyhole, Shield, Sparkles, Star, Swords, Zap } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { Notice } from './components/wiki'
import { HeaderAction, SidebarSub } from './components/SectionNav'
import { GameText } from './components/GameText'
import { LevelStepper } from './components/LevelStepper'
import { stageEmblem } from './professionCatalog'
import {
  BOARD_ROWS,
  classRow,
  cumulativeCosts,
  gateBranches,
  GATE_TYPE,
  nodeLevelRows,
  seasonPath,
  TALENT_LINES,
  treeLabel,
  type TalentClass,
} from './talentCatalog'
import {
  loadItemNames,
  loadTalentWikiData,
  type PatronTalentNodeRecord,
  type TalentCatalogDocument,
  type TalentLevelRecord,
  type TalentNodeRecord,
} from './wikiData'
import { resourceUrl } from './lib/urls'
import content from './locales/zh-CN.json'

type TalentData = Awaited<ReturnType<typeof loadTalentWikiData>>
type TalentMode = 'season' | 'patron'

const text = content.wiki.talents
const PATRON_COLUMNS = 4

export function TalentWiki() {
  const [data, setData] = useState<TalentData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [itemNames, setItemNames] = useState<Map<number, string>>(() => new Map())
  const [mode, setMode] = useState<TalentMode>('season')
  const [lineId, setLineId] = useState(TALENT_LINES[0].lineId)
  const [variantId, setVariantId] = useState<number>()
  const line = TALENT_LINES.find((candidate) => candidate.lineId === lineId) ?? TALENT_LINES[0]
  const jobClass = line.classes.find((candidate) => candidate.jobId === variantId) ?? line.classes[0]
  const [treeId, setTreeId] = useState<number>()
  const [groupId, setGroupId] = useState<number>()

  useEffect(() => {
    let active = true
    loadTalentWikiData()
      .then((next) => { if (active) setData(next) })
      .catch(() => { if (active) setDataError(true) })
    // Names only dress the costs up; without them the ids still read.
    loadItemNames().then((names) => { if (active) setItemNames(names) }).catch(() => {})
    return () => { active = false }
  }, [])

  const talents = data?.talents
  const trees = talents?.seasonTalents.trees ?? []
  const groups = talents?.patronTalents.groups ?? []
  const tree = trees.find((candidate) => candidate.iId === treeId) ?? trees[0]
  const group = groups.find((candidate) => candidate.iID === groupId) ?? groups[0]

  const modeSwitch = (compact: boolean) => (
    <div role="tablist" aria-label={text.systemLabel} className="flex shrink-0 gap-0.5 rounded-full bg-muted p-0.5">
      {(['season', 'patron'] as const).map((candidate) => {
        const selected = candidate === mode
        const Icon = candidate === 'season' ? GitFork : Star
        return (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={compact ? text[candidate] : undefined}
            onClick={() => setMode(candidate)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-full text-sm font-semibold transition-colors',
              compact ? 'w-9 justify-center' : 'px-3',
              selected ? 'bg-card text-[color:var(--arkive-nav-active)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {compact ? null : text[candidate]}
          </button>
        )
      })}
    </div>
  )

  // The two boards are the page's sub-pages, so they sit under its sidebar entry.
  const systemList = (
    <div role="tablist" aria-label={text.systemLabel} aria-orientation="vertical" className="my-1 ml-6 flex flex-col gap-0.5 border-l-2 border-border pl-2">
      {(['season', 'patron'] as const).map((candidate) => {
        const selected = candidate === mode
        const Icon = candidate === 'season' ? GitFork : Star
        return (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setMode(candidate)}
            className={cn(
              'flex h-9 items-center gap-2 rounded-lg px-2 text-sm transition-colors',
              selected ? 'bg-[color:var(--arkive-filter-active)] font-bold text-[color:var(--arkive-nav-active)]' : 'font-semibold text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {text[candidate]}
          </button>
        )
      })}
    </div>
  )

  const tabs = mode === 'season'
    ? trees.map((candidate) => (
      <UnderlineTab key={candidate.iId} selected={candidate.iId === tree?.iId} onClick={() => setTreeId(candidate.iId)}>
        {treeLabel(candidate.name?.['zh-CN'] ?? String(candidate.iId))}
      </UnderlineTab>
    ))
    : groups.map((candidate) => (
      <UnderlineTab key={candidate.iID} selected={candidate.iID === group?.iID} onClick={() => setGroupId(candidate.iID)}>
        {candidate.name?.['zh-CN'] ?? candidate.iID}
      </UnderlineTab>
    ))

  return (
    <div className="talent-wiki flex flex-col gap-3 md:gap-4">
      <HeaderAction>{modeSwitch(true)}</HeaderAction>
      <SidebarSub>{systemList}</SidebarSub>

      {mode === 'season' ? (
        // The class is the one choice above the board: it decides every job talent behind the gates.
        <div className="w-full overflow-x-auto rounded-full bg-muted [scrollbar-width:none] md:w-fit md:max-w-full">
          <div role="tablist" aria-label={text.classLabel} className="flex w-max items-center gap-0.5 p-1">
            {TALENT_LINES.map((candidate) => {
              const selected = candidate.lineId === line.lineId
              const face = (
                <>
                  <img src={stageEmblem(candidate.lineId)} alt="" className="size-8 object-contain" />
                  {lineLabel(candidate.lineId)}
                </>
              )
              const look = cn(
                'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full py-0 pl-1 text-sm font-semibold transition-colors',
                selected ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )
              // A line with several classes grows a tray of them off its pill:
              // smaller, lighter and behind a chevron, so they read as its children.
              if (selected && candidate.classes.length > 1) {
                return (
                  <div key={candidate.lineId} role="tab" aria-selected="true" className="flex shrink-0 items-center rounded-full bg-[color:var(--arkive-filter-active)] pr-1">
                    <span className={cn(look, 'pr-3.5')}>{face}</span>
                    <ChevronRight aria-hidden="true" className="mx-0.5 size-4 text-[color:var(--arkive-nav-active)] opacity-60" />
                    <span role="radiogroup" aria-label={text.classLabel} className="flex gap-0.5">
                      {candidate.classes.map((option) => {
                        const checked = option.jobId === jobClass.jobId
                        return (
                          <button
                            key={option.jobId}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            onClick={() => setVariantId(option.jobId)}
                            className={cn(
                              'flex h-8 items-center gap-1 rounded-full py-0 pl-0.5 pr-2.5 text-xs font-semibold transition-colors',
                              checked
                                ? 'bg-card font-bold text-[color:var(--arkive-nav-active)] shadow-[0_1px_3px_rgba(13,116,206,0.18)]'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            <img src={stageEmblem(option.stageId)} alt="" className="size-6 object-contain" />
                            {classLabel(option)}
                          </button>
                        )
                      })}
                    </span>
                  </div>
                )
              }
              return (
                <button
                  key={candidate.lineId}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setLineId(candidate.lineId)}
                  className={cn(look, 'pr-4')}
                >
                  {face}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {dataError ? <Notice>{content.wiki.dataError}</Notice> : !talents ? <Notice>{content.wiki.loading}</Notice> : mode === 'season' ? (
        tree ? (
          <SeasonBoard
            key={tree.iId}
            talents={talents}
            treeId={tree.iId}
            tabs={tabs}
            tabsLabel={text.treeLabel}
            chip={tree.iNeedLevel ? text.requiredLevel.replace('{level}', String(tree.iNeedLevel)) : undefined}
            jobClass={jobClass}
            itemNames={itemNames}
          />
        ) : null
      ) : group ? (
        <PatronBoard key={group.iID} talents={talents} nodeIds={group.kTanlentPoints} tabs={tabs} tabsLabel={text.groupLabel} />
      ) : null}
    </div>
  )
}

/**
 * A board under its own tabs, with the picked node's panel beside it on wide
 * screens -- so the detail is in view on arrival -- and under it below `lg`.
 */
function BoardCard({ tabs, tabsLabel, chip, areaRef, board, detail }: {
  tabs: ReactNode
  tabsLabel: string
  chip?: string
  areaRef: RefObject<HTMLDivElement | null>
  board: ReactNode
  detail: ReactNode
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border pr-2.5 md:px-1.5 md:pr-3.5">
        <div role="group" aria-label={tabsLabel} className="flex min-w-0 overflow-x-auto [scrollbar-width:none]">{tabs}</div>
        {chip ? (
          <span className="ml-auto shrink-0 whitespace-nowrap rounded-full bg-[color:var(--ro3-stage-solid)] px-2 text-xs font-bold leading-5 text-white">{chip}</span>
        ) : null}
      </div>
      <div className="grid gap-2.5 p-2.5 md:p-3.5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-4">
        <div ref={areaRef} className="flex min-w-0 flex-col gap-2">{board}</div>
        {detail}
      </div>
    </section>
  )
}
function UnderlineTab({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'relative flex h-10 shrink-0 items-baseline px-2 pt-2.5 text-sm transition-colors after:absolute after:inset-x-2 after:bottom-1 after:h-1 after:rounded-full md:px-3 md:after:inset-x-3',
        selected
          ? 'font-bold text-foreground after:bg-[color:var(--ro3-stage)]'
          : 'font-semibold text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Points a panel's rounded pointer at the pressed tile inside `area`: from the
 * panel's left edge when it stands beside the board, from its top when it
 * sits below. Written straight to the pointer's style: it follows layout, not
 * state.
 */
function usePointer(key: string) {
  const panel = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const pointer = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const box = panel.current
    const scope = area.current
    if (!box || !scope) return
    const aim = () => {
      const tile = scope.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (!tile || !pointer.current) return
      const outer = box.getBoundingClientRect()
      const inner = tile.getBoundingClientRect()
      const style = pointer.current.style
      if (outer.left >= inner.right) {
        style.left = '0px'
        style.top = `${Math.max(16, Math.min(outer.height - 16, inner.top + inner.height / 2 - outer.top))}px`
      } else {
        style.left = `${Math.max(16, Math.min(outer.width - 16, inner.left + inner.width / 2 - outer.left))}px`
        style.top = '0px'
      }
    }
    aim()
    const observer = new ResizeObserver(aim)
    observer.observe(box)
    observer.observe(scope)
    scope.addEventListener('scroll', aim, { capture: true, passive: true })
    return () => {
      observer.disconnect()
      scope.removeEventListener('scroll', aim, { capture: true })
    }
  }, [key])
  return { panelRef: panel, areaRef: area, pointerRef: pointer }
}

function DetailPanel({ panelRef, pointerRef, children }: {
  panelRef: RefObject<HTMLDivElement | null>
  pointerRef: RefObject<HTMLSpanElement | null>
  children: ReactNode
}) {
  return (
    <div ref={panelRef} className="relative rounded-lg bg-[color:var(--ro3-skill-panel)] p-3 md:p-3.5">
      <span
        ref={pointerRef}
        aria-hidden="true"
        className="absolute left-9 top-0 -ml-2 -mt-2 size-4 rotate-45 rounded-[0.3rem_0.2rem] bg-[color:var(--ro3-skill-panel)] transition-[left,top] duration-500 ease-[cubic-bezier(.34,1.4,.64,1)]"
      />
      {children}
    </div>
  )
}

/** How many cells of `cell` rem fit across the measured element; 0 until measured. */
function useFit(cell: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(0)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    // The observer reports once on observe, so this also takes the first measure.
    const observer = new ResizeObserver(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setFit(Math.max(1, Math.floor(node.clientWidth / (cell * rem))))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [cell])
  return [ref, fit] as const
}

/** The tree in unlock order, with one panel beside it for the picked node. */
function SeasonBoard({ talents, treeId, tabs, tabsLabel, chip, jobClass, itemNames }: {
  talents: TalentCatalogDocument
  treeId: number
  tabs: ReactNode
  tabsLabel: string
  chip?: string
  jobClass: TalentClass
  itemNames: Map<number, string>
}) {
  const { nodes, levels } = talents.seasonTalents
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.iId, node])), [nodes])
  const levelById = useMemo(() => new Map(levels.map((row) => [row.iId, row])), [levels])
  const effectById = useMemo(() => new Map((talents.specialEffects ?? []).flatMap((effect) => effect.desc?.['zh-CN'] ? [[effect.iID, effect.desc['zh-CN']] as const] : [])), [talents])
  const placed = useMemo(() => nodes.filter((node) => node.iTalentTreeID === treeId && node.kPosition?.length === 2), [nodes, treeId])
  // Nodes with no place on the board (the battle oath) still level up, so they get a row of their own.
  const loose = useMemo(() => nodes.filter((node) => node.iTalentTreeID === treeId && !node.kPosition && node.iType !== 6 && node.iType !== 7 && node.levels?.length), [nodes, treeId])

  const [selectedId, setSelectedId] = useState<number>()
  const [levelIndexes, setLevelIndexes] = useState<Record<number, number>>({})
  const selected = [...placed, ...loose].find((node) => node.iId === selectedId)
    ?? placed.find((node) => node.iIsStartPoint) ?? placed[0]
  const { panelRef, areaRef, pointerRef } = usePointer(`${selected?.iId}`)

  // Laid out in unlock order rather than the game's scatter, as many to a row
  // as the width takes, with the rows evened out so the last is not a stub.
  const [boardRef, fit] = useFit(5)
  const rowCount = Math.max(1, Math.ceil(placed.length / Math.max(1, fit || BOARD_ROWS)))
  const columns = Math.max(1, Math.ceil(placed.length / rowCount))
  const cells = useMemo(() => seasonPath(placed, columns), [placed, columns])
  const pointById = new Map(cells.map(({ node, column, row }) => [node.iId, {
    x: (column + 0.5) / columns * 100,
    y: (row + 0.5) / rowCount * 100,
  }]))
  const links = placed.flatMap((node) => (node.kAfterids ?? []).filter((id) => pointById.has(id)).map((id) => [node, nodeById.get(id)!] as const))

  return (
    <BoardCard
      tabs={tabs}
      tabsLabel={tabsLabel}
      chip={chip}
      areaRef={areaRef}
      board={(
        <>
          <div ref={boardRef}>
            <div
              className="relative w-full rounded-lg bg-[linear-gradient(160deg,var(--ro3-stage-soft),transparent_60%)]"
              style={{ height: `${rowCount * 5.5}rem` }}
            >
              <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
                {links.map(([from, to]) => {
                  const a = pointById.get(from.iId)!
                  const b = pointById.get(to.iId)!
                  return (
                    <line
                      key={`${from.iId}-${to.iId}`}
                      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      vectorEffect="non-scaling-stroke"
                      strokeLinecap="round"
                      className="stroke-[color:var(--ro3-stage-mid)] [stroke-width:5]"
                    />
                  )
                })}
              </svg>
              {placed.map((node) => {
                const point = pointById.get(node.iId)!
                return (
                  <div key={node.iId} className="absolute -translate-x-1/2 -translate-y-[1.4rem]" style={{ left: `${point.x}%`, top: `${point.y}%` }}>
                    <SeasonTile node={node} levelById={levelById} selected={node.iId === selected?.iId} onSelect={() => setSelectedId(node.iId)} />
                  </div>
                )
              })}
            </div>
          </div>
          {loose.length > 0 ? (
            <div className="flex items-center gap-2 border-t border-dashed border-border pt-2">
              <span className="text-xs font-semibold text-muted-foreground">{text.extra}</span>
              {loose.map((node) => (
                <SeasonTile key={node.iId} node={node} levelById={levelById} selected={node.iId === selected?.iId} onSelect={() => setSelectedId(node.iId)} />
              ))}
            </div>
          ) : null}
        </>
      )}
      detail={selected ? (
        <DetailPanel panelRef={panelRef} pointerRef={pointerRef}>
          {selected.iType === GATE_TYPE ? (
            <GateDetail gate={selected} nodeById={nodeById} levelById={levelById} effectById={effectById} jobClass={jobClass} />
          ) : (
            <StatDetail
              node={selected}
              rows={nodeLevelRows(selected, levelById)}
              attributes={talents.attributes}
              itemNames={itemNames}
              index={levelIndexes[selected.iId]}
              onIndex={(next) => setLevelIndexes((previous) => ({ ...previous, [selected.iId]: next }))}
            />
          )}
        </DetailPanel>
      ) : null}
    />
  )
}
function SeasonTile({ node, levelById, selected, onSelect }: {
  node: TalentNodeRecord
  levelById: Map<number, TalentLevelRecord>
  selected: boolean
  onSelect: () => void
}) {
  const gate = node.iType === GATE_TYPE
  const first = levelById.get(node.levels?.[0] ?? -1)
  const name = gate ? text.gate : first?.name?.['zh-CN'] ?? String(node.iId)
  return (
    <Tile
      selected={selected}
      onSelect={onSelect}
      name={name}
      badge={gate ? undefined : node.iMaxLevel ?? node.levels?.length}
      art={gate ? (
        <span className="grid size-full place-items-center rounded-full bg-[image:var(--arkive-warm-search)] text-[color:var(--arkive-warm-search-foreground)]">
          <LockKeyhole aria-hidden="true" className="size-5" />
        </span>
      ) : first?.icon ? <TalentArt icon={first.icon} /> :<Zap aria-hidden="true" className="size-5 text-muted-foreground" />}
      round={gate}
    />
  )
}

function Tile({ selected, onSelect, name, art, badge, round }: {
  selected: boolean
  onSelect: () => void
  name: string
  art: ReactNode
  badge?: number
  round?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={name}
      onClick={onSelect}
      className={cn(
        'group relative flex w-16 shrink-0 flex-col items-center gap-0.5 rounded-lg px-0.5 pb-0.5 pt-1 transition-colors',
        selected ? 'bg-[color:var(--arkive-filter-active)]' : 'hover:bg-muted',
      )}
    >
      <span
        className={cn(
          'grid size-11 place-items-center overflow-hidden bg-muted transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:-translate-y-0.5',
          round ? 'rounded-full' : 'rounded-xl',
          selected ? 'ring-2 ring-[color:var(--arkive-nav-active)]' : 'ring-1 ring-inset ring-black/5',
        )}
      >
        {art}
      </span>
      <span className={cn('max-w-full truncate text-xs', selected ? 'font-bold text-[color:var(--arkive-nav-active)]' : 'text-foreground/80')}>
        {name}
      </span>
      {badge ? (
        <span className="absolute right-0.5 top-0 min-w-5 rounded-full bg-card px-1 text-xs font-bold leading-5 text-muted-foreground shadow-[0_0_0_1px_var(--border)]">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

/** A stat node at the stepped level: what it adds by then, and what it costs. */
function StatDetail({ node, rows, attributes, itemNames, index, onIndex }: {
  node: TalentNodeRecord
  rows: TalentLevelRecord[]
  attributes: TalentCatalogDocument['attributes']
  itemNames: Map<number, string>
  index?: number
  onIndex: (index: number) => void
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{text.noEffect}</p>
  const last = rows.length - 1
  // The full node by default: its whole effect and the whole bill.
  const at = Math.min(index ?? last, last)
  const row = rows[at]
  const skillPoints = rows.slice(0, at + 1).reduce((sum, entry) => sum + (entry.iSkillPoint ?? 0), 0)
  const costRows = (costs: Array<[number, number]>) => costs.map(([id, value]): [string, string] => [
    itemNames.get(id) ?? text.item.replace('{id}', String(id)),
    `×${value.toLocaleString('zh-CN')}`,
  ])
  return (
    <div className="flex flex-col gap-3">
      <DetailHead
        label={node.iType === 4 ? text.oathNode : text.statNode}
        start={!!node.iIsStartPoint}
        stepper={rows.length > 1 ? <LevelStepper index={at} last={last} current={row.iLevel ?? at + 1} top={rows[last].iLevel ?? rows.length} onChange={onIndex} /> : null}
      />
      {row.kAttrs?.length ? <ValueList label={text.attributes} rows={attributeRows(row.kAttrs, attributes)} /> : <p className="text-sm text-muted-foreground">{text.noEffect}</p>}
      <div className="grid grid-cols-2 gap-3 border-t border-dashed border-border pt-2.5">
        <CostList label={text.cost} rows={costRows((row.kCosts ?? []).map(([id, value]) => [id, value]))} />
        <CostList
          label={text.totalCost}
          rows={[...costRows(cumulativeCosts(rows, at)), ...(skillPoints ? [[text.skillPoints, `×${skillPoints}`] as [string, string]] : [])]}
        />
      </div>
    </div>
  )
}

/** The panel's first line: what kind of node it is, and its level stepper. */
function DetailHead({ label, start, stepper }: { label: string; start?: boolean; stepper?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-1.5">
      <Badge>{label}</Badge>
      {start ? <span className="text-xs text-muted-foreground">{text.startNode}</span> : null}
      {stepper ? <div className="ml-auto">{stepper}</div> : null}
    </div>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-[color:var(--arkive-filter-active)] px-1.5 text-xs font-bold leading-5 text-[color:var(--arkive-nav-active)]">
      {children}
    </span>
  )
}

function attributeRows(values: number[][], attributes: TalentCatalogDocument['attributes']): Array<[string, string]> {
  return values.map(([id, value]) => {
    const attribute = attributes.find((candidate) => candidate.iID === id)
    return [attribute?.name?.['zh-CN'] ?? attribute?.kVariable ?? String(id), `+${value}`]
  })
}

/** What a node adds, one attribute a line with its value set large on the right. */
function ValueList({ label, rows }: { label: string; rows: Array<[string, string]> }) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold text-muted-foreground">{label}</h4>
      <dl className="flex flex-col divide-y divide-border rounded-lg bg-card px-3 shadow-[0_0_0_1px_var(--border)]">
        {rows.map(([name, value]) => (
          <div key={name} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-sm text-foreground/80">{name}</dt>
            <dd className="text-base font-bold tabular-nums text-[color:var(--ro3-stage)]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function CostList({ label, rows }: { label: string; rows: Array<[string, string]> }) {
  if (rows.length === 0) return null
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <h4 className="text-xs font-semibold text-muted-foreground">{label}</h4>
      <ul className="flex flex-col gap-0.5 text-sm">
        {rows.map(([name, value]) => (
          <li key={name} className="flex items-baseline justify-between gap-2">
            <span className="truncate text-foreground/80">{name}</span>
            <span className="shrink-0 font-semibold tabular-nums">{value}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
/** What a gate opens for the picked class: three branches, each a head and its follow-ups. */
function GateDetail({ gate, nodeById, levelById, effectById, jobClass }: {
  gate: TalentNodeRecord
  nodeById: Map<number, TalentNodeRecord>
  levelById: Map<number, TalentLevelRecord>
  effectById: Map<number, string>
  jobClass: TalentClass
}) {
  const branches = gateBranches(gate, nodeById)
    .map((branch) => ({
      head: classRow(branch.head, levelById, jobClass.jobId),
      children: branch.children.flatMap((child) => classRow(child, levelById, jobClass.jobId) ?? []),
    }))
  const known = branches.filter((branch) => branch.head)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-8 flex-wrap items-center gap-1.5">
        <Badge>{text.gate}</Badge>
        <img src={stageEmblem(jobClass.stageId)} alt="" className="size-6 object-contain" />
        <span className="text-sm font-semibold">{classLabel(jobClass)}</span>
      </div>
      {known.length === 0 ? <p className="text-sm text-muted-foreground">{text.noBranches}</p> : (
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-1">
          {branches.map((branch, index) => (
            <div key={branch.head?.iId ?? `empty-${index}`} className="flex flex-col gap-1.5 rounded-lg bg-card p-2 shadow-[0_0_0_1px_var(--border)]">
              {branch.head ? (
                <>
                  <JobTalent row={branch.head} effectById={effectById} lead />
                  {branch.children.map((child) => <JobTalent key={child.iId} row={child} effectById={effectById} />)}
                </>
              ) : <p className="text-sm text-muted-foreground">{text.noBranch}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function JobTalent({ row, effectById, lead }: { row: TalentLevelRecord; effectById: Map<number, string>; lead?: boolean }) {
  const effects = (row.kSpecialEffectList ?? []).flatMap((id) => effectById.get(id) || [])
  return (
    <div className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-2', !lead && 'border-t border-dashed border-border pt-1.5')}>
      <span className={cn('grid place-items-center overflow-hidden rounded-lg bg-muted', lead ? 'size-9' : 'size-7')}>
        {row.icon ? <TalentArt icon={row.icon} /> :<Sparkles aria-hidden="true" className="size-4 text-muted-foreground" />}
      </span>
      <div className="flex min-w-0 flex-col">
        <b className={cn('font-bold', lead ? 'text-sm' : 'text-xs')}>{row.name?.['zh-CN'] ?? row.iId}</b>
        <p className="whitespace-pre-line text-xs leading-relaxed text-foreground/80">
          {effects.length > 0 ? effects.map((desc, index) => (
            <Fragment key={index}>{index > 0 ? '\n' : null}<GameText value={desc} /></Fragment>
          )) : <span className="text-muted-foreground">{text.noDesc}</span>}
        </p>
      </div>
    </div>
  )
}

/** The star board: four columns, laid out by each node's iPos. */
function PatronBoard({ talents, nodeIds, tabs, tabsLabel }: { talents: TalentCatalogDocument; nodeIds: number[]; tabs: ReactNode; tabsLabel: string }) {
  const nodes = useMemo(() => {
    const ids = new Set(nodeIds)
    return talents.patronTalents.nodes.filter((node) => ids.has(node.iID))
  }, [talents, nodeIds])
  const attrById = useMemo(() => new Map(talents.patronTalents.attrLevels.map((row) => [row.iID, row])), [talents])
  const [selectedId, setSelectedId] = useState<number>()
  const [levelIndexes, setLevelIndexes] = useState<Record<number, number>>({})
  const selected = nodes.find((node) => node.iID === selectedId) ?? nodes.find((node) => node.iIsStartPoint) ?? nodes[0]
  const { panelRef, areaRef, pointerRef } = usePointer(`${selected?.iID}`)
  const rows = Math.max(1, Math.ceil(Math.max(...nodes.map((node) => node.iPos)) / PATRON_COLUMNS))
  const nodeById = new Map(nodes.map((node) => [node.iID, node]))
  const links = nodes.flatMap((node) => (node.iPostTalentID ?? []).flatMap((id) => nodeById.has(id) ? [[node, nodeById.get(id)!] as const] : []))
  const point = (node: PatronTalentNodeRecord) => ({
    x: (((node.iPos - 1) % PATRON_COLUMNS) + 0.5) / PATRON_COLUMNS * 100,
    y: (Math.floor((node.iPos - 1) / PATRON_COLUMNS) + 0.5) / rows * 100,
  })

  const attrRows = (node: PatronTalentNodeRecord) => (node.kTalentAttrIds ?? []).map((id) => attrById.get(id)?.kAttrs ?? [])
  const levelCount = (node: PatronTalentNodeRecord) => Math.max(1, Math.min(node.iMaxLevel, node.kTalentAttrIds?.length || node.iSeasonPower?.length || 1))

  return (
    <BoardCard
      tabs={tabs}
      tabsLabel={tabsLabel}
      areaRef={areaRef}
      board={(
        <div className="relative mx-auto w-full max-w-2xl rounded-lg bg-[linear-gradient(160deg,var(--ro3-stage-soft),transparent_60%)]" style={{ height: `${rows * 5.5}rem` }}>
          <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
            {links.map(([from, to]) => {
              const a = point(from)
              const b = point(to)
              return (
                <line
                  key={`${from.iID}-${to.iID}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  className="stroke-[color:var(--ro3-stage-mid)] [stroke-width:5]"
                />
              )
            })}
          </svg>
          {nodes.map((node) => {
            const at = point(node)
            return (
              <div key={node.iID} className="absolute -translate-x-1/2 -translate-y-[1.4rem]" style={{ left: `${at.x}%`, top: `${at.y}%` }}>
                <Tile
                  selected={node.iID === selected?.iID}
                  onSelect={() => setSelectedId(node.iID)}
                  name={node.name?.['zh-CN'] ?? String(node.iID)}
                  badge={node.iMaxLevel > 1 ? node.iMaxLevel : undefined}
                  round={!node.icon}
                  art={node.icon ? <TalentArt icon={node.icon} /> :<PatronGlyph values={attrRows(node)[0] ?? []} />}
                />
              </div>
            )
          })}
        </div>
      )}
      detail={selected ? (
        <DetailPanel panelRef={panelRef} pointerRef={pointerRef}>
          <PatronDetail
            node={selected}
            attrRows={attrRows(selected)}
            count={levelCount(selected)}
            attributes={talents.attributes}
            index={levelIndexes[selected.iID]}
            onIndex={(next) => setLevelIndexes((previous) => ({ ...previous, [selected.iID]: next }))}
          />
        </DetailPanel>
      ) : null}
    />
  )
}

/** Plain star nodes carry no art; a glyph for what they raise stands in. */
function PatronGlyph({ values }: { values: number[][] }) {
  const id = values[0]?.[0]
  const Icon = id === 101 ? Heart : id === 105 || id === 106 ? Shield : id === 103 || id === 104 ? Swords : Star
  return <Icon aria-hidden="true" className="size-5 text-[color:var(--ro3-stage)]" />
}

function PatronDetail({ node, attrRows, count, attributes, index, onIndex }: {
  node: PatronTalentNodeRecord
  attrRows: number[][][]
  count: number
  attributes: TalentCatalogDocument['attributes']
  index?: number
  onIndex: (index: number) => void
}) {
  const last = count - 1
  const at = Math.min(index ?? last, last)
  const power = node.iSeasonPower?.[at]
  const rows = [...attributeRows(attrRows[at] ?? [], attributes), ...(power ? [[text.power, `+${power}`] as [string, string]] : [])]
  return (
    <div className="flex flex-col gap-3">
      <DetailHead
        label={node.icon ? text.core : text.starNode}
        start={!!node.iIsStartPoint}
        stepper={count > 1 ? <LevelStepper index={at} last={last} current={at + 1} top={count} onChange={onIndex} /> : null}
      />
      {rows.length > 0 ? <ValueList label={text.attributes} rows={rows} /> : <p className="text-sm text-muted-foreground">{text.noEffect}</p>}
    </div>
  )
}
function classLabel(jobClass: TalentClass): string {
  return (content.wiki.professions.stages as Record<string, string>)[jobClass.stageId] ?? jobClass.stageId
}

function lineLabel(lineId: string): string {
  return (content.wiki.professions.lines as Record<string, string>)[lineId] ?? lineId
}

/** Talent art is white glow drawn for the game's dark panels, so it sits on a dark plate. */
function TalentArt({ icon }: { icon: string }) {
  return (
    <span className="grid size-full place-items-center bg-[image:var(--ro3-talent-plate)]">
      <img src={resourceUrl(icon)} alt="" loading="lazy" className="size-[88%] object-contain" />
    </span>
  )
}
