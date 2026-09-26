import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Swords, Zap } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { buildProfessionStages, PROFESSION_LINES, type ProfessionSkillChoice } from './professionCatalog'
import { Chip, DetailPanel, DetailSection, Facts, FilterRow, IconTile, Notice, Panel, SearchField, Tab, TabRow } from './components/wiki'
import { loadProfessionWikiData, loadSkillLevels, type SkillLevelRow } from './wikiData'
import { resourceUrl } from './lib/urls'
import { stripGameMarkup } from './cardCatalog'
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

type ProfessionData = Awaited<ReturnType<typeof loadProfessionWikiData>>
type Scope = 'new' | 'all'

export function ProfessionWiki() {
  const [data, setData] = useState<ProfessionData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [lineId, setLineId] = useState(PROFESSION_LINES[0].id)
  const [routeId, setRouteId] = useState(PROFESSION_LINES[0].routes[0].id)
  const [stageIndex, setStageIndex] = useState(0)
  const [scope, setScope] = useState<Scope>('new')
  const [query, setQuery] = useState('')
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null)

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
  const stages = buildProfessionStages(route, data?.jobSkills.jobSkills ?? [], skillIndex)
  const stage = stages[Math.min(stageIndex, Math.max(stages.length - 1, 0))]
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN')
  const visibleSkills = (stage?.skills ?? []).filter((choice) => {
    if (scope === 'new' && choice.inherited) return false
    if (!normalizedQuery) return true
    return String(choice.skillId).includes(normalizedQuery)
      || choice.skill?.name?.['zh-CN']?.toLocaleLowerCase('zh-CN').includes(normalizedQuery)
  })
  const activeChoice = (stage?.skills ?? []).find((choice) => choice.skillId === selectedSkillId)
    ?? visibleSkills[0]
    ?? null

  const selectLine = (nextLineId: string) => {
    const nextLine = PROFESSION_LINES.find((candidate) => candidate.id === nextLineId) ?? PROFESSION_LINES[0]
    setLineId(nextLine.id)
    setRouteId(nextLine.routes[0].id)
    setStageIndex(0)
    setSelectedSkillId(null)
  }

  const selectRoute = (nextRouteId: string) => {
    setRouteId(nextRouteId)
    setStageIndex(0)
    setSelectedSkillId(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        {/* One scrolling row on a phone, rather than six tabs folded into three. */}
        <TabRow label={content.wiki.professions.lineLabel} className="flex-nowrap overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
          {PROFESSION_LINES.map((candidate) => (
            <Tab key={candidate.id} active={candidate.id === line.id} onClick={() => selectLine(candidate.id)}>
              <img src={stageIcon(candidate.routes[0].stages[0].stageId)} alt="" className="size-6 object-contain" />
              {lineLabel(candidate.id)}
            </Tab>
          ))}
        </TabRow>
        <SearchField
          className="lg:w-72"
          value={query}
          onChange={setQuery}
          label={content.wiki.professions.searchLabel}
          placeholder={content.wiki.professions.searchPlaceholder}
        />
      </div>

      <FilterRow label={content.wiki.professions.routeLabel}>
        {line.routes.map((candidate) => (
          <Chip key={candidate.id} active={candidate.id === route.id} onClick={() => selectRoute(candidate.id)}>
            {routeLabel(candidate.id)}
          </Chip>
        ))}
      </FilterRow>

      {/* The advancement path reads left to right, one card per stage. */}
      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label={content.wiki.progressionTitle}>
        {stages.map((candidate, index) => (
          <li key={`${candidate.professionId}-${candidate.rank}`} className="relative">
            <button
              type="button"
              aria-pressed={index === stageIndex}
              onClick={() => {
                setStageIndex(index)
                setSelectedSkillId(null)
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                index === stageIndex
                  ? 'border-ring bg-[color:var(--arkive-filter-active)]'
                  : 'border-border bg-card hover:border-primary/60',
              )}
            >
              <img src={stageIcon(candidate.stageId)} alt="" className="size-10 shrink-0 object-contain" />
              <span className="flex min-w-0 flex-col">
                <span className="text-xs text-muted-foreground">{advancementLabel(index)}</span>
                <strong className="truncate font-semibold">{stageLabel(candidate.stageId)}</strong>
                <span className="text-xs text-muted-foreground">{content.wiki.professions.newSkills.replace('{count}', String(candidate.newSkillCount))}</span>
              </span>
            </button>
            {index < stages.length - 1 ? (
              <ChevronRight aria-hidden="true" className="absolute -right-2.5 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-muted-foreground lg:block" />
            ) : null}
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel aria-label={content.wiki.professions.skillsTitle} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{content.wiki.professions.skillsTitle}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Chip active={scope === 'new'} onClick={() => setScope('new')}>{content.wiki.professions.newOnly}</Chip>
              <Chip active={scope === 'all'} onClick={() => setScope('all')}>{content.wiki.professions.allAvailable}</Chip>
              <span className="text-sm text-muted-foreground">{content.wiki.professions.resultCount.replace('{count}', String(visibleSkills.length))}</span>
            </div>
          </div>
          {dataError ? <Notice>{content.wiki.dataError}</Notice> : !data ? <Notice>{content.wiki.loading}</Notice> : visibleSkills.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleSkills.map((choice) => <ProfessionSkillRow key={choice.skillId} choice={choice} active={activeChoice?.skillId === choice.skillId} onSelect={() => setSelectedSkillId(choice.skillId)} />)}
            </div>
          ) : <Notice>{content.wiki.professions.empty}</Notice>}
        </Panel>
        <ProfessionSkillDetail key={activeChoice?.skillId ?? 'empty'} choice={activeChoice} stageName={stage ? stageLabel(stage.stageId) : ''} data={data} />
      </div>
    </div>
  )
}

function ProfessionSkillRow({ choice, active, onSelect }: { choice: ProfessionSkillChoice; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 rounded-md border p-2 text-left transition-colors',
        active ? 'border-ring bg-[color:var(--arkive-filter-active)]' : 'border-border hover:border-primary/60',
      )}
    >
      <IconTile src={choice.skill?.icon ? resourceUrl(choice.skill.icon) : undefined} fallback={<Zap aria-hidden="true" className="size-5 text-muted-foreground" />} />
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="truncate text-sm font-semibold">{choice.skill?.name?.['zh-CN'] ?? content.wiki.professions.unknownSkill.replace('{id}', String(choice.skillId))}</strong>
        <span className="text-xs text-muted-foreground">{choice.inherited ? content.wiki.professions.inherited : content.wiki.professions.unlockLevel.replace('{level}', String(choice.unlockLevel))}</span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{content.wiki.professions.maxLevel.replace('{level}', String(choice.skill?.iMaxLevel ?? 0))}</span>
    </button>
  )
}

