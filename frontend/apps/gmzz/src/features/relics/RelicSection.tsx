import { useEffect, useId, useMemo, useState } from 'react'
import { Dialog, DialogClose, DialogContent, Popover, PopoverContent, PopoverTrigger } from '@gamemap/ui'
import { IconChevronDown } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { GzSelect } from '@/components/GzSelect'
import { DialogHead, ItemHead, PickBox } from '@/features/equipment/EquipmentSection'
import { IconTile } from '@/features/equipment/PickerModal'
import { iconUrl } from '@/lib/urls'
import { Stepper } from '@/features/score/Stepper'
import { Tip, TipOn } from '@/features/score/Tip'
import { useCharacterReadOnly, useSection } from '@/features/characters/CharacterProvider'
import { toStoredMaterials } from '@/features/relics/memory'
import { useRelicServer } from '@/features/relics/useRelicServer'
import { EMPTY_RELIC_AFFIX, GROUP_IDS, SPEC_GROUP, affixFrom, knowledgeLevelOf, restoreSlots } from '@/features/relics/slots'
import {
  MATERIAL_SLOTS, activeMaterialIndexes, affixValue, artifactsInGroup, currentSeason, effectiveAffixCap, effectiveGrade,
  evaluateRelicSlot, formatStat, gradeQuality, gradeOptions, gradeRung, isRareAffix, k1For, k2For,
  knowledgeLadder, materialName, materialTypeAt, maxAffixes, poolRungs, poolStats, rareAffixes,
  rareEffect, relicTotals, specIndex, statName, typePool, usedGroups,
  type ChosenRelicAffix, type MaterialResult, type PoolAffix, type Relics, type RelicServer,
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
 * A relic part before the final floor, to two decimals. The game floors only
 * once the three relics are added up, so the cards show what is being added.
 */
const decimal = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 })

/** A material position across the three slots, for swapping. */
type Position = { groupId: number; index: number }

/** An affix's value as the game prints it, with its sign. */
function shownValue(relics: Relics, affix: { stat: string; value: number; scaled?: boolean }, k2: number): string {
  return `+${formatStat(relics, affix.stat, affixValue(affix, k2))}`
}

/** `Artifact.tag` is a usage bucket: 1 副本, 2 竞技, 3 通用. */
const TAG_KEY: Record<number, string> = { 1: 'relic.tagDungeon', 2: 'relic.tagArena', 3: 'relic.tagGeneral' }

/**
 * An affix's kind pill (普通 / 稀有), its word type (凡 · 珍 · 稀 · 异) on the
 * tooltip. A row with nothing picked shows a blank pill.
 */
function KindPip({ source }: { source: PoolAffix | undefined }) {
  const { t } = useTranslation()
  if (!source) return <span className="gz-pip" aria-hidden />
  const rare = isRareAffix(source)
  const tier = source.tag ?? 0
  const known = tier >= 1 && tier <= 4
  const pip = (
    <span className={`gz-pip ${rare ? 'rare' : 'ordinary'}`} tabIndex={known ? 0 : undefined}>
      {t(rare ? 'relic.pipRare' : 'relic.pipOrdinary')}
    </span>
  )
  if (!known) return pip
  return (
    <TipOn content={t('relic.tierTip', { tier: t(`relic.tierName${tier}`), kind: t(rare ? 'relic.affixRare' : 'relic.affixOrdinary') })}>
      {pip}
    </TipOn>
  )
}

/**
 * One affix row, laid out as the piece dialog's: kind, stat, the value between
 * −/+ that walk its rungs (the value opens every rung at once), and at the end
 * what it scores and ×. A rare word picks the word; its value and score are
 * fixed, read out as they are, and its effect runs under the row. A row past
 * the grade's cap is dimmed and its score gives way to a tag whose tooltip
 * says why.
 */
