import { Fragment, useEffect, useMemo, useState } from 'react'
import { Minus, Plus, Zap } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { buildProfessionStages, PROFESSION_LINES, type ProfessionSkillChoice, type ProfessionStageData } from './professionCatalog'
import { Chip, Notice, SearchField } from './components/wiki'
import { loadProfessionWikiData, loadSkillLevels, type SkillLevelRow } from './wikiData'
import { resourceUrl } from './lib/urls'
import content from './locales/zh-CN.json'

const STAGE_ICON_SLUGS: Record<string, string> = {
  swordman: 'swordman',
  knight: 'knight',
  lordKnight: 'lordknight',
  runeKnight: 'runeknight',
  crusader: 'crusader',
  paladin: 'paladin',
  royalGuard: 'royalguard',
  magician: 'magician',
  wizard: 'wizard',
  highWizard: 'highwizard',
  warlock: 'warlock',
  archer: 'archer',
  hunter: 'hunter',
  sniper: 'sniper',
  ranger: 'ranger',
  acolyte: 'acolyte',
  priest: 'priest',
  highPriest: 'highpriest',
  archBishop: 'arcbeeshop',
  thief: 'thief',
  assassin: 'assassin',
  assassinCross: 'assasincross',
  guillotineCross: 'guillotinecross',
  merchant: 'merchant',
  blacksmith: 'blacksmith',
  whitesmith: 'mastersmith',
  mechanic: 'mechanic',
}

/** The skill table's own category code for a passive skill. */
const PASSIVE_CATEGORY = 1001

type ProfessionData = Awaited<ReturnType<typeof loadProfessionWikiData>>
type SkillKind = 'active' | 'passive'
const text = content.wiki.professions

/**
 * A whole advancement route read top to bottom: pick a class and a branch, and
 * each stage from first job to third follows as a band of skill cards, in the
 * order a player unlocks them. Every card carries its own level stepper, so
 * the numbers can be read without leaving the page.
 */
export function ProfessionWiki() {
  const [data, setData] = useState<ProfessionData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [lineId, setLineId] = useState(PROFESSION_LINES[0].id)
  const [routeId, setRouteId] = useState(PROFESSION_LINES[0].routes[0].id)
  const [query, setQuery] = useState('')
  // Level rows by skill, filled a route at a time; every card reads them.
  const [levelRows, setLevelRows] = useState<Map<number, SkillLevelRow[]>>(() => new Map())
  const [levelError, setLevelError] = useState(false)

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

  const line = PROFESSION_LINES.find((candidate) => candidate.id === lineId) ?? PROFESSION_LINES[0]
  const route = line.routes.find((candidate) => candidate.id === routeId) ?? line.routes[0]
  const skillIndex = useMemo(() => new Map(data?.skills.skills.map((skill) => [skill.iSkillID, skill]) ?? []), [data])
  // Left to the React Compiler to memoise: the level effect below reruns on
  // a new array, and only fetches what is still missing when it does.
  const stages = buildProfessionStages(route, data?.jobSkills.jobSkills ?? [], skillIndex)
  const routeSkills = stages.flatMap((stage) => stage.skills.filter((choice) => !choice.inherited))

  useEffect(() => {
    if (!data) return
    const missing = routeSkills.filter((choice) => choice.skill && !levelRows.has(choice.skillId))
    if (missing.length === 0) return
    let active = true
    Promise.all(missing.map((choice) => loadSkillLevels(choice.skill!, data.skills.shards).then((rows) => [choice.skillId, rows] as const)))
      .then((loaded) => {
        if (!active) return
        setLevelRows((previous) => new Map([...previous, ...loaded]))
      })
      .catch(() => { if (active) setLevelError(true) })
    return () => { active = false }
  }, [data, routeSkills, levelRows])

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <div
          role="tablist"
          aria-label={text.lineLabel}
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
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
                  'flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-3.5 text-sm font-semibold transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-card hover:border-primary/60',
                )}
              >
                <img src={stageEmblem(candidate.routes[0].stages[0].stageId)} alt="" className="size-7 object-contain" />
                {lineLabel(candidate.id)}
              </button>
            )
          })}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div role="group" aria-label={text.routeLabel} className="flex flex-wrap gap-1.5">
            {line.routes.map((candidate) => (
              <Chip key={candidate.id} active={candidate.id === route.id} onClick={() => setRouteId(candidate.id)}>
                {routeLabel(candidate.id)}
              </Chip>
            ))}
          </div>
          <SearchField
            className="sm:w-64"
            value={query}
            onChange={setQuery}
            label={text.searchLabel}
            placeholder={text.searchPlaceholder}
          />
        </div>
      </div>

      {dataError ? <Notice>{content.wiki.dataError}</Notice> : !data ? <Notice>{content.wiki.loading}</Notice> : normalizedQuery && matchCount === 0 ? (
        <Notice>{text.empty}</Notice>
      ) : (
        <ol aria-label={text.pathTitle} className="flex flex-col gap-6">
          {stages.map((stage, index) => (
            <StageBand
              key={`${stage.professionId}-${stage.rank}`}
              stage={stage}
              index={index}
              matches={matches}
              levelRows={levelRows}
              levelError={levelError}
            />
          ))}
        </ol>
      )}
    </div>
  )
}

