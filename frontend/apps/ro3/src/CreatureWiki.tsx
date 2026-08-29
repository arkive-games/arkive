import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Crown,
  Ghost,
  HeartPulse,
  PawPrint,
  Search,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  X,
  Zap,
} from 'lucide-react'
import { localizedText, stripGameMarkup } from './cardCatalog'
import { filterMonsters, filterPets, findPetStar, petSkillIds, type MonsterFilters } from './creatureCatalog'
import {
  loadMonsterWikiData,
  loadPetWikiData,
  type MonsterRank,
  type MonsterRecord,
  type MonsterSkillRecord,
  type MonsterWikiData,
  type PetAttribute,
  type PetRecord,
  type PetSkillRecord,
  type PetStarRecord,
  type PetWikiData,
} from './creatureData'
import { resourceUrl } from './lib/urls'
import content from './locales/zh-CN.json'

const numberFormatter = new Intl.NumberFormat('zh-CN')
const PET_QUALITIES = [3, 4, 5]
const PET_STARS = [1, 2, 3, 4, 5, 6]
const MONSTER_BATCH_SIZE = 120
const MONSTER_STATS = ['maxhp', 'maxsp', 'atk', 'matk', 'def', 'mdef'] as const

function useEscapeClose(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])
}

function MobileDetail({ open, label, onClose, children }: {
  open: boolean
  label: string
  onClose: () => void
  children: ReactNode
}) {
  useEscapeClose(open, onClose)
  if (!open) return null
  return (
    <div className="creature-mobile-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <aside className="creature-mobile-detail" role="dialog" aria-modal="true" aria-label={label}>
        <button type="button" className="creature-mobile-close" aria-label={label} onClick={onClose}><X aria-hidden="true" /></button>
        {children}
      </aside>
    </div>
  )
}

export function PetWiki() {
  const [data, setData] = useState<PetWikiData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [query, setQuery] = useState('')
  const [quality, setQuality] = useState(0)
  const [kingOnly, setKingOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedStar, setSelectedStar] = useState(1)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)

  useEffect(() => {
    let active = true
    loadPetWikiData()
      .then((nextData) => {
        if (!active) return
        setData(nextData)
        setSelectedId(filterPets(nextData.catalog.pets, '', 0, false)[0]?.id ?? null)
        setDataError(false)
      })
      .catch(() => {
        if (active) setDataError(true)
      })
    return () => { active = false }
  }, [])

  const pets = useMemo(
    () => filterPets(data?.catalog.pets ?? [], query, quality, kingOnly),
    [data, kingOnly, quality, query],
  )
  const activePet = data?.catalog.pets.find((pet) => pet.id === selectedId) ?? pets[0] ?? null

  const selectPet = (pet: PetRecord) => {
    setSelectedId(pet.id)
    setSelectedStar(1)
    setMobileDetailOpen(true)
  }

  const detail = activePet && data ? (
    <PetDetail pet={activePet} data={data} star={selectedStar} onStarChange={setSelectedStar} />
  ) : <div className="creature-detail-empty">{dataError ? content.wiki.dataError : content.wiki.loading}</div>

  return (
    <div className="ro3-shell creature-wiki" role="tabpanel">
      <section className="creature-database-main" aria-labelledby="pet-wiki-title">
        <header className="creature-database-toolbar">
          <div className="creature-database-title">
            <PawPrint aria-hidden="true" />
            <h2 id="pet-wiki-title">{content.wiki.pets.title}</h2>
            <span>{content.wiki.pets.count.replace('{count}', String(pets.length))}</span>
          </div>
          <div className="creature-toolbar-controls">
            <div className="creature-segmented" aria-label={content.wiki.pets.allQualities}>
              <button type="button" className={quality === 0 ? 'is-active' : undefined} onClick={() => setQuality(0)}>{content.wiki.pets.allQualities}</button>
              {PET_QUALITIES.map((value) => (
                <button type="button" key={value} className={quality === value ? 'is-active' : undefined} onClick={() => setQuality(value)}>
                  {content.wiki.pets.quality.replace('{quality}', String(value))}
                </button>
              ))}
            </div>
            <button type="button" className={`creature-king-filter${kingOnly ? ' is-active' : ''}`} aria-pressed={kingOnly} onClick={() => setKingOnly((value) => !value)}>
              <Crown aria-hidden="true" />{content.wiki.pets.kingOnly}
            </button>
            <SearchField value={query} label={content.wiki.pets.searchLabel} placeholder={content.wiki.pets.searchPlaceholder} onChange={setQuery} />
          </div>
        </header>

        {dataError ? <div className="creature-empty">{content.wiki.dataError}</div> : !data ? (
          <div className="creature-empty">{content.wiki.loading}</div>
        ) : pets.length > 0 ? (
          <div className="pet-roster-grid" aria-label={content.wiki.pets.title}>
            {pets.map((pet) => (
              <button type="button" key={pet.id} className={`pet-roster-card quality-${pet.quality}${activePet?.id === pet.id ? ' is-active' : ''}`} onClick={() => selectPet(pet)}>
                <span className="pet-roster-art"><img src={resourceUrl(pet.art.fightField)} alt="" loading="lazy" /></span>
                <span className="pet-roster-quality"><Star aria-hidden="true" />{pet.quality}</span>
                {pet.king ? <span className="pet-roster-king" title={content.wiki.pets.king}><Crown aria-hidden="true" /></span> : null}
                <strong>{localizedText(pet.name)}</strong>
              </button>
            ))}
          </div>
        ) : <div className="creature-empty">{content.wiki.pets.empty}</div>}
      </section>

      <aside className="creature-database-detail pet-database-detail" aria-label={content.wiki.pets.title}>{detail}</aside>
      <MobileDetail open={mobileDetailOpen} label={content.wiki.pets.closeDetail} onClose={() => setMobileDetailOpen(false)}>{detail}</MobileDetail>
    </div>
  )
}

