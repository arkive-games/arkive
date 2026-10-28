import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogClose, DialogContent } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { DialogHead, ItemHead, PickBox } from '@/features/equipment/EquipmentSection'
import { IconTile } from '@/features/equipment/PickerModal'
import { iconUrl } from '@/lib/urls'
import { Stepper } from '@/features/score/Stepper'
import { useCharacterReadOnly, useSection } from '@/features/characters/CharacterProvider'
import { storedAffixes, toStoredMaterials, type StoredRelicSlot } from '@/features/relics/memory'
import { useRelicServer } from '@/features/relics/useRelicServer'
import {
  MATERIAL_SLOTS, activeMaterialIndexes, affixValue, artifactsInGroup, currentSeason, effectiveAffixCap, effectiveGrade,
  evaluateRelicSlot, formatStat, gradeOptions, gradeQuality, gradeRung, isRareAffix, k1For, k2For,
  knowledgeLadder, materialTypeAt, maxAffixes, newRelicSlot, poolRungs, poolStats, rareAffixes,
  rareEffect, relicTotals, specIndex, statName, typePool, usedGroups,
  type ChosenRelicAffix, type PoolAffix, type Relics, type RelicServer,
  type RelicSlotResult, type RelicSlotState,
} from '@/features/relics/data'

/** The three 封印物 items as the page's rating grades them. */
export type RelicTotals = {
  assembly: number; resonance: number; affix: number; total: number
  /**
   * All-skill levels the rare words in effect grant (战争主教, 愚者…). They
   * raise the 途径/秘偶/人脉 skill levels in game but never score, so the page
   * shows them next to those levels and adds them to nothing.
   */
  skillLevelBonus: number
}

/**
 * The panel's three slots. 1 攻击 and 2 防御 are fixed — an artifact's `groupId`
 * *is* the slot it goes in, and so is the material type it takes. 3 特化 takes
 * either, and is the only one that asks which.
 */
const GROUP_IDS = [1, 2, 3]
const SPEC_GROUP = 3

/**
 * A relic part before the final floor, to two decimals. The game floors only
 * once the three relics are added up, so the cards show what is being added.
 */
const decimal = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 })

/** A material position across the three slots, for swapping. */
type Position = { groupId: number; index: number }

/** A freshly added affix row: no stat picked, so it scores and counts as nothing. */
const EMPTY_RELIC_AFFIX: ChosenRelicAffix = { stat: '', value: 0, mark: 0 }

function affixFrom(rung: PoolAffix): ChosenRelicAffix {
  return { stat: rung.stat, value: rung.value, mark: rung.mark, affixId: rung.id, scaled: rung.scaled }
}

/**
 * One affix row. An ordinary affix picks a stat and a rung; a rare word picks
 * the word and reads out its effect. A row past the grade's cap is dimmed and
 * tagged in its end column, the reason on the tag's tooltip.
 */
