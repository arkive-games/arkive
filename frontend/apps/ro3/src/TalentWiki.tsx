import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { CircleDot, GitFork, LockKeyhole, Sparkles, Star, Zap } from 'lucide-react'
import { resourceUrl } from './lib/urls'
import {
  loadTalentWikiData,
  type PatronTalentNodeRecord,
  type TalentCatalogDocument,
  type TalentLevelRecord,
  type TalentNodeRecord,
} from './wikiData'
import content from './locales/zh-CN.json'

type TalentData = Awaited<ReturnType<typeof loadTalentWikiData>>
type TalentMode = 'season' | 'patron'

export function TalentWiki() {
  const [data, setData] = useState<TalentData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [mode, setMode] = useState<TalentMode>('season')
  const [treeId, setTreeId] = useState<number | null>(null)
  const [groupId, setGroupId] = useState<number | null>(null)
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null)
  const [selectedPatronId, setSelectedPatronId] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    loadTalentWikiData()
      .then((nextData) => {
        if (!active) return
        setData(nextData)
        setTreeId(nextData.talents.seasonTalents.trees[0]?.iId ?? null)
        setGroupId(nextData.talents.patronTalents.groups[0]?.iID ?? null)
        setDataError(false)
      })
      .catch(() => { if (active) setDataError(true) })
    return () => { active = false }
  }, [])

  const seasonNodes = useMemo(
    () => data?.talents.seasonTalents.nodes.filter((node) => node.iTalentTreeID === treeId && node.kPosition?.length === 2) ?? [],
    [data, treeId],
  )
  const activeTree = data?.talents.seasonTalents.trees.find((tree) => tree.iId === treeId)
  const activeGroup = data?.talents.patronTalents.groups.find((group) => group.iID === groupId)
  const patronNodeIds = new Set(activeGroup?.kTanlentPoints ?? [])
  const patronNodes = data?.talents.patronTalents.nodes.filter((node) => patronNodeIds.has(node.iID)) ?? []
  const selectedSeason = seasonNodes.find((node) => node.iId === selectedSeasonId) ?? seasonNodes[0] ?? null
  const selectedPatron = patronNodes.find((node) => node.iID === selectedPatronId) ?? patronNodes[0] ?? null

  return (
    <div className="ro3-shell talent-wiki" role="tabpanel">
      <header className="talent-toolbar">
        <div>
          <span><Sparkles aria-hidden="true" />{content.wiki.talents.eyebrow}</span>
          <h2>{content.wiki.talents.title}</h2>
        </div>
        <div className="talent-mode-tabs" role="tablist" aria-label={content.wiki.talents.systemLabel}>
          <button type="button" role="tab" aria-selected={mode === 'season'} className={mode === 'season' ? 'is-active' : undefined} onClick={() => setMode('season')}>
            <GitFork aria-hidden="true" />{content.wiki.talents.season}
            <small>{data?.talents.counts.seasonNodes ?? 0}</small>
          </button>
          <button type="button" role="tab" aria-selected={mode === 'patron'} className={mode === 'patron' ? 'is-active' : undefined} onClick={() => setMode('patron')}>
            <Star aria-hidden="true" />{content.wiki.talents.patron}
            <small>{data?.talents.counts.patronNodes ?? 0}</small>
          </button>
        </div>
      </header>

      {dataError ? <div className="talent-empty">{content.wiki.dataError}</div> : !data ? <div className="talent-empty">{content.wiki.loading}</div> : mode === 'season' ? (
        <div className="talent-system-layout">
          <section className="talent-tree-panel" aria-labelledby="season-tree-title">
            <header>
              <div>
                <span>{content.wiki.talents.treeLabel}</span>
                <h3 id="season-tree-title">{activeTree?.name?.['zh-CN'] ?? content.wiki.talents.season}</h3>
              </div>
              <div className="talent-tree-tabs" role="tablist" aria-label={content.wiki.talents.treeLabel}>
                {data.talents.seasonTalents.trees.map((tree) => (
                  <button type="button" role="tab" key={tree.iId} aria-selected={tree.iId === treeId} className={tree.iId === treeId ? 'is-active' : undefined} onClick={() => {
                    setTreeId(tree.iId)
                    setSelectedSeasonId(null)
                  }}>
                    {tree.name?.['zh-CN'] ?? tree.iId}
                    {tree.iNeedLevel ? <small>{content.wiki.talents.requiredLevel.replace('{level}', String(tree.iNeedLevel))}</small> : null}
                  </button>
                ))}
              </div>
            </header>
            <SeasonTalentCanvas
              nodes={seasonNodes}
              levels={data.talents.seasonTalents.levels}
              activeId={selectedSeason?.iId ?? null}
              onSelect={setSelectedSeasonId}
            />
          </section>
          <SeasonTalentDetail node={selectedSeason} data={data.talents} />
        </div>
      ) : (
        <div className="talent-system-layout">
          <section className="talent-tree-panel patron-tree-panel" aria-labelledby="patron-tree-title">
            <header>
              <div>
                <span>{content.wiki.talents.groupLabel}</span>
                <h3 id="patron-tree-title">{activeGroup?.name?.['zh-CN'] ?? content.wiki.talents.patron}</h3>
              </div>
              <div className="talent-tree-tabs is-groups" role="tablist" aria-label={content.wiki.talents.groupLabel}>
                {data.talents.patronTalents.groups.map((group) => (
                  <button type="button" role="tab" key={group.iID} aria-selected={group.iID === groupId} className={group.iID === groupId ? 'is-active' : undefined} onClick={() => {
                    setGroupId(group.iID)
                    setSelectedPatronId(null)
                  }}>{group.name?.['zh-CN'] ?? group.iID}</button>
                ))}
              </div>
            </header>
            <PatronTalentGrid nodes={patronNodes} activeId={selectedPatron?.iID ?? null} onSelect={setSelectedPatronId} />
          </section>
          <PatronTalentDetail node={selectedPatron} data={data.talents} />
        </div>
      )}
    </div>
  )
}