/** One advancement: a slim heading, then the skills it adds as cards, actives first. */
function StageBand({ stage, index, matches, levelRows, levelError }: {
  stage: ProfessionStageData
  index: number
  matches: (choice: ProfessionSkillChoice) => boolean
  levelRows: Map<number, SkillLevelRow[]>
  levelError: boolean
}) {
  const fresh = stage.skills.filter((choice) => !choice.inherited && matches(choice))
  const kindOf = (choice: ProfessionSkillChoice) => levelRows.has(choice.skillId) ? skillKind(levelRows.get(choice.skillId)) : undefined
  // A stable sort: passives drop behind the actives, each kind keeping unlock order.
  const ordered = [...fresh].sort((a, b) => Number(kindOf(a) === 'passive') - Number(kindOf(b) === 'passive'))
  if (ordered.length === 0) return null

  return (
    <li className="flex flex-col gap-3">
      <header className="flex items-center gap-2.5">
        <img src={stageEmblem(stage.stageId)} alt="" className="size-9 shrink-0 object-contain" />
        <span className="rounded-md bg-[color:var(--arkive-filter-active)] px-1.5 py-0.5 text-xs font-semibold text-[color:var(--arkive-nav-active)]">
          {advancementLabel(index)}
        </span>
        <h3 className="text-lg font-bold">{stageLabel(stage.stageId)}</h3>
        <span className="text-xs text-muted-foreground">{text.newSkills.replace('{count}', String(stage.newSkillCount))}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </header>
      <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {ordered.map((choice) => (
          <li key={choice.skillId} className="flex">
            <SkillCard choice={choice} levels={levelRows.get(choice.skillId)} levelError={levelError} />
          </li>
        ))}
      </ul>
    </li>
  )
}

/**
 * A skill read in place: its facts on one line, a level stepper, and the
 * description of the level the stepper is on.
 */
function SkillCard({ choice, levels, levelError }: {
  choice: ProfessionSkillChoice
  levels?: SkillLevelRow[]
  levelError: boolean
}) {
  const [levelIndex, setLevelIndex] = useState(0)
  const level = levels?.[Math.min(levelIndex, levels.length - 1)]
  const kind = levels ? skillKind(levels) : undefined
  const first = levels?.[0]
  const element = first?.iEleType ? (text.elements as Record<string, string>)[String(first.iEleType)] : undefined
  const lastIndex = (levels?.length ?? 1) - 1
  const facts = [
    text.jobLevel.replace('{level}', String(choice.unlockLevel)),
    ...(element ? [element] : []),
    ...(level?.iDistanceMax ? [`${text.range} ${text.meters.replace('{value}', formatNumber(level.iDistanceMax / 100))}`] : []),
    ...(level?.iCD ? [`${text.cooldown} ${text.seconds.replace('{value}', formatNumber(level.iCD / 1000))}`] : []),
  ]

  return (
    <article className="flex w-full flex-col gap-2.5 rounded-xl border border-border bg-card p-3">
      <header className="flex items-start gap-2.5">
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted">
          {choice.skill?.icon ? (
            <img src={resourceUrl(choice.skill.icon)} alt="" loading="lazy" className="size-full object-contain" />
          ) : <Zap aria-hidden="true" className="size-5 text-muted-foreground" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <h4 className="truncate text-base font-semibold">{skillName(choice)}</h4>
            {kind ? (
              <span
                className={cn(
                  'shrink-0 rounded px-1 text-xs font-medium',
                  kind === 'passive' ? 'bg-muted text-muted-foreground' : 'bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]',
                )}
              >
                {kind === 'passive' ? text.kindPassive : text.kindActive}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{facts.join(' · ')}</p>
        </div>
        {levels && levels.length > 1 ? (
          <div role="group" aria-label={text.levelPicker} className="flex shrink-0 items-center rounded-lg border border-border">
            <button
              type="button"
              aria-label={text.levelDown}
              disabled={levelIndex === 0}
              onClick={() => setLevelIndex((value) => Math.max(0, value - 1))}
              className="grid size-7 place-items-center rounded-l-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Minus aria-hidden="true" className="size-3.5" />
            </button>
            <span aria-live="polite" className="min-w-14 text-center text-xs font-semibold tabular-nums">
              Lv.{level?.iLevel}<span className="font-normal text-muted-foreground">/{levels[lastIndex].iLevel}</span>
            </span>
            <button
              type="button"
              aria-label={text.levelUp}
              disabled={levelIndex >= lastIndex}
              onClick={() => setLevelIndex((value) => Math.min(lastIndex, value + 1))}
              className="grid size-7 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <Plus aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        ) : null}
      </header>
      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
        {levelError ? content.wiki.dataError : !levels ? content.wiki.loading : (
          <GameText value={level?.desc?.['zh-CN'] ?? content.wiki.skillDetail.unavailable} />
        )}
      </p>
    </article>
  )
}

/**
 * The game's rich text: the values it colours are the ones that grow with the
 * level, so they keep an emphasis -- in the theme's accent rather than the
 * game's own hex, which is unreadable on a dark page.
 */
function GameText({ value }: { value: string }) {
  const plain = value
    .replace(/<link(?:=[^>]*)?>/gi, '')
    .replace(/<\/link>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
  const parts = plain.split(/<color(?:=[^>]*)?>([\s\S]*?)<\/color>/gi)
  return (
    <>
      {parts.map((part, index) => index % 2 === 1 ? (
        <b key={index} className="font-semibold text-[color:var(--arkive-nav-active)]">{part}</b>
      ) : <Fragment key={index}>{part.replace(/<\/?color(?:=[^>]*)?>/gi, '')}</Fragment>)}
    </>
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

function stageEmblem(stageId: string): string {
  return resourceUrl(`icons/jobs/emblems/${STAGE_ICON_SLUGS[stageId] ?? 'novice'}.webp`)
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
