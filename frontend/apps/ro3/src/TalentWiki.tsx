import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { CircleDot, GitFork, LockKeyhole, Star, Zap } from 'lucide-react'
import { resourceUrl } from './lib/urls'
import { Chip, DetailPanel, DetailSection, Facts, FilterRow, Notice, Panel, Tab, TabRow } from './components/wiki'
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
    <div className="flex flex-col gap-4">
      <TabRow label={content.wiki.talents.systemLabel}>
        <Tab active={mode === 'season'} onClick={() => setMode('season')}>
          <GitFork aria-hidden="true" className="size-4" />{content.wiki.talents.season}
          <span className="text-xs text-muted-foreground">{data?.talents.counts.seasonNodes ?? 0}</span>
        </Tab>
        <Tab active={mode === 'patron'} onClick={() => setMode('patron')}>
          <Star aria-hidden="true" className="size-4" />{content.wiki.talents.patron}
          <span className="text-xs text-muted-foreground">{data?.talents.counts.patronNodes ?? 0}</span>
        </Tab>
      </TabRow>

      {dataError ? <Notice>{content.wiki.dataError}</Notice> : !data ? <Notice>{content.wiki.loading}</Notice> : mode === 'season' ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel aria-label={activeTree?.name?.['zh-CN'] ?? content.wiki.talents.season} className="flex min-w-0 flex-col gap-3">
            <FilterRow label={content.wiki.talents.treeLabel}>
              {data.talents.seasonTalents.trees.map((tree) => (
                <Chip key={tree.iId} active={tree.iId === treeId} onClick={() => {
                  setTreeId(tree.iId)
                  setSelectedSeasonId(null)
                }}>
                  {tree.name?.['zh-CN'] ?? tree.iId}
                  {tree.iNeedLevel ? <span className="text-xs text-muted-foreground">{content.wiki.talents.requiredLevel.replace('{level}', String(tree.iNeedLevel))}</span> : null}
                </Chip>
              ))}
            </FilterRow>
            <SeasonTalentCanvas
              nodes={seasonNodes}
              levels={data.talents.seasonTalents.levels}
              activeId={selectedSeason?.iId ?? null}
              onSelect={setSelectedSeasonId}
            />
          </Panel>
          <SeasonTalentDetail node={selectedSeason} data={data.talents} />
        </div>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel aria-label={activeGroup?.name?.['zh-CN'] ?? content.wiki.talents.patron} className="flex min-w-0 flex-col gap-3">
            <FilterRow label={content.wiki.talents.groupLabel}>
              {data.talents.patronTalents.groups.map((group) => (
                <Chip key={group.iID} active={group.iID === groupId} onClick={() => {
                  setGroupId(group.iID)
                  setSelectedPatronId(null)
                }}>{group.name?.['zh-CN'] ?? group.iID}</Chip>
              ))}
            </FilterRow>
            <PatronTalentGrid nodes={patronNodes} activeId={selectedPatron?.iID ?? null} onSelect={setSelectedPatronId} />
          </Panel>
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
    <div className="season-talent-scroll rounded-md">
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
    <div className="patron-talent-grid rounded-md">
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
    <DetailPanel label={content.wiki.talents.node}>
      <TalentHeader
        icon={first?.icon ? <img src={resourceUrl(first.icon)} alt="" /> : <Zap aria-hidden="true" />}
        name={first?.name?.['zh-CN'] ?? content.wiki.talents.gate}
        id={node.iId}
      />
      <TalentFacts maxLevel={node.iMaxLevel ?? levels.length} type={node.iType} start={Boolean(node.iIsStartPoint)} />
      <AttributeList values={last?.kAttrs ?? []} data={data} />
      <TalentCosts level={first} />
      <DetailSection title={content.wiki.talents.levels}>
        <div className="flex flex-wrap gap-1.5">
          {levels.slice(0, 10).map((level) => (
            <span key={level.iId} className="grid min-w-8 place-items-center rounded-md border border-border px-2 py-1 text-xs">{level.iLevel ?? 1}</span>
          ))}
          {levels.length > 10 ? <span className="px-1 py-1 text-xs text-muted-foreground">+{levels.length - 10}</span> : null}
        </div>
      </DetailSection>
    </DetailPanel>
  )
}