function AffixRow({ relics, affix, others, index, inactive, pool, k2, testPrefix, onChange, onRemove }: {
  relics: Relics; affix: ChosenRelicAffix; others: ChosenRelicAffix[]; index: number; inactive: boolean
  pool: PoolAffix[]; k2: number; testPrefix: string
  onChange: (next: ChosenRelicAffix) => void; onRemove: () => void
}) {
  const { t } = useTranslation()
  const source = pool.find((entry) => entry.id === affix.affixId)
  const rare = source && isRareAffix(source) ? source : null
  // What the other rows of this material already hold: a group at most once,
  // and one rare word at most.
  const taken = usedGroups(pool, others)
  const remove = (
    <button type="button" className="gz-rm" onClick={onRemove} aria-label={t('relic.removeAffix')}
      data-testid={`${testPrefix}-remove-${index}`}>×</button>
  )

  if (rare) {
    return (
      <div className="gz-aff rare" data-testid={`${testPrefix}-row-${index}`}>
        <span className="gz-pip rare">{t('relic.pipRare')}</span>
        <select value={rare.id} aria-label={t('relic.affixRare')} data-testid={`${testPrefix}-stat-${index}`}
          onChange={(event) => {
            const next = pool.find((entry) => entry.id === Number(event.target.value))
            if (next) onChange(affixFrom(next))
          }}>
          {rareAffixes(pool).map((entry) => (
            <option key={entry.id} value={entry.id} disabled={entry.id !== rare.id && taken.groups.has(entry.groupId)}>
              {entry.name ?? statName(relics, entry.stat)}
            </option>
          ))}
        </select>
        <span className="desc" data-testid={`${testPrefix}-rung-${index}`}>{rareEffect(relics, rare, k2)}</span>
        <span className="end">{remove}</span>
      </div>
    )
  }

  const rungs = poolRungs(pool, affix.stat)
  const at = rungs.findIndex((rung) => rung.id === affix.affixId)
  return (
    <div className={`gz-aff ${inactive ? 'off' : ''}`} data-inactive={inactive || undefined} data-testid={`${testPrefix}-row-${index}`}>
      <span className="gz-pip ordinary">{t('relic.pipOrdinary')}</span>
      <select value={affix.stat} aria-label={t('relic.affixStat')} data-testid={`${testPrefix}-stat-${index}`}
        onChange={(event) => {
          const next = poolRungs(pool, event.target.value)[0]
          if (next) onChange(affixFrom(next))
        }}>
        {affix.stat === '' ? <option value="" disabled>{t('relic.affixPick')}</option> : null}
        {poolStats(pool).map((stat) => (
          <option key={stat} value={stat} disabled={stat !== affix.stat && taken.groups.has(poolRungs(pool, stat)[0]?.groupId ?? -1)}>
            {statName(relics, stat)}
          </option>
        ))}
      </select>
      {/* Keyed by the pool row's own id: two rungs of one stat can share a value. */}
      <select value={affix.affixId ?? ''} aria-label={t('relic.affixRung')} data-testid={`${testPrefix}-rung-${index}`}
        onChange={(event) => {
          const next = rungs.find((rung) => rung.id === Number(event.target.value))
          if (next) onChange(affixFrom(next))
        }}>
        {at < 0 ? <option value="">—</option> : null}
        {rungs.map((rung) => (
          <option key={rung.id} value={rung.id}>
            {t('relic.rungOption', { value: formatStat(relics, rung.stat, affixValue(rung, k2)), mark: rung.mark })}
          </option>
        ))}
      </select>
      <span className="end">
        {inactive ? (
          <span className="why" title={t('relic.affixInactive')} data-testid={`${testPrefix}-state-${index}`}>{t('relic.affixOff')}</span>
        ) : null}
        {remove}
      </span>
    </div>
  )
}

/** A knowledge coefficient as the game prints it: k 0.1 (level 0) reads 100%, k 0.88 reads 880%. */
const percent = (k: number) => `${Number((k * 1000).toFixed(1))}%`

function KnowledgeBar({ relics, level, k1, k2, season, onChange }: {
  relics: Relics; level: number; k1: number; k2: number; season: number | undefined; onChange: (level: number) => void
}) {
  const { t } = useTranslation()
  const ladder = useMemo(() => knowledgeLadder(relics, season), [relics, season])
  const levels = ladder.flatMap((r) => (r.level == null ? [] : [r.level]))
  const min = levels[0] ?? 0
  const max = levels[levels.length - 1] ?? 0
  const role = ladder.find((r) => r.level === level)?.roleLevelRequired ?? null

  return (
    <div className="gz-know" data-testid="relic-knowledge-bar">
      <span className="meta">{t('relic.knowledge')}</span>
      <Stepper value={level} min={min} max={max} onChange={onChange} label={t('relic.knowledge')} testId="relic-knowledge" />
      {/* The two lines the game's 非凡知识提升 panel shows, in its own words. */}
      <span className="gz-eff">
        {t('relic.resonanceEfficiency')} <b className="num" data-testid="relic-k1">{percent(k1)}</b>
        {' · '}
        {t('relic.affixEfficiency')} <b className="num" data-testid="relic-k2">{percent(k2)}</b>
        {role !== null ? <> · {t('relic.knowledgeRole', { level: role })}</> : null}
      </span>
    </div>
  )
}

/**
 * One relic's dialog: the artifact with a button to swap it, the grade, the
 * material being edited and its affixes, the three figures they come to, and
 * last the one destructive action. With no artifact it opens straight on the
 * artifact grid. It is portalled out of the page's read-only fieldset, so it
 * carries its own.
 */