function AffixRow({ relics, affix, others, index, inactive, cap, pool, k2, testPrefix, onChange, onRemove }: {
  relics: Relics; affix: ChosenRelicAffix; others: ChosenRelicAffix[]; index: number; inactive: boolean
  /** How many affixes the grade lets take effect, for the switched-off tooltip. */
  cap: number
  pool: PoolAffix[]; k2: number; testPrefix: string
  onChange: (next: ChosenRelicAffix) => void; onRemove: () => void
}) {
  const { t } = useTranslation()
  const [valueOpen, setValueOpen] = useState(false)
  const source = pool.find((entry) => entry.id === affix.affixId)
  const rare = source && isRareAffix(source) ? source : null
  // What the other rows of this material already hold: a group at most once,
  // and one rare word at most.
  const taken = usedGroups(pool, others)
  const remove = (
    <button type="button" className="gz-rm" onClick={onRemove} aria-label={t('relic.removeAffix')}
      data-testid={`${testPrefix}-remove-${index}`}>×</button>
  )
  /** What the row scores, its Mark × k2 on the tooltip. */
  const score = (mark: number) => (
    <TipOn content={t('relic.affixScoreOf', { score: decimal(mark * k2), mark: mark.toLocaleString() })}>
      <span className="mk num gz-hov" tabIndex={0} data-testid={`${testPrefix}-score-${index}`}>{decimal(mark * k2)}</span>
    </TipOn>
  )
  const end = (mark: number | null) => (
    <span className="end">
      {inactive ? (
        <TipOn content={t('relic.cappedOut', { cap })} title={t('relic.affixInactive')}>
          <span className="why" tabIndex={0} data-testid={`${testPrefix}-state-${index}`}>{t('relic.affixOff')}</span>
        </TipOn>
      ) : mark === null ? <span className="mk num">—</span> : score(mark)}
      {remove}
    </span>
  )

  if (rare) {
    return (
      <div className="gz-aff eq relx rare" data-testid={`${testPrefix}-row-${index}`}>
        <KindPip source={rare} />
        <GzSelect value={String(rare.id)} label={t('relic.affixRare')} testId={`${testPrefix}-stat-${index}`}
          options={rareAffixes(pool).map((entry) => ({
            value: String(entry.id),
            label: entry.name ?? statName(relics, entry.stat),
            disabled: entry.id !== rare.id && taken.groups.has(entry.groupId),
          }))}
          onChange={(raw) => {
            const next = pool.find((entry) => entry.id === Number(raw))
            if (next) onChange(affixFrom(next))
          }} />
        {/* A rare word has one value: read out, not picked. */}
        <span className="gz-val ro num" data-testid={`${testPrefix}-value-${index}`}>{shownValue(relics, rare, k2)}</span>
        {end(rare.mark)}
        <span className="desc full" data-testid={`${testPrefix}-rung-${index}`}>{rareEffect(relics, rare, k2)}</span>
      </div>
    )
  }

  // The arrows walk the stat's rungs by value, smallest first.
  const byValue = [...poolRungs(pool, affix.stat)].reverse()
  const at = byValue.findIndex((rung) => rung.id === affix.affixId)
  const current = at < 0 ? undefined : byValue[at]
  const stepTo = (offset: number) => {
    const next = at < 0 ? undefined : byValue[at + offset]
    return next ? () => onChange(affixFrom(next)) : undefined
  }
  const up = stepTo(1)
  const down = stepTo(-1)
  // The picker groups the rungs by word type, the richer type first.
  const tiers = [...new Set(byValue.map((rung) => rung.tag ?? 0))].sort((a, b) => b - a)
  return (
    <div className={`gz-aff eq relx ${inactive ? 'off' : ''}`} data-inactive={inactive || undefined} data-testid={`${testPrefix}-row-${index}`}>
      <KindPip source={source} />
      <GzSelect value={affix.stat} label={t('relic.affixStat')} testId={`${testPrefix}-stat-${index}`}
        // An unpicked row reads "Pick an affix", which cannot be picked back.
        options={[
          ...(affix.stat === '' ? [{ value: '', label: t('relic.affixPick'), disabled: true }] : []),
          ...poolStats(pool).map((stat) => ({
            value: stat,
            label: statName(relics, stat),
            disabled: stat !== affix.stat && taken.groups.has(poolRungs(pool, stat)[0]?.groupId ?? -1),
          })),
        ]}
        onChange={(raw) => {
          const next = poolRungs(pool, raw)[0]
          if (next) onChange(affixFrom(next))
        }} />
      {/* Keyed by the pool row's own id: two rungs of one stat can share a value. */}
      <span className="gz-val">
        <button type="button" disabled={!down} onClick={down} aria-label={t('equip.rungDown')}
          data-testid={`${testPrefix}-rung-${index}-down`}>−</button>
        <Popover open={valueOpen} onOpenChange={setValueOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="v num" disabled={byValue.length === 0} aria-label={t('relic.affixRung')}
              data-testid={`${testPrefix}-rung-${index}`}>
              {current ? shownValue(relics, current, k2) : '—'}
              <IconChevronDown stroke={2} aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="center" collisionPadding={8} className="gz-valpop"
            data-testid={`${testPrefix}-rung-${index}-menu`}>
            {tiers.map((tier) => (
              <section key={tier}>
                <span className="gz-pip ordinary">{t(`relic.tier${tier}`, { defaultValue: '' })}</span>
                <div className="grid">
                  {byValue.filter((rung) => (rung.tag ?? 0) === tier).map((rung) => (
                    <button key={rung.id} type="button" className="num" aria-pressed={rung.id === current?.id}
                      onClick={() => { onChange(affixFrom(rung)); setValueOpen(false) }}
                      data-testid={`${testPrefix}-rung-${index}-${rung.id}`}>
                      <b>{shownValue(relics, rung, k2)}</b>
                      <small>{decimal(rung.mark * k2)}</small>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </PopoverContent>
        </Popover>
        <button type="button" disabled={!up} onClick={up} aria-label={t('equip.rungUp')}
          data-testid={`${testPrefix}-rung-${index}-up`}>+</button>
      </span>
      {end(current ? current.mark : null)}
    </div>
  )
}

/** A knowledge coefficient as the game prints it: k 0.1 (level 0) reads 100%, k 0.88 reads 880%. */
const percent = (k: number) => `${Number((k * 1000).toFixed(1))}%`

function KnowledgeBar({ relics, level, k1, k2, season, readOnly, onChange }: {
  relics: Relics; level: number; k1: number; k2: number; season: number | undefined; readOnly: boolean
  onChange: (level: number) => void
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
      <Stepper value={level} min={min} max={max} onChange={onChange} label={t('relic.knowledge')} testId="relic-knowledge"
        disabled={readOnly} />
      {/* The two lines the game's 非凡知识提升 panel shows, in its own words. */}
      <span className="gz-eff">
        {t('relic.resonanceEfficiency')} <b className="num" data-testid="relic-k1">{percent(k1)}</b>
        {' · '}
        {t('relic.affixEfficiency')} <b className="num" data-testid="relic-k2">{percent(k2)}</b>
        {role !== null ? <> · {t('relic.knowledgeRole', { level: role })}</> : null}
      </span>
      <Tip content={t('relic.knowledgeHint', { min, max, k1, k2 })} title={t('relic.knowledge')} testId="relic-knowledge-formula" />
    </div>
  )
}

/** 非凡共鸣 at the relic's active word count: the stats it grants, as the game shows them (floor(value × k1)). */
function ResonanceStats({ relics, material, k1 }: { relics: Relics; material: MaterialResult | undefined; k1: number }) {
  if (!material || material.activeCount === 0 || material.resonanceStats.length === 0) return null
  return (
    <>
      {material.resonanceStats.map(([stat, value]) => (
        <span key={stat} className="num">{statName(relics, stat)} +{formatStat(relics, stat, Math.floor(value * k1))}</span>
      ))}
    </>
  )
}

/**
 * One relic's dialog: the artifact with a button to swap it, the grade, the
 * material being edited and its affixes, the resonance they come to, the three
 * figures, and last the one destructive action. With no artifact it opens
 * straight on the artifact grid. It is portalled out of the page's read-only
 * fieldset, so it carries its own.
 */
function RelicCard({ relics, slot, result, k1, k2, server, swapFrom, canSwapFrom, readOnly, onChange, onSwapStart, onSwapTo }: {
  relics: Relics; slot: RelicSlotState; result: RelicSlotResult
  k1: number; k2: number; server: RelicServer; readOnly: boolean
  /** The position being moved, if any: every tab of its type becomes a drop target. */
  swapFrom: Position | null
  canSwapFrom: (from: Position) => boolean
  onChange: (next: RelicSlotState) => void
  onSwapStart: (from: Position) => void; onSwapTo: (to: Position) => void
}) {
  const { t } = useTranslation()
  const ids = useId()
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
          // No tooltip here: on a phone a hint on a button opens its sheet on
          // the same tap that picks. The picked artifact's effect sits on the
          // ⓘ in the dialog's head.
          <button key={entry.id} type="button" className={entry.id === artifact?.id ? 'on' : ''} aria-pressed={entry.id === artifact?.id}
            data-testid={`relic-artifact-option-${entry.id}`}
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
  const scored = effectiveGrade(relics, slot.grade, server)
  const assemblyMark = (gradeRung(relics, scored)?.mark ?? 0) * k2
  // The material row's notes, in its label's tooltip rather than as prose:
  // how the fills (or 特化's two types) work, and what applies right now.
  const materialNotes = [
    t(spec ? 'relic.materialSpecHint' : 'relic.materialSlotsHint'),
    material && !material.applies ? t('relic.fillTwoNote') : null,
    swapping ? t('relic.swapHint') : null,
  ].filter((line): line is string => line !== null)

  return (
    <DialogContent className="gz-dlg" data-testid={`relic-card-${groupId}`}>
      <fieldset disabled={readOnly}>
        <ItemHead
          icon={<IconTile quality={gradeQuality(slot.grade)} src={artifact.icon ? iconUrl(artifact.icon) : undefined} alt=""
            label={artifact.name.slice(0, 1)} className="ic" />}
          title={`${t('relic.groupTitle', { group })} · ${artifact.name}`}
          sub={<>
            {t('relic.headSub', { group, n: activeCount })}{' '}
            <Tip kind="info" title={artifact.name} testId={`relic-artifact-info-${groupId}`} content={
              `${t('relic.artifactDetail', { group: artifact.groupName ?? group, tag: t(TAG_KEY[artifact.tag ?? 0] ?? 'relic.tagUnknown') })}\n${artifact.description}`
            } />
          </>}
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
          <div className="gz-row grade relx">
            <span className="lab" id={`${ids}-grade`}>{t('relic.dangerGrade')}</span>
            <div className="gz-seg full" role="group" aria-labelledby={`${ids}-grade`}>
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
            {/* Every piece keeps its width whichever grade is picked: the Mark
                sits in a fixed-width box, and the 本服 note is a mark in a
                slot that is always reserved. */}
            <span className="gz-tags" data-testid={`relic-grade-line-${groupId}`}>
              <span>{t('relic.tagMarkLabel')} <b className="num">{decimal(assemblyMark)}</b></span>
              <span>{t('relic.tagCap', { cap: effectiveAffixCap(relics, scored) })}</span>
              <i className="slot">
                {scored !== slot.grade ? (
                  <Tip kind="info" on content={`${t('relic.scoredAsGrade', { grade: scored })}\n${t('relic.serverHint')}`}
                    title={t('relic.dangerGrade')} testId={`relic-grade-scored-${groupId}`} />
                ) : null}
              </i>
            </span>
          </div>

          <div className="gz-row">
            <span className="lab tipped" id={`${ids}-material`}>
              {t('relic.extraMaterial')}
              <Tip kind="info" on={materialNotes.length > 1} content={materialNotes.join('\n')} title={t('relic.extraMaterial')}
                testId={`relic-material-hint-${groupId}`} />
            </span>
            {/* 特化 picks which type it takes; the other two view a position. */}
            <div className="gz-tabsx" role="group" aria-labelledby={`${ids}-material`}>
              {Array.from({ length: MATERIAL_SLOTS }, (_, at) => {
                const self = swapFrom?.groupId === groupId && swapFrom.index === at
                // While a material is being moved, every other position of its
                // type takes it; the rest of the tabs sit the move out.
                const target = swapFrom !== null && !self
                  && materialTypeAt(groupId, at) === materialTypeAt(swapFrom.groupId, swapFrom.index)
                const on = active.includes(at)
                // A fill's dot is green while it counts; the label's ⓘ says so in
                // words (a tooltip on the tab itself would steal its tap on a phone).
                return (
                  <button key={at} type="button" className={at === index ? 'on' : ''} aria-pressed={at === index}
                    disabled={swapFrom !== null && !target && !self}
                    onClick={() => (target ? onSwapTo({ groupId, index: at })
                      : spec ? patch({ materialType: materialTypeAt(groupId, at) }) : setViewed(at))}
                    data-testid={`relic-material-tab-${groupId}-${at}`} data-swap-target={target || undefined}
                    data-fill={spec ? undefined : on ? 'on' : 'off'}>
                    {spec
                      ? t('relic.materialTypeOption', { group: relics.groupNames[String(materialTypeAt(groupId, at))] ?? '' })
                      : <><i aria-hidden />{t(at === 0 ? 'relic.fill1' : 'relic.fill2')}<span className="sr-only">{` · ${t(on ? 'relic.fillOn' : 'relic.fillOff')}`}</span></>}
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

          <div className="gz-affs" data-testid={`relic-material-${groupId}-${index}`}>
            {affixes.map((affix, at) => (
              <AffixRow key={at} relics={relics} affix={affix} index={at} inactive={material?.inactive[at] ?? false}
                cap={result.cap}
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

        {/* The relic's one resonance: the stats it grants, read off the
            material in effect with the most active affixes. */}
        <div className="sub">
          {t('relic.resonance')}
          <span className="meta">{t('relic.resonanceRow', { count: resonating?.activeCount ?? 0 })}</span>
          {resonating && resonating.index !== index && resonating.activeCount > 0 ? (
            <Tip kind="info" content={t('relic.resonanceOther')} title={t('relic.resonance')} testId={`relic-resonance-hint-${groupId}`} />
          ) : null}
        </div>
        <div className="gz-res" data-testid={`relic-resonance-${groupId}`}>
          {resonating && resonating.activeCount > 0
            ? <ResonanceStats relics={relics} material={resonating} k1={k1} />
            : <p className="note">{t('relic.resonanceNone')}</p>}
        </div>

        <div className="gz-kv" data-testid={`relic-breakdown-${groupId}`}>
          <div>{t('relic.assembly')}<b className="num">{decimal(result.assemblyScore)}</b></div>
          <div>{t('relic.resonance')}<b className="num">{decimal(result.resonanceScore)}</b></div>
          <div>{t('relic.affixScore')}<b className="num">{decimal(result.affixScore)}</b></div>
        </div>
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
 * What a relic carries, under its face: the affixes of each material in
 * effect (named as the game names the material) and the stats its 非凡共鸣
 * grants.
 */
function RelicDetail({ relics, result, k1, k2 }: { relics: Relics; result: RelicSlotResult; k1: number; k2: number }) {
  const { t } = useTranslation()
  const groupId = result.state.groupId
  const applying = result.materials.filter((material) => material.applies)
  const two = applying.length > 1
  const filled = applying.filter((material) => material.affixes.some((affix) => affix.stat !== ''))
  const resonating = result.materials.find((material) => material.resonates)
  return (
    <div className="gz-rdet" data-testid={`relic-face-detail-${groupId}`}>
      {filled.length === 0 ? <p className="none">{t('relic.noAffix')}</p> : null}
      {filled.map((material) => {
        const pool = typePool(relics, material.type)
        const name = materialName(relics, material.type, pool, material.affixes)
          ?? t('relic.materialTypeOption', { group: relics.groupNames[String(material.type)] ?? '' })
        return (
          <div key={material.index} data-testid={`relic-face-affixes-${groupId}-${material.index}`}>
            <span className="h">{two ? `${t(material.index === 0 ? 'relic.fill1' : 'relic.fill2')} · ${name}` : name}</span>
            <ul>
              {material.affixes.map((affix, at) => {
                if (affix.stat === '') return null
                const source = pool.find((entry) => entry.id === affix.affixId)
                const rare = source && isRareAffix(source) ? source : null
                const off = material.inactive[at]
                return (
                  <li key={at} className={`${rare ? 'rare' : ''} ${off ? 'off' : ''}`}>
                    <span>{rare ? t('relic.rareName', { name: rare.name ?? '' }) : statName(relics, affix.stat)}</span>
                    {off ? <small>{t('relic.affixOff')}</small> : null}
                    <b className="num">{shownValue(relics, affix, k2)}</b>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
      {resonating && resonating.activeCount > 0 && resonating.resonanceStats.length > 0 ? (
        <div data-testid={`relic-face-resonance-${groupId}`}>
          <span className="h">{t('relic.resonanceNow', { count: resonating.activeCount })}</span>
          <div className="res"><ResonanceStats relics={relics} material={resonating} k1={k1} /></div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * A relic at a glance -- artifact, slot, grade and total -- opening its dialog,
 * with what it carries listed under it. The three sit side by side; everything
 * edited is in the dialog.
 */
function RelicFace({ relics, slot, result, k1, k2, onOpen }: {
  relics: Relics; slot: RelicSlotState; result: RelicSlotResult; k1: number; k2: number; onOpen: () => void
}) {
  const { t } = useTranslation()
  const groupId = slot.groupId
  const artifact = result.artifact
  return (
    <div className={`gz-relic-card ${artifact ? '' : 'empty'}`}>
      <button type="button" aria-haspopup="dialog" onClick={onOpen}
        className={`gz-relic ${artifact ? '' : 'empty'}`}
        data-testid={`relic-open-${groupId}`}>
        <IconTile
          quality={artifact ? gradeQuality(slot.grade) : null}
          src={artifact?.icon ? iconUrl(artifact.icon) : undefined}
          label={artifact?.name.slice(0, 1)}
          className="ic"
        />
        <span className="t">
          <small>{t('relic.groupTitle', { group: relics.groupNames[String(groupId)] ?? '' })}</small>
          <b>{artifact ? artifact.name : t('relic.artifactPlaceholder')}</b>
          <span className="tags">
            <span>{t('relic.gradeBare', { grade: slot.grade })}</span>
          </span>
        </span>
        <span className="s num" data-testid={`relic-face-total-${groupId}`}>
          {decimal(result.total)}
        </span>
      </button>
      {artifact ? <RelicDetail relics={relics} result={result} k1={k1} k2={k2} /> : null}
    </div>
  )
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
  const knowledgeLevel = useMemo(() => knowledgeLevelOf(relics, draft.knowledgeLevel, season), [draft.knowledgeLevel, relics, season])
  const setKnowledgeLevel = (level: number) => setDraft((prev) => ({ ...prev, knowledgeLevel: level }))
  const slots = useMemo<RelicSlotState[]>(() => restoreSlots(relics, draft.slots), [draft.slots, relics])
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
    <section className="space-y-3" data-testid="relic-section">
      {/* The page leaves this section's read-only state to it, so the relic
          faces stay clickable and the formula mark readable; only the inputs lock. */}
      <div className="gz-panel-head">
        <h3>{t('relic.title')}</h3>
        <KnowledgeBar relics={relics} level={knowledgeLevel} k1={k1} k2={k2} season={season} readOnly={readOnly}
          onChange={setKnowledgeLevel} />
      </div>

      <div className="gz-relics">
        {slots.map((slot, index) => (
          <RelicFace key={slot.groupId} relics={relics} slot={slot} result={results[index]} k1={k1} k2={k2}
            onOpen={() => setOpenGroup(slot.groupId)} />
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
          <RelicCard key={slots[openIndex].groupId} relics={relics} slot={slots[openIndex]} result={results[openIndex]} k1={k1} k2={k2}
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