function SeasonTalentCanvas({ nodes, levels, activeId, onSelect }: {
  nodes: TalentNodeRecord[]
  levels: TalentLevelRecord[]
  activeId: number | null
  onSelect: (id: number) => void
}) {
  const levelById = new Map(levels.map((level) => [level.iId, level]))
  const nodeById = new Map(nodes.map((node) => [node.iId, node]))
  return (
    <div className="season-talent-scroll">
      <div className="season-talent-canvas">
        <svg className="season-talent-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {nodes.flatMap((node) => (node.kAfterids ?? []).flatMap((nextId) => {
            const next = nodeById.get(nextId)
            if (!node.kPosition || !next?.kPosition) return []
            const from = talentPosition(node.kPosition)
            const to = talentPosition(next.kPosition)
            return [<line key={`${node.iId}-${nextId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />]
          }))}
        </svg>
        {nodes.map((node) => {
          const level = levelById.get(node.levels?.[0] ?? -1)
          const position = talentPosition(node.kPosition ?? [0, 0])
          return (
            <button
              type="button"
              key={node.iId}
              className={`${node.iId === activeId ? 'is-active' : ''}${node.iIsStartPoint ? ' is-start' : ''}${node.iType === 5 ? ' is-gate' : ''}`}
              style={{ '--talent-x': `${position.x}%`, '--talent-y': `${position.y}%` } as CSSProperties}
              onClick={() => onSelect(node.iId)}
              aria-label={level?.name?.['zh-CN'] ?? String(node.iId)}
            >
              <span>{level?.icon ? <img src={resourceUrl(level.icon)} alt="" loading="lazy" /> : node.iType === 5 ? <LockKeyhole aria-hidden="true" /> : <CircleDot aria-hidden="true" />}</span>
              <strong>{level?.name?.['zh-CN'] ?? content.wiki.talents.gate}</strong>
              <small>{content.wiki.talents.levelCap.replace('{level}', String(node.iMaxLevel ?? node.levels?.length ?? 1))}</small>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PatronTalentGrid({ nodes, activeId, onSelect }: { nodes: PatronTalentNodeRecord[]; activeId: number | null; onSelect: (id: number) => void }) {
  const nodeById = new Map(nodes.map((node) => [node.iID, node]))
  return (
    <div className="patron-talent-grid">
      <svg className="patron-talent-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {nodes.flatMap((node) => (node.iPostTalentID ?? []).flatMap((nextId) => {
          const next = nodeById.get(nextId)
          if (!next) return []
          const from = patronTalentPosition(node.iPos)
          const to = patronTalentPosition(next.iPos)
          return [<line key={`${node.iID}-${nextId}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />]
        }))}
      </svg>
      {nodes.map((node) => (
        <button type="button" key={node.iID} className={`${node.iID === activeId ? 'is-active' : ''}${node.iIsStartPoint ? ' is-start' : ''}`} style={{ gridColumn: ((node.iPos - 1) % 4) + 1, gridRow: Math.floor((node.iPos - 1) / 4) + 1 }} onClick={() => onSelect(node.iID)}>
          <span>{node.icon ? <img src={resourceUrl(node.icon)} alt="" /> : <Star aria-hidden="true" />}</span>
          <strong>{node.name?.['zh-CN'] ?? node.iID}</strong>
          <small>{content.wiki.talents.levelCap.replace('{level}', String(node.iMaxLevel))}</small>
        </button>
      ))}
    </div>
  )
}

