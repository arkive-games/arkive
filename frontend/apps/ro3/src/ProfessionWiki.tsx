import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronRight, Swords, Zap } from 'lucide-react'
import { cn, Dialog, DialogContent, DialogTitle } from '@gamemap/ui'
import { buildProfessionStages, PROFESSION_LINES, type ProfessionSkillChoice, type ProfessionStageData } from './professionCatalog'
import { Chip, DetailSection, Facts, Notice, SearchField } from './components/wiki'
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

/** Rank-4 jobs without art of their own show the rank-3 job they grow from. */
const STAGE_ART: Record<string, string> = {
  lordKnight: 'knight',
  paladin: 'crusader',
  highWizard: 'wizard',
  sniper: 'hunter',
  highPriest: 'priest',
  assassinCross: 'assassin',
  whitesmith: 'blacksmith',
}

/** The skill table's own category code for a passive skill. */
const PASSIVE_CATEGORY = 1001

type ProfessionData = Awaited<ReturnType<typeof loadProfessionWikiData>>
type SkillKind = 'active' | 'passive'
const text = content.wiki.professions

interface Selection {
  choice: ProfessionSkillChoice
  stageId: string
}

/**
 * A whole advancement route on one board: pick a class and a branch, and every
 * stage from first job to third stands side by side with the skills it adds,
 * in the order a player unlocks them. A skill opens in a dialog.
 */
