import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Ghost, Sparkles, Target, Zap } from 'lucide-react'
import { Button, cn } from '@gamemap/ui'
import { localizedText } from './cardCatalog'
import { filterMonsters, type MonsterFilters } from './creatureCatalog'
import {
  loadMonsterWikiData,
  type MonsterRank,
  type MonsterRecord,
  type MonsterSkillRecord,
  type MonsterWikiData,
} from './creatureData'
import { resourceUrl } from './lib/urls'
import { CatalogLayout, DetailSection, Facts, IconTile, Notice, SearchField } from './components/wiki'
import { SELECT_CLASS } from './lib/styles'
import content from './locales/zh-CN.json'

const numberFormatter = new Intl.NumberFormat('zh-CN')
const MONSTER_BATCH_SIZE = 120
const MONSTER_STATS = ['maxhp', 'maxsp', 'atk', 'matk', 'def', 'mdef'] as const

function SkillRow({ icon, name, tag, children }: { icon: ReactNode; name: string; tag: string; children: ReactNode }) {
  return (
    <article className="flex gap-3 rounded-md border border-border p-2.5">
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <strong className="text-sm font-semibold">{name}</strong>
          <span className="shrink-0 text-xs text-muted-foreground">{tag}</span>
        </div>
        {children}
      </div>
    </article>
  )
}
export function MonsterWiki() {
  const [data, setData] = useState<MonsterWikiData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<MonsterFilters>({
    rank: 'all', race: 0, element: 0, size: 0, levelMin: 0, levelMax: 100,
  })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [visibleCount, setVisibleCount] = useState(MONSTER_BATCH_SIZE)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)

  useEffect(() => {
    let active = true
    loadMonsterWikiData()
      .then((nextData) => {
        if (!active) return
        setData(nextData)
        setSelectedId(filterMonsters(nextData.monsters, '', {
          rank: 'all', race: 0, element: 0, size: 0, levelMin: 0, levelMax: 100,
        })[0]?.id ?? null)
        setDataError(false)
      })
      .catch(() => {
        if (active) setDataError(true)
      })
    return () => { active = false }
  }, [])

  const monsters = useMemo(
    () => filterMonsters(data?.monsters ?? [], query, filters),
    [data, filters, query],
  )
  const visibleMonsters = monsters.slice(0, visibleCount)
  const activeMonster = data?.monsters.find((monster) => monster.id === selectedId) ?? visibleMonsters[0] ?? null

  const selectMonster = (monster: MonsterRecord) => {
    setSelectedId(monster.id)
    setMobileDetailOpen(true)
  }

  const changeFilters = (change: Partial<MonsterFilters>) => {
    setFilters((value) => ({ ...value, ...change }))
    setVisibleCount(MONSTER_BATCH_SIZE)
  }

  const detail = activeMonster && data ? <MonsterDetail monster={activeMonster} data={data} /> : (
    <Notice>{dataError ? content.wiki.dataError : content.wiki.loading}</Notice>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <SearchField value={query} label={content.wiki.monsters.searchLabel} placeholder={content.wiki.monsters.searchPlaceholder} onChange={(value) => {
          setQuery(value)
          setVisibleCount(MONSTER_BATCH_SIZE)
        }} />
        {/* Selects rather than chips: the race, element and size lists run to
            a dozen entries each, and five chip rows would push the grid off
            the first screen. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <select className={SELECT_CLASS} aria-label={content.wiki.monsters.allRanks} value={filters.rank} onChange={(event) => changeFilters({ rank: event.target.value as MonsterRank | 'all' })}>
            <option value="all">{content.wiki.monsters.allRanks}</option>
            {Object.entries(content.wiki.monsters.ranks).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <EnumSelect label={content.wiki.monsters.allRaces} value={filters.race} values={data?.catalog.enums.race} onChange={(race) => changeFilters({ race })} />
          <EnumSelect label={content.wiki.monsters.allElements} value={filters.element} values={data?.catalog.enums.element} onChange={(element) => changeFilters({ element })} />
          <EnumSelect label={content.wiki.monsters.allSizes} value={filters.size} values={data?.catalog.enums.size} onChange={(size) => changeFilters({ size })} />
          <select className={SELECT_CLASS} aria-label={content.wiki.monsters.allLevels} defaultValue="" onChange={(event) => {
            const range = content.wiki.monsters.levelRanges.find((candidate) => candidate.value === event.target.value)
            changeFilters({ levelMin: range?.min ?? 0, levelMax: range?.max ?? 100 })
          }}>
            <option value="">{content.wiki.monsters.allLevels}</option>
            {content.wiki.monsters.levelRanges.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
          </select>
        </div>
      </div>

      <CatalogLayout
        detailLabel={activeMonster ? localizedText(activeMonster.name) || content.wiki.monsters.unnamed : content.wiki.monsters.title}
        detail={detail}
        open={mobileDetailOpen}
        onClose={() => setMobileDetailOpen(false)}
        list={(
          <>
            <p className="text-sm text-muted-foreground">{content.wiki.monsters.count.replace('{count}', String(monsters.length))}</p>
            {dataError ? <Notice>{content.wiki.dataError}</Notice> : !data ? <Notice>{content.wiki.loading}</Notice> : visibleMonsters.length > 0 ? (
              <>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))] gap-2.5" aria-label={content.wiki.monsters.title}>
                  {visibleMonsters.map((monster) => <MonsterTile key={monster.id} monster={monster} active={activeMonster?.id === monster.id} onSelect={selectMonster} />)}
                </div>
                <div className="flex flex-col items-center gap-2 py-2">
                  <span className="text-sm text-muted-foreground">{content.wiki.monsters.shown.replace('{shown}', String(visibleMonsters.length)).replace('{total}', String(monsters.length))}</span>
                  {visibleMonsters.length < monsters.length ? (
                    <Button type="button" variant="outline" onClick={() => setVisibleCount((value) => value + MONSTER_BATCH_SIZE)}>{content.wiki.monsters.loadMore}</Button>
                  ) : null}
                </div>
              </>
            ) : <Notice>{content.wiki.monsters.empty}</Notice>}
          </>
        )}
      />
    </div>
  )
}

function MonsterTile({ monster, active, onSelect }: {
  monster: MonsterRecord
  active: boolean
  onSelect: (monster: MonsterRecord) => void
}) {
  const name = localizedText(monster.name) || content.wiki.monsters.unnamed
  const rank = monster.rank ?? 'normal'
  // The tile is the game's own monster card, rank edge and all.
  return (
    <button type="button" className={`monster-roster-card rank-${rank}${active ? ' is-active' : ''}`} onClick={() => onSelect(monster)} aria-label={`${name}, ${content.wiki.monsters.level.replace('{level}', String(monster.level ?? '-'))}`}>
      <span className="monster-roster-art">{monster.headIcon ? <img src={resourceUrl(monster.headIcon)} alt="" loading="lazy" /> : <Ghost aria-hidden="true" />}</span>
      <span className="monster-level-badge">{monster.level ?? '-'}</span>
      <strong>{name}</strong>
      <small>{content.wiki.monsters.ranks[rank]}</small>
    </button>
  )
}

/** The game's rank colours, as the tile's bottom edge shows them. */
const RANK_TEXT: Record<MonsterRank, string> = {
  normal: 'text-muted-foreground',
  elite: 'text-[color:var(--arkive-nav-active)]',
  mvp: 'text-[color:var(--ro3-gold-06)]',
  boss: 'text-red-600 dark:text-red-400',
}

function MonsterDetail({ monster, data }: { monster: MonsterRecord; data: MonsterWikiData }) {
  const name = localizedText(monster.name) || content.wiki.monsters.unnamed
  const rank = monster.rank ?? 'normal'
  const skillById = new Map(data.skills.skills.map((skill) => [skill.id, skill]))
  const skills = (monster.skills ?? []).flatMap((id) => {
    const skill = skillById.get(id)
    return skill ? [skill] : []
  })

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border pb-4">
        <IconTile
          className="size-16"
          src={monster.headIcon ? resourceUrl(monster.headIcon) : undefined}
          fallback={<Ghost aria-hidden="true" className="size-7 text-muted-foreground" />}
        />
        <div className="flex min-w-0 flex-col">
          <span className={cn('text-xs font-medium', RANK_TEXT[rank])}>
            {content.wiki.monsters.ranks[rank]} · {content.wiki.monsters.level.replace('{level}', String(monster.level ?? '-'))}
          </span>
          <h3 className="text-lg font-semibold">{name}</h3>
          <span className="text-xs text-muted-foreground">{content.wiki.monsters.id.replace('{id}', String(monster.id))}</span>
        </div>
      </header>

      <Facts
        items={[
          { label: content.wiki.monsters.race, value: monsterEnumLabel(data.catalog.enums.race, monster.race) },
          { label: content.wiki.monsters.element, value: monsterEnumLabel(data.catalog.enums.element, monster.element) },
          { label: content.wiki.monsters.size, value: monsterEnumLabel(data.catalog.enums.size, monster.size) },
        ]}
      />

      <DetailSection title={content.wiki.monsters.stats}>
        <Facts items={MONSTER_STATS.map((key) => ({ label: content.wiki.monsters.statLabels[key], value: formatNumber(monster.stats?.[key]) }))} />
        <div className="flex flex-wrap gap-1.5">
          {monster.speed !== undefined ? (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"><Sparkles aria-hidden="true" className="size-3.5" />{content.wiki.monsters.speed} <b className="font-semibold">{formatNumber(monster.speed)}</b></span>
          ) : null}
          {monster.attackRange !== undefined ? (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs"><Target aria-hidden="true" className="size-3.5" />{content.wiki.monsters.attackRange} <b className="font-semibold">{formatNumber(monster.attackRange)}</b></span>
          ) : null}
        </div>
      </DetailSection>

      <DetailSection title={content.wiki.monsters.skills}>
        {skills.length > 0 ? (
          <div className="flex flex-col gap-2">{skills.map((skill) => <MonsterSkill key={skill.id} skill={skill} />)}</div>
        ) : <p className="text-sm text-muted-foreground">{content.wiki.monsters.noSkills}</p>}
      </DetailSection>
    </>
  )
}

function MonsterSkill({ skill }: { skill: MonsterSkillRecord }) {
  const name = cleanGameLabel(localizedText(skill.name)) || content.wiki.monsters.unnamed
  const facts = [
    skill.cooldown !== undefined ? content.wiki.monsters.cooldown.replace('{value}', formatMilliseconds(skill.cooldown)) : null,
    skill.castTime !== undefined ? content.wiki.monsters.castTime.replace('{value}', formatMilliseconds(skill.castTime)) : null,
    skill.rangeMax !== undefined ? content.wiki.monsters.rangeMax.replace('{value}', String(skill.rangeMax)) : null,
    skill.targetMax !== undefined ? content.wiki.monsters.targetMax.replace('{value}', String(skill.targetMax)) : null,
    skill.damageParam?.length ? content.wiki.monsters.damageParam.replace('{value}', skill.damageParam.join(' / ')) : null,
  ].filter((fact): fact is string => fact !== null)
  return (
    <SkillRow
      icon={<IconTile fallback={<Zap aria-hidden="true" className="size-5 text-muted-foreground" />} />}
      name={name}
      tag={content.wiki.monsters.skillLevel.replace('{level}', String(skill.level))}
    >
      <div className="flex flex-wrap gap-1">
        {facts.map((fact) => <span key={fact} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{fact}</span>)}
      </div>
    </SkillRow>
  )
}

function EnumSelect({ label, value, values, onChange }: {
  label: string
  value: number
  values?: Record<string, { 'zh-CN'?: string }>
  onChange: (value: number) => void
}) {
  return (
    <select className={SELECT_CLASS} aria-label={label} value={value} onChange={(event) => onChange(Number(event.target.value))}>
      <option value={0}>{label}</option>
      {Object.entries(values ?? {}).map(([id, name]) => <option key={id} value={id}>{name['zh-CN']}</option>)}
    </select>
  )
}

function monsterEnumLabel(values: Record<string, { 'zh-CN'?: string }>, id?: number): string {
  return id === undefined ? '-' : values[String(id)]?.['zh-CN'] ?? '-'
}

function formatNumber(value?: number): string {
  return value === undefined ? '-' : numberFormatter.format(value)
}

function formatSeconds(milliseconds: number): string {
  return String(Math.round(milliseconds / 100) / 10)
}

function formatMilliseconds(milliseconds: number): string {
  return formatSeconds(milliseconds)
}

function cleanGameLabel(value: string): string {
  return value.replace(/\[[^\]]+\]$/g, '').trim()
}
