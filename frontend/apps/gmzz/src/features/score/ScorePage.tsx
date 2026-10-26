import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconDatabase, IconInfoCircle } from '@tabler/icons-react'
import { useMemory } from '@gamemap/state-memory'
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
import { carriedPuppetSkill, clampSkillLevel, emptyBondsDraft, evaluatePuppets, extraResearchPoints, historyScore, isBondsDraft } from '@/features/score/bonds'
import { carriedFellowSkill, relationResearchPoints, skillLevelCap, starMap } from '@/features/score/fellowSkill'
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
import PathwaySection, { LEVEL_MODULE, TALENT_MODULE } from '@/features/score/PathwaySection'
import { emptyTalentDraft, evaluateTalents, isTalentDraft, loadTalents, treeFor, type Talents } from '@/features/score/talents'
import { loadPartnerScoring, loadSecretPartners, type PartnerScoring, type SecretPartner } from '@/features/secretpartners/data'
import { gmzzMemory, isFiniteNumber, isNullableNumber, isRecord } from '@/lib/memory'
import { TYPE } from '@/lib/typography'

/** The character as typed into the page: levels, pathway, and the per-item scores. */
type CharacterDraft = {
  roleLevel: number
  divinityLevel: number
  /** `null` until a pathway is picked; the page then seeds the first playable one. */
  professionId: number | null
  /** Species id → the score the player typed. Keys are strings once stored, as JSON has no other kind. */
  scores: Record<string, number>
}

function isCharacterDraft(value: unknown): value is CharacterDraft {
  return (
    isRecord(value) &&
    isFiniteNumber(value.roleLevel) &&
    isFiniteNumber(value.divinityLevel) &&
    isNullableNumber(value.professionId) &&
    isRecord(value.scores) &&
    Object.values(value.scores).every(isFiniteNumber)
  )
}

/**
 * The inputs survive a reload. They are a draft in the state-memory sense — a
 * calculator's configuration, costly to retype — so they take that class's
 * thirty-day life rather than living for ever.
 */
const characterDraft = gmzzMemory.draft('score/character', {
  default: (): CharacterDraft => ({ roleLevel: 70, divinityLevel: 0, professionId: null, scores: {} }),
  validate: isCharacterDraft,
})

/** The 非凡人物 inputs: owned puppets with their stage and slot, and the research rank. Same draft class and life. */
const bondsDraft = gmzzMemory.draft('score/bonds', {
  default: emptyBondsDraft,
  validate: isBondsDraft,
})

/** The 途径 inputs: the active talent tree and every node's level. */
const talentDraft = gmzzMemory.draft('score/talents', {
  default: emptyTalentDraft,
  validate: isTalentDraft,
})

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
const RELIC_MODULES: Record<keyof Omit<RelicTotals, 'total'>, string> = {
  assembly: 'Relics_Basic',
  resonance: 'Relics_Main',
  affix: 'Relics_Word',
}

/** `CEGenusData` ids, in the panel's order. */
const PATHWAY_GENUS = 1
const EQUIPMENT_GENUS = 2
const RELICS_GENUS = 3
const BONDS_GENUS = 4