export function ProfessionWiki() {
  const [data, setData] = useState<ProfessionData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [lineId, setLineId] = useState(PROFESSION_LINES[0].id)
  const [routeId, setRouteId] = useState(PROFESSION_LINES[0].routes[0].id)
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  // Level rows by skill, filled a route at a time; they decide active or
  // passive on the board as well as feeding the dialog.
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
    || String(choice.skillId).includes(normalizedQuery)
    || skillName(choice).toLocaleLowerCase('zh-CN').includes(normalizedQuery)
  const matchCount = routeSkills.filter(matches).length

  const selectLine = (nextLineId: string) => {
    const nextLine = PROFESSION_LINES.find((candidate) => candidate.id === nextLineId) ?? PROFESSION_LINES[0]
    setLineId(nextLine.id)
    setRouteId(nextLine.routes[0].id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
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
        <ol aria-label={text.pathTitle} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {stages.map((stage, index) => (
            <StageColumn
              key={`${stage.professionId}-${stage.rank}`}
              stage={stage}
              index={index}
              matches={matches}
              kindOf={(choice) => levelRows.has(choice.skillId) ? skillKind(levelRows.get(choice.skillId)) : undefined}
              selectedId={selection?.choice.skillId}
              onSelect={(choice) => setSelection({ choice, stageId: stage.stageId })}
            />
          ))}
        </ol>
      )}

      <Dialog open={selection !== null} onOpenChange={(next) => { if (!next) setSelection(null) }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogTitle className="sr-only">{text.detailTitle}</DialogTitle>
          <div className="flex flex-col gap-4">
            {selection ? (
              <SkillDetail
                key={selection.choice.skillId}
                choice={selection.choice}
                stageName={stageLabel(selection.stageId)}
                levels={levelRows.get(selection.choice.skillId)}
                levelError={levelError}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** One advancement: its art and emblem on top, then the skills it adds. */
function StageColumn({ stage, index, matches, kindOf, selectedId, onSelect }: {
  stage: ProfessionStageData
  index: number
  matches: (choice: ProfessionSkillChoice) => boolean
  kindOf: (choice: ProfessionSkillChoice) => SkillKind | undefined
  selectedId?: number
  onSelect: (choice: ProfessionSkillChoice) => void
}) {
  const fresh = stage.skills.filter((choice) => !choice.inherited && matches(choice))
  const kindsKnown = fresh.every((choice) => kindOf(choice) || !choice.skill)
  const groups: Array<{ key: string; title?: string; skills: ProfessionSkillChoice[] }> = kindsKnown
    ? [
        { key: 'active', title: text.activeSkills, skills: fresh.filter((choice) => kindOf(choice) !== 'passive') },
        { key: 'passive', title: text.passiveSkills, skills: fresh.filter((choice) => kindOf(choice) === 'passive') },
      ]
    : [{ key: 'all', skills: fresh }]
  const name = stageLabel(stage.stageId)

  return (
    <li className="relative flex min-w-0 flex-col rounded-xl border border-border bg-card shadow-sm">
      {index > 0 ? (
        <ChevronRight aria-hidden="true" className="absolute -left-3 top-14 z-20 hidden size-5 rounded-full bg-background text-muted-foreground xl:block" />
      ) : null}
      {/* White artwork multiplied into a light sheet: it stays light in the dark theme, which the art needs. */}
      <div className="relative h-28 overflow-hidden rounded-t-xl bg-[#f7f4ee] sm:h-32">
        <img
          src={resourceUrl(`art/jobs/${STAGE_ART[stage.stageId] ?? stage.stageId}.webp`)}
          alt={name}
          loading="lazy"
          className="absolute inset-0 size-full object-contain mix-blend-multiply"
        />
        <span className="absolute left-2 top-2 rounded-full bg-neutral-900/75 px-2 py-0.5 text-xs font-semibold text-white">
          {advancementLabel(index)}
        </span>
      </div>
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <img src={stageEmblem(stage.stageId)} alt="" className="relative z-10 -mt-6 size-11 shrink-0 rounded-full bg-card object-contain p-0.5 shadow-sm ring-1 ring-border" />
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{name}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">{text.newSkills.replace('{count}', String(stage.newSkillCount))}</span>
      </header>
      <div className="flex flex-col gap-3 p-3">
        {fresh.length === 0 ? <p className="py-2 text-center text-xs text-muted-foreground">{text.empty}</p> : null}
        {groups.filter((group) => group.skills.length > 0).map((group) => (
          <section key={group.key} className="flex flex-col gap-1.5">
            {group.title ? (
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                {group.title}
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </h4>
            ) : null}
            <div className="grid grid-cols-4 gap-1 sm:grid-cols-5 md:grid-cols-4">
              {group.skills.map((choice) => (
                <SkillTile
                  key={choice.skillId}
                  choice={choice}
                  kind={kindOf(choice)}
                  active={selectedId === choice.skillId}
                  onSelect={() => onSelect(choice)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </li>
  )
}

function SkillTile({ choice, kind, active, onSelect }: {
  choice: ProfessionSkillChoice
  kind?: SkillKind
  active: boolean
  onSelect: () => void
}) {
  const name = skillName(choice)
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      title={`${name} · ${text.unlockShort.replace('{level}', String(choice.unlockLevel))}`}
      className={cn(
        'group flex min-w-0 flex-col items-center gap-1 rounded-lg p-1 text-center transition-colors',
        active ? 'bg-[color:var(--arkive-filter-active)]' : 'hover:bg-muted',
      )}
    >
      <span className="relative">
        <SkillIcon choice={choice} kind={kind} className="size-12 transition-transform group-hover:scale-105" />
        <span className="absolute -bottom-1 -right-1 rounded-full border border-card bg-foreground px-1 text-xs font-semibold leading-tight text-background tabular-nums">
          {choice.unlockLevel}
        </span>
      </span>
      <span className="w-full truncate text-xs font-medium">{name}</span>
    </button>
  )
}

/** Active skills sit in a square frame and passives in a round one, as in the game's own skill page. */
function SkillIcon({ choice, kind, className }: { choice: ProfessionSkillChoice; kind?: SkillKind; className?: string }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden border border-border bg-muted',
        kind === 'passive' ? 'rounded-full' : 'rounded-xl',
        className,
      )}
    >
      {choice.skill?.icon ? (
        <img src={resourceUrl(choice.skill.icon)} alt="" loading="lazy" className="size-full object-contain" />
      ) : <Zap aria-hidden="true" className="size-5 text-muted-foreground" />}
    </span>
  )
}

function SkillDetail({ choice, stageName, levels, levelError }: {
  choice: ProfessionSkillChoice | null
  stageName: string
  levels?: SkillLevelRow[]
  levelError: boolean
}) {
  const [levelIndex, setLevelIndex] = useState(0)

  if (!choice) return <Notice>{text.selectSkill}</Notice>

  const level = levels?.[Math.min(levelIndex, levels.length - 1)]
  const first = levels?.[0]
  const kind = levels ? skillKind(levels) : undefined
  const element = first?.iEleType ? (text.elements as Record<string, string>)[String(first.iEleType)] : undefined
  const facts = [
    { label: text.unlock, value: choice.inherited ? text.inherited : text.jobLevel.replace('{level}', String(choice.unlockLevel)) },
    { label: text.levelCap, value: choice.skill?.iMaxLevel ?? content.wiki.skillDetail.unavailable },
    ...(level?.iDistanceMax ? [{ label: text.range, value: text.meters.replace('{value}', formatNumber(level.iDistanceMax / 100)) }] : []),
    ...(level?.iCD ? [{ label: text.cooldown, value: text.seconds.replace('{value}', formatNumber(level.iCD / 1000)) }] : []),
  ]

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border pb-3">
        {choice.skill?.icon ? (
          <SkillIcon choice={choice} kind={kind} className="size-12" />
        ) : (
          <span className="grid size-12 place-items-center rounded-xl bg-muted"><Swords aria-hidden="true" className="size-5 text-muted-foreground" /></span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-[color:var(--arkive-nav-active)]">{stageName}</span>
          <h3 className="text-lg font-semibold">{skillName(choice)}</h3>
          <div className="flex flex-wrap gap-1.5">
            {kind ? <Badge>{kind === 'passive' ? text.kindPassive : text.kindActive}</Badge> : null}
            {element ? <Badge>{element}</Badge> : null}
            <span className="text-xs text-muted-foreground">{text.skillId.replace('{id}', String(choice.skillId))}</span>
          </div>
        </div>
      </header>

      <Facts items={facts} />

      {levels && levels.length > 1 ? (
        <DetailSection title={text.levelPicker}>
          <div role="radiogroup" aria-label={text.levelPicker} className="flex flex-wrap gap-1.5">
            {levels.map((row, index) => (
              <button
                key={row.iID}
                type="button"
                role="radio"
                aria-checked={index === levelIndex}
                onClick={() => setLevelIndex(index)}
                className={cn(
                  'grid size-8 place-items-center rounded-md border text-xs font-semibold transition-colors',
                  index === levelIndex ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/60',
                )}
              >
                {row.iLevel}
              </button>
            ))}
          </div>
        </DetailSection>
      ) : null}

      <DetailSection title={level ? text.levelDescription.replace('{level}', String(level.iLevel)) : text.description}>
        <p className="whitespace-pre-line text-sm leading-relaxed">
          {levelError ? content.wiki.dataError : !levels ? content.wiki.loading : (
            <GameText value={level?.desc?.['zh-CN'] ?? content.wiki.skillDetail.unavailable} />
          )}
        </p>
      </DetailSection>
    </>
  )
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded bg-[color:var(--arkive-filter-active)] px-1.5 py-0.5 text-xs font-medium">{children}</span>
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