function PetDetail({ pet, data, star, onStarChange }: {
  pet: PetRecord
  data: PetWikiData
  star: number
  onStarChange: (star: number) => void
}) {
  const row = findPetStar(data.stars.stars, pet.id, star)
  const skillById = useMemo(() => new Map(data.skills.skills.map((skill) => [skill.id, skill])), [data])
  const skills = petSkillIds(row).flatMap((id) => {
    const skill = skillById.get(id)
    return skill ? [{ skill, role: petSkillRole(row, id) }] : []
  })
  const attributeById = new Map(data.catalog.attributes.map((attribute) => [attribute.id, attribute]))

  return (
    <div className="pet-detail-content">
      <div className={`pet-detail-hero quality-${pet.quality}`}>
        <img src={resourceUrl(pet.art.encyclopedia)} alt="" />
        <div>
          <span>{content.wiki.pets.quality.replace('{quality}', String(pet.quality))}{pet.king ? ` · ${content.wiki.pets.king}` : ''}</span>
          <h3>{localizedText(pet.name)}</h3>
        </div>
      </div>

      <div className="pet-star-selector" aria-label={content.wiki.pets.starSelector}>
        {PET_STARS.map((value) => (
          <button type="button" key={value} className={star === value ? 'is-active' : undefined} aria-pressed={star === value} onClick={() => onStarChange(value)}>
            <Star aria-hidden="true" />{value}
          </button>
        ))}
      </div>

      <dl className="pet-strength-grid">
        <div><dt><Swords aria-hidden="true" />{content.wiki.pets.fightStrength}</dt><dd>{formatNumber(row?.starFightStrength)}</dd></div>
        <div><dt><Shield aria-hidden="true" />{content.wiki.pets.assistStrength}</dt><dd>{formatNumber(row?.starAssistStrength)}</dd></div>
        <div><dt><Sparkles aria-hidden="true" />{content.wiki.pets.collectStrength}</dt><dd>{formatNumber(row?.collectStrength)}</dd></div>
      </dl>

      <PetAttributes title={content.wiki.pets.fightAttributes} values={row?.fightAttributes ?? []} attributeById={attributeById} />
      <PetAttributes title={content.wiki.pets.collectAttributes} values={row?.collectAttributes ?? []} attributeById={attributeById} />

      <section className="creature-skill-section">
        <h4><Zap aria-hidden="true" />{content.wiki.pets.skills}</h4>
        {skills.length > 0 ? <div className="pet-skill-list">{skills.map(({ skill, role }) => (
          <PetSkill key={skill.id} skill={skill} role={role} />
        ))}</div> : <p className="creature-detail-note">{content.wiki.pets.noSkills}</p>}
      </section>
    </div>
  )
}

function PetAttributes({ title, values, attributeById }: {
  title: string
  values: number[][]
  attributeById: Map<number, PetAttribute>
}) {
  if (values.length === 0) return null
  return (
    <section className="pet-attribute-section">
      <h4>{title}</h4>
      <div>{values.map(([id, value]) => (
        <span key={id}>{localizedText(attributeById.get(id)?.name)} <strong>+{formatNumber(value)}</strong></span>
      ))}</div>
    </section>
  )
}

