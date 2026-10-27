import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, Hint, Input, TooltipProvider } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import RangeField from '@/components/RangeField'
import StepSelect from '@/components/StepSelect'
import PickerModal, { DETAIL_DIALOG_CLASS, IconTile, type PickerOption } from '@/features/equipment/PickerModal'
import { TYPE } from '@/lib/typography'
import { iconUrl } from '@/lib/urls'
import { FormulaHint } from '@/features/score/FormulaHint'
import { useCharacterReadOnly, useSection } from '@/features/characters/CharacterProvider'
import { storedAffixes, toStoredMaterials, type StoredRelicSlot } from '@/features/relics/memory'
import { useRelicServer } from '@/features/relics/useRelicServer'
import {
  MATERIAL_SLOTS, activeMaterialIndexes, affixValue, artifactsInGroup, currentSeason,
  evaluateRelicSlot, formatStat, gradeOptions, gradeQuality, gradeRung, isRareAffix, k1For, k2For,
  knowledgeLadder, materialTypeAt, maxAffixes, newRelicSlot, poolRungs, poolStats, rareAffixes,
  materialName, rareEffect, relicTotals, specIndex, statName, typePool, usedGroups,
  type Artifact, type ChosenRelicAffix, type MaterialResult, type PoolAffix, type Relics, type RelicServer,
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

/** An affix's option value: an ordinary stat by key, a rare word by its pool id. */
const STAT_PREFIX = 'stat:'
const RARE_PREFIX = 'rare:'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const SELECT_CLASS = `h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none ${FOCUS}`
const BUTTON_CLASS = `inline-flex items-center justify-center rounded-md border border-border text-xs font-medium text-muted-foreground transition-colors hover:border-[color:var(--arkive-nav-accent)] hover:text-foreground disabled:opacity-50 ${FOCUS}`
const TAB_ACTIVE = 'border-[color:var(--arkive-nav-accent)] bg-[color:var(--arkive-filter-active)] text-foreground'
const CELL_CLASS = `flex w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background p-2 text-left transition-colors hover:border-[color:var(--arkive-nav-accent)] ${FOCUS}`
const NUMBER_CLASS = 'h-9 border-border bg-background text-sm tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]'
const LABEL_CLASS = `mb-0.5 block ${TYPE.label}`
const SECTION_CLASS = 'border-t border-border/70 p-2.5'
/** One part of a relic's dialog; an empty part (no rare word, no active affix) collapses to nothing. */
const ROW_CLASS = 'min-w-0 px-2.5 pb-2 empty:pb-0'
const PROSE_CLASS = `mt-0.5 whitespace-pre-line ${TYPE.body}`

/**
 * A relic part before the final floor, to two decimals. The game floors only
 * once the three relics are added up, so the cards show what is being added.
 */
const decimal = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 })

/** `Artifact.tag` is a usage bucket: 1 副本, 2 竞技, 3 通用. */
const TAG_KEY: Record<number, string> = { 1: 'relic.tagDungeon', 2: 'relic.tagArena', 3: 'relic.tagGeneral' }

/** A material position across the three slots, for swapping. */
type Position = { groupId: number; index: number }

/** A freshly added affix row: no stat picked, so it scores and counts as nothing. */
const EMPTY_RELIC_AFFIX: ChosenRelicAffix = { stat: '', value: 0, mark: 0 }

function affixFrom(rung: PoolAffix): ChosenRelicAffix {
  return { stat: rung.stat, value: rung.value, mark: rung.mark, affixId: rung.id, scaled: rung.scaled }
}

/** The game's risk wording for a grade, falling back to the bare number. */
function useGradeLabel() {
  const { t } = useTranslation()
  return (grade: number) => t(`relic.gradeRisk${grade}`, { defaultValue: t('relic.gradeBare', { grade }) })
}

type ChoiceOption = { value: string | number; label: string; disabled?: boolean }

