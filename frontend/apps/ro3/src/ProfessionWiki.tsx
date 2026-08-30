import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, GitBranch, Search, Swords, X, Zap } from 'lucide-react'
import { buildProfessionStages, PROFESSION_LINES, type ProfessionSkillChoice } from './professionCatalog'
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
    <div className="ro3-shell profession-wiki" role="tabpanel">
      <header className="profession-toolbar">
        <div className="profession-line-tabs" role="tablist" aria-label={content.wiki.professions.lineLabel}>
          {PROFESSION_LINES.map((candidate) => (
            <button type="button" role="tab" key={candidate.id} aria-selected={candidate.id === line.id} className={candidate.id === line.id ? 'is-active' : undefined} onClick={() => selectLine(candidate.id)}>
              <img src={stageIcon(candidate.routes[0].stages[0].stageId)} alt="" />
              <span>{lineLabel(candidate.id)}</span>
            </button>
          ))}
        </div>
        <label className="profession-search">
          <Search aria-hidden="true" />
          <span className="sr-only">{content.wiki.professions.searchLabel}</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={content.wiki.professions.searchPlaceholder} />
          {query ? <button type="button" aria-label={content.search.clear} onClick={() => setQuery('')}><X aria-hidden="true" /></button> : null}
        </label>
      </header>

      <section className="profession-route-panel" aria-labelledby="profession-route-title">
        <header>
          <div>
            <span><GitBranch aria-hidden="true" />{content.wiki.professions.routeLabel}</span>
            <h2 id="profession-route-title">{lineLabel(line.id)}</h2>
          </div>
          <div className="profession-route-tabs" role="tablist" aria-label={content.wiki.professions.routeLabel}>
            {line.routes.map((candidate) => (
              <button type="button" role="tab" key={candidate.id} aria-selected={candidate.id === route.id} className={candidate.id === route.id ? 'is-active' : undefined} onClick={() => selectRoute(candidate.id)}>
                {routeLabel(candidate.id)}
              </button>
            ))}
          </div>
        </header>
        <div className="profession-route-track">
          {stages.map((candidate, index) => (
            <div className="profession-route-step" key={`${candidate.professionId}-${candidate.rank}`}>
              {index > 0 ? <ChevronRight aria-hidden="true" /> : null}
              <button type="button" className={index === stageIndex ? 'is-active' : undefined} aria-pressed={index === stageIndex} onClick={() => {
                setStageIndex(index)
                setSelectedSkillId(null)
              }}>
                <img src={stageIcon(candidate.stageId)} alt="" />
                <span>{content.wiki.professions.rank.replace('{rank}', String(index + 1))}</span>
                <strong>{stageLabel(candidate.stageId)}</strong>
                <small>{content.wiki.professions.newSkills.replace('{count}', String(candidate.newSkillCount))}</small>
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="profession-data-layout">
        <section className="profession-skill-panel" aria-labelledby="profession-skills-title">
          <header>
            <div>
              <span>{stage ? stageLabel(stage.stageId) : content.wiki.professions.skillsTitle}</span>
              <h3 id="profession-skills-title">{content.wiki.professions.skillsTitle}</h3>
            </div>
            <div className="profession-scope-tabs">
              <button type="button" className={scope === 'new' ? 'is-active' : undefined} onClick={() => setScope('new')}>{content.wiki.professions.newOnly}</button>
              <button type="button" className={scope === 'all' ? 'is-active' : undefined} onClick={() => setScope('all')}>{content.wiki.professions.allAvailable}</button>
            </div>
            <strong>{content.wiki.professions.resultCount.replace('{count}', String(visibleSkills.length))}</strong>
          </header>
          {dataError ? <div className="profession-empty">{content.wiki.dataError}</div> : !data ? <div className="profession-empty">{content.wiki.loading}</div> : visibleSkills.length > 0 ? (
            <div className="profession-skill-list">
              {visibleSkills.map((choice) => <ProfessionSkillRow key={choice.skillId} choice={choice} active={activeChoice?.skillId === choice.skillId} onSelect={() => setSelectedSkillId(choice.skillId)} />)}
            </div>
          ) : <div className="profession-empty">{content.wiki.professions.empty}</div>}
        </section>
        <ProfessionSkillDetail key={activeChoice?.skillId ?? 'empty'} choice={activeChoice} stageName={stage ? stageLabel(stage.stageId) : ''} data={data} />
      </div>
    </div>
  )
}

function ProfessionSkillRow({ choice, active, onSelect }: { choice: ProfessionSkillChoice; active: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={active ? 'is-active' : undefined} onClick={onSelect}>
      <span className="profession-skill-icon">
        {choice.skill?.icon ? <img src={resourceUrl(choice.skill.icon)} alt="" loading="lazy" /> : <Zap aria-hidden="true" />}
      </span>
      <span>
        <strong>{choice.skill?.name?.['zh-CN'] ?? content.wiki.professions.unknownSkill.replace('{id}', String(choice.skillId))}</strong>
        <small>{choice.inherited ? content.wiki.professions.inherited : content.wiki.professions.unlockLevel.replace('{level}', String(choice.unlockLevel))}</small>
      </span>
      <em>{content.wiki.professions.maxLevel.replace('{level}', String(choice.skill?.iMaxLevel ?? 0))}</em>
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

  if (!choice) return <aside className="profession-skill-detail"><div className="profession-empty">{content.wiki.professions.selectSkill}</div></aside>
  const currentLevel = levels?.[0]
  return (
    <aside className="profession-skill-detail" aria-label={content.wiki.professions.detailTitle}>
      <header>
        <span className="profession-detail-icon">
          {choice.skill?.icon ? <img src={resourceUrl(choice.skill.icon)} alt="" /> : <Swords aria-hidden="true" />}
        </span>
        <div>
          <span>{stageName}</span>
          <h3>{choice.skill?.name?.['zh-CN'] ?? choice.skillId}</h3>
          <small>{content.wiki.professions.skillId.replace('{id}', String(choice.skillId))}</small>
        </div>
      </header>
      <dl>
        <div><dt>{content.wiki.professions.unlock}</dt><dd>{choice.inherited ? content.wiki.professions.inherited : content.wiki.professions.jobLevel.replace('{level}', String(choice.unlockLevel))}</dd></div>
        <div><dt>{content.wiki.professions.levelCap}</dt><dd>{choice.skill?.iMaxLevel ?? content.wiki.skillDetail.unavailable}</dd></div>
      </dl>
      <section>
        <h4>{content.wiki.professions.description}</h4>
        {levelError ? <p>{content.wiki.dataError}</p> : levels === null ? <p>{content.wiki.loading}</p> : (
          <p>{stripGameMarkup(currentLevel?.desc?.['zh-CN'] ?? content.wiki.skillDetail.unavailable)}</p>
        )}
      </section>
      {levels && levels.length > 0 ? (
        <section>
          <h4>{content.wiki.professions.levelPreview}</h4>
          <div className="profession-level-preview">
            {levels.slice(0, 5).map((level) => <span key={level.iID}>{level.iLevel}</span>)}
            {levels.length > 5 ? <small>+{levels.length - 5}</small> : null}
          </div>
        </section>
      ) : null}
    </aside>
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