function PetSkill({ skill, role }: { skill: PetSkillRecord; role: string }) {
  return (
    <article className="pet-skill-row">
      <img src={resourceUrl(skill.icon)} alt="" loading="lazy" />
      <div>
        <header><strong>{localizedText(skill.name)}</strong><span>{role}</span></header>
        <p>{stripGameMarkup(localizedText(skill.description) || content.wiki.pets.noDescription)}</p>
        {skill.cooldown > 0 ? <small>{content.wiki.pets.cooldown.replace('{seconds}', formatSeconds(skill.cooldown))}</small> : null}
      </div>
    </article>
  )
}

function petSkillRole(row: PetStarRecord | null, id: number): string {
  if (!row) return content.wiki.pets.otherSkill
  if (row.activeSkills.includes(id)) return content.wiki.pets.activeSkill
  if (row.passiveMain === id) return content.wiki.pets.passiveSkill
  if (row.protectSkill === id) return content.wiki.pets.protectSkill
  if (row.corePassiveSkill === id) return content.wiki.pets.coreSkill
  return content.wiki.pets.otherSkill
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
    <div className="creature-detail-empty">{dataError ? content.wiki.dataError : content.wiki.loading}</div>
  )

  return (
    <div className="ro3-shell creature-wiki" role="tabpanel">
      <section className="creature-database-main" aria-labelledby="monster-wiki-title">
        <header className="creature-database-toolbar monster-toolbar">
          <div className="creature-database-title">
            <Ghost aria-hidden="true" />
            <h2 id="monster-wiki-title">{content.wiki.monsters.title}</h2>
            <span>{content.wiki.monsters.count.replace('{count}', String(monsters.length))}</span>
          </div>
          <SearchField value={query} label={content.wiki.monsters.searchLabel} placeholder={content.wiki.monsters.searchPlaceholder} onChange={(value) => {
            setQuery(value)
            setVisibleCount(MONSTER_BATCH_SIZE)
          }} />
          <div className="monster-filter-row">
            <select aria-label={content.wiki.monsters.allRanks} value={filters.rank} onChange={(event) => changeFilters({ rank: event.target.value as MonsterRank | 'all' })}>
              <option value="all">{content.wiki.monsters.allRanks}</option>
              {Object.entries(content.wiki.monsters.ranks).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <EnumSelect label={content.wiki.monsters.allRaces} value={filters.race} values={data?.catalog.enums.race} onChange={(race) => changeFilters({ race })} />
            <EnumSelect label={content.wiki.monsters.allElements} value={filters.element} values={data?.catalog.enums.element} onChange={(element) => changeFilters({ element })} />
            <EnumSelect label={content.wiki.monsters.allSizes} value={filters.size} values={data?.catalog.enums.size} onChange={(size) => changeFilters({ size })} />
            <select aria-label={content.wiki.monsters.allLevels} defaultValue="" onChange={(event) => {
              const range = content.wiki.monsters.levelRanges.find((candidate) => candidate.value === event.target.value)
              changeFilters({ levelMin: range?.min ?? 0, levelMax: range?.max ?? 100 })
            }}>
              <option value="">{content.wiki.monsters.allLevels}</option>
              {content.wiki.monsters.levelRanges.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
            </select>
          </div>
        </header>

        {dataError ? <div className="creature-empty">{content.wiki.dataError}</div> : !data ? (
          <div className="creature-empty">{content.wiki.loading}</div>
        ) : visibleMonsters.length > 0 ? (
          <>
            <div className="monster-roster-grid" aria-label={content.wiki.monsters.title}>
              {visibleMonsters.map((monster) => <MonsterTile key={monster.id} monster={monster} active={activeMonster?.id === monster.id} onSelect={selectMonster} />)}
            </div>
            <div className="creature-load-more">
              <span>{content.wiki.monsters.shown.replace('{shown}', String(visibleMonsters.length)).replace('{total}', String(monsters.length))}</span>
              {visibleMonsters.length < monsters.length ? <button type="button" onClick={() => setVisibleCount((value) => value + MONSTER_BATCH_SIZE)}>{content.wiki.monsters.loadMore}</button> : null}
            </div>
          </>
        ) : <div className="creature-empty">{content.wiki.monsters.empty}</div>}
      </section>

      <aside className="creature-database-detail monster-database-detail" aria-label={content.wiki.monsters.title}>{detail}</aside>
      <MobileDetail open={mobileDetailOpen} label={content.wiki.monsters.closeDetail} onClose={() => setMobileDetailOpen(false)}>{detail}</MobileDetail>
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
  return (
    <button type="button" className={`monster-roster-card rank-${rank}${active ? ' is-active' : ''}`} onClick={() => onSelect(monster)} aria-label={`${name}, ${content.wiki.monsters.level.replace('{level}', String(monster.level ?? '-'))}`}>
      <span className="monster-roster-art">{monster.headIcon ? <img src={resourceUrl(monster.headIcon)} alt="" loading="lazy" /> : <Ghost aria-hidden="true" />}</span>
      <span className="monster-level-badge">{monster.level ?? '-'}</span>
      <strong>{name}</strong>
      <small>{content.wiki.monsters.ranks[rank]}</small>
    </button>
  )
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
    <div className="monster-detail-content">
      <header className={`monster-detail-heading rank-${rank}`}>
        <span className="monster-detail-portrait">{monster.headIcon ? <img src={resourceUrl(monster.headIcon)} alt="" /> : <Ghost aria-hidden="true" />}</span>
        <div>
          <span>{content.wiki.monsters.ranks[rank]} · {content.wiki.monsters.level.replace('{level}', String(monster.level ?? '-'))}</span>
          <h3>{name}</h3>
          <small>{content.wiki.monsters.id.replace('{id}', String(monster.id))}</small>
        </div>
      </header>

      <dl className="monster-taxonomy">
        <div><dt>{content.wiki.monsters.race}</dt><dd>{monsterEnumLabel(data.catalog.enums.race, monster.race)}</dd></div>
        <div><dt>{content.wiki.monsters.element}</dt><dd>{monsterEnumLabel(data.catalog.enums.element, monster.element)}</dd></div>
        <div><dt>{content.wiki.monsters.size}</dt><dd>{monsterEnumLabel(data.catalog.enums.size, monster.size)}</dd></div>
      </dl>

      <section className="monster-stat-section">
        <h4><HeartPulse aria-hidden="true" />{content.wiki.monsters.stats}</h4>
        <dl>{MONSTER_STATS.map((key) => (
          <div key={key}><dt>{content.wiki.monsters.statLabels[key]}</dt><dd>{formatNumber(monster.stats?.[key])}</dd></div>
        ))}</dl>
        <div className="monster-combat-meta">
          {monster.speed !== undefined ? <span><Sparkles aria-hidden="true" />{content.wiki.monsters.speed} <strong>{formatNumber(monster.speed)}</strong></span> : null}
          {monster.attackRange !== undefined ? <span><Target aria-hidden="true" />{content.wiki.monsters.attackRange} <strong>{formatNumber(monster.attackRange)}</strong></span> : null}
        </div>
      </section>

      <section className="creature-skill-section">
        <h4><Zap aria-hidden="true" />{content.wiki.monsters.skills}</h4>
        {skills.length > 0 ? <div className="monster-skill-list">{skills.map((skill) => <MonsterSkill key={skill.id} skill={skill} />)}</div> : (
          <p className="creature-detail-note">{content.wiki.monsters.noSkills}</p>
        )}
      </section>
    </div>
  )
}

function MonsterSkill({ skill }: { skill: MonsterSkillRecord }) {
  const name = cleanGameLabel(localizedText(skill.name)) || content.wiki.monsters.unnamed
  return (
    <article className="monster-skill-row">
      <span><Zap aria-hidden="true" /></span>
      <div>
        <header><strong>{name}</strong><small>{content.wiki.monsters.skillLevel.replace('{level}', String(skill.level))}</small></header>
        <div>
          {skill.cooldown !== undefined ? <em>{content.wiki.monsters.cooldown.replace('{value}', formatMilliseconds(skill.cooldown))}</em> : null}
          {skill.castTime !== undefined ? <em>{content.wiki.monsters.castTime.replace('{value}', formatMilliseconds(skill.castTime))}</em> : null}
          {skill.rangeMax !== undefined ? <em>{content.wiki.monsters.rangeMax.replace('{value}', String(skill.rangeMax))}</em> : null}
          {skill.targetMax !== undefined ? <em>{content.wiki.monsters.targetMax.replace('{value}', String(skill.targetMax))}</em> : null}
          {skill.damageParam?.length ? <em>{content.wiki.monsters.damageParam.replace('{value}', skill.damageParam.join(' / '))}</em> : null}
        </div>
      </div>
    </article>
  )
}

function SearchField({ value, label, placeholder, onChange }: {
  value: string
  label: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <label className="creature-search">
      <Search aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value ? <button type="button" aria-label={content.search.clear} onClick={() => onChange('')}><X aria-hidden="true" /></button> : null}
    </label>
  )
}

function EnumSelect({ label, value, values, onChange }: {
  label: string
  value: number
  values?: Record<string, { 'zh-CN'?: string }>
  onChange: (value: number) => void
}) {
  return (
    <select aria-label={label} value={value} onChange={(event) => onChange(Number(event.target.value))}>
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
