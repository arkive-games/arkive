import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { IconChevronDown } from '@tabler/icons-react'
import { useDocumentTitle } from '@gamemap/ui'
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
import { relicFormula, useRelicFormulaContext } from '@/features/relics/formulas'
import { equipmentFormula } from '@/features/equipment/formulas'
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
import { GzSelect } from '@/components/GzSelect'
import { lastCharacter } from '@/features/characters/memory'
import { useMemory } from '@gamemap/state-memory'
import { TYPE } from '@/lib/typography'
import { RES_BASE } from '@/lib/urls'
import { bandVar } from '@/features/score/SpeciesRow'
import { Stepper } from '@/features/score/Stepper'
import './score.css'

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

/** Each group's tab icon, a path under the resource root without its extension. */
const GENUS_ICON: Record<number, string> = {
  [PATHWAY_GENUS]: 'utopia/Bard_Skill_04',
  [EQUIPMENT_GENUS]: 'icons/3010660',
  [RELICS_GENUS]: 'icons/2000543',
  [BONDS_GENUS]: 'secretpartners/100',
}

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
  const relicFormulaContext = useRelicFormulaContext(relics)
  const [talents, setTalents] = useState<Talents | null>(null)
  const [partners, setPartners] = useState<SecretPartner[] | null>(null)
  const [rawScoring, setScoring] = useState<PartnerScoring | null>(null)
  // The day of the server, read once per visit: puppet levels open on a schedule
  // counted from launch, so the scoring the page uses is the one capped for today.
  const day = useMemo(() => serverDay(), [])
  const scoring = useMemo(() => (rawScoring ? scoringOnDay(rawScoring, day) : null), [rawScoring, day])
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
  // 重新填写: a fresh local draft, keeping only the pathway and the relic
  // server, which describe the player rather than what they entered. On a
  // saved character it never writes the character: the draft is emptied and
  // opened instead, and the character stays as it was saved.
  const navigate = useNavigate()
  const reset = () => {
    const saved = character.id ? character.character : null
    const question = saved ? t('characters.resetToDraftConfirm', { name: saved.name }) : t('score.resetConfirm')
    if (!window.confirm(question)) return
    character.resetDraft(professionId)
    if (character.id) void navigate({ to: '/score', search: { draft: true } })
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

  // Pathway, role level and divinity level drive the whole page, but they head
  // the 途径 group, whose items follow them most directly. They sit in that
  // group's one bar, beside the shared skill level.
  const progression = (
    <div role="group" aria-label={t('score.progression')} className="contents">
      {equipment ? (
        <div className="gz-field">
          <span>{t('score.pathway')}</span>
          <GzSelect
            value={professionId === null ? '' : String(professionId)}
            onChange={(next) => setProfessionId(next === '' ? null : Number(next))}
            options={playableProfessions(equipment.equipment).map((profession) => ({
              value: String(profession.id),
              label: `${profession.sequenceName} · ${profession.name}`,
            }))}
            label={t('score.pathway')}
            testId="score-pathway"
            className="gz-sel-lg"
          />
        </div>
      ) : null}
      <LevelField
        label={t('score.roleLevel')}
        value={roleLevel}
        min={1}
        max={rating.maxRoleLevel}
        onChange={setRoleLevel}
        testId="score-role-level"
      />
      <LevelField
        label={t('score.divinityLevel')}
        hint={atCap ? undefined : t('score.divinityAfter', { level: rating.maxRoleLevel })}
        value={divinityLevel}
        min={0}
        max={rating.maxDivinityLevel}
        onChange={setDivinityLevel}
        disabled={!atCap}
        testId="score-divinity-level"
      />
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
      <GroupSection group={group} rating={rating} present={() => ({ kind: 'derived' })}
        formula={(item) => equipmentFormula(item.species.module, equipment, professionId)}>
        {equipment ? (
          <EquipmentSection equipment={equipment.equipment} graces={equipment.graces} professionId={professionId} onTotals={onEquipmentTotals} />
        ) : (
          <p className={TYPE.body}>{t('score.sectionUnavailable')}</p>
        )}
      </GroupSection>
    )),
    [RELICS_GENUS]: section(RELICS_GENUS, (group) => (
      <GroupSection group={group} rating={rating} present={() => ({ kind: 'derived' })}
        formula={(item) => relicFormula(item.species.module, relicFormulaContext)}>
        {relics ? <RelicSection relics={relics} onTotals={onRelicTotals} /> : <p className={TYPE.body}>{t('score.sectionUnavailable')}</p>}
      </GroupSection>
    )),
    [BONDS_GENUS]: section(BONDS_GENUS, (group) => (
      <BondsSection group={group} rating={rating} data={bondsData} draft={bonds} setDraft={setBonds} />
    )),
  }

  return (
    <ContentPage active="/score" title={t('score.title')} wide>
      <div data-testid="score-page" className="gz-score">
        {/* The rail: who is being scored, the score, and the one switch every
            relic number depends on. It stays in view beside the long panels on
            wide screens and stacks above them on narrow ones. */}
        <aside className="gz-side gz-tint" data-testid="score-rail">
          <div className="gz-phead">
            <h1>{t('score.title')}</h1>
            <CharacterBar />
            <button type="button" className="gz-reset" onClick={reset} data-testid="score-reset">
              {t('score.reset')}
            </button>
          </div>
          <section className="gz-hero" aria-label={t('score.ratingLabel')}>
            <Summary result={result} day={day} tab={tab} onTab={setTab}
              relicServer={relics ? <RelicServerToggle testId="score-relic-server" /> : null} />
          </section>
          {gaps.length > 0 ? (
            <details className="gz-gaps" data-testid="score-headroom-section">
              <summary>
                {t('score.headroom')}
                <IconChevronDown stroke={2} aria-hidden />
              </summary>
              <ol className="gz-gap-list" data-testid="score-headroom">
                {gaps.map((item, index) => (
                  <li key={item.species.id} className="gz-gap">
                    <span className="n num">{index + 1}</span>
                    <span className="t">
                      <b>{item.species.name}</b>
                      <small className="num">{t('score.gapToExpected', { points: item.toExpected.toLocaleString() })}</small>
                      <small>{materialsFor(rating, item.species).map((m) => m.name).join(' · ')}</small>
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </aside>

        <div className="gz-work">
        {/* The four groups as folder tabs: the open one joins the panel below in its colour. */}
        <div role="tablist" aria-label={t('score.groupsLabel')} className="gz-gtabs" data-testid="score-tabs">
          {result.groups.map((group) => {
            const on = group.genus.id === tab
            const icon = GENUS_ICON[group.genus.id]
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
                style={{ '--c': genusColor(group.genus.id) } as React.CSSProperties}
                className={`gz-gtab ${on ? 'on' : ''}`}
                data-testid={`score-tab-${group.genus.id}`}>
                {icon ? <img src={`${RES_BASE}/${icon}.webp`} alt="" loading="lazy" /> : <span aria-hidden />}
                <strong>{group.genus.name}</strong>
                <span className="v num">{group.score.toLocaleString()}</span>
                <span className="pct num">{Math.round(group.percent * 100)}%</span>
              </button>
            )
          })}
        </div>

        <div className="gz-main" style={{ '--c': genusColor(tab) } as React.CSSProperties} data-testid="score-inputs">
        {result.groups.map((group) => (
          <div key={group.genus.id} role="tabpanel" id={`score-panel-${group.genus.id}`} aria-labelledby={`score-tab-${group.genus.id}`}
            hidden={group.genus.id !== tab}
            style={{ '--c': genusColor(group.genus.id) } as React.CSSProperties}
            className="min-w-0"
            data-testid={`score-panel-${group.genus.id}`}>
            {/* Read-only for someone else's character: the panel's controls are
                disabled at once, and the setters ignore writes besides. Equipment
                and relics are exempt: their slots open dialogs that must stay
                viewable, and those sections lock their own inputs. */}
            <fieldset disabled={character.readOnly && group.genus.id !== EQUIPMENT_GENUS && group.genus.id !== RELICS_GENUS}>
              {panels[group.genus.id] ?? null}
            </fieldset>
          </div>
        ))}
        </div>
        </div>
      </div>
    </ContentPage>
  )
}

/** The rating's band for an overall percentage, and its position worst to best. */
function bandFor(percent: number) {
  const index = BANDS.findIndex((b) => percent <= b.upTo)
  return index < 0 ? BANDS.length - 1 : index
}

function Summary({ result, day, tab, onTab, relicServer }: {
  result: NonNullable<ReturnType<typeof evaluate>>
  day: number
  /** The open group, whose share of the ring is drawn wider; a click on a share opens its group. */
  tab: number
  onTab: (id: number) => void
  relicServer: React.ReactNode
}) {
  const { t } = useTranslation()
  const percent = Math.round(result.percent * 100)
  const band = bandFor(percent)
  return (
    <div data-testid="score-summary" className="contents" style={{ '--b': bandVar(band) } as React.CSSProperties}>
      <div className="gz-ring">
        <ScoreRing result={result} tab={tab} onTab={onTab} />
        <div className="gz-rc">
          <span className="label">{t('score.ratingLabel')}</span>
          <span className="total num" data-testid="score-total">{result.score.toLocaleString()}</span>
          <span className="gz-bandchip num" data-testid="score-band">{t(BANDS[band].key)} {percent}%</span>
        </div>
        <p className="gz-vs num">
          {t('score.expectedTotal')} <b>{result.expected.toLocaleString()}</b>{'　'}
          {t('score.maxTotal')} <b>{result.max.toLocaleString()}</b>
        </p>
      </div>
      <div className="gz-setup">
        {day >= 1 ? (
          <div className="gz-field">
            <span>{t('score.serverDayLabel')}</span>
            <span className="gz-pill num" data-testid="score-server-day">{t('score.serverDay', { day })}</span>
          </div>
        ) : null}
        {relicServer ? <div className={day >= 1 ? '' : 'wide'}>{relicServer}</div> : null}
      </div>
    </div>
  )
}

/**
 * The total drawn as two rings: the outer one split by each group's share of
 * the score, in the group's colour, with the open group's share drawn wider;
 * the inner one filled to the overall percent in the band's colour.
 */
function ScoreRing({ result, tab, onTab }: { result: NonNullable<ReturnType<typeof evaluate>>; tab: number; onTab: (id: number) => void }) {
  const total = result.groups.reduce((sum, group) => sum + Math.max(0, group.score), 0)
  const gap = result.groups.length > 1 ? 1.4 : 0
  const percent = Math.min(1, Math.max(0, result.percent)) * 100
  const lengths = result.groups.map((group) => (total > 0 ? (Math.max(0, group.score) / total) * 100 : 100 / result.groups.length))
  return (
    <svg viewBox="0 0 200 200" aria-hidden>
      <g transform="rotate(-90 100 100)">
        {result.groups.map((group, index) => {
          const shown = Math.max(lengths[index] - gap, 0.1)
          const offset = lengths.slice(0, index).reduce((sum, length) => sum + length, 0)
          return (
            <circle key={group.genus.id} className={`arc ${group.genus.id === tab ? 'on' : ''}`} cx="100" cy="100" r="84" pathLength={100}
              stroke={`rgb(${genusColor(group.genus.id)})`}
              strokeDasharray={`${shown} ${100 - shown}`}
              strokeDashoffset={-offset}
              onClick={() => onTab(group.genus.id)} />
          )
        })}
        <circle className="trk" cx="100" cy="100" r="68" pathLength={100} />
        <circle className="pv" cx="100" cy="100" r="68" pathLength={100} strokeDasharray={`${percent} ${100 - percent}`} />
      </g>
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
  /** A short note beside the label, such as when a disabled field takes effect. */
  hint?: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  disabled?: boolean
  testId: string
}) {
  return (
    <div className={`gz-field ${disabled ? 'off' : ''}`} title={disabled ? hint : undefined}>
      <span>{label}{hint ? <> <em className="num">{hint}</em></> : null}</span>
      <Stepper value={value} min={min} max={max} onChange={onChange} label={label} testId={testId} disabled={disabled} />
    </div>
  )
}