function RelicCard({ relics, slot, result, k2, server, swapFrom, canSwapFrom, readOnly, onChange, onSwapStart, onSwapTo }: {
  relics: Relics; slot: RelicSlotState; result: RelicSlotResult
  k2: number; server: RelicServer; readOnly: boolean
  /** The position being moved, if any: every tab of its type becomes a drop target. */
  swapFrom: Position | null
  canSwapFrom: (from: Position) => boolean
  onChange: (next: RelicSlotState) => void
  onSwapStart: (from: Position) => void; onSwapTo: (to: Position) => void
}) {
  const { t } = useTranslation()
  const groupId = slot.groupId
  const spec = groupId === SPEC_GROUP
  const group = relics.groupNames[String(groupId)] ?? ''
  const [picking, setPicking] = useState(false)
  // 特化 views the material it has equipped; the other two view whichever
  // position the player last picked, which is only a view.
  const [viewed, setViewed] = useState(0)
  const index = spec ? specIndex(slot) : viewed
  const material = result.materials[index]
  const active = activeMaterialIndexes(slot, server)
  const artifact = result.artifact

  const patch = (next: Partial<RelicSlotState>) => onChange({ ...slot, ...next })
  /** An artifact's own grade: stored per artifact, starting at the worst. */
  const gradeOf = (id: number) => slot.grades?.[String(id)] ?? relics.promotion.worstGrade

  const artGrid = (
    <PickBox onCollapse={artifact ? () => setPicking(false) : undefined} collapseTestId={`relic-artifact-collapse-${groupId}`}>
      <div className="gz-arts">
        {artifactsInGroup(relics, groupId).map((entry) => (
          <button key={entry.id} type="button" className={entry.id === artifact?.id ? 'on' : ''} aria-pressed={entry.id === artifact?.id}
            title={entry.description} data-testid={`relic-artifact-option-${entry.id}`}
            onClick={() => { patch({ artifactId: entry.id, grade: gradeOf(entry.id) }); setPicking(false) }}>
            {entry.icon ? <img src={iconUrl(entry.icon)} alt="" /> : null}
            <span>{entry.name}</span>
          </button>
        ))}
      </div>
    </PickBox>
  )

  if (!artifact) {
    return (
      <DialogContent className="gz-dlg" data-testid={`relic-card-${groupId}`}>
        <DialogHead title={t('relic.pickTitle', { group })} />
        <fieldset disabled={readOnly}>{artGrid}</fieldset>
      </DialogContent>
    )
  }

  const applying = result.materials.filter((entry) => entry.applies)
  const activeCount = applying.reduce((sum, entry) => sum + entry.activeCount, 0)
  const resonating = result.materials.find((entry) => entry.resonates)
  const pool = material ? typePool(relics, material.type) : []
  const affixes = material?.affixes ?? []
  const max = maxAffixes(relics)
  const testPrefix = `relic-affix-${groupId}-${index}`
  const writeAffixes = (next: ChosenRelicAffix[]) =>
    patch({ materials: slot.materials.map((list, at) => (at === index ? next : list)) })
  const taken = usedGroups(pool, affixes)
  const nextRare = taken.rare ? undefined : rareAffixes(pool).find((entry) => !taken.groups.has(entry.groupId))
  const swapping = swapFrom?.groupId === groupId && swapFrom.index === index
  // Every rare word in effect across the relic's materials, with its effect.
  const rares = applying.flatMap((entry) => {
    const list = typePool(relics, entry.type)
    return entry.affixes.flatMap((affix) => {
      const source = list.find((row) => row.id === affix.affixId)
      return source && isRareAffix(source) && source.effect ? [{ source, k: `${entry.index}-${source.id}` }] : []
    })
  })

  return (
    <DialogContent className="gz-dlg" data-testid={`relic-card-${groupId}`}>
      <fieldset disabled={readOnly}>
        <ItemHead
          icon={<IconTile quality={gradeQuality(slot.grade)} src={artifact.icon ? iconUrl(artifact.icon) : undefined} alt=""
            label={artifact.name.slice(0, 1)} className="ic" />}
          title={`${t('relic.groupTitle', { group })} · ${artifact.name}`}
          sub={t('relic.headSub', { group, n: activeCount })}
          scoreLabel={t('relic.relicScore')}
          score={decimal(result.total)}
          scoreTestId={`relic-total-${groupId}`}
          swapLabel={picking ? t('equip.collapse') : t('equip.swap')}
          swapTestId={`relic-artifact-open-${groupId}`}
          onSwap={() => setPicking((open) => !open)}
        />
        {picking ? artGrid : null}

        {/* The same grid as the piece dialog: label, body, end. */}
        <div className="gz-form">
          <div className="gz-row grade">
            <span className="lab">{t('relic.dangerGrade')}</span>
            <div className="gz-seg full" role="group" aria-label={t('relic.dangerGrade')}>
              {gradeOptions(relics).map((grade) => (
                <button key={grade} type="button" className="gz-chip" aria-pressed={grade === slot.grade}
                  data-testid={`relic-grade-${groupId}-${grade}`}
                  onClick={() => patch({
                    grade,
                    grades: slot.artifactId == null ? slot.grades : { ...slot.grades, [String(slot.artifactId)]: grade },
                  })}>
                  {t('relic.gradeBare', { grade })}
                </button>
              ))}
            </div>
            {(() => {
              const scored = effectiveGrade(relics, slot.grade, server)
              const mark = (gradeRung(relics, scored)?.mark ?? 0) * k2
              return (
                <span className="gz-tags" data-testid={`relic-grade-line-${groupId}`}>
                  <span>{t('relic.tagMark', { mark: decimal(mark) })}</span>
                  <span>{t('relic.tagCap', { cap: effectiveAffixCap(relics, scored) })}</span>
                  {scored !== slot.grade ? <span className="warn">{t('relic.scoredAsGrade', { grade: scored })}</span> : null}
                </span>
              )
            })()}
          </div>

          <div className="gz-row">
            <span className="lab">{t('relic.extraMaterial')}</span>
            {/* 特化 picks which type it takes; the other two view a position. */}
            <div className="gz-tabsx" role="group" aria-label={t(spec ? 'relic.materialType' : 'relic.extraMaterial')}>
              {Array.from({ length: MATERIAL_SLOTS }, (_, at) => {
                const self = swapFrom?.groupId === groupId && swapFrom.index === at
                // While a material is being moved, every other position of its
                // type takes it; the rest of the tabs sit the move out.
                const target = swapFrom !== null && !self
                  && materialTypeAt(groupId, at) === materialTypeAt(swapFrom.groupId, swapFrom.index)
                return (
                  <button key={at} type="button" className={at === index ? 'on' : ''} aria-pressed={at === index}
                    disabled={swapFrom !== null && !target && !self}
                    onClick={() => (target ? onSwapTo({ groupId, index: at })
                      : spec ? patch({ materialType: materialTypeAt(groupId, at) }) : setViewed(at))}
                    data-testid={`relic-material-tab-${groupId}-${at}`} data-swap-target={target || undefined}
                    data-fill={spec ? undefined : active.includes(at) ? 'on' : 'off'}
                    title={spec ? undefined : `${t(at === 0 ? 'relic.fill1' : 'relic.fill2')} · ${t(active.includes(at) ? 'relic.fillOn' : 'relic.fillOff')}`}>
                    {spec
                      ? t('relic.materialTypeOption', { group: relics.groupNames[String(materialTypeAt(groupId, at))] ?? '' })
                      : <><i aria-hidden />{t(at === 0 ? 'relic.fill1' : 'relic.fill2')}<span className="sr-only">{` · ${t(active.includes(at) ? 'relic.fillOn' : 'relic.fillOff')}`}</span></>}
                  </button>
                )
              })}
            </div>
            {canSwapFrom({ groupId, index }) ? (
              <button type="button" className="gz-chip end" aria-pressed={swapping} onClick={() => onSwapStart({ groupId, index })}
                data-testid={`relic-swap-${groupId}-${index}`}>
                {t(swapping ? 'relic.swapCancel' : 'relic.swapStart')}
              </button>
            ) : null}
          </div>
          {swapping ? <p className="note" data-testid={`relic-swap-hint-${groupId}`}>{t('relic.swapHint')}</p> : null}
          {material && !material.applies ? <p className="note" data-testid={`relic-material-state-${groupId}-${index}`}>{t('relic.fillTwoNote')}</p> : null}

          <div className="gz-affs" data-testid={`relic-material-${groupId}-${index}`}>
            {affixes.map((affix, at) => (
              <AffixRow key={at} relics={relics} affix={affix} index={at} inactive={material?.inactive[at] ?? false}
                others={affixes.filter((_, other) => other !== at)} pool={pool} k2={k2} testPrefix={testPrefix}
                onChange={(next) => writeAffixes(affixes.map((entry, other) => (other === at ? next : entry)))}
                onRemove={() => writeAffixes(affixes.filter((_, other) => other !== at))} />
            ))}
          </div>
          <div className="gz-addrow">
            <button type="button" className="gz-add" disabled={affixes.length >= max}
              onClick={() => writeAffixes([...affixes, EMPTY_RELIC_AFFIX])} data-testid={`${testPrefix}-add`}>
              {/* `used` rather than `count`, which i18next reads as a plural selector. */}
              {t('relic.addAffix', { used: affixes.length, max: result.cap })}
            </button>
            <button type="button" className="gz-add" disabled={affixes.length >= max || !nextRare}
              onClick={() => { if (nextRare) writeAffixes([...affixes, affixFrom(nextRare)]) }} data-testid={`${testPrefix}-add-rare`}>
              {t('relic.addRare')}
            </button>
          </div>
        </div>

        <div className="gz-kv" data-testid={`relic-breakdown-${groupId}`}>
          <div>{t('relic.assembly')}<b className="num">{decimal(result.assemblyScore)}</b></div>
          <div>
            {t('relic.resonanceCount', { n: resonating?.activeCount ?? 0 })}<b className="num">{decimal(result.resonanceScore)}</b>
          </div>
          <div>{t('relic.affixScore')}<b className="num">{decimal(result.affixScore)}</b></div>
        </div>

        {rares.length > 0 ? (
          <>
            <div className="sub">{t('relic.rareEffects')}</div>
            <div className="gz-rare" data-testid={`${testPrefix}-rare`}>
              {rares.map(({ source, k }) => (
                <div key={k}><b>{source.name ?? ''}</b>{'　'}{rareEffect(relics, source, k2)}</div>
              ))}
            </div>
          </>
        ) : null}

      </fieldset>
      {/* As the piece dialog: outside the fieldset so a read-only viewer can
          still close. Every change applies as it is made; Confirm only closes. */}
      <div className="gz-dlg-foot split">
        <button type="button" className="gz-btn warn" disabled={readOnly} onClick={() => { patch({ artifactId: null }); setPicking(false) }}
          data-testid={`relic-remove-${groupId}`}>
          {t('relic.remove')}
        </button>
        <DialogClose asChild>
          <button type="button" className="gz-btn pri" data-testid={`relic-done-${groupId}`}>{t('equip.done')}</button>
        </DialogClose>
      </div>
    </DialogContent>
  )
}

