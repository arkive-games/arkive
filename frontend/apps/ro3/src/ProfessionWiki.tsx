import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, Swords, Zap } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { buildProfessionStages, PROFESSION_LINES, type ProfessionSkillChoice } from './professionCatalog'
import { CatalogLayout, Chip, DetailSection, Facts, FilterRow, Notice, SearchField } from './components/wiki'
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
const NO_SKILLS: ProfessionSkillChoice[] = []

type ProfessionData = Awaited<ReturnType<typeof loadProfessionWikiData>>
type SkillKind = 'active' | 'passive'
const text = content.wiki.professions

export function ProfessionWiki() {
  const [data, setData] = useState<ProfessionData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [lineId, setLineId] = useState(PROFESSION_LINES[0].id)
  const [routeId, setRouteId] = useState(PROFESSION_LINES[0].routes[0].id)
  const [stageIndex, setStageIndex] = useState(0)
  const [query, setQuery] = useState('')
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  // Level rows by skill, filled a stage at a time; they decide active or
  // passive for the board as well as feeding the detail column.
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
  const stage = stages[Math.min(stageIndex, Math.max(stages.length - 1, 0))]
  const stageSkills = stage?.skills ?? NO_SKILLS

  useEffect(() => {
    if (!data) return
    const missing = stageSkills.filter((choice) => choice.skill && !levelRows.has(choice.skillId))
    if (missing.length === 0) return
    let active = true
    Promise.all(missing.map((choice) => loadSkillLevels(choice.skill!, data.skills.shards).then((rows) => [choice.skillId, rows] as const)))
      .then((loaded) => {
        if (!active) return
        setLevelRows((previous) => new Map([...previous, ...loaded]))
      })
      .catch(() => { if (active) setLevelError(true) })
    return () => { active = false }
  }, [data, stageSkills, levelRows])

  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visibleSkills = stageSkills.filter((choice) => !normalizedQuery
    || String(choice.skillId).includes(normalizedQuery)
    || skillName(choice).toLocaleLowerCase('zh-CN').includes(normalizedQuery))
  const fresh = visibleSkills.filter((choice) => !choice.inherited)
  const inherited = visibleSkills.filter((choice) => choice.inherited)
  const kindOf = (choice: ProfessionSkillChoice) => skillKind(levelRows.get(choice.skillId))
  const kindsKnown = fresh.every((choice) => levelRows.has(choice.skillId) || !choice.skill)
  const freshGroups: Array<{ key: string; title: string; skills: ProfessionSkillChoice[] }> = kindsKnown
    ? [
        { key: 'active', title: text.activeSkills, skills: fresh.filter((choice) => kindOf(choice) === 'active') },
        { key: 'passive', title: text.passiveSkills, skills: fresh.filter((choice) => kindOf(choice) === 'passive') },
      ]
    : [{ key: 'new', title: text.newSkillsTitle, skills: fresh }]

  const activeChoice = stageSkills.find((choice) => choice.skillId === selectedSkillId)
    ?? fresh[0]
    ?? visibleSkills[0]
    ?? null

  const resetSelection = () => {
    setSelectedSkillId(null)
    setDetailOpen(false)
  }

  const selectLine = (nextLineId: string) => {
    const nextLine = PROFESSION_LINES.find((candidate) => candidate.id === nextLineId) ?? PROFESSION_LINES[0]
    setLineId(nextLine.id)
    setRouteId(nextLine.routes[0].id)
    setStageIndex(0)
    resetSelection()
  }

  const selectRoute = (nextRouteId: string) => {
    setRouteId(nextRouteId)
    setStageIndex(0)
    resetSelection()
  }

  const selectSkill = (skillId: number) => {
    setSelectedSkillId(skillId)
    setDetailOpen(true)
  }

  const tile = (choice: ProfessionSkillChoice, compact = false) => (
    <SkillTile
      key={choice.skillId}
      choice={choice}
      kind={levelRows.has(choice.skillId) ? kindOf(choice) : undefined}
      compact={compact}
      active={activeChoice?.skillId === choice.skillId}
      onSelect={() => selectSkill(choice.skillId)}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      {/* The six classes as portraits: one scrolling strip on a phone. */}
      <div
        role="tablist"
        aria-label={text.lineLabel}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-6 sm:overflow-visible sm:px-0 sm:pb-0"
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
                'flex min-w-24 shrink-0 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 transition-colors',
                selected
                  ? 'border-primary bg-primary text-primary-foreground shadow-md'
                  : 'border-border bg-card hover:border-primary/60',
              )}
            >
              <span className={cn('grid size-14 place-items-center rounded-full', selected ? 'bg-primary-foreground/15' : 'bg-muted')}>
                <img src={stageIcon(candidate.routes[0].stages[0].stageId)} alt="" className="size-11 object-contain" />
              </span>
              <span className="text-sm font-semibold">{lineLabel(candidate.id)}</span>
              <span className={cn('text-xs', selected ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                {text.routeCount.replace('{count}', String(candidate.routes.length))}
              </span>
            </button>
          )
        })}
      </div>

      <section aria-label={text.pathTitle} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">{text.pathTitle}</h2>
          <FilterRow label={text.routeLabel}>
            {line.routes.map((candidate) => (
              <Chip key={candidate.id} active={candidate.id === route.id} onClick={() => selectRoute(candidate.id)}>
                {routeLabel(candidate.id)}
              </Chip>
            ))}
          </FilterRow>
        </div>

        {/* A track from first to last advancement, filled up to the stage on show. */}
        <ol className="relative grid grid-cols-4" aria-label={text.pathTitle}>
          <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-8 h-1 -translate-y-1/2 rounded-full bg-border" />
          <span
            aria-hidden="true"
            className="absolute left-[12.5%] top-8 h-1 -translate-y-1/2 rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${(Math.min(stageIndex, stages.length - 1) / Math.max(stages.length - 1, 1)) * 75}%` }}
          />
          {stages.map((candidate, index) => {
            const selected = index === stageIndex
            const reached = index <= stageIndex
            return (
              <li key={`${candidate.professionId}-${candidate.rank}`} className="relative flex justify-center">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setStageIndex(index)
                    resetSelection()
                  }}
                  className="group flex flex-col items-center gap-1 text-center"
                >
                  <span
                    className={cn(
                      'relative grid size-16 place-items-center rounded-full border-2 bg-card transition-transform',
                      selected ? 'scale-110 border-primary ring-4 ring-primary/15' : reached ? 'border-primary/70' : 'border-border group-hover:border-primary/60',
                    )}
                  >
                    <img src={stageIcon(candidate.stageId)} alt="" className="size-12 object-contain" />
                  </span>
                  <span className="mt-1 text-xs text-muted-foreground">{advancementLabel(index)}</span>
                  <strong className={cn('text-sm font-semibold', selected && 'text-primary')}>{stageLabel(candidate.stageId)}</strong>
                  <span className="text-xs text-muted-foreground">{text.newSkills.replace('{count}', String(candidate.newSkillCount))}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>

      <CatalogLayout
        detailLabel={text.detailTitle}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        list={
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="flex items-baseline gap-2 text-lg font-semibold">
                {text.stageSkills.replace('{stage}', stage ? stageLabel(stage.stageId) : '')}
                <span className="text-sm font-normal text-muted-foreground">{text.resultCount.replace('{count}', String(visibleSkills.length))}</span>
              </h2>
              <SearchField
                className="sm:w-64"
                value={query}
                onChange={setQuery}
                label={text.searchLabel}
                placeholder={text.searchPlaceholder}
              />
            </div>
            {dataError ? <Notice>{content.wiki.dataError}</Notice> : !data ? <Notice>{content.wiki.loading}</Notice> : visibleSkills.length === 0 ? (
              <Notice>{text.empty}</Notice>
            ) : (
              <>
                {freshGroups.filter((group) => group.skills.length > 0).map((group) => (
                  <SkillGroup key={group.key} title={group.title} count={group.skills.length}>
                    {group.skills.map((choice) => tile(choice))}
                  </SkillGroup>
                ))}
                {inherited.length > 0 ? (
                  <details className="group/inherited rounded-lg border border-dashed border-border px-3 py-2">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-muted-foreground">
                      <ChevronDown aria-hidden="true" className="size-4 -rotate-90 transition-transform group-open/inherited:rotate-0" />
                      {text.inheritedTitle}
                      <span className="font-normal">{inherited.length}</span>
                    </summary>
                    <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))]">
                      {inherited.map((choice) => tile(choice, true))}
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </>
        }
        detail={
          <SkillDetail
            key={activeChoice?.skillId ?? 'empty'}
            choice={activeChoice}
            stageName={stage ? stageLabel(stage.stageId) : ''}
            levels={activeChoice ? levelRows.get(activeChoice.skillId) : undefined}
            levelError={levelError}
          />
        }
      />
    </div>
  )
}

function SkillGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        {title}
        <span className="font-normal">{count}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]">{children}</div>
    </section>
  )
}