function ProfessionSkillDetail({ choice, stageName, data }: { choice: ProfessionSkillChoice | null; stageName: string; data: ProfessionData | null }) {
  const [levels, setLevels] = useState<SkillLevelRow[] | null>(null)
  const [levelError, setLevelError] = useState(false)

  useEffect(() => {
    let active = true
    if (!choice?.skill || !data) return
    loadSkillLevels(choice.skill, data.skills.shards)
      .then((rows) => { if (active) setLevels(rows) })
      .catch(() => { if (active) setLevelError(true) })
    return () => { active = false }
  }, [choice, data])

  if (!choice) {
    return <DetailPanel label={content.wiki.professions.detailTitle}><Notice>{content.wiki.professions.selectSkill}</Notice></DetailPanel>
  }
  const currentLevel = levels?.[0]
  return (
    <DetailPanel label={content.wiki.professions.detailTitle}>
      <header className="flex items-center gap-3 border-b border-border pb-4">
        <IconTile
          className="size-14"
          src={choice.skill?.icon ? resourceUrl(choice.skill.icon) : undefined}
          fallback={<Swords aria-hidden="true" className="size-6 text-muted-foreground" />}
        />
        <div className="flex min-w-0 flex-col">
          <span className="text-xs text-[color:var(--arkive-nav-active)]">{stageName}</span>
          <h3 className="text-lg font-semibold">{choice.skill?.name?.['zh-CN'] ?? choice.skillId}</h3>
          <span className="text-xs text-muted-foreground">{content.wiki.professions.skillId.replace('{id}', String(choice.skillId))}</span>
        </div>
      </header>
      <Facts
        items={[
          { label: content.wiki.professions.unlock, value: choice.inherited ? content.wiki.professions.inherited : content.wiki.professions.jobLevel.replace('{level}', String(choice.unlockLevel)) },
          { label: content.wiki.professions.levelCap, value: choice.skill?.iMaxLevel ?? content.wiki.skillDetail.unavailable },
        ]}
      />
      <DetailSection title={content.wiki.professions.description}>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {levelError ? content.wiki.dataError : levels === null ? content.wiki.loading : stripGameMarkup(currentLevel?.desc?.['zh-CN'] ?? content.wiki.skillDetail.unavailable)}
        </p>
      </DetailSection>
      {levels && levels.length > 0 ? (
        <DetailSection title={content.wiki.professions.levelPreview}>
          <div className="flex flex-wrap gap-1.5">
            {levels.slice(0, 10).map((level) => (
              <span key={level.iID} className="grid min-w-8 place-items-center rounded-md border border-border px-2 py-1 text-xs">{level.iLevel}</span>
            ))}
            {levels.length > 10 ? <span className="px-1 py-1 text-xs text-muted-foreground">+{levels.length - 10}</span> : null}
          </div>
        </DetailSection>
      ) : null}
    </DetailPanel>
  )
}

function stageIcon(stageId: string): string {
  return resourceUrl(`icons/jobs/icon_job_${STAGE_ICON_SLUGS[stageId] ?? 'null'}.webp`)
}

function lineLabel(lineId: string): string {
  return (content.wiki.professions.lines as Record<string, string>)[lineId] ?? lineId
}

function routeLabel(routeId: string): string {
  return (content.wiki.professions.routes as Record<string, string>)[routeId] ?? routeId
}

function stageLabel(stageId: string): string {
  return (content.wiki.professions.stages as Record<string, string>)[stageId] ?? stageId
}

function advancementLabel(index: number): string {
  return content.wiki.professions.advancementLabels[index] ?? content.wiki.professions.rank.replace('{rank}', String(index + 1))
}