/**
 * A relic at a glance -- artifact, slot, grade and total -- opening its dialog.
 * The three sit side by side; everything edited is in the dialog.
 */
function RelicFace({ relics, slot, result, onOpen }: {
  relics: Relics; slot: RelicSlotState; result: RelicSlotResult; onOpen: () => void
}) {
  const { t } = useTranslation()
  const groupId = slot.groupId
  const artifact = result.artifact
  return (
    <button type="button" aria-haspopup="dialog" onClick={onOpen}
      className={`gz-relic ${artifact ? '' : 'empty'}`}
      data-testid={`relic-open-${groupId}`}>
      <IconTile
        quality={artifact ? gradeQuality(slot.grade) : null}
        src={artifact?.icon ? iconUrl(artifact.icon) : undefined}
        alt={artifact?.name ?? ''}
        label={artifact?.name.slice(0, 1)}
        className="ic"
      />
      <span className="t">
        <small>{t('relic.groupTitle', { group: relics.groupNames[String(groupId)] ?? '' })}</small>
        <b>{artifact ? artifact.name : t('relic.artifactPlaceholder')}</b>
        <span className="tags">
          <span>{t('relic.gradeBare', { grade: slot.grade })}</span>
          {artifact ? (
            <>
              <span className="num">{t('relic.faceAffixes', { counts: result.materials.map((m) => m.affixes.length).join('+') })}</span>
              <span className="num">{t('relic.faceResonance', { count: result.materials.find((m) => m.resonates)?.activeCount ?? 0 })}</span>
            </>
          ) : null}
        </span>
      </span>
      <span className="s num" data-testid={`relic-face-total-${groupId}`}>
        {decimal(result.total)}
      </span>
    </button>
  )
}

