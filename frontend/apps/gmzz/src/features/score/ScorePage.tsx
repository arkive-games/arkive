import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { IconDatabase, IconInfoCircle } from '@tabler/icons-react'
import { Input, useDocumentTitle } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { ContentPage } from '@/components/ContentPage'
import EquipmentSection, { type EquipmentTotals } from '@/features/equipment/EquipmentSection'
import { loadEquipment, playableProfessions, type Equipment, type Grace } from '@/features/equipment/data'
import {
  loadFellowRelations,
  loadFellows,
  loadHistoryResearch,
  type Fellow,
  type FellowRelation,
  type HistoryResearchRank,
} from '@/features/fellows/data'
import RelicSection, { type RelicTotals } from '@/features/relics/RelicSection'
import RelicServerToggle from '@/features/relics/RelicServerToggle'
import { loadRelics, type Relics } from '@/features/relics/data'
import BondsSection, { FELLOW_SKILL_MODULE, HISTORY_MODULE, PUPPET_GAIN_MODULE, PUPPET_SKILL_MODULE, type BondsData } from '@/features/score/BondsSection'
import { carriedPuppetSkill, clampSkillLevel, evaluatePuppets, historyScore, scoringOnDay } from '@/features/score/bonds'
import { serverDay } from '@/lib/server'
import { carriedFellowSkill, relationResearchPoints, pathwaySkillScore, skillLevelCap, starMap } from '@/features/score/fellowSkill'
import {
  benchmarkAt,
  clamp,
  evaluate,
  headroom,
  loadRating,
  materialsFor,
  type GenusResult,
  type Rating,
} from '@/features/score/data'
import { GroupSection } from '@/features/score/GroupSection'
import PathwaySection, { LEVEL_MODULE, SKILL_MODULE, TALENT_MODULE } from '@/features/score/PathwaySection'
import { carryTalents, evaluateTalents, loadTalents, talentLimits, treeFor, type Talents } from '@/features/score/talents'
import { loadPartnerScoring, loadSecretPartners, type PartnerScoring, type SecretPartner } from '@/features/secretpartners/data'
import { CharacterBar } from '@/features/characters/CharacterBar'
import { CharacterProvider, useCharacter, useSection } from '@/features/characters/CharacterProvider'
import { lastCharacter } from '@/features/characters/memory'
import { useMemory } from '@gamemap/state-memory'
import { TYPE } from '@/lib/typography'

/**
 * The client's module keys for the items whose score a section derives and
 * reports upward. Keyed by module rather than species id, which is the
 * dataset's to assign.
 */
const EQUIPMENT_MODULES: Record<keyof Omit<EquipmentTotals, 'total'>, string> = {
  base: 'Equip_Basic',
  reforge: 'Equip_Word',
  enhance: 'Equip_Grow',
  suit: 'Equip_Suit',
}
const RELIC_MODULES: Record<keyof Omit<RelicTotals, 'total' | 'skillLevelBonus'>, string> = {
  assembly: 'Relics_Basic',
  resonance: 'Relics_Main',
  affix: 'Relics_Word',
}

/** `CEGenusData` ids, in the panel's order. */
const PATHWAY_GENUS = 1
const EQUIPMENT_GENUS = 2
const RELICS_GENUS = 3
const BONDS_GENUS = 4

/** Each group's colour (an `r,g,b` triple, for alpha mixes): its folder tab, panel tint and share of the ring. */
const GENUS_COLOR: Record<number, string> = {
  [PATHWAY_GENUS]: '72,150,160',
  [EQUIPMENT_GENUS]: '230,164,23',
  [RELICS_GENUS]: '214,90,70',
  [BONDS_GENUS]: '124,96,214',
}
const genusColor = (id: number) => GENUS_COLOR[id] ?? '120,120,120'

/** The rating's wording for an overall percentage, worst to best, by its upper bound. */
const BANDS: { upTo: number; key: string }[] = [
  { upTo: 49, key: 'score.bandLow' },
  { upTo: 75, key: 'score.bandMid' },
  { upTo: 99, key: 'score.bandHigh' },
  { upTo: Infinity, key: 'score.bandTop' },
]

/**
 * The score page on the local draft. A signed-in player who last edited a saved
 * character is taken back to it, unless they asked for the draft (`?draft`).
 */