function SkillTile({ choice, kind, compact, active, onSelect }: {
  choice: ProfessionSkillChoice
  kind?: SkillKind
  compact: boolean
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 flex-col items-center gap-1.5 rounded-lg border bg-card text-center transition-colors',
        compact ? 'p-2 opacity-85' : 'p-3',
        active ? 'border-ring bg-[color:var(--arkive-filter-active)] opacity-100' : 'border-border hover:border-primary/60',
      )}
    >
      <span className="relative">
        <SkillIcon choice={choice} kind={kind} className={compact ? 'size-11' : 'size-14'} />
        {choice.skill?.iMaxLevel ? (
          <span className="absolute -bottom-1 -right-1.5 rounded-full border border-card bg-foreground px-1.5 text-xs font-semibold leading-tight text-background">
            {choice.skill.iMaxLevel}
          </span>
        ) : null}
      </span>
      <strong className="w-full truncate text-sm font-semibold">{skillName(choice)}</strong>
      {compact ? null : (
        <span className="text-xs text-muted-foreground">{text.unlockShort.replace('{level}', String(choice.unlockLevel))}</span>
      )}
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
      <header className="flex items-center gap-4 border-b border-border pb-4">
        {choice.skill?.icon ? (
          <SkillIcon choice={choice} kind={kind} className="size-16" />
        ) : (
          <span className="grid size-16 place-items-center rounded-xl bg-muted"><Swords aria-hidden="true" className="size-6 text-muted-foreground" /></span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-[color:var(--arkive-nav-active)]">{stageName}</span>
          <h3 className="text-xl font-semibold">{skillName(choice)}</h3>
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

function stageIcon(stageId: string): string {
  return resourceUrl(`icons/jobs/icon_job_${STAGE_ICON_SLUGS[stageId] ?? 'null'}.webp`)
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