/**
 * A stored slot read against the dataset: the grade clamped to the ones a
 * player can hold, each affix resolved by id against its position's pool, and
 * a group or a second rare word repeated within a material dropped — those
 * cannot exist in game. An id the pool no longer has is dropped too. A relic
 * the player removed stays removed.
 */
function restoreSlot(relics: Relics, groupId: number, stored: StoredRelicSlot | undefined, fresh: RelicSlotState): RelicSlotState {
  if (!stored) return fresh
  const grades = gradeOptions(relics)
  // A grade the player cannot hold (0) reads as the best one they can.
  const clamp = (value: number) => (grades.includes(value)
    ? value
    : gradeRung(relics, value) && grades.length > 0 ? grades[grades.length - 1] : fresh.grade)
  const artifactId = stored.artifactId === null ? null
    : artifactsInGroup(relics, groupId).some((a) => a.id === stored.artifactId) ? stored.artifactId : fresh.artifactId
  // Older drafts kept one grade per slot; it becomes the stored artifact's.
  const perArtifact: Record<string, number> = {}
  for (const [id, value] of Object.entries(stored.grades ?? {})) perArtifact[id] = clamp(value)
  if (artifactId != null && perArtifact[String(artifactId)] === undefined && stored.artifactId === artifactId) {
    perArtifact[String(artifactId)] = clamp(stored.grade)
  }
  const grade = artifactId != null ? perArtifact[String(artifactId)] ?? fresh.grade : clamp(stored.grade)
  const materialType = groupId === SPEC_GROUP ? (stored.materialType ?? 1) : undefined
  const materials = Array.from({ length: MATERIAL_SLOTS }, (_, at) => {
    const pool = typePool(relics, materialTypeAt(groupId, at))
    const kept: ChosenRelicAffix[] = []
    for (const affix of storedAffixes(stored.materials?.[at])) {
      // An empty row the player added but has not filled yet stays.
      if (affix.affixId === null) {
        kept.push(EMPTY_RELIC_AFFIX)
        continue
      }
      const source = pool.find((entry) => entry.id === affix.affixId)
      if (!source) continue
      const taken = usedGroups(pool, kept)
      if (taken.groups.has(source.groupId) || (taken.rare && isRareAffix(source))) continue
      kept.push(affixFrom(source))
    }
    return kept.slice(0, maxAffixes(relics))
  })
  return {
    groupId,
    artifactId,
    grade,
    grades: perArtifact,
    ...(materialType !== undefined ? { materialType } : {}),
    materials,
  }
}