export default function ScorePage() {
  const { t } = useTranslation()
  const [rating, setRating] = useState<Rating | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [draft, setDraft] = useMemory(characterDraft)
  const [bonds, setBonds] = useMemory(bondsDraft)
  const [talentState, setTalentState] = useMemory(talentDraft)
  const [equipment, setEquipment] = useState<{ equipment: Equipment; graces: Grace[] } | null>(null)
  const [relics, setRelics] = useState<Relics | null>(null)
  const [talents, setTalents] = useState<Talents | null>(null)
  const [partners, setPartners] = useState<SecretPartner[] | null>(null)
  const [scoring, setScoring] = useState<PartnerScoring | null>(null)
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
  const setProfessionId = (professionId: number | null) => setDraft((prev) => ({ ...prev, professionId }))
  const setScore = (speciesId: number, value: number) =>
    setDraft((prev) => ({ ...prev, scores: { ...prev.scores, [speciesId]: value } }))
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
  // Every derived item is written over whatever the typed map holds for it,
  // so one `evaluate` grades all fourteen the same way and no group total
  // needs a special case.
  const scores = useMemo(() => {
    const merged: Record<string, number> = { ...draft.scores }
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
    put(TALENT_MODULE, talents ? evaluateTalents(treeFor(talents, professionId, talentState.treeId), talentState.levels).total : 0)
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
    const research = (relations ? relationResearchPoints(relations, starMap(bonds.fellows ?? [])) : 0) + extraResearchPoints(bonds)
    put(HISTORY_MODULE, ranks ? historyScore(ranks, research) : 0)
    put(
      FELLOW_SKILL_MODULE,
      fellows && relations
        ? carriedFellowSkill(bonds.fellows ?? [], fellows, relations, bonds.fellowSkillId, bonds.fellowRelationId, clampSkillLevel(bonds.puppetSkillLevel))?.score ?? 0
        : 0,
    )
    return merged
  }, [draft.scores, rating, roleLevel, divinityLevel, talents, professionId, talentState, equipmentTotals, relicTotals, partners, scoring, ranks, fellows, relations, bonds])
  const result = useMemo(
    () => (rating ? evaluate(rating, roleLevel, divinityLevel, scores) : null),
    [rating, roleLevel, divinityLevel, scores],
  )
  const bondsData: BondsData = { partners, scoring, ranks, fellows, relations, skillCap: capAt(roleLevel, divinityLevel) }
  const gaps = useMemo(() => (result ? headroom(result).slice(0, 5) : []), [result])

  if (loading) {
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

  return (
    <ContentPage active="/score" title={t('score.title')} wide>
      <div data-testid="score-page" className="space-y-4">
        <header className="border-b border-border pb-4">
          <h1 className={TYPE.pageTitle}>{t('score.title')}</h1>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">{t('score.description')}</p>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-muted-foreground">{t('score.sourceNote')}</p>
        </header>

        {/* Progression drives every benchmark on the page, so it sits above the
            items rather than beside them. */}
        <section
          aria-label={t('score.progression')}
          className="grid gap-4 rounded-md border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[repeat(2,minmax(0,10rem))_minmax(0,13rem)_minmax(0,1fr)]"
        >
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
          <Summary result={result} />
          {/* Mirrors the switch in the relic section; both write the same stored value. */}
          {relics ? (
            <div className="sm:col-span-2 lg:col-span-4">
              <RelicServerToggle testId="score-relic-server" />
            </div>
          ) : null}
        </section>

        {section(PATHWAY_GENUS, (group) => (
          <PathwaySection
            key={group.genus.id}
            group={group}
            rating={rating}
            talents={talents}
            professionId={professionId}
            draft={talentState}
            setDraft={setTalentState}
            onScore={setScore}
          />
        ))}

        {section(EQUIPMENT_GENUS, (group) => (
          <GroupSection key={group.genus.id} group={group} rating={rating} hint={t('score.equipmentHint')} onScore={setScore} present={() => ({ kind: 'derived' })}>
            {equipment ? (
              <EquipmentSection equipment={equipment.equipment} graces={equipment.graces} professionId={professionId} onTotals={onEquipmentTotals} />
            ) : (
              <p className={TYPE.body}>{t('score.sectionUnavailable')}</p>
            )}
          </GroupSection>
        ))}

        {section(RELICS_GENUS, (group) => (
          <GroupSection key={group.genus.id} group={group} rating={rating} hint={t('score.relicsHint')} onScore={setScore} present={() => ({ kind: 'derived' })}>
            {relics ? <RelicSection relics={relics} onTotals={onRelicTotals} /> : <p className={TYPE.body}>{t('score.sectionUnavailable')}</p>}
          </GroupSection>
        ))}

        {section(BONDS_GENUS, (group) => (
          <BondsSection
            key={group.genus.id}
            group={group}
            rating={rating}
            data={bondsData}
            draft={bonds}
            setDraft={setBonds}
            onScore={setScore}
          />
        ))}

        {gaps.length > 0 ? (
          <section aria-label={t('score.headroom')} className="rounded-md border border-border bg-card p-3">
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
    </ContentPage>
  )
}

function Summary({ result }: { result: NonNullable<ReturnType<typeof evaluate>> }) {
  const { t } = useTranslation()
  const percent = Math.round(result.percent * 100)
  return (
    <div data-testid="score-summary">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        {/* Deliberately not labelled 非凡评分 (the in-game panel's name): that
            rating is a separate server value, and nothing in the package says
            it equals this sum. The hint sits below the row rather than inside
            this cell — a third line here would bottom-align the other tiles
            against it instead of against the total. */}
        <div>
          <div className={TYPE.label}>{t('score.total')}</div>
          <div className="text-3xl font-bold tabular-nums text-foreground" data-testid="score-total">{result.score.toLocaleString()}</div>
        </div>
        <div>
          <div className={TYPE.label}>{t('score.expectedTotal')}</div>
          <div className="text-lg font-semibold tabular-nums text-muted-foreground">
            {result.expected.toLocaleString()}
          </div>
        </div>
        <div>
          <div className={TYPE.label}>{t('score.maxTotal')}</div>
          <div className="text-lg font-semibold tabular-nums text-muted-foreground">{result.max.toLocaleString()}</div>
        </div>
        <div>
          <div className={TYPE.label}>{t('score.overall')}</div>
          <div className="text-lg font-semibold tabular-nums text-foreground">{percent}%</div>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('score.totalHint')}</p>
    </div>
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
