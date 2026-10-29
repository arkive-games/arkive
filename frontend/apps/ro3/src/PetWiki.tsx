import { useEffect, useMemo, useRef, useState } from 'react'
import { Crown, Search, Shield, Sparkles, Star, Swords, Zap } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { localizedText } from './cardCatalog'
import { filterPets, findPetStar, petSkillIds } from './creatureCatalog'
import { loadPetWikiData, type PetRecord, type PetStarRecord, type PetWikiData } from './creatureData'
import { Notice } from './components/wiki'
import { GameText } from './components/GameText'
import { LevelStepper } from './components/LevelStepper'
import { HeaderAction } from './components/SectionNav'
import { resourceUrl } from './lib/urls'
import content from './locales/zh-CN.json'

const text = content.wiki.pets
const QUALITIES = [5, 4, 3]
const STARS = [1, 2, 3, 4, 5, 6]
const STEPPER_LABELS = { group: text.starPicker, down: text.starDown, up: text.starUp }
const numberFormatter = new Intl.NumberFormat('zh-CN')

/**
 * Every pet, grouped by quality: the game's own cards on the left, and the
 * picked pet's full-body art, strengths, attributes and skills held beside
 * them at the star its stepper is on.
 */
export function PetWiki() {
  const [data, setData] = useState<PetWikiData | null>(null)
  const [dataError, setDataError] = useState(false)
  const [quality, setQuality] = useState(0)
  const [kingOnly, setKingOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number>()
  // One star for every pet, so comparing two at 4 stars takes one click each.
  const [starIndex, setStarIndex] = useState(0)
  // On phones the search field folds behind a button in the wiki header.
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const detail = useRef<HTMLElement>(null)

  useEffect(() => {
    let active = true
    loadPetWikiData()
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

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus()
  }, [searchOpen])

  const shown = useMemo(() => data?.catalog.pets.filter((pet) => pet.show) ?? [], [data])
  // The quality pills count what the other two filters leave, so a number never promises an empty block.
  const unranked = useMemo(() => filterPets(shown, query, 0, kingOnly), [shown, query, kingOnly])
  const pets = quality ? unranked.filter((pet) => pet.quality === quality) : unranked
  const selected = pets.find((pet) => pet.id === selectedId) ?? pets[0]
  const groups = QUALITIES
    .map((value) => ({ quality: value, pets: pets.filter((pet) => pet.quality === value) }))
    .filter((group) => group.pets.length > 0)

  const selectPet = (pet: PetRecord) => {
    setSelectedId(pet.id)
    // Below lg the detail sits above the cards, so bring it back into view.
    if (!window.matchMedia('(min-width: 64rem)').matches) {
      detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const qualityOptions = [
    { value: 0, label: text.all, count: unranked.length },
    ...QUALITIES.map((value) => ({ value, label: String(value), count: unranked.filter((pet) => pet.quality === value).length })),
  ]

  return (
    <div className="pet-wiki flex flex-col gap-4 md:gap-5">
      <HeaderAction>
        <button
          type="button"
          aria-label={text.searchToggle}
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((value) => !value)}
          className={cn(
            'grid size-9 place-items-center rounded-full transition-colors',
            searchOpen
              ? 'bg-foreground text-background'
              : 'bg-[image:var(--arkive-warm-search)] text-[color:var(--arkive-warm-search-foreground)] shadow-[0_0.3rem_0.8rem_rgba(236,122,28,0.28)]',
          )}
        >
          <Search aria-hidden="true" className="size-4" />
        </button>
      </HeaderAction>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {/* Quality is the page's main choice: a muted track whose lit pill is filled. */}
          <div className="min-w-0 overflow-x-auto rounded-full bg-muted [scrollbar-width:none]">
            <div role="group" aria-label={text.qualityLabel} className="flex w-max gap-0.5 p-1">
              {qualityOptions.map((option) => {
                const active = option.value === quality
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setQuality(option.value)}
                    className={cn(
                      'flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-semibold transition-colors md:min-h-10 md:px-4',
                      active ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {option.value ? <Star aria-hidden="true" className="size-3.5 fill-current" /> : null}
                    {option.label}
                    <span className={cn('text-xs tabular-nums', active ? 'text-background/70' : 'text-muted-foreground/70')}>{option.count}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <button
            type="button"
            aria-pressed={kingOnly}
            onClick={() => setKingOnly((value) => !value)}
            className={cn(
              'flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors md:h-12 md:w-auto md:px-4',
              kingOnly
                ? 'bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)] shadow-[inset_0_0_0_1.5px_var(--arkive-nav-active)]'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            <Crown aria-hidden="true" className="size-4" />
            {/* Phones keep only the crown, so the whole filter row fits one line. */}
            <span className="sr-only md:not-sr-only">{text.kingToggle}</span>
          </button>
        </div>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            searchInput.current?.focus()
          }}
          className={cn(
            'w-full items-center gap-2 rounded-full border border-border bg-card py-1 pl-4 pr-1 transition-shadow focus-within:ring-2 focus-within:ring-ring/40 lg:flex lg:w-[23rem]',
            searchOpen ? 'flex' : 'hidden',
          )}
        >
          <input
            ref={searchInput}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={text.searchLabel}
            placeholder={text.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            aria-label={text.searchLabel}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-[image:var(--arkive-warm-search)] text-[color:var(--arkive-warm-search-foreground)] shadow-[0_0.3rem_0.8rem_rgba(236,122,28,0.28)] transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] hover:scale-105"
          >
            <Search aria-hidden="true" className="size-4" />
          </button>
        </form>
      </div>

      {dataError ? <Notice>{content.wiki.dataError}</Notice> : !data ? <Notice>{content.wiki.loading}</Notice> : groups.length === 0 ? (
        <Notice>{text.empty}</Notice>
      ) : (
        // Cards on the left, the picked pet held beside them; phones put the detail first.
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_27rem]">
          <ol aria-label={text.title} className="order-2 flex flex-col gap-4 rounded-lg border border-border bg-card p-2.5 md:p-4 lg:order-1">
            {groups.map((group) => (
              <QualityGroup
                key={group.quality}
                quality={group.quality}
                pets={group.pets}
                selectedId={selected?.id}
                onSelect={selectPet}
              />
            ))}
          </ol>
          {selected ? (
            <aside
              ref={detail}
              aria-label={localizedText(selected.name)}
              className="order-1 scroll-mt-3 lg:sticky lg:top-4 lg:order-2 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:[scrollbar-width:thin]"
            >
              <PetDetail pet={selected} data={data} starIndex={starIndex} onStar={setStarIndex} />
            </aside>
          ) : null}
        </div>
      )}
    </div>
  )
}

/** One quality: a small heading in its own colour, then its cards. */
function QualityGroup({ quality, pets, selectedId, onSelect }: {
  quality: number
  pets: PetRecord[]
  selectedId?: number
  onSelect: (pet: PetRecord) => void
}) {
  return (
    <li data-quality={quality} className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 px-1">
        <span aria-hidden="true" className="flex text-[color:var(--ro3-stage-solid)]">
          {Array.from({ length: quality }, (_, star) => <Star key={star} className="size-3.5 fill-current" />)}
        </span>
        <span className="text-base font-bold">{text.quality.replace('{quality}', String(quality))}</span>
        <span className="rounded-full bg-[color:var(--ro3-stage-mid)] px-2 text-xs font-bold leading-5 text-[color:var(--ro3-stage)]">
          {text.groupCount.replace('{count}', String(pets.length))}
        </span>
        <span aria-hidden="true" className="h-px flex-1 bg-[linear-gradient(90deg,var(--ro3-stage-mid),transparent)]" />
      </h3>
      <div
        aria-label={text.rosterLabel.replace('{quality}', String(quality))}
        className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-x-1 gap-y-1.5 md:grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]"
      >
        {pets.map((pet) => (
          <PetTile key={pet.id} pet={pet} selected={pet.id === selectedId} onSelect={() => onSelect(pet)} />
        ))}
      </div>
    </li>
  )
}

function PetTile({ pet, selected, onSelect }: { pet: PetRecord; selected: boolean; onSelect: () => void }) {
  const name = localizedText(pet.name)
  return (
    <button
      type="button"
      aria-pressed={selected}
      title={name}
      onClick={onSelect}
      className={cn(
        'group relative flex min-w-0 flex-col items-center gap-1 rounded-xl p-1 pb-1.5 transition-colors',
        selected ? 'bg-[color:var(--arkive-filter-active)]' : 'hover:bg-muted',
      )}
    >
      {/* The game's own card, quality frame and all. */}
      <span
        className={cn(
          'block aspect-square w-full overflow-hidden rounded-lg bg-muted transition-transform duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] group-hover:-translate-y-0.5',
          selected ? 'ring-2 ring-[color:var(--arkive-nav-active)]' : 'ring-1 ring-inset ring-black/5',
        )}
      >
        <img src={resourceUrl(pet.art.fightField)} alt="" loading="lazy" className="size-full object-cover" />
      </span>
      <span className={cn('max-w-full truncate text-xs', selected ? 'font-bold text-[color:var(--arkive-nav-active)]' : 'text-foreground/80')}>
        {name}
      </span>
      {pet.king ? (
        <span title={text.king} className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-card text-[color:var(--ro3-stage-solid)] shadow-[0_0_0_1px_var(--border)]">
          <Crown aria-hidden="true" className="size-3" />
        </span>
      ) : null}
    </button>
  )
}

/**
 * The picked pet in the side column: its full-body art on a quality glow with
 * its name, strengths and star stepper, then its attributes and its skills at
 * that star. Phones keep the art beside the name so the cards stay in reach.
 */
function PetDetail({ pet, data, starIndex, onStar }: {
  pet: PetRecord
  data: PetWikiData
  starIndex: number
  onStar: (index: number) => void
}) {
  const star = STARS[starIndex]
  const row = findPetStar(data.stars.stars, pet.id, star)
  const skillById = useMemo(() => new Map(data.skills.skills.map((skill) => [skill.id, skill])), [data])
  const attributeById = useMemo(() => new Map(data.catalog.attributes.map((attribute) => [attribute.id, attribute])), [data])
  const skills = petSkillIds(row).flatMap((id) => {
    const skill = skillById.get(id)
    return skill ? [{ skill, role: petSkillRole(row, id) }] : []
  })
  const attributeGroups = [
    { key: 'fight', label: text.fightAttributes, values: row?.fightAttributes ?? [] },
    { key: 'collect', label: text.collectAttributes, values: row?.collectAttributes ?? [] },
  ].filter((group) => group.values.length > 0)
  const strengths = [
    { key: 'fight', label: text.fightStrength, value: row?.starFightStrength, Icon: Swords },
    { key: 'assist', label: text.assistStrength, value: row?.starAssistStrength, Icon: Shield },
    { key: 'collect', label: text.collectStrength, value: row?.collectStrength, Icon: Sparkles },
  ]
  const name = localizedText(pet.name)

  return (
    <div data-quality={pet.quality} className="flex flex-col gap-3 rounded-lg bg-[color:var(--ro3-skill-panel)] p-2.5 md:p-3">
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-1">
        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_58%,var(--ro3-stage-mid),var(--ro3-stage-soft)_62%,transparent_80%)] lg:aspect-[5/4]">
          <img
            src={resourceUrl(pet.art.encyclopedia)}
            alt={name}
            className="absolute inset-0 size-full -translate-y-[9%] scale-[1.45] object-contain lg:-translate-y-[6%] lg:scale-[1.3]"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate text-xl font-extrabold">{name}</h3>
            <span className="flex items-center gap-0.5 text-[color:var(--ro3-stage-solid)]" title={text.quality.replace('{quality}', String(pet.quality))}>
              {Array.from({ length: pet.quality }, (_, index) => <Star key={index} aria-hidden="true" className="size-3 fill-current" />)}
              <span className="sr-only">{text.quality.replace('{quality}', String(pet.quality))}</span>
            </span>
            {pet.king ? (
              <span className="flex items-center gap-1 rounded-full bg-card px-2 text-xs font-bold leading-5 text-[color:var(--ro3-stage)] shadow-[0_0_0_1px_var(--border)]">
                <Crown aria-hidden="true" className="size-3" />
                {text.king}
              </span>
            ) : null}
          </div>
          <dl className="flex flex-col gap-1 lg:flex-row lg:flex-wrap lg:gap-x-4">
            {strengths.map(({ key, label, value, Icon }) => (
              <div key={key} className="flex items-center gap-1.5">
                <Icon aria-hidden="true" className="size-4 shrink-0 text-[color:var(--ro3-stage)]" />
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-base font-extrabold tabular-nums">{formatNumber(value)}</dd>
              </div>
            ))}
          </dl>
          <div className="self-start">
            <LevelStepper index={starIndex} last={STARS.length - 1} current={star} top={STARS[STARS.length - 1]} onChange={onStar} unit={text.starUnit} labels={STEPPER_LABELS} />
          </div>
        </div>
      </div>

      {attributeGroups.length > 0 ? (
        <dl aria-label={text.attributeBonus} className="flex flex-col gap-1.5">
          {attributeGroups.map((group) => (
            <div key={group.key} className="flex items-start gap-2">
              <dt className="shrink-0 pt-1 text-xs font-semibold text-muted-foreground">{group.label}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {group.values.map(([id, value]) => (
                  <span key={id} className="flex items-baseline gap-1 rounded-md bg-card px-2 py-1 text-xs shadow-[0_0_0_1px_var(--border)]">
                    {localizedText(attributeById.get(id)?.name)}
                    <b className="font-bold tabular-nums text-[color:var(--ro3-stage)]">+{formatNumber(value)}</b>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {skills.length > 0 ? (
        <ul aria-label={text.skills} className="flex flex-col gap-2">
          {skills.map(({ skill, role }) => (
            <li key={skill.id} className="flex gap-2.5 rounded-lg bg-card p-2.5 shadow-[0_0_0_1px_var(--border)]">
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                {skill.icon ? <img src={resourceUrl(skill.icon)} alt="" loading="lazy" className="size-full object-contain" /> : <Zap aria-hidden="true" className="size-5 text-muted-foreground" />}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <strong className="text-sm font-bold">{localizedText(skill.name)}</strong>
                  <span className="rounded-md bg-[color:var(--arkive-filter-active)] px-1.5 text-xs font-bold leading-5 text-[color:var(--arkive-nav-active)]">{role}</span>
                  {skill.cooldown > 0 ? (
                    <span className="text-xs text-muted-foreground">{text.cooldown.replace('{seconds}', formatSeconds(skill.cooldown))}</span>
                  ) : null}
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">
                  <GameText value={localizedText(skill.description ?? undefined) || text.noDescription} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">{text.noSkills}</p>}
    </div>
  )
}
function petSkillRole(row: PetStarRecord | null, id: number): string {
  if (!row) return text.otherSkill
  if (row.activeSkills.includes(id)) return text.activeSkill
  if (row.passiveMain === id) return text.passiveSkill
  if (row.protectSkill === id) return text.protectSkill
  if (row.corePassiveSkill === id) return text.coreSkill
  return text.otherSkill
}

function formatNumber(value?: number): string {
  return value === undefined ? '-' : numberFormatter.format(value)
}

function formatSeconds(milliseconds: number): string {
  return String(Math.round(milliseconds / 100) / 10)
}