export default function RelicSection({ relics, onTotals }: {
  relics: Relics
  /** Reports the three subtotals whenever they change, for the page's rating rows. */
  onTotals?: (totals: RelicTotals) => void
}) {
  const { t } = useTranslation()
  const season = useMemo(() => currentSeason(relics), [relics])
  const [draft, setDraft] = useSection('relics')
  const [server] = useRelicServer()
  const knowledgeLevel = useMemo(() => {
    const ladder = knowledgeLadder(relics, season)
    const known = ladder.some((rung) => rung.level === draft.knowledgeLevel)
    return known ? (draft.knowledgeLevel as number) : ladder.find((rung) => rung.level != null)?.level ?? 0
  }, [draft.knowledgeLevel, relics, season])
  const setKnowledgeLevel = (level: number) => setDraft((prev) => ({ ...prev, knowledgeLevel: level }))
  // Pre-picked so a card shows real effects on first paint. The scorer ignores
  // `artifactId`, so this changes no number.
  const slots = useMemo<RelicSlotState[]>(
    () =>
      GROUP_IDS.map((groupId) => {
        const fresh: RelicSlotState = {
          ...newRelicSlot(groupId, relics.promotion.worstGrade),
          artifactId: artifactsInGroup(relics, groupId)[0]?.id ?? null,
          ...(groupId === SPEC_GROUP ? { materialType: 1 } : {}),
        }
        return restoreSlot(relics, groupId, draft.slots.find((slot) => slot.groupId === groupId), fresh)
      }),
    [draft.slots, relics],
  )
  // Stored as ids only; the derived stat, value and Mark are re-read from the dataset.
  const setSlots = (update: (prev: RelicSlotState[]) => RelicSlotState[]) =>
    setDraft((prev) => ({
      ...prev,
      slots: update(slots).map((slot) => ({ ...slot, materials: toStoredMaterials(slot.materials) })),
    }))

  /** The material being moved; the next compatible tab clicked receives it. */
  const [swapFrom, setSwapFrom] = useState<Position | null>(null)
  const positions = GROUP_IDS.flatMap((groupId) => Array.from({ length: MATERIAL_SLOTS }, (_, index) => ({ groupId, index })))
  const canSwapFrom = (from: Position) =>
    positions.some((to) => !(to.groupId === from.groupId && to.index === from.index)
      && materialTypeAt(to.groupId, to.index) === materialTypeAt(from.groupId, from.index))
  useEffect(() => {
    if (swapFrom === null) return
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') setSwapFrom(null) }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [swapFrom])

  // Same type on both ends, so each affix list stays valid in its new pool.
  const swap = (a: Position, b: Position) =>
    setSlots((prev) => {
      const next = prev.map((slot) => ({ ...slot, materials: [...slot.materials] }))
      const sa = next.find((slot) => slot.groupId === a.groupId)
      const sb = next.find((slot) => slot.groupId === b.groupId)
      if (!sa || !sb) return prev
      const held = sa.materials[a.index] ?? []
      sa.materials[a.index] = sb.materials[b.index] ?? []
      sb.materials[b.index] = held
      return next
    })

  const [openGroup, setOpenGroup] = useState<number | null>(null)
  const openIndex = slots.findIndex((slot) => slot.groupId === openGroup)
  const readOnly = useCharacterReadOnly()

  const k2 = k2For(relics, knowledgeLevel, season)
  const k1 = k1For(relics, knowledgeLevel, season)
  const results = useMemo(
    () => slots.map((slot) => evaluateRelicSlot(relics, slot, knowledgeLevel, season, server)),
    [relics, slots, knowledgeLevel, season, server],
  )
  const totals = useMemo<RelicTotals>(() => {
    // Summed across every material in effect. ASSUMPTION: the bonus of rare
    // words on different relics stacks; nothing in the client says otherwise.
    let skillLevelBonus = 0
    for (const result of results) {
      for (const material of result.materials) {
        if (!material.applies) continue
        const pool = typePool(relics, material.type)
        for (const affix of material.affixes) {
          skillLevelBonus += pool.find((entry) => entry.id === affix.affixId)?.skillLevelPlus ?? 0
        }
      }
    }
    return { ...relicTotals(results), skillLevelBonus }
  }, [results, relics])
  useEffect(() => {
    onTotals?.(totals)
  }, [onTotals, totals])

  return (
    <section className="space-y-3" data-testid="relic-section" aria-label={t('relic.title')}>
      {/* The page leaves this section's read-only state to it, so the relic
          faces stay clickable; only the inputs lock. */}
      <div className="gz-panel-head">
        <h3>{t('relic.title')}</h3>
        <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
          <KnowledgeBar relics={relics} level={knowledgeLevel} k1={k1} k2={k2} season={season} onChange={setKnowledgeLevel} />
        </fieldset>
      </div>

      <div className="gz-relics">
        {slots.map((slot, index) => (
          <RelicFace key={slot.groupId} relics={relics} slot={slot} result={results[index]} onOpen={() => setOpenGroup(slot.groupId)} />
        ))}
      </div>

      {/* A move survives closing the dialog, so a material can be carried to
          another relic: close this one, open that one, click a dashed tab. */}
      {swapFrom ? (
        <div className="gz-swap" data-testid="relic-swap-pending">
          {t('relic.swapPending')}
          <button type="button" onClick={() => setSwapFrom(null)} className="gz-chip"
            data-testid="relic-swap-cancel">
            {t('relic.swapCancel')}
          </button>
        </div>
      ) : null}

      <Dialog open={openIndex >= 0} onOpenChange={(open) => { if (!open) setOpenGroup(null) }}>
        {openIndex >= 0 ? (
          <RelicCard key={slots[openIndex].groupId} relics={relics} slot={slots[openIndex]} result={results[openIndex]} k2={k2}
            server={server} swapFrom={swapFrom} canSwapFrom={canSwapFrom} readOnly={readOnly}
            onSwapStart={(from) => setSwapFrom((prev) => (prev && prev.groupId === from.groupId && prev.index === from.index ? null : from))}
            onSwapTo={(to) => {
              if (swapFrom) swap(swapFrom, to)
              setSwapFrom(null)
            }}
            onChange={(next) => setSlots((prev) => prev.map((entry, at) => (at === openIndex ? next : entry)))} />
        ) : null}
      </Dialog>

    </section>
  )
}