export default function ScorePage() {
  const search = useSearch({ strict: false }) as { draft?: boolean }
  return (
    <CharacterProvider id={null}>
      <ReturnToLastCharacter skip={Boolean(search.draft)} />
      <ScoreView />
    </CharacterProvider>
  )
}

/** The score page on a saved character: the owner edits it, anyone else reads it. */
export function SavedScorePage() {
  const { id } = useParams({ strict: false }) as { id: string }
  // Keyed so a switch to another character starts from a clean provider.
  return (
    <CharacterProvider key={id} id={id}>
      <ScoreView />
    </CharacterProvider>
  )
}

function ReturnToLastCharacter({ skip }: { skip: boolean }) {
  const { characters } = useCharacter()
  const [last] = useMemory(lastCharacter)
  const navigate = useNavigate()
  useEffect(() => {
    if (skip || !last || !characters?.some((entry) => entry.id === last)) return
    void navigate({ to: '/score/c/$id', params: { id: last }, replace: true })
  }, [skip, last, characters, navigate])
  return null
}

function ScoreView() {
  const character = useCharacter()
  const { t } = useTranslation()
  const [rating, setRating] = useState<Rating | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [draft, setDraft] = useSection('character')
  const [bonds, setBonds] = useSection('bonds')
  const [talentState, setTalentState] = useSection('talents')
  // The group whose panel is open. The others stay mounted, hidden: the
  // equipment and relic sections report their totals only while mounted.
  const [tab, setTab] = useState(PATHWAY_GENUS)
  const [equipment, setEquipment] = useState<{ equipment: Equipment; graces: Grace[] } | null>(null)
  const [relics, setRelics] = useState<Relics | null>(null)
  const [talents, setTalents] = useState<Talents | null>(null)
  const [partners, setPartners] = useState<SecretPartner[] | null>(null)
  const [rawScoring, setScoring] = useState<PartnerScoring | null>(null)
  // The day of the server, read once per visit: puppet levels open on a schedule
  // counted from launch, so the scoring the page uses is the one capped for today.
  const day = useMemo(() => serverDay(), [])
  const scoring = useMemo(() => (rawScoring ? scoringOnDay(rawScoring, Math.max(0, day - 1)) : null), [rawScoring, day])
  const [ranks, setRanks] = useState<HistoryResearchRank[] | null>(null)
  const [fellows, setFellows] = useState<Fellow[] | null>(null)
  const [relations, setRelations] = useState<FellowRelation[] | null>(null)
  // What the two self-contained calculators last reported. They own their own
  // drafts, so their figures arrive by callback rather than being recomputed
  // here; a null is "not loaded yet", which scores as nothing.
  const [equipmentTotals, setEquipmentTotals] = useState<EquipmentTotals | null>(null)
  const [relicTotals, setRelicTotals] = useState<RelicTotals | null>(null)
  const onEquipmentTotals = useCallback((totals: EquipmentTotals) => setEquipmentTotals(totals), [])
  const onRelicTotals = useCallback((totals: RelicTotals) => setRelicTotals(totals), [])
  /**
   * The skill level the given role and divinity level allow, read back off the
   * 人脉技能 max curve. Changing either level moves the shared skill level to
   * this cap, since the cap is where a player's skill level sits as the season
   * opens it; the box stays editable for anyone below it.
   */
  const capAt = (role: number, divinity: number): number | null => {
    const species = rating?.species.find((entry) => entry.module === FELLOW_SKILL_MODULE)
    if (!rating || !species) return null
    return skillLevelCap(
      benchmarkAt(species.max, clamp(role, 1, rating.maxRoleLevel), clamp(divinity, 0, rating.maxDivinityLevel), rating.maxRoleLevel),
    )
  }
  const followCap = (role: number, divinity: number) => {
    const cap = capAt(role, divinity)
    if (cap !== null) setBonds((prev) => ({ ...prev, puppetSkillLevel: cap }))
  }
  const setRoleLevel = (roleLevel: number) => {
    setDraft((prev) => ({ ...prev, roleLevel }))
    followCap(roleLevel, draft.divinityLevel)
  }
  const setDivinityLevel = (divinityLevel: number) => {
    setDraft((prev) => ({ ...prev, divinityLevel }))
    followCap(draft.roleLevel, divinityLevel)
  }
  /**
   * The character's pathway. Global, not per-section: it gates which weapons
   * exist for this character and which talent trees. Read against the dataset
   * rather than trusted: a stored pathway the data no longer offers falls back
   * to the first playable one, as does an unset one, because the page has no
   * default of its own.
   */
  const professionId = useMemo(() => {
    if (!equipment) return draft.professionId
    const playable = playableProfessions(equipment.equipment)
    return playable.some((profession) => profession.id === draft.professionId)
      ? draft.professionId
      : playable[0]?.id ?? null
  }, [draft.professionId, equipment])
  // The pathway change carries every pathway-keyed entry across: the weapon
  // swaps to its counterpart in the equipment section, and the talent points
  // move to the same positions of the new pathway's tree.
  const setProfessionId = (next: number | null) => {
    if (talents) setTalentState((prev) => carryTalents(talents, prev, professionId, next))
    setDraft((prev) => ({ ...prev, professionId: next }))
  }

  useEffect(() => {
    let live = true
    // Every section's data is loaded alongside the rating rather than gating
    // it: a section that fails to load says so in place, and the rest of the
    // page still works.
    const load = <T,>(loader: () => Promise<T>, set: (data: T) => void) =>
      void loader()
        .then((data) => {
          if (live) set(data)
        })
        .catch((cause) => console.error(cause))
    load(loadEquipment, setEquipment)
    load(loadRelics, setRelics)
    load(loadTalents, setTalents)
    load(loadSecretPartners, setPartners)
    load(loadPartnerScoring, setScoring)
    load(loadHistoryResearch, setRanks)
    load(loadFellows, setFellows)
    load(loadFellowRelations, setRelations)
    loadRating()
      .then((data) => {
        if (live) setRating(data)
      })
      .catch((cause) => {
        console.error(cause)
        if (live) setError(true)
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [])

  useDocumentTitle(`${t('score.title')} - ${t('siteTitle')}`)

  // Stored levels are clamped to the dataset's range, so a draft written under
  // a higher cap cannot push a benchmark past the curve it is read from.
  const roleLevel = rating ? clamp(draft.roleLevel, 1, rating.maxRoleLevel) : draft.roleLevel
  const divinityLevel = rating ? clamp(draft.divinityLevel, 0, rating.maxDivinityLevel) : draft.divinityLevel
  // Every item is derived from the inputs and graded by one `evaluate`, so
  // no group total needs a special case. An item the page cannot derive is
  // absent here and scores nothing.
  const scores = useMemo(() => {
    const merged: Record<string, number> = {}
    if (!rating) return merged
    const put = (module: string, value: number) => {
      const species = rating.species.find((entry) => entry.module === module)
      if (species) merged[species.id] = value
    }
    // 等级 scores exactly its expected benchmark at the chosen role and divinity
    // level — the panel shows the two equal — so it follows the level inputs
    // rather than being typed. Its expected and max curves are identical, so
    // the item always grades at 100%.
    const level = rating.species.find((entry) => entry.module === LEVEL_MODULE)
    if (level) put(LEVEL_MODULE, benchmarkAt(level.expected, roleLevel, divinityLevel, rating.maxRoleLevel))
    // The pathway skill follows the same shared skill level as the puppet and
    // connection skills; see `pathwaySkillScore` for what is fitted.
    const pathwaySkill = rating.species.find((entry) => entry.module === SKILL_MODULE)
    const fellowCurve = rating.species.find((entry) => entry.module === FELLOW_SKILL_MODULE)
    if (pathwaySkill) {
      put(SKILL_MODULE, pathwaySkillScore(
        clampSkillLevel(bonds.puppetSkillLevel),
        benchmarkAt(pathwaySkill.max, roleLevel, divinityLevel, rating.maxRoleLevel),
        fellowCurve ? skillLevelCap(benchmarkAt(fellowCurve.max, roleLevel, divinityLevel, rating.maxRoleLevel)) : null,
      ))
    }
    // Talents are scored under the limits the progression allows (see `talentLimits`).
    const talentCurve = rating.species.find((entry) => entry.module === TALENT_MODULE)
    const talentTree = talents ? treeFor(talents, professionId, talentState.treeId) : null
    const talentMax = talentCurve ? benchmarkAt(talentCurve.max, roleLevel, divinityLevel, rating.maxRoleLevel) : 0
    put(TALENT_MODULE, talentTree ? evaluateTalents(talentTree, talentState.levels, talentLimits(talentTree, talentMax)).total : 0)
    for (const [part, module] of Object.entries(EQUIPMENT_MODULES)) {
      put(module, equipmentTotals?.[part as keyof EquipmentTotals] ?? 0)
    }
    for (const [part, module] of Object.entries(RELIC_MODULES)) {
      put(module, relicTotals?.[part as keyof RelicTotals] ?? 0)
    }
    put(PUPPET_GAIN_MODULE, partners && scoring ? evaluatePuppets(bonds.puppets, partners, scoring, bonds.dominateSlots).total : 0)
    put(
      PUPPET_SKILL_MODULE,
      partners && scoring ? carriedPuppetSkill(bonds.puppets, partners, scoring, bonds.skillPartnerId, bonds.puppetSkillLevel)?.result.score ?? 0 : 0,
    )
    const research = relations ? relationResearchPoints(relations, starMap(bonds.fellows ?? [])) : 0
    put(HISTORY_MODULE, ranks ? historyScore(ranks, research) : 0)
    put(
      FELLOW_SKILL_MODULE,
      fellows && relations
        ? carriedFellowSkill(bonds.fellows ?? [], fellows, relations, bonds.fellowSkillId, bonds.fellowRelationId, clampSkillLevel(bonds.puppetSkillLevel))?.score ?? 0
        : 0,
    )
    return merged
  }, [rating, roleLevel, divinityLevel, talents, professionId, talentState, equipmentTotals, relicTotals, partners, scoring, ranks, fellows, relations, bonds])
  const result = useMemo(
    () => (rating ? evaluate(rating, roleLevel, divinityLevel, scores) : null),
    [rating, roleLevel, divinityLevel, scores],
  )
  const skillCap = capAt(roleLevel, divinityLevel)
  const talentSpecies = rating?.species.find((entry) => entry.module === TALENT_MODULE)
  const talentBenchmark = rating && talentSpecies ? benchmarkAt(talentSpecies.max, roleLevel, divinityLevel, rating.maxRoleLevel) : 0
  const relicSkillBonus = relicTotals?.skillLevelBonus ?? 0
  const bondsData: BondsData = { partners, scoring, ranks, fellows, relations, skillCap, relicSkillBonus }
  const gaps = useMemo(() => (result ? headroom(result).slice(0, 5) : []), [result])

  if (character.id && (character.status === 'missing' || (character.status === 'error' && !character.character))) {
    return (
      <ContentPage active="/score" title={t('score.title')} wide>
        <div className="space-y-2" data-testid="character-missing">
          <h1 className={TYPE.pageTitle}>{t(character.status === 'missing' ? 'characters.missingTitle' : 'characters.loadErrorTitle')}</h1>
          {character.status === 'missing' ? <p className={TYPE.body}>{t('characters.missingBody')}</p> : null}
          <Link to="/score" search={{ draft: true }} className="text-sm font-medium text-[color:var(--arkive-nav-accent)] underline-offset-2 hover:underline">
            {t('characters.backToDraft')}
          </Link>
        </div>
      </ContentPage>
    )
  }

  if (loading || character.status === 'loading') {
    return (
      <ContentPage active="/score" title={t('score.title')} wide>
        <div className="space-y-5" role="status" aria-label={t('common.loading')} data-testid="score-loading">
          <div className="h-28 animate-pulse rounded-md bg-muted" />
          <div className="h-24 animate-pulse rounded-md bg-muted" />
          <div className="h-96 animate-pulse rounded-md bg-muted" />
        </div>
      </ContentPage>
    )
  }

  if (error || !rating || !result) {
    return (
      <ContentPage active="/score" title={t('score.title')} wide>
        <p className="text-sm text-muted-foreground">{t('score.loadError')}</p>
      </ContentPage>
    )
  }

  const atCap = roleLevel >= rating.maxRoleLevel
  const groupById = new Map(result.groups.map((group) => [group.genus.id, group]))
  /** A group section, or nothing if the dataset has no such group. */
  const section = (id: number, render: (group: GenusResult) => React.ReactNode) => {
    const group = groupById.get(id)
    return group ? render(group) : null
  }

  // Role level, divinity level and pathway drive the whole page, but they head
  // the 途径 group, whose items follow them most directly.
  const progression = (
    <div role="group" aria-label={t('score.progression')}
      className="grid gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(2,minmax(0,10rem))_minmax(0,13rem)]">
      <LevelField
        label={t('score.roleLevel')}
        hint={t('score.roleLevelHint')}
        value={roleLevel}
        min={1}
        max={rating.maxRoleLevel}
        onChange={setRoleLevel}
        testId="score-role-level"
      />
      <LevelField
        label={t('score.divinityLevel')}
        hint={atCap ? t('score.divinityHint') : t('score.divinityInactive', { level: rating.maxRoleLevel })}
        value={divinityLevel}
        min={0}
        max={rating.maxDivinityLevel}
        onChange={setDivinityLevel}
        disabled={!atCap}
        testId="score-divinity-level"
      />
      {equipment ? (
        <label className="block">
          <span className={`block ${TYPE.label}`}>{t('score.pathway')}</span>
          <select
            value={professionId ?? ''}
            onChange={(event) => setProfessionId(event.target.value === '' ? null : Number(event.target.value))}
            className="mt-0.5 h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]"
            data-testid="score-pathway"
          >
            {playableProfessions(equipment.equipment).map((profession) => (
              <option key={profession.id} value={profession.id}>
                {profession.sequenceName} · {profession.name}
              </option>
            ))}
          </select>
          <span className="mt-0.5 block text-xs text-muted-foreground">{t('score.pathwayHint')}</span>
        </label>
      ) : null}
    </div>
  )

  // Every group's inputs, one per tab. All stay mounted behind the hidden
  // tabs: the equipment and relic sections report their totals from effects.
  const panels: Record<number, React.ReactNode> = {
    [PATHWAY_GENUS]: section(PATHWAY_GENUS, (group) => (
      <PathwaySection
        progression={progression}
        group={group}
        rating={rating}
        talents={talents}
        professionId={professionId}
        draft={talentState}
        setDraft={setTalentState}
        skillLevel={Math.min(clampSkillLevel(bonds.puppetSkillLevel), skillCap ?? Infinity)}
        skillCap={skillCap}
        relicSkillBonus={relicSkillBonus}
        onSkillLevel={(level) => setBonds((prev) => ({ ...prev, puppetSkillLevel: level }))}
        talentBenchmark={talentBenchmark}
      />
    )),
    [EQUIPMENT_GENUS]: section(EQUIPMENT_GENUS, (group) => (
      <GroupSection group={group} rating={rating} hint={t('score.equipmentHint')} present={() => ({ kind: 'derived' })}>
        {equipment ? (
          <EquipmentSection equipment={equipment.equipment} graces={equipment.graces} professionId={professionId} onTotals={onEquipmentTotals} />
        ) : (
          <p className={TYPE.body}>{t('score.sectionUnavailable')}</p>
        )}
      </GroupSection>
    )),
    [RELICS_GENUS]: section(RELICS_GENUS, (group) => (
      <GroupSection group={group} rating={rating} hint={t('score.relicsHint')} present={() => ({ kind: 'derived' })}>
        {relics ? <RelicSection relics={relics} onTotals={onRelicTotals} /> : <p className={TYPE.body}>{t('score.sectionUnavailable')}</p>}
      </GroupSection>
    )),
    [BONDS_GENUS]: section(BONDS_GENUS, (group) => (
      <BondsSection group={group} rating={rating} data={bondsData} draft={bonds} setDraft={setBonds} />
    )),
  }

  return (
    <ContentPage active="/score" title={t('score.title')} wide>
      <div data-testid="score-page" className="grid items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* The rail: who is being scored, the score, and the one switch every
            relic number depends on. It stays in view beside the long panels on
            wide screens and stacks above them on narrow ones. */}
        <aside className="min-w-0 space-y-3 rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-0" data-testid="score-rail">
          <h1 className={TYPE.pageTitle}>{t('score.title')}</h1>
          <CharacterBar />
          <section aria-label={t('score.total')}>
            <Summary result={result} day={day} />
          </section>
          {relics ? <RelicServerToggle testId="score-relic-server" /> : null}
        </aside>

        <div className="min-w-0 space-y-4">
        {/* The four groups as folder tabs: the open one joins the panel below in its colour. */}
        <div role="tablist" aria-label={t('score.groupsLabel')}
          className="grid grid-cols-2 items-end gap-1.5 sm:grid-cols-4" data-testid="score-tabs">
          {result.groups.map((group) => {
            const on = group.genus.id === tab
            const color = genusColor(group.genus.id)
            return (
              <button key={group.genus.id} type="button" role="tab" aria-selected={on}
                id={`score-tab-${group.genus.id}`} aria-controls={`score-panel-${group.genus.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setTab(group.genus.id)}
                onKeyDown={(event) => {
                  const ids = result.groups.map((g) => g.genus.id)
                  const at = ids.indexOf(group.genus.id)
                  const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: ids.length - 1 }[event.key]
                  if (next === undefined) return
                  event.preventDefault()
                  const id = ids[(next + ids.length) % ids.length]
                  setTab(id)
                  document.getElementById(`score-tab-${id}`)?.focus()
                }}
                style={{ '--g': color } as React.CSSProperties}
                className={`relative min-w-0 rounded-xl border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)] sm:rounded-b-none sm:border-b-0 ${
                  on
                    ? 'z-10 border-[rgba(var(--g),0.45)] bg-[rgba(var(--g),0.1)] py-3 shadow-[inset_0_4px_0_rgb(var(--g))] sm:-mb-px sm:pb-3.5'
                    : 'border-border bg-card py-2.5 hover:bg-[rgba(var(--g),0.06)]'
                }`}
                data-testid={`score-tab-${group.genus.id}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm font-bold ${on ? 'text-foreground' : 'text-muted-foreground'}`}>{group.genus.name}</span>
                  <span className={`shrink-0 rounded-full px-2 text-xs font-bold tabular-nums ${on ? 'bg-[rgba(var(--g),0.18)] text-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {Math.round(group.percent * 100)}%
                  </span>
                </span>
                <span className={`block text-lg font-semibold tabular-nums ${on ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {group.score.toLocaleString()}
                </span>
              </button>
            )
          })}
        </div>

        <div className="-mt-4 min-w-0" data-testid="score-inputs">

        {result.groups.map((group) => (
          <div key={group.genus.id} role="tabpanel" id={`score-panel-${group.genus.id}`} aria-labelledby={`score-tab-${group.genus.id}`}
            hidden={group.genus.id !== tab}
            style={{ '--g': genusColor(group.genus.id) } as React.CSSProperties}
            className="min-w-0 rounded-2xl border border-[rgba(var(--g),0.45)] bg-[rgba(var(--g),0.05)] p-3 sm:rounded-t-none sm:p-4"
            data-testid={`score-panel-${group.genus.id}`}>
            {/* Read-only for someone else's character: the panel's controls are
                disabled at once, and the setters ignore writes besides. Equipment
                and relics are exempt: their slots open dialogs that must stay
                viewable, and those sections lock their own inputs. */}
            <fieldset className="m-0 min-w-0 border-0 p-0"
              disabled={character.readOnly && group.genus.id !== EQUIPMENT_GENUS && group.genus.id !== RELICS_GENUS}>
              {panels[group.genus.id] ?? null}
            </fieldset>
          </div>
        ))}

        {gaps.length > 0 ? (
          <section aria-label={t('score.headroom')} className="mt-4 rounded-md border border-border bg-card p-3">
            <h2 className="text-sm font-bold text-foreground">{t('score.headroom')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('score.headroomHint')}</p>
            <ol className="mt-2 space-y-1" data-testid="score-headroom">
              {gaps.map((item, index) => (
                <li key={item.species.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="tabular-nums text-muted-foreground">{index + 1}.</span>
                  <span className="font-medium text-foreground">{item.species.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {t('score.gapToExpected', { points: item.toExpected.toLocaleString() })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {materialsFor(rating, item.species).map((m) => m.name).join(' · ')}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="flex items-center gap-2">
            <IconDatabase className="size-4" stroke={1.8} aria-hidden />
            {t('score.dataNote')}
          </p>
          <p className="flex items-center gap-2">
            <IconInfoCircle className="size-4" stroke={1.8} aria-hidden />
            {t('score.aggregateNote')}
          </p>
        </div>
        </div>
      </div>
    </ContentPage>
  )
}

function Summary({ result, day }: { result: NonNullable<ReturnType<typeof evaluate>>; day: number }) {
  const { t } = useTranslation()
  const percent = Math.round(result.percent * 100)
  const band = BANDS.find((b) => percent <= b.upTo) ?? BANDS[BANDS.length - 1]
  return (
    <div data-testid="score-summary" className="space-y-3">
      {/* Deliberately not labelled 非凡评分 (the in-game panel's name): that
          rating is a separate server value, and nothing in the package says it
          equals this sum. */}
      <div className="relative mx-auto aspect-square w-full max-w-44 lg:max-w-56">
        <ScoreRing result={result} />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className={TYPE.label}>{t('score.total')}</span>
          <span className="text-3xl font-bold tabular-nums text-foreground" data-testid="score-total">{result.score.toLocaleString()}</span>
          <span className="text-sm font-semibold tabular-nums text-muted-foreground">{t('score.overall')} {percent}%</span>
        </div>
      </div>
      <div className="flex justify-center">
        <span className="rounded-full bg-[color:var(--arkive-filter-active)] px-3 py-0.5 text-sm font-bold text-foreground" data-testid="score-band">
          {t(band.key)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-muted/60 px-2 py-1.5">
          <dt className={TYPE.label}>{t('score.expectedTotal')}</dt>
          <dd className="text-base font-semibold tabular-nums text-foreground">{result.expected.toLocaleString()}</dd>
        </div>
        <div className="rounded-lg bg-muted/60 px-2 py-1.5">
          <dt className={TYPE.label}>{t('score.maxTotal')}</dt>
          <dd className="text-base font-semibold tabular-nums text-foreground">{result.max.toLocaleString()}</dd>
        </div>
        {day >= 1 ? (
          <div className="col-span-2 rounded-lg bg-muted/60 px-2 py-1.5">
            <dt className={TYPE.label}>{t('score.serverDayLabel')}</dt>
            <dd className="text-base font-semibold tabular-nums text-foreground" data-testid="score-server-day">
              {t('score.serverDay', { day })}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="text-xs text-muted-foreground">{t('score.totalHint')}</p>
    </div>
  )
}

/**
 * The total drawn as two rings: the outer one split by each group's share of
 * the score, in the group's colour; the inner one filled to the overall percent.
 */
function ScoreRing({ result }: { result: NonNullable<ReturnType<typeof evaluate>> }) {
  const outer = 46
  const inner = 37
  const outerLength = 2 * Math.PI * outer
  const innerLength = 2 * Math.PI * inner
  const total = result.groups.reduce((sum, group) => sum + Math.max(0, group.score), 0)
  const gap = result.groups.length > 1 ? 1.5 : 0
  let offset = 0
  return (
    <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
      <circle cx="50" cy="50" r={outer} fill="none" className="stroke-muted" strokeWidth="5" />
      {total > 0
        ? result.groups.map((group) => {
            const length = (Math.max(0, group.score) / total) * outerLength
            const arc = (
              <circle key={group.genus.id} cx="50" cy="50" r={outer} fill="none" strokeWidth="5"
                stroke={`rgb(${genusColor(group.genus.id)})`}
                strokeDasharray={`${Math.max(0, length - gap)} ${outerLength}`}
                strokeDashoffset={-offset} />
            )
            offset += length
            return arc
          })
        : null}
      <circle cx="50" cy="50" r={inner} fill="none" className="stroke-muted" strokeWidth="3" />
      <circle cx="50" cy="50" r={inner} fill="none" strokeWidth="3" strokeLinecap="round"
        className="stroke-[color:var(--arkive-nav-accent)]"
        strokeDasharray={`${Math.min(1, Math.max(0, result.percent)) * innerLength} ${innerLength}`} />
    </svg>
  )
}

function LevelField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  disabled = false,
  testId,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
  testId: string
}) {
  // The field holds what was typed; the clamp lands on blur.
  //
  // Clamping on every keystroke makes a two-digit level unretypable: clearing
  // "70" snaps the box to the minimum, and the next digits append to it — type
  // "65" and you get "165", clamped straight back to 70, so the box shows the
  // value you were trying to replace. `draft` is null whenever the field is not
  // being edited, so external changes still flow in.
  const [draft, setDraft] = useState<string | null>(null)

  return (
    <label className={`block ${disabled ? 'opacity-60' : ''}`}>
      <span className={`block ${TYPE.label}`}>{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft ?? value}
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value
          setDraft(raw)
          // An in-range value applies as you type; anything else waits for blur
          // rather than yanking the caret to a clamped number.
          const parsed = Math.trunc(Number(raw))
          if (raw !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) onChange(parsed)
        }}
        onBlur={() => {
          if (draft !== null) onChange(clamp(Math.trunc(Number(draft)), min, max))
          setDraft(null)
        }}
        className="mt-0.5 h-9 border-border bg-background text-sm tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]"
        data-testid={testId}
      />
      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
    </label>
  )
}