/** A native select; `groups` renders labelled option groups instead of a flat list. */
function ChoiceSelect({ value, options = [], groups, label, testId, placeholder, onChange }: {
  value: string | number; options?: ChoiceOption[]; groups?: { label: string; options: ChoiceOption[] }[]
  label: string; testId: string
  /** Shown, unselectable, while nothing is picked. */
  placeholder?: string
  onChange: (raw: string) => void
}) {
  const render = (list: ChoiceOption[]) =>
    list.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)
  return (
    <select value={value} className={SELECT_CLASS} aria-label={label} data-testid={testId}
      onChange={(event) => onChange(event.target.value)}>
      {placeholder ? <option value="" disabled>{placeholder}</option> : null}
      {groups
        ? groups.filter((group) => group.options.length > 0).map((group) => (
          <optgroup key={group.label} label={group.label}>{render(group.options)}</optgroup>
        ))
        : render(options)}
    </select>
  )
}

function ArtifactCell({ relics, groupId, artifact, gradeOf, onSelect }: {
  relics: Relics; groupId: number; artifact: Artifact | null; gradeOf: (id: number) => number; onSelect: (id: number) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const groupName = relics.groupNames[String(groupId)] ?? ''
  const detailOf = (entry: Artifact) =>
    t('relic.artifactDetail', {
      group: entry.groupName ?? groupName,
      tag: t(TAG_KEY[entry.tag ?? 0] ?? 'relic.tagUnknown'),
    })
  const options: PickerOption[] = artifactsInGroup(relics, groupId).map((entry) => ({
    id: entry.id, name: entry.name, detail: detailOf(entry),
    quality: gradeQuality(gradeOf(entry.id)), iconUrl: entry.icon ? iconUrl(entry.icon) : undefined,
    keywords: entry.description,
  }))

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={CELL_CLASS}
        data-testid={`relic-artifact-open-${groupId}`}>
        <IconTile
          quality={artifact ? gradeQuality(gradeOf(artifact.id)) : null}
          src={artifact?.icon ? iconUrl(artifact.icon) : undefined}
          alt={artifact?.name ?? ''}
          label={artifact?.name.slice(0, 1)}
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">
            {artifact === null ? t('relic.artifactEmpty') : artifact.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {artifact === null ? t('relic.artifactPlaceholder') : detailOf(artifact)}
          </span>
        </span>
      </button>
      <PickerModal open={open} onOpenChange={setOpen} onSelect={onSelect} options={options}
        selectedId={artifact?.id ?? null} title={t('relic.groupTitle', { group: groupName })} />
    </>
  )
}

/** The game's prohibition sign, on an affix switched off for being past the cap. */
function BanIcon({ label, detail }: { label: string; detail: string }) {
  return (
    <Hint content={detail} title={label} contentClassName="max-w-xs">
      <span className="inline-flex cursor-help" tabIndex={0} aria-label={label}>
        <BanGlyph />
      </span>
    </Hint>
  )
}

function BanGlyph() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0 text-red-600 dark:text-red-400">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3.6 3.6 12.4 12.4" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function AffixRow({ relics, affix, others, index, inactive, cap, pool, k2, testPrefix, onChange, onRemove }: {
  relics: Relics; affix: ChosenRelicAffix; others: ChosenRelicAffix[]; index: number; inactive: boolean
  /** How many affixes the grade lets take effect, for the switched-off tooltip. */
  cap: number
  pool: PoolAffix[]; k2: number; testPrefix: string
  onChange: (next: ChosenRelicAffix) => void; onRemove: () => void
}) {
  const { t } = useTranslation()
  const source = pool.find((entry) => entry.id === affix.affixId)
  const rare = source && isRareAffix(source) ? source : null
  const rungs = poolRungs(pool, affix.stat)
  const show = (entry: PoolAffix) => formatStat(relics, entry.stat, affixValue(entry, k2))
  // What the other rows of this material already hold: a group at most once,
  // and one rare word at most.
  const taken = usedGroups(pool, others)
  // The arrows walk the stat's rungs, which `poolRungs` lists richest first.
  const at = rungs.findIndex((rung) => rung.id === affix.affixId)
  const stepTo = (offset: number) => {
    const next = at < 0 ? undefined : rungs[at + offset]
    return next ? () => onChange(affixFrom(next)) : null
  }

  return (
    <div className={`min-w-0 ${inactive ? 'opacity-60' : ''}`} data-inactive={inactive || undefined}>
      {/* One column template for every row, so the stat pickers line up and so do the values. */}
      <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-center gap-1">
        <span className="flex w-4 justify-center" data-testid={`${testPrefix}-state-${index}`}>
          {inactive ? <BanIcon label={t('relic.affixInactive')} detail={t('relic.cappedOut', { cap })} /> : null}
        </span>
        <ChoiceSelect value={rare ? `${RARE_PREFIX}${rare.id}` : affix.stat === '' ? '' : `${STAT_PREFIX}${affix.stat}`}
          label={t('relic.affixStat')} testId={`${testPrefix}-stat-${index}`}
          placeholder={affix.stat === '' ? t('relic.affixPick') : undefined}
          groups={[
            {
              label: t('relic.affixOrdinary'),
              options: poolStats(pool).map((stat) => ({
                value: `${STAT_PREFIX}${stat}`,
                label: statName(relics, stat),
                disabled: taken.groups.has(poolRungs(pool, stat)[0]?.groupId ?? -1),
              })),
            },
            {
              label: t('relic.affixRare'),
              options: rareAffixes(pool).map((entry) => ({
                value: `${RARE_PREFIX}${entry.id}`,
                label: t('relic.rareOption', { name: entry.name ?? statName(relics, entry.stat), stat: statName(relics, entry.stat) }),
                disabled: taken.rare || taken.groups.has(entry.groupId),
              })),
            },
          ]}
          onChange={(raw) => {
            const next = raw.startsWith(RARE_PREFIX)
              ? pool.find((entry) => entry.id === Number(raw.slice(RARE_PREFIX.length)))
              : poolRungs(pool, raw.slice(STAT_PREFIX.length))[0]
            if (next) onChange(affixFrom(next))
          }} />
        {rare ? (
          <span className="flex h-9 min-w-0 items-center overflow-hidden truncate whitespace-nowrap rounded-md border border-border bg-muted/40 px-2 text-sm tabular-nums text-foreground"
            data-testid={`${testPrefix}-rung-${index}`}>
            {t('relic.rungOption', { value: show(rare), mark: rare.mark })}
          </span>
        ) : (
          // Keyed by the pool row's own id: two rungs of one stat can share a
          // value, so the value alone is not a unique handle.
          <StepSelect value={affix.affixId ?? ''} label={t('relic.affixRung')} testId={`${testPrefix}-rung-${index}`}
            upLabel={t('relic.rungUp')} downLabel={t('relic.rungDown')} className={SELECT_CLASS}
            onUp={stepTo(-1)} onDown={stepTo(1)}
            onChange={(raw) => {
              const next = rungs.find((rung) => rung.id === Number(raw))
              if (next) onChange(affixFrom(next))
            }}>
            {rungs.map((rung) => (
              <option key={rung.id} value={rung.id}>{t('relic.rungOption', { value: show(rung), mark: rung.mark })}</option>
            ))}
          </StepSelect>
        )}
        <button type="button" onClick={onRemove} className={`${BUTTON_CLASS} size-7`}
          aria-label={t('relic.removeAffix')} data-testid={`${testPrefix}-remove-${index}`}>
          ×
        </button>
        <TierBadge tier={source?.tag ?? 0} testId={`${testPrefix}-tier-${index}`} />
      </div>
    </div>
  )
}

/** The game's word-type marks: 1 凡 blue, 2 珍 purple, 3 稀 gold, 4 异 orange. */
const TIER_CLASS: Record<number, string> = {
  1: 'border-blue-500/60 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  2: 'border-purple-500/60 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  3: 'border-yellow-500/70 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
  4: 'border-orange-500/70 bg-orange-500/10 text-orange-700 dark:text-orange-300',
}

function TierBadge({ tier, testId }: { tier: number; testId: string }) {
  const { t } = useTranslation()
  const style = TIER_CLASS[tier]
  return (
    <span data-testid={testId} title={style ? t(`relic.tierName${tier}`) : undefined}
      className={`inline-flex size-7 items-center justify-center rounded-md border text-xs font-bold ${style ?? 'border-transparent'}`}>
      {style ? t(`relic.tier${tier}`) : ''}
    </span>
  )
}

/** The effects of the rare words on a material, under all of its affixes; absent when there are none. */
function RareEffects({ relics, pool, affixes, k2, testId }: {
  relics: Relics; pool: PoolAffix[]; affixes: ChosenRelicAffix[]; k2: number; testId: string
}) {
  const { t } = useTranslation()
  const rares = affixes.flatMap((affix) => {
    const source = pool.find((entry) => entry.id === affix.affixId)
    return source && isRareAffix(source) && source.effect ? [source] : []
  })
  if (rares.length === 0) return null
  return (
    <div className="rounded-md border border-yellow-500/40 bg-yellow-500/5 p-2" data-testid={testId}>
      <div className="text-xs font-semibold text-foreground">{t('relic.rareEffects')}</div>
      <ul className="mt-0.5 space-y-0.5 text-xs leading-5 text-yellow-800 dark:text-yellow-200">
        {rares.map((rare) => (
          <li key={rare.id}>
            <span className="font-semibold">{t('relic.rareName', { name: rare.name ?? '' })}</span>
            {rareEffect(relics, rare, k2)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The grade, worst on the left. The slider runs over positions rather than
 * grade numbers because the best grade is the lowest number; every stop is
 * labelled with the game's risk wording.
 */
function GradeSlider({ relics, grade, scoredGrade, k2, groupId, onChange }: {
  relics: Relics; grade: number; scoredGrade: number; k2: number; groupId: number; onChange: (grade: number) => void
}) {
  const { t } = useTranslation()
  const label = useGradeLabel()
  const grades = gradeOptions(relics)
  const position = Math.max(0, grades.indexOf(grade))
  const rung = gradeRung(relics, grade)
  const valueText = t('relic.gradeValue', { risk: label(grade), mark: decimal((rung?.mark ?? 0) * k2) })

  return (
    <div>
      <span className={LABEL_CLASS}>{t('relic.grade')}</span>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className={`${TYPE.name} tabular-nums`} data-testid={`relic-grade-value-${groupId}`}>{valueText}</span>
        {scoredGrade !== grade ? (
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300" data-testid={`relic-grade-scored-${groupId}`}>
            {t('relic.scoredAsGrade', { grade: scoredGrade })}
          </span>
        ) : null}
      </div>
      <div className="px-6">
        <RangeField label={t('relic.grade')} min={0} max={grades.length - 1} value={position} valueText={valueText}
          minLabel="" maxLabel="" tickLabel={(step) => t('relic.gradeBare', { grade: grades[step] ?? grade })}
          testId={`relic-grade-${groupId}`} onChange={(step) => onChange(grades[step] ?? grade)} />
      </div>
      {rung && rung.note !== '' ? <p className={PROSE_CLASS}>{rung.note}</p> : null}
    </div>
  )
}

/** A knowledge coefficient as the game prints it: k 0.1 (level 0) reads 100%, k 0.88 reads 880%. */
const percent = (k: number) => `${Number((k * 1000).toFixed(1))}%`

function KnowledgeBar({ relics, level, k1, k2, season, onChange }: {
  relics: Relics; level: number; k1: number; k2: number; season: number | undefined; onChange: (level: number) => void
}) {
  const { t } = useTranslation()
  const levels = useMemo(
    () => knowledgeLadder(relics, season).flatMap((r) => (r.level == null ? [] : [r.level])),
    [relics, season],
  )
  const min = levels[0] ?? 0
  const max = levels[levels.length - 1] ?? 0
  const [text, setText] = useState(String(level))
  useEffect(() => setText(String(level)), [level])
  const commit = (raw: string) => {
    const value = Math.trunc(Number(raw))
    onChange(Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)))
  }

  return (
    <div className="rounded-md border border-border bg-card p-3" data-testid="relic-knowledge-bar">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <label className="block w-28 shrink-0">
          <span className={LABEL_CLASS}>{t('relic.knowledge')}</span>
          <Input type="number" inputMode="numeric" min={min} max={max} value={text} className={NUMBER_CLASS}
            data-testid="relic-knowledge" onChange={(event) => {
              setText(event.target.value)
              if (event.target.value !== '') commit(event.target.value)
            }} onBlur={() => setText(String(level))} />
        </label>
        {/* The two lines the game's 非凡知识提升 panel shows, in its own words. */}
        <dl className="flex flex-wrap gap-x-6 gap-y-1 pb-1.5 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">{t('relic.resonanceEfficiency')}</dt>
            <dd className="font-semibold tabular-nums text-foreground" data-testid="relic-k1">{percent(k1)}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">{t('relic.affixEfficiency')}</dt>
            <dd className="font-semibold tabular-nums text-foreground" data-testid="relic-k2">{percent(k2)}</dd>
          </div>
          <FormulaHint testId="relic-knowledge-formula">{t('relic.knowledgeHint', { min, max, k1, k2 })}</FormulaHint>
        </dl>
      </div>

    </div>
  )
}

/**
 * The 非凡共鸣 bonus at the material's current active affix count, read at the
 * grade the relic is scored at. Words past the cap add nothing, so a grade-2
 * relic with six words shows the five-word bonus.
 */
function ResonanceNow({ relics, material, k1, testId }: {
  relics: Relics; material: MaterialResult; k1: number; testId: string
}) {
  const { t } = useTranslation()
  if (material.activeCount === 0) return null
  if (!material.resonates) {
    return material.applies ? (
      <p className="text-xs text-muted-foreground" data-testid={testId}>{t('relic.resonanceOther')}</p>
    ) : null
  }
  return (
    <div className="rounded-md bg-[color:var(--arkive-filter-active)] px-2 py-1.5 text-xs" data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 font-semibold text-foreground">
        <span>{t('relic.resonanceNow', { count: material.activeCount })}</span>
        <span className="tabular-nums">{t('relic.resonanceRowScore', { score: decimal(material.resonanceScore) })}</span>
      </div>
      {material.resonanceStats.length > 0 ? (
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-muted-foreground">
          {material.resonanceStats.map(([stat, value]) => (
            <span key={stat} className="tabular-nums">
              {statName(relics, stat)} +{formatStat(relics, stat, Math.floor(value * k1))}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function MaterialPanel({ relics, slot, material, result, k1, k2, swapping, canSwap, onAffixes, onSwapStart }: {
  relics: Relics; slot: RelicSlotState; material: MaterialResult; result: RelicSlotResult
  k1: number; k2: number
  /** Whether this material is the one being moved. */
  swapping: boolean
  /** Whether another position takes this material's type at all. */
  canSwap: boolean
  onAffixes: (affixes: ChosenRelicAffix[]) => void; onSwapStart: () => void
}) {
  const { t } = useTranslation()
  const groupId = slot.groupId
  const pool = useMemo(() => typePool(relics, material.type), [relics, material.type])
  const max = maxAffixes(relics)
  const testPrefix = `relic-affix-${groupId}-${material.index}`
  const affixes = material.affixes
  const over = material.inactive.filter(Boolean).length
  const name = materialName(relics, material.type, pool, affixes)
    ?? t('relic.materialTypeOption', { group: relics.groupNames[String(material.type)] ?? '' })

  // The first ordinary stat this material does not hold yet.
  // A new row is empty: nothing is picked for the player.
  const addAffix = () => onAffixes([...affixes, EMPTY_RELIC_AFFIX])
  const canAdd = affixes.length < max

  return (
    <>
    <div className={ROW_CLASS} data-testid={`relic-material-${groupId}-${material.index}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {/* Named as the game names it, from the words the material carries. */}
          <div className="flex items-baseline gap-1.5">
            <span className={TYPE.label}>{t('relic.materialName')}</span>
            <span className={`${TYPE.name} text-amber-700 dark:text-amber-300`} data-testid={`relic-material-name-${groupId}-${material.index}`}>{name}</span>
          </div>
          <span className={`text-xs font-semibold ${material.applies ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}
            data-testid={`relic-material-state-${groupId}-${material.index}`}>
            {material.applies ? t('relic.materialActive') : t('relic.materialInactive')}
          </span>
          <span className="ml-2 text-xs tabular-nums text-muted-foreground">{t('relic.materialScore', { score: decimal(material.affixScore) })}</span>
          {over > 0 ? (
            <span className="ml-2 text-xs tabular-nums text-amber-700 dark:text-amber-300" data-testid={`relic-material-full-${groupId}-${material.index}`}>
              {t('relic.materialFullScore', { score: decimal(material.fullAffixScore) })}
            </span>
          ) : null}
        </div>
        {canSwap ? (
          <button type="button" onClick={onSwapStart} aria-pressed={swapping}
            className={`${BUTTON_CLASS} min-h-8 gap-1 px-2.5 py-1 ${swapping ? TAB_ACTIVE : ''}`}
            data-testid={`relic-swap-${groupId}-${material.index}`}>
            <span aria-hidden>⇄</span>
            {t(swapping ? 'relic.swapCancel' : 'relic.swapStart')}
          </button>
        ) : null}
      </div>
      {swapping ? (
        <p className="mt-1 text-xs font-semibold text-[color:var(--arkive-nav-accent)]" data-testid={`relic-swap-hint-${groupId}`}>
          {t('relic.swapHint')}
        </p>
      ) : null}
    </div>

    <div className={`${ROW_CLASS} space-y-1.5`}>
      <span className={LABEL_CLASS}>
        {t('relic.affixesOf', { group: relics.groupNames[String(material.type)] ?? '' })}
      </span>
      {affixes.map((affix, index) => (
        <AffixRow key={index} relics={relics} affix={affix} index={index} inactive={material.inactive[index] ?? false} cap={result.cap}
          others={affixes.filter((_, at) => at !== index)} pool={pool} k2={k2} testPrefix={testPrefix}
          onChange={(next) => onAffixes(affixes.map((entry, at) => (at === index ? next : entry)))}
          onRemove={() => onAffixes(affixes.filter((_, at) => at !== index))} />
      ))}
      <button type="button" onClick={addAffix} className={`${BUTTON_CLASS} min-h-8 px-2.5 py-1`}
        disabled={!canAdd} data-testid={`${testPrefix}-add`}>
        {/* `used` rather than `count`, which i18next reads as a plural selector. */}
        {t('relic.addAffix', { used: affixes.length, max })}
      </button>
    </div>

    <div className={ROW_CLASS}>
      <RareEffects relics={relics} pool={pool} affixes={affixes} k2={k2} testId={`${testPrefix}-rare`} />
    </div>
    <div className={ROW_CLASS}>
      <ResonanceNow relics={relics} material={material} k1={k1} testId={`relic-resonance-${groupId}-${material.index}`} />
    </div>
    </>
  )
}

/**
 * One relic's dialog. It is portalled out of the page's read-only fieldset,
 * so it carries its own.
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
  const groupId = slot.groupId
  const spec = groupId === SPEC_GROUP
  // 特化 views the material it has equipped; the other two view whichever
  // position the player last picked, which is only a view.
  const [viewed, setViewed] = useState(0)
  const index = spec ? specIndex(slot) : viewed
  const material = result.materials[index]
  const active = activeMaterialIndexes(slot, server)
  const title = t('relic.groupTitle', { group: relics.groupNames[String(groupId)] ?? '' })

  const patch = (next: Partial<RelicSlotState>) => onChange({ ...slot, ...next })
  /** An artifact's own grade: stored per artifact, starting at the worst. */
  const gradeOf = (id: number) => slot.grades?.[String(id)] ?? relics.promotion.worstGrade
  const choose = (at: number) => (spec ? patch({ materialType: materialTypeAt(groupId, at) }) : setViewed(at))
  /** A position's material, named as the game names it from the words it carries. */
  const nameAt = (at: number) => {
    const type = materialTypeAt(groupId, at)
    return materialName(relics, type, typePool(relics, type), slot.materials[at] ?? [])
      ?? t('relic.materialTypeOption', { group: relics.groupNames[String(type)] ?? '' })
  }

  return (
    <DialogContent className={`${DETAIL_DIALOG_CLASS} gap-0 p-0`} data-testid={`relic-card-${groupId}`} aria-label={title}>
      <DialogHeader className="flex-row items-start justify-between gap-2 border-b border-border p-4 pr-12 text-left">
        <div className="min-w-0">
          <DialogTitle>{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">{t('relic.affixCap', { cap: result.cap })}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs font-semibold text-muted-foreground">{t('relic.slotTotal')}</div>
          <div className={TYPE.total} data-testid={`relic-total-${groupId}`}>{decimal(result.total)}</div>
        </div>
      </DialogHeader>
      <fieldset disabled={readOnly} className="m-0 flex min-w-0 flex-col border-0 p-0 pb-1">

      <div className="min-w-0 px-2.5 pt-2.5 pb-2">
          <span className={LABEL_CLASS}>{t('relic.artifact')}</span>
          <ArtifactCell relics={relics} groupId={groupId} artifact={result.artifact} gradeOf={gradeOf}
            onSelect={(artifactId) => patch({ artifactId, grade: gradeOf(artifactId) })} />
          {/* Every line of the effect text, deliberately untruncated. */}
          <p className={PROSE_CLASS}>{result.artifact ? result.artifact.description : t('relic.artifactPlaceholder')}</p>
      </div>
      <div className="min-w-0 px-2.5 pb-2.5">
        <GradeSlider relics={relics} grade={slot.grade} scoredGrade={result.resonanceGrade} k2={k2} groupId={groupId}
          onChange={(grade) => patch({
            grade,
            grades: slot.artifactId == null ? slot.grades : { ...slot.grades, [String(slot.artifactId)]: grade },
          })} />
      </div>

      <div className={`${SECTION_CLASS} space-y-1.5`}>
        {/* The same two-button row on every card, so the material panels and
            their resonance ladders line up across the three columns. */}
        <span className={LABEL_CLASS}>{t(spec ? 'relic.materialType' : 'relic.materialSlots')}</span>
        <div className="flex gap-1.5" role="group" aria-label={t(spec ? 'relic.materialType' : 'relic.materialSlots')}>
          {Array.from({ length: MATERIAL_SLOTS }, (_, at) => {
            const self = swapFrom?.groupId === groupId && swapFrom.index === at
            // While a material is being moved, every other position of its type
            // takes it; the rest of the tabs sit the move out.
            const target = swapFrom !== null && !self
              && materialTypeAt(groupId, at) === materialTypeAt(swapFrom.groupId, swapFrom.index)
            return (
              <button key={at} type="button" aria-pressed={at === index}
                disabled={swapFrom !== null && !target && !self}
                onClick={() => (target ? onSwapTo({ groupId, index: at }) : choose(at))}
                data-testid={`relic-material-tab-${groupId}-${at}`}
                data-swap-target={target || undefined}
                className={`${BUTTON_CLASS} min-h-8 flex-1 gap-1 px-2.5 py-1 ${
                  target ? 'border-dashed border-[color:var(--arkive-nav-accent)] text-[color:var(--arkive-nav-accent)]' : at === index ? TAB_ACTIVE : ''
                }`}>
                {target ? <span aria-hidden>⇄</span> : null}
                <span className="truncate">{(slot.materials[at]?.length ?? 0) === 0 ? t('relic.materialEmpty') : t('relic.materialTab', { name: nameAt(at), count: slot.materials[at].length })}</span>
                {!spec && !active.includes(at) ? <span className="shrink-0 text-amber-700 dark:text-amber-300">{t('relic.strategicOnly')}</span> : null}
              </button>
            )
          })}
        </div>
        <p className={PROSE_CLASS}>{t(spec ? 'relic.materialSpecHint' : 'relic.materialSlotsHint')}</p>
      </div>

        {material ? (
          <MaterialPanel relics={relics} slot={slot} material={material} result={result} k1={k1} k2={k2}
            swapping={swapFrom?.groupId === groupId && swapFrom.index === index}
            canSwap={canSwapFrom({ groupId, index })}
            onAffixes={(affixes) => patch({ materials: slot.materials.map((list, at) => (at === index ? affixes : list)) })}
            onSwapStart={() => onSwapStart({ groupId, index })} />
        ) : (
          <><div /><div /><div /><div /></>
        )}

      <div className={`${SECTION_CLASS} mt-auto`} data-testid={`relic-breakdown-${groupId}`}>
        <dl className="space-y-0.5 text-xs">
          <Line label={t('relic.assembly')} value={result.assemblyScore} />
          <Line label={t('relic.resonance')} value={result.resonanceScore} />
          <Line label={t('relic.affixScore')} value={result.affixScore} />
          <Line label={t('relic.slotTotal')} value={result.total} strong />
        </dl>
      </div>
      </fieldset>
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
  const gradeLabel = useGradeLabel()
  const groupId = slot.groupId
  const artifact = result.artifact
  return (
    <button type="button" aria-haspopup="dialog" onClick={onOpen}
      className={`flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left transition-colors hover:border-[color:var(--arkive-nav-accent)] ${FOCUS}`}
      data-testid={`relic-open-${groupId}`}>
      <IconTile
        quality={artifact ? gradeQuality(slot.grade) : null}
        src={artifact?.icon ? iconUrl(artifact.icon) : undefined}
        alt={artifact?.name ?? ''}
        label={artifact?.name.slice(0, 1)}
        className="size-14"
      />
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${TYPE.body}`}>{t('relic.groupTitle', { group: relics.groupNames[String(groupId)] ?? '' })}</span>
        <span className={`block truncate ${TYPE.name}`}>{artifact ? artifact.name : t('relic.artifactPlaceholder')}</span>
        <span className={`mt-1 inline-block rounded border border-border px-1 ${TYPE.control} leading-4 text-muted-foreground`}>
          {gradeLabel(slot.grade)}
        </span>
      </span>
      <span className="shrink-0 text-lg font-bold tabular-nums text-foreground" data-testid={`relic-face-total-${groupId}`}>
        {decimal(result.total)}
      </span>
    </button>
  )
}

function Line({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <dt className={strong ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
        {decimal(value)}
      </dd>
    </div>
  )
}

/**
 * A stored slot read against the dataset: the grade clamped to the ones a
 * player can hold, each affix resolved by id against its position's pool, and
 * a group or a second rare word repeated within a material dropped — those
 * cannot exist in game. An id the pool no longer has is dropped too.
 */
function restoreSlot(relics: Relics, groupId: number, stored: StoredRelicSlot | undefined, fresh: RelicSlotState): RelicSlotState {
  if (!stored) return fresh
  const grades = gradeOptions(relics)
  // A grade the player cannot hold (0) reads as the best one they can.
  const clamp = (value: number) => (grades.includes(value)
    ? value
    : gradeRung(relics, value) && grades.length > 0 ? grades[grades.length - 1] : fresh.grade)
  const artifactId = artifactsInGroup(relics, groupId).some((a) => a.id === stored.artifactId) ? stored.artifactId : fresh.artifactId
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
    <TooltipProvider delayDuration={200}>
    <section className="space-y-3" data-testid="relic-section" aria-label={t('relic.title')}>
      <KnowledgeBar relics={relics} level={knowledgeLevel} k1={k1} k2={k2} season={season} onChange={setKnowledgeLevel} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {slots.map((slot, index) => (
          <RelicFace key={slot.groupId} relics={relics} slot={slot} result={results[index]} onOpen={() => setOpenGroup(slot.groupId)} />
        ))}
      </div>

      {/* A move survives closing the dialog, so a material can be carried to
          another relic: close this one, open that one, click a dashed tab. */}
      {swapFrom ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-[color:var(--arkive-nav-accent)] px-3 py-2 text-xs font-semibold text-[color:var(--arkive-nav-accent)]"
          data-testid="relic-swap-pending">
          {t('relic.swapPending')}
          <button type="button" onClick={() => setSwapFrom(null)} className={`${BUTTON_CLASS} min-h-7 px-2.5`}
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
    </TooltipProvider>
  )
}