function PatronTalentDetail({ node, data }: { node: PatronTalentNodeRecord | null; data: TalentCatalogDocument }) {
  if (!node) return <TalentEmptyDetail />
  const attrById = new Map(data.patronTalents.attrLevels.map((row) => [row.iID, row]))
  const lastAttributes = attrById.get(node.kTalentAttrIds?.at(-1) ?? -1)?.kAttrs ?? []
  return (
    <DetailPanel label={content.wiki.talents.node}>
      <TalentHeader
        icon={node.icon ? <img src={resourceUrl(node.icon)} alt="" /> : <Star aria-hidden="true" />}
        name={node.name?.['zh-CN'] ?? String(node.iID)}
        id={node.iID}
      />
      <TalentFacts maxLevel={node.iMaxLevel} type={node.iType} start={Boolean(node.iIsStartPoint)} />
      <AttributeList values={lastAttributes} data={data} />
    </DetailPanel>
  )
}

function TalentHeader({ icon, name, id }: { icon: ReactNode; name: string; id: number }) {
  return (
    <header className="flex items-center gap-3 border-b border-border pb-4">
      {/* The medallion is the game's own artwork and keeps its palette. */}
      <span className="talent-medallion shrink-0">{icon}</span>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-[color:var(--arkive-nav-active)]">{content.wiki.talents.node}</span>
        <h3 className="text-lg font-semibold">{name}</h3>
        <span className="text-xs text-muted-foreground">{content.wiki.talents.nodeId.replace('{id}', String(id))}</span>
      </div>
    </header>
  )
}

function TalentFacts({ maxLevel, type, start }: { maxLevel: number; type: number; start: boolean }) {
  return (
    <Facts
      items={[
        { label: content.wiki.talents.levelCapLabel, value: maxLevel },
        { label: content.wiki.talents.nodeType, value: type },
        { label: content.wiki.talents.startNode, value: start ? content.wiki.talents.yes : content.wiki.talents.no },
      ]}
    />
  )
}

function StatList({ rows }: { rows: Array<{ key: number | string; label: ReactNode; value: ReactNode }> }) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          <strong className="font-semibold text-[color:var(--arkive-nav-active)]">{row.value}</strong>
        </div>
      ))}
    </div>
  )
}

function AttributeList({ values, data }: { values: number[][]; data: TalentCatalogDocument }) {
  const attributeById = new Map(data.attributes.map((attribute) => [attribute.iID, attribute]))
  return (
    <DetailSection title={content.wiki.talents.maxEffect}>
      {values.length > 0 ? (
        <StatList rows={values.map(([id, value]) => ({
          key: id,
          label: attributeById.get(id)?.name?.['zh-CN'] ?? attributeById.get(id)?.kVariable ?? id,
          value: `+${value}`,
        }))} />
      ) : <p className="text-sm text-muted-foreground">{content.wiki.talents.noEffect}</p>}
    </DetailSection>
  )
}

function TalentCosts({ level }: { level?: TalentLevelRecord }) {
  if (!level?.kCosts?.length && !level?.iSkillPoint) return null
  const rows = [
    ...(level.iSkillPoint ? [{ key: 'point', label: content.wiki.talents.skillPoint, value: level.iSkillPoint }] : []),
    ...(level.kCosts ?? []).map(([id, value]) => ({ key: id, label: content.wiki.talents.item.replace('{id}', String(id)), value })),
  ]
  return (
    <DetailSection title={content.wiki.talents.cost}>
      <StatList rows={rows} />
    </DetailSection>
  )
}

function TalentEmptyDetail() {
  return <DetailPanel label={content.wiki.talents.node}><Notice>{content.wiki.talents.selectNode}</Notice></DetailPanel>
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
