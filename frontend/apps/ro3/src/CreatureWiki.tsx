import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Crown, Shield, Sparkles, Star, Swords, Zap } from 'lucide-react'
import { localizedText, stripGameMarkup } from './cardCatalog'
import { filterPets, findPetStar, petSkillIds } from './creatureCatalog'
import {
  loadPetWikiData,
  type PetAttribute,
  type PetRecord,
  type PetSkillRecord,
  type PetStarRecord,
  type PetWikiData,
} from './creatureData'
import { resourceUrl } from './lib/urls'
import { AttributeChips, CatalogLayout, Chip, DetailSection, Facts, IconTile, Notice, SearchField } from './components/wiki'
import content from './locales/zh-CN.json'

const numberFormatter = new Intl.NumberFormat('zh-CN')
const PET_QUALITIES = [3, 4, 5]
const PET_STARS = [1, 2, 3, 4, 5, 6]

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
  ) : <Notice>{dataError ? content.wiki.dataError : content.wiki.loading}</Notice>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Chip active={quality === 0} onClick={() => setQuality(0)}>{content.wiki.pets.allQualities}</Chip>
          {PET_QUALITIES.map((value) => (
            <Chip key={value} active={quality === value} onClick={() => setQuality(value)}>
              {content.wiki.pets.quality.replace('{quality}', String(value))}
            </Chip>
          ))}
          <Chip active={kingOnly} onClick={() => setKingOnly((value) => !value)}>
            <Crown aria-hidden="true" className="size-3.5" />{content.wiki.pets.kingOnly}
          </Chip>
        </div>
        <SearchField className="md:w-72" value={query} label={content.wiki.pets.searchLabel} placeholder={content.wiki.pets.searchPlaceholder} onChange={setQuery} />
      </div>

      <CatalogLayout
        detailLabel={activePet ? localizedText(activePet.name) : content.wiki.pets.title}
        detail={detail}
        open={mobileDetailOpen}
        onClose={() => setMobileDetailOpen(false)}
        list={(
          <>
            <p className="text-sm text-muted-foreground">{content.wiki.pets.count.replace('{count}', String(pets.length))}</p>
            {dataError ? <Notice>{content.wiki.dataError}</Notice> : !data ? <Notice>{content.wiki.loading}</Notice> : pets.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2.5" aria-label={content.wiki.pets.title}>
                {pets.map((pet) => (
                  // The tile is the game's own pet card, quality frame and all.
                  <button
                    type="button"
                    key={pet.id}
                    className={`pet-roster-card quality-${pet.quality}${activePet?.id === pet.id ? ' is-active' : ''}`}
                    aria-label={`${localizedText(pet.name)} ${content.wiki.pets.quality.replace('{quality}', String(pet.quality))}`}
                    onClick={() => selectPet(pet)}
                  >
                    <span className="pet-roster-art"><span aria-hidden="true" /><img src={resourceUrl(pet.art.fightField)} alt="" loading="lazy" /></span>
                    <span className="pet-roster-quality"><Star aria-hidden="true" />{pet.quality}</span>
                    {pet.king ? <span className="pet-roster-king" title={content.wiki.pets.king}><Crown aria-hidden="true" /></span> : null}
                    <strong>{localizedText(pet.name)}</strong>
                  </button>
                ))}
              </div>
            ) : <Notice>{content.wiki.pets.empty}</Notice>}
          </>
        )}
      />
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
    <>
      {/* The portrait banner is the game's, tinted by quality. */}
      <div className={`pet-detail-hero quality-${pet.quality} overflow-hidden rounded-md`}>
        <img src={resourceUrl(pet.art.fightField)} alt="" />
        <div>
          <span>{content.wiki.pets.quality.replace('{quality}', String(pet.quality))}{pet.king ? ` · ${content.wiki.pets.king}` : ''}</span>
          <h3>{localizedText(pet.name)}</h3>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label={content.wiki.pets.starSelector}>
        {PET_STARS.map((value) => (
          <Chip key={value} active={star === value} onClick={() => onStarChange(value)}>
            <Star aria-hidden="true" className="size-3.5" />{value}
          </Chip>
        ))}
      </div>

      <Facts
        items={[
          { label: content.wiki.pets.fightStrength, value: <span className="inline-flex items-center gap-1"><Swords aria-hidden="true" className="size-3.5 text-muted-foreground" />{formatNumber(row?.starFightStrength)}</span> },
          { label: content.wiki.pets.assistStrength, value: <span className="inline-flex items-center gap-1"><Shield aria-hidden="true" className="size-3.5 text-muted-foreground" />{formatNumber(row?.starAssistStrength)}</span> },
          { label: content.wiki.pets.collectStrength, value: <span className="inline-flex items-center gap-1"><Sparkles aria-hidden="true" className="size-3.5 text-muted-foreground" />{formatNumber(row?.collectStrength)}</span> },
        ]}
      />

      <PetAttributes title={content.wiki.pets.fightAttributes} values={row?.fightAttributes ?? []} attributeById={attributeById} />
      <PetAttributes title={content.wiki.pets.collectAttributes} values={row?.collectAttributes ?? []} attributeById={attributeById} />

      <DetailSection title={content.wiki.pets.skills}>
        {skills.length > 0 ? (
          <div className="flex flex-col gap-2">
            {skills.map(({ skill, role }) => <PetSkill key={skill.id} skill={skill} role={role} />)}
          </div>
        ) : <p className="text-sm text-muted-foreground">{content.wiki.pets.noSkills}</p>}
      </DetailSection>
    </>
  )
}

function PetAttributes({ title, values, attributeById }: {
  title: string
  values: number[][]
  attributeById: Map<number, PetAttribute>
}) {
  if (values.length === 0) return null
  return (
    <DetailSection title={title}>
      <AttributeChips values={values.map(([id, value]) => ({ key: id, label: localizedText(attributeById.get(id)?.name), value: `+${formatNumber(value)}` }))} />
    </DetailSection>
  )
}

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

function PetSkill({ skill, role }: { skill: PetSkillRecord; role: string }) {
  return (
    <SkillRow
      icon={<IconTile src={resourceUrl(skill.icon)} fallback={<Zap aria-hidden="true" className="size-5 text-muted-foreground" />} />}
      name={localizedText(skill.name)}
      tag={role}
    >
      <p className="text-xs leading-relaxed text-muted-foreground">{stripGameMarkup(localizedText(skill.description) || content.wiki.pets.noDescription)}</p>
      {skill.cooldown > 0 ? <span className="text-xs text-muted-foreground">{content.wiki.pets.cooldown.replace('{seconds}', formatSeconds(skill.cooldown))}</span> : null}
    </SkillRow>
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

function formatNumber(value?: number): string {
  return value === undefined ? '-' : numberFormatter.format(value)
}

function formatSeconds(milliseconds: number): string {
  return String(Math.round(milliseconds / 100) / 10)
}
