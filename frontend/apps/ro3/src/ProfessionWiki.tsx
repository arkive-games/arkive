import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Search, Zap } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { buildProfessionStages, PROFESSION_LINES, stageEmblem, type ProfessionSkillChoice, type ProfessionStageData } from './professionCatalog'
import { Notice } from './components/wiki'
import { GameText } from './components/GameText'
import { LevelStepper } from './components/LevelStepper'
import { HeaderAction } from './components/SectionNav'
import { loadProfessionWikiData, loadSkillLevels, type SkillLevelRow } from './wikiData'
import { resourceUrl } from './lib/urls'
import content from './locales/zh-CN.json'

/** The skill table's own category code for a passive skill. */
const PASSIVE_CATEGORY = 1001

type ProfessionData = Awaited<ReturnType<typeof loadProfessionWikiData>>
type SkillKind = 'active' | 'passive'
const text = content.wiki.professions

/**
 * A whole advancement route read top to bottom: pick a class and a branch, and
 * each stage from first job to third follows as one block -- its skills in a
 * row, and under them the one that is picked, at the level its stepper is on.
 */
export function ProfessionWiki() {
  const [data, setData] = useState<ProfessionData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [lineId, setLineId] = useState(PROFESSION_LINES[0].id)
  const [routeId, setRouteId] = useState(PROFESSION_LINES[0].routes[0].id)
  const [query, setQuery] = useState('')
  // On phones the search field folds behind a button in the wiki header.
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  // Level rows by skill, filled a route at a time; every block reads them.
  const [levelRows, setLevelRows] = useState<Map<number, SkillLevelRow[]>>(() => new Map())
  const [failedSkills, setFailedSkills] = useState<Set<number>>(() => new Set())

  useEffect(() => {
    let active = true
    loadProfessionWikiData()
      .then((nextData) => {
        if (!active) return
        setData(nextData)
        setDataError(false)
      })
      .catch(() => {
        if (active) setDataError(true)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus()
  }, [searchOpen])

  const line = PROFESSION_LINES.find((candidate) => candidate.id === lineId) ?? PROFESSION_LINES[0]
  const route = useMemo(() => line.routes.find((candidate) => candidate.id === routeId) ?? line.routes[0], [line, routeId])
  const skillIndex = useMemo(() => new Map(data?.skills.skills.map((skill) => [skill.iSkillID, skill]) ?? []), [data])
  const jobSkills = data?.jobSkills.jobSkills
  const stages = useMemo(
    () => buildProfessionStages(route, jobSkills ?? [], skillIndex),
    [route, jobSkills, skillIndex],
  )
  const routeSkills = useMemo(
    () => stages.flatMap((stage) => stage.skills.filter((choice) => !choice.inherited)),
    [stages],
  )

  // Each skill settles on its own, so one unreadable shard costs only its own
  // skills; those are remembered as failed rather than fetched again.
  useEffect(() => {
    if (!data) return
    const missing = routeSkills.filter((choice) => choice.skill && !levelRows.has(choice.skillId) && !failedSkills.has(choice.skillId))
    if (missing.length === 0) return
    let active = true
    Promise.allSettled(missing.map((choice) => loadSkillLevels(choice.skill!, data.skills.shards)))
      .then((results) => {
        if (!active) return
        const loaded = new Map<number, SkillLevelRow[]>()
        const failed: number[] = []
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') loaded.set(missing[index].skillId, result.value)
          else failed.push(missing[index].skillId)
        })
        if (loaded.size > 0) setLevelRows((previous) => new Map([...previous, ...loaded]))
        if (failed.length > 0) setFailedSkills((previous) => new Set([...previous, ...failed]))
      })
    return () => { active = false }
  }, [data, routeSkills, levelRows, failedSkills])

  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const matches = (choice: ProfessionSkillChoice) => !normalizedQuery
    || skillName(choice).toLocaleLowerCase('zh-CN').includes(normalizedQuery)
  const matchCount = routeSkills.filter(matches).length

  const selectLine = (nextLineId: string) => {
    const nextLine = PROFESSION_LINES.find((candidate) => candidate.id === nextLineId) ?? PROFESSION_LINES[0]
    setLineId(nextLine.id)
    setRouteId(nextLine.routes[0].id)
  }

  return (
    <div className="profession-wiki flex flex-col gap-4 md:gap-5">
      <HeaderAction>
        <button
          type="button"
          aria-label={text.searchToggle}
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((value) => !value)}
          className={cn(
            'grid size-9 place-items-center rounded-full transition-colors',
            searchOpen
              ? 'bg-foreground text-background'
              : 'bg-[image:var(--arkive-warm-search)] text-[color:var(--arkive-warm-search-foreground)] shadow-[0_0.3rem_0.8rem_rgba(236,122,28,0.28)]',
          )}
        >
          <Search aria-hidden="true" className="size-4" />
        </button>
      </HeaderAction>

      <div className="flex flex-col gap-1.5 md:gap-3">
        {/* The class is the page's main choice: a muted track whose lit pill is filled. */}
        <div className="w-full overflow-x-auto rounded-full bg-muted [scrollbar-width:none] md:w-fit md:max-w-full">
          <div role="tablist" aria-label={text.lineLabel} className="flex w-max gap-0.5 p-1">
            {PROFESSION_LINES.map((candidate) => {
              const selected = candidate.id === line.id
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => selectLine(candidate.id)}
                  className={cn(
                    'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full py-0 pl-1 pr-4 text-sm font-semibold transition-colors',
                    selected ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <img src={stageEmblem(candidate.routes[0].stages[0].stageId)} alt="" className="size-8 object-contain" />
                  {lineLabel(candidate.id)}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          {/* The branch belongs to the class, so it reads lighter: plain tabs with an underline. */}
          <div role="group" aria-label={text.routeLabel} className="-mx-2 flex overflow-x-auto [scrollbar-width:none] md:mx-0">
            {line.routes.map((candidate) => {
              const selected = candidate.id === route.id
              return (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setRouteId(candidate.id)}
                  className={cn(
                    'relative h-10 shrink-0 px-2 text-sm transition-colors after:absolute after:inset-x-2 after:bottom-1 after:h-1 after:rounded-full md:px-3 md:after:inset-x-3',
                    selected
                      ? 'font-bold text-foreground after:bg-[color:var(--ro3-stage)]'
                      : 'font-semibold text-muted-foreground hover:text-foreground',
                  )}
                >
                  {routeLabel(candidate.id)}
                </button>
              )
            })}
          </div>
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              searchInput.current?.focus()
            }}
            className={cn(
              'w-full items-center gap-2 rounded-full border border-border bg-card py-1 pl-4 pr-1 transition-shadow focus-within:ring-2 focus-within:ring-ring/40 lg:flex lg:w-[23rem]',
              searchOpen ? 'flex' : 'hidden',
            )}
          >
            <input
              ref={searchInput}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={text.searchLabel}
              placeholder={text.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              aria-label={text.searchLabel}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-[image:var(--arkive-warm-search)] text-[color:var(--arkive-warm-search-foreground)] shadow-[0_0.3rem_0.8rem_rgba(236,122,28,0.28)] transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] hover:scale-105"
            >
              <Search aria-hidden="true" className="size-4" />
            </button>
          </form>
        </div>
      </div>

      {dataError ? <Notice>{content.wiki.dataError}</Notice> : !data ? <Notice>{content.wiki.loading}</Notice> : normalizedQuery && matchCount === 0 ? (
        <Notice>{text.empty}</Notice>
      ) : (
        <ol aria-label={text.pathTitle} className="flex flex-col gap-3">
          {stages.map((stage, index) => (
            <StageBlock
              key={`${route.id}-${stage.professionId}-${stage.rank}`}
              stage={stage}
              index={index}
              matches={matches}
              levelRows={levelRows}
              failedSkills={failedSkills}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * One advancement: a plate naming it on the left (room for job art later), its
 * skills in a row, and the picked one described underneath. A rounded pointer
 * on the description's top edge sits under the picked skill.
 */
function StageBlock({ stage, index, matches, levelRows, failedSkills }: {
  stage: ProfessionStageData
  index: number
  matches: (choice: ProfessionSkillChoice) => boolean
  levelRows: Map<number, SkillLevelRow[]>
  failedSkills: Set<number>
}) {
  const [selectedId, setSelectedId] = useState<number>()
  const [levelIndexes, setLevelIndexes] = useState<Record<number, number>>({})
  const panel = useRef<HTMLDivElement>(null)
  const tiles = useRef<HTMLDivElement>(null)
  const pointer = useRef<HTMLSpanElement>(null)

  const fresh = stage.skills.filter((choice) => !choice.inherited && matches(choice))
  const kindOf = (choice: ProfessionSkillChoice) => levelRows.has(choice.skillId) ? skillKind(levelRows.get(choice.skillId)) : undefined
  // A stable sort: passives drop behind the actives, each kind keeping unlock order.
  const ordered = [...fresh].sort((a, b) => Number(kindOf(a) === 'passive') - Number(kindOf(b) === 'passive'))
  const selected = ordered.find((choice) => choice.skillId === selectedId) ?? ordered[0]

  const tileOrder = ordered.map((choice) => choice.skillId).join()

  // Written straight to the pointer's style: it follows layout, not state.
  useLayoutEffect(() => {
    const box = panel.current
    const row = tiles.current
    if (!box || !row) return
    const aim = () => {
      const tile = row.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (!tile || !pointer.current) return
      const outer = box.getBoundingClientRect()
      const inner = tile.getBoundingClientRect()
      const x = Math.max(16, Math.min(outer.width - 16, inner.left + inner.width / 2 - outer.left))
      pointer.current.style.left = `${x}px`
    }
    aim()
    const observer = new ResizeObserver(aim)
    observer.observe(box)
    row.addEventListener('scroll', aim, { passive: true })
    return () => {
      observer.disconnect()
      row.removeEventListener('scroll', aim)
    }
  }, [selected?.skillId, tileOrder])

  if (!selected) return null

  const levels = levelRows.get(selected.skillId)
  const levelIndex = Math.min(levelIndexes[selected.skillId] ?? 0, (levels?.length ?? 1) - 1)
  const setLevel = (next: number) => setLevelIndexes((previous) => ({ ...previous, [selected.skillId]: next }))

  return (
    <li className="grid overflow-hidden rounded-lg border border-border bg-card md:grid-cols-[8.5rem_minmax(0,1fr)]">
      <header className="flex items-center gap-2 border-b border-border bg-[linear-gradient(90deg,var(--ro3-stage-mid),var(--ro3-stage-soft)_70%)] px-3 py-2 md:flex-col md:justify-center md:gap-1.5 md:border-b-0 md:border-r md:bg-[linear-gradient(170deg,var(--ro3-stage-mid),var(--ro3-stage-soft)_75%)] md:px-2 md:py-3">
        <img
          src={stageEmblem(stage.stageId)}
          alt=""
          className="size-8 object-contain drop-shadow-[0_0.2rem_0.4rem_rgba(120,50,20,0.18)] md:size-[3.25rem]"
        />
        <span className="rounded-full bg-[color:var(--ro3-stage-solid)] px-2 text-xs font-bold leading-5 text-white">
          {advancementLabel(index)}
        </span>
        <h3 className="text-base font-bold md:text-lg">{stageLabel(stage.stageId)}</h3>
      </header>

      <div className="flex min-w-0 flex-col gap-2.5 p-2.5 md:px-3.5 md:pb-3.5 md:pt-3">
        <div ref={tiles} className="-mx-2.5 flex gap-1 overflow-x-auto px-2.5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {ordered.map((choice) => (
            <SkillTile
              key={choice.skillId}
              choice={choice}
              passive={kindOf(choice) === 'passive'}
              selected={choice.skillId === selected.skillId}
              onSelect={() => setSelectedId(choice.skillId)}
            />
          ))}
        </div>

        <div ref={panel} className="relative rounded-lg bg-[color:var(--ro3-skill-panel)] px-2.5 py-2.5 md:px-3">
          <span
            ref={pointer}
            aria-hidden="true"
            className="absolute -top-1.5 left-9 -ml-2 size-4 rotate-45 rounded-[0.3rem_0.2rem] bg-[color:var(--ro3-skill-panel)] transition-[left] duration-500 ease-[cubic-bezier(.34,1.4,.64,1)]"
          />
          <SkillDetail
            choice={selected}
            levels={levels}
            levelIndex={levelIndex}
            onLevel={setLevel}
            levelError={failedSkills.has(selected.skillId)}
          />
        </div>
      </div>
    </li>
  )
}

function SkillTile({ choice, passive, selected, onSelect }: {
  choice: ProfessionSkillChoice
  passive: boolean
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={skillName(choice)}
      onClick={onSelect}
      className={cn(
        'group relative flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg px-0.5 pb-1 pt-1.5 transition-colors md:w-[4.4rem]',
        selected ? 'bg-[color:var(--arkive-filter-active)]' : 'hover:bg-muted',
      )}
    >
      <span
        className={cn(
          'grid size-11 place-items-center overflow-hidden rounded-lg bg-muted transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:-translate-y-0.5',
          selected ? 'ring-2 ring-[color:var(--arkive-nav-active)]' : 'ring-1 ring-inset ring-black/5',
        )}
      >
        {choice.skill?.icon ? (
          <img src={resourceUrl(choice.skill.icon)} alt="" loading="lazy" className="size-full object-contain" />
        ) : <Zap aria-hidden="true" className="size-5 text-muted-foreground" />}
      </span>
      <span
        className={cn(
          'max-w-full truncate text-xs',
          selected ? 'font-bold text-[color:var(--arkive-nav-active)]' : 'text-muted-foreground',
        )}
      >
        {skillName(choice)}
      </span>
      {passive ? (
        <span
          title={text.kindPassive}
          className="absolute right-1 top-0.5 grid size-5 place-items-center rounded-full bg-card text-xs font-bold leading-none text-muted-foreground shadow-[0_0_0_1px_var(--border)]"
        >
          {text.passiveBadge}
        </span>
      ) : null}
    </button>
  )
}

/**
 * The picked skill, without repeating its icon or name: kind and facts on one
 * line, the level stepper at its end, then the description at that level.
 */
function SkillDetail({ choice, levels, levelIndex, onLevel, levelError }: {
  choice: ProfessionSkillChoice
  levels?: SkillLevelRow[]
  levelIndex: number
  onLevel: (index: number) => void
  levelError: boolean
}) {
  const level = levels?.[levelIndex]
  const kind = levels ? skillKind(levels) : undefined
  const first = levels?.[0]
  const element = kind === 'active' && first?.iEleType ? (text.elements as Record<string, string>)[String(first.iEleType)] : undefined
  const facts: Array<{ key: string; value: string; accent?: boolean }> = [
    { key: 'unlock', value: text.jobLevel.replace('{level}', String(choice.unlockLevel)) },
    ...(element ? [{ key: 'element', value: element, accent: true }] : []),
    ...(level?.iDistanceMax ? [{ key: 'range', value: `${text.range} ${text.meters.replace('{value}', formatNumber(level.iDistanceMax / 100))}` }] : []),
    ...(level?.iCD ? [{ key: 'cooldown', value: `${text.cooldown} ${text.seconds.replace('{value}', formatNumber(level.iCD / 1000))}` }] : []),
  ]

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1 md:gap-x-2">
          {kind ? (
            <span
              className={cn(
                'rounded-md px-1.5 text-xs font-bold leading-5',
                kind === 'passive'
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]',
              )}
            >
              {kind === 'passive' ? text.kindPassive : text.kindActive}
            </span>
          ) : null}
          {facts.map((fact, index) => (
            <Fragment key={fact.key}>
              {index > 0 ? <span aria-hidden="true" className="hidden text-xs text-muted-foreground/50 md:inline">·</span> : null}
              <span
                className={cn(
                  'whitespace-nowrap text-xs',
                  fact.accent ? 'font-semibold text-[color:var(--ro3-stage)]' : 'text-muted-foreground',
                )}
              >
                {fact.value}
              </span>
            </Fragment>
          ))}
        </div>
        {levels && levels.length > 1 ? (
          <LevelStepper index={levelIndex} last={levels.length - 1} current={levels[levelIndex].iLevel} top={levels[levels.length - 1].iLevel} onChange={onLevel} />
        ) : null}
      </div>
      <p className="min-h-[3.3em] whitespace-pre-line text-sm leading-relaxed text-foreground/85">
        {levelError ? content.wiki.dataError : !levels ? content.wiki.loading : (
          <GameText value={level?.desc?.['zh-CN'] ?? content.wiki.skillDetail.unavailable} />
        )}
      </p>
    </div>
  )
}

function skillKind(levels?: SkillLevelRow[]): SkillKind {
  return levels?.[0]?.kSkillCategory?.[0] === PASSIVE_CATEGORY ? 'passive' : 'active'
}

function skillName(choice: ProfessionSkillChoice): string {
  return choice.skill?.name?.['zh-CN'] ?? text.unknownSkill.replace('{id}', String(choice.skillId))
}

function formatNumber(value: number): string {
  return String(Math.round(value * 10) / 10)
}

function lineLabel(lineId: string): string {
  return (text.lines as Record<string, string>)[lineId] ?? lineId
}

function routeLabel(routeId: string): string {
  return (text.routes as Record<string, string>)[routeId] ?? routeId
}

function stageLabel(stageId: string): string {
  return (text.stages as Record<string, string>)[stageId] ?? stageId
}

function advancementLabel(index: number): string {
  return text.advancementLabels[index] ?? text.rank.replace('{rank}', String(index + 1))
}