function SeasonTalentDetail({ node, data }: { node: TalentNodeRecord | null; data: TalentCatalogDocument }) {
  if (!node) return <TalentEmptyDetail />
  const levelById = new Map(data.seasonTalents.levels.map((level) => [level.iId, level]))
  const levels = (node.levels ?? []).flatMap((id) => {
    const level = levelById.get(id)
    return level ? [level] : []
  })
  const first = levels[0]
  const last = levels.at(-1)
  return (
    <aside className="talent-detail">
      <header>
        <span>{first?.icon ? <img src={resourceUrl(first.icon)} alt="" /> : <Zap aria-hidden="true" />}</span>
        <div><small>{content.wiki.talents.node}</small><h3>{first?.name?.['zh-CN'] ?? content.wiki.talents.gate}</h3><em>{content.wiki.talents.nodeId.replace('{id}', String(node.iId))}</em></div>
      </header>
      <TalentFacts maxLevel={node.iMaxLevel ?? levels.length} type={node.iType} start={Boolean(node.iIsStartPoint)} />
      <TalentAttributes level={last} data={data} />
      <TalentCosts level={first} />
      <section className="talent-level-strip">
        <h4>{content.wiki.talents.levels}</h4>
        <div>{levels.slice(0, 10).map((level) => <span key={level.iId}>{level.iLevel ?? 1}</span>)}{levels.length > 10 ? <small>+{levels.length - 10}</small> : null}</div>
      </section>
    </aside>
  )
}

function PatronTalentDetail({ node, data }: { node: PatronTalentNodeRecord | null; data: TalentCatalogDocument }) {
  if (!node) return <TalentEmptyDetail />
  const attrById = new Map(data.patronTalents.attrLevels.map((row) => [row.iID, row]))
  const lastAttributes = attrById.get(node.kTalentAttrIds?.at(-1) ?? -1)?.kAttrs ?? []
  return (
    <aside className="talent-detail">
      <header>
        <span>{node.icon ? <img src={resourceUrl(node.icon)} alt="" /> : <Star aria-hidden="true" />}</span>
        <div><small>{content.wiki.talents.node}</small><h3>{node.name?.['zh-CN'] ?? node.iID}</h3><em>{content.wiki.talents.nodeId.replace('{id}', String(node.iID))}</em></div>
      </header>
      <TalentFacts maxLevel={node.iMaxLevel} type={node.iType} start={Boolean(node.iIsStartPoint)} />
      <AttributeList values={lastAttributes} data={data} />
    </aside>
  )
}

function TalentFacts({ maxLevel, type, start }: { maxLevel: number; type: number; start: boolean }) {
  return <dl className="talent-facts"><div><dt>{content.wiki.talents.levelCapLabel}</dt><dd>{maxLevel}</dd></div><div><dt>{content.wiki.talents.nodeType}</dt><dd>{type}</dd></div><div><dt>{content.wiki.talents.startNode}</dt><dd>{start ? content.wiki.talents.yes : content.wiki.talents.no}</dd></div></dl>
}

function TalentAttributes({ level, data }: { level?: TalentLevelRecord; data: TalentCatalogDocument }) {
  return <AttributeList values={level?.kAttrs ?? []} data={data} />
}

function AttributeList({ values, data }: { values: number[][]; data: TalentCatalogDocument }) {
  const attributeById = new Map(data.attributes.map((attribute) => [attribute.iID, attribute]))
  return (
    <section className="talent-detail-section">
      <h4>{content.wiki.talents.maxEffect}</h4>
      {values.length > 0 ? <div>{values.map(([id, value]) => <span key={id}><small>{attributeById.get(id)?.name?.['zh-CN'] ?? attributeById.get(id)?.kVariable ?? id}</small><strong>+{value}</strong></span>)}</div> : <p>{content.wiki.talents.noEffect}</p>}
    </section>
  )
}

function TalentCosts({ level }: { level?: TalentLevelRecord }) {
  if (!level?.kCosts?.length && !level?.iSkillPoint) return null
  return (
    <section className="talent-detail-section">
      <h4>{content.wiki.talents.cost}</h4>
      <div>{level.iSkillPoint ? <span><small>{content.wiki.talents.skillPoint}</small><strong>{level.iSkillPoint}</strong></span> : null}{level.kCosts?.map(([id, value]) => <span key={id}><small>{content.wiki.talents.item.replace('{id}', String(id))}</small><strong>{value}</strong></span>)}</div>
    </section>
  )
}

function TalentEmptyDetail() {
  return <aside className="talent-detail"><div className="talent-empty">{content.wiki.talents.selectNode}</div></aside>
}

function talentPosition(position: number[]): { x: number; y: number } {
  return {
    x: 8 + (Math.max(0, position[0]) / 31) * 82,
    y: 9 + (Math.max(0, position[1]) / 15) * 78,
  }
}

function patronTalentPosition(position: number): { x: number; y: number } {
  const index = Math.max(0, position - 1)
  return {
    x: 12.5 + (index % 4) * 25,
    y: 12.5 + Math.floor(index / 4) * 25,
  }
}
