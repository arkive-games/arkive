import { useEffect, useMemo, useState } from 'react'
import { useMemory } from '@gamemap/state-memory'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import RangeField from '@/components/RangeField'
import PickerModal, { IconTile, type PickerOption } from '@/features/equipment/PickerModal'
import { TYPE } from '@/lib/typography'
import { iconUrl } from '@/lib/urls'
import RelicServerToggle from '@/features/relics/RelicServerToggle'
import { relicDraft, useRelicServer, type StoredRelicSlot } from '@/features/relics/memory'
import {
  MATERIAL_SLOTS, activeMaterialIndexes, affixValue, artifactsInGroup, currentSeason, effectiveAffixCap,
  effectiveGrade, evaluateRelicSlot, formatStat, gradeOptions, gradeRung, isRareAffix, k1For, k2For,
  knowledgeLadder, markForStat, materialTypeAt, maxAffixes, newRelicSlot, poolRungs, poolStats, rareAffixes,
  rareEffect, resonanceLadder, specIndex, statName, typePool, usedGroups,
  type Artifact, type ChosenRelicAffix, type MaterialResult, type PoolAffix, type Relics, type RelicServer,
  type RelicSlotResult, type RelicSlotState,
} from '@/features/relics/data'

/** The three 封印物 items as the page's rating grades them. */
export type RelicTotals = { assembly: number; resonance: number; affix: number; total: number }

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
const PROSE_CLASS = `mt-0.5 whitespace-pre-line ${TYPE.body}`

/** `Artifact.tag` is a usage bucket: 1 副本, 2 竞技, 3 通用. */
const TAG_KEY: Record<number, string> = { 1: 'relic.tagDungeon', 2: 'relic.tagArena', 3: 'relic.tagGeneral' }

/** A material position across the three slots, for swapping. */
type Position = { groupId: number; index: number }

function affixFrom(rung: PoolAffix): ChosenRelicAffix {
  return { stat: rung.stat, value: rung.value, mark: rung.mark, affixId: rung.id, scaled: rung.scaled }
}

/** The game's risk wording for a grade, falling back to the bare number. */
function useGradeLabel() {
  const { t } = useTranslation()
  return (grade: number) => t(`relic.gradeRisk${grade}`, { defaultValue: t('relic.gradeBare', { grade }) })
}

/** A position's name: 填充一/填充二 on 攻击 and 防御, the material type on 特化. */
function usePositionLabel(relics: Relics) {
  const { t } = useTranslation()
  return (groupId: number, index: number) =>
    groupId === SPEC_GROUP
      ? t('relic.materialTypeOption', { group: relics.groupNames[String(materialTypeAt(groupId, index))] ?? '' })
      : t(index === 0 ? 'relic.materialSlot1' : 'relic.materialSlot2')
}

type ChoiceOption = { value: string | number; label: string; disabled?: boolean }

/** A native select; `groups` renders labelled option groups instead of a flat list. */
function ChoiceSelect({ value, options = [], groups, label, testId, onChange }: {
  value: string | number; options?: ChoiceOption[]; groups?: { label: string; options: ChoiceOption[] }[]
  label: string; testId: string; onChange: (raw: string) => void
}) {
  const render = (list: ChoiceOption[]) =>
    list.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)
  return (
    <select value={value} className={SELECT_CLASS} aria-label={label} data-testid={testId}
      onChange={(event) => onChange(event.target.value)}>
      {groups
        ? groups.filter((group) => group.options.length > 0).map((group) => (
          <optgroup key={group.label} label={group.label}>{render(group.options)}</optgroup>
        ))
        : render(options)}
    </select>
  )
}

function ArtifactCell({ relics, groupId, artifact, onSelect }: {
  relics: Relics; groupId: number; artifact: Artifact | null; onSelect: (id: number) => void
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
    quality: entry.quality, iconUrl: entry.icon ? iconUrl(entry.icon) : undefined,
    keywords: entry.description,
  }))

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={CELL_CLASS}
        data-testid={`relic-artifact-open-${groupId}`}>
        <IconTile
          quality={artifact?.quality ?? null}
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
function BanIcon({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 16 16" role="img" aria-label={label} className="size-4 shrink-0 text-red-600 dark:text-red-400">
      <title>{label}</title>
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M3.6 3.6 12.4 12.4" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function AffixRow({ relics, affix, others, index, inactive, pool, k2, testPrefix, onChange, onRemove }: {
  relics: Relics; affix: ChosenRelicAffix; others: ChosenRelicAffix[]; index: number; inactive: boolean
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

  return (
    <div className={`min-w-0 ${inactive ? 'opacity-60' : ''}`} data-inactive={inactive || undefined}>
      {/* A rare word's name is longer and its value fixed, so its picker takes the wider column. */}
      <div className={`grid min-w-0 items-center gap-1 ${
        rare ? 'grid-cols-[auto_minmax(7rem,1.6fr)_minmax(5rem,1fr)_auto]' : 'grid-cols-[auto_minmax(5rem,1fr)_minmax(5.5rem,1.2fr)_auto]'
      }`}>
        <span className="flex w-4 justify-center" data-testid={`${testPrefix}-state-${index}`}>
          {inactive ? <BanIcon label={t('relic.affixInactive')} /> : null}
        </span>
        <ChoiceSelect value={rare ? `${RARE_PREFIX}${rare.id}` : `${STAT_PREFIX}${affix.stat}`}
          label={t('relic.affixStat')} testId={`${testPrefix}-stat-${index}`}
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
          <span className="flex h-9 min-w-0 items-center overflow-hidden whitespace-nowrap rounded-md border border-border bg-muted/40 px-2 text-sm tabular-nums text-foreground"
            data-testid={`${testPrefix}-rung-${index}`}>
            {t('relic.rungOption', { value: show(rare), mark: rare.mark })}
          </span>
        ) : (
          // Keyed by the pool row's own id: two rungs of one stat can share a
          // value, so the value alone is not a unique handle.
          <ChoiceSelect value={affix.affixId ?? ''} label={t('relic.affixRung')} testId={`${testPrefix}-rung-${index}`}
            options={rungs.map((rung) => ({ value: rung.id, label: t('relic.rungOption', { value: show(rung), mark: rung.mark }) }))}
            onChange={(raw) => {
              const next = rungs.find((rung) => rung.id === Number(raw))
              if (next) onChange(affixFrom(next))
            }} />
        )}
        <button type="button" onClick={onRemove} className={`${BUTTON_CLASS} size-7`}
          aria-label={t('relic.removeAffix')} data-testid={`${testPrefix}-remove-${index}`}>
          ×
        </button>
      </div>
      {rare && rare.effect ? (
        <p className="mt-0.5 pl-5 text-xs leading-5 text-amber-700 dark:text-amber-300" data-testid={`${testPrefix}-effect-${index}`}>
          <span className="font-semibold">{t('relic.rareName', { name: rare.name ?? '' })}</span>
          {rareEffect(relics, rare, k2)}
        </p>
      ) : null}
    </div>
  )
}

/**
 * The grade, worst on the left. The slider runs over positions rather than
 * grade numbers because the best grade is the lowest number; every stop is
 * labelled with the game's risk wording.
 */
function GradeSlider({ relics, grade, scoredGrade, groupId, onChange }: {
  relics: Relics; grade: number; scoredGrade: number; groupId: number; onChange: (grade: number) => void
}) {
  const { t } = useTranslation()
  const label = useGradeLabel()
  const grades = gradeOptions(relics)
  const position = Math.max(0, grades.indexOf(grade))
  const rung = gradeRung(relics, grade)
  const valueText = t('relic.gradeValue', { risk: label(grade), mark: rung?.mark ?? 0 })

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
          minLabel="" maxLabel="" tickLabel={(step) => label(grades[step] ?? grade)}
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
        </dl>
      </div>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
        {t('relic.knowledgeHint', { min, max, k1, k2 })}
      </p>
    </div>
  )
}

/**
 * 非凡共鸣 by affix count, at the grade the relic is scored at. Counts past the
 * grade's cap pay the cap's bonus only, so they are shown with the grade that
 * unlocks them instead, read off that grade's ladder.
 */
function ResonanceLadder({ relics, groupId, scoredGrade, cap, activeCount, k1, season, server, testId }: {
  relics: Relics; groupId: number; scoredGrade: number; cap: number; activeCount: number; k1: number
  season: number | undefined; server: RelicServer; testId: string
}) {
  const { t } = useTranslation()
  const grades = gradeOptions(relics)
  const counts = Array.from({ length: maxAffixes(relics) }, (_, i) => i + 1)

  return (
    <div data-testid={testId}>
      <div className="text-xs font-semibold text-foreground">{t('relic.resonanceLadder')}</div>
      <ol className="mt-0.5 space-y-0.5 text-xs">
        {counts.map((count) => {
          const locked = count > cap
          // The worst grade whose cap reaches this count, and whether this server allows it.
          const unlock = locked ? grades.find((g) => effectiveAffixCap(relics, g) >= count) : scoredGrade
          const reachable = unlock !== undefined && effectiveGrade(relics, unlock, server) === unlock
          const rung = unlock === undefined ? undefined
            : resonanceLadder(relics, groupId, unlock, season).find((r) => r.affixCount === count)
          const current = !locked && count === activeCount
          return (
            <li key={count} data-current={current || undefined}
              className={`rounded px-1.5 py-0.5 ${current ? 'bg-[color:var(--arkive-filter-active)] text-foreground' : locked ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className={current ? 'font-semibold' : ''}>
                  {t('relic.resonanceRow', { count })}
                  {locked && unlock !== undefined
                    ? ` · ${t(reachable ? 'relic.resonanceNeedsGrade' : 'relic.resonanceNeedsStrategic', { grade: unlock })}`
                    : ''}
                </span>
                <span className="tabular-nums">{rung ? t('relic.resonanceRowScore', { score: Math.floor((rung.mark ?? 0) * k1) }) : '—'}</span>
              </div>
              {rung && rung.stats.length > 0 ? (
                <div className="flex flex-wrap gap-x-3">
                  {rung.stats.map(([stat, value]) => (
                    <span key={stat} className="tabular-nums">
                      {statName(relics, stat)} +{formatStat(relics, stat, Math.floor(value * k1))}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function MaterialPanel({ relics, slot, material, result, k1, k2, season, server, swapTargets, onAffixes, onSwap }: {
  relics: Relics; slot: RelicSlotState; material: MaterialResult; result: RelicSlotResult
  k1: number; k2: number; season: number | undefined; server: RelicServer
  swapTargets: { position: Position; label: string }[]
  onAffixes: (affixes: ChosenRelicAffix[]) => void; onSwap: (to: Position) => void
}) {
  const { t } = useTranslation()
  const groupId = slot.groupId
  const pool = useMemo(() => typePool(relics, material.type), [relics, material.type])
  const max = maxAffixes(relics)
  const testPrefix = `relic-affix-${groupId}-${material.index}`
  const affixes = material.affixes
  const over = material.inactive.filter(Boolean).length

  // The first ordinary stat this material does not hold yet.
  const addAffix = () => {
    const taken = usedGroups(pool, affixes)
    const stat = poolStats(pool).find((entry) => !taken.groups.has(poolRungs(pool, entry)[0]?.groupId ?? -1))
    const next = stat === undefined ? undefined : poolRungs(pool, stat)[0]
    if (next) onAffixes([...affixes, affixFrom(next)])
  }
  const canAdd = affixes.length < max && poolStats(pool).some((stat) => !usedGroups(pool, affixes).groups.has(poolRungs(pool, stat)[0]?.groupId ?? -1))

  return (
    <div className="space-y-1.5" data-testid={`relic-material-${groupId}-${material.index}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`text-xs font-semibold ${material.applies ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}
          data-testid={`relic-material-state-${groupId}-${material.index}`}>
          {material.applies ? t('relic.materialActive') : t('relic.materialInactive')}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{t('relic.materialScore', { score: material.affixScore })}</span>
      </div>
      {swapTargets.length > 0 ? (
        <ChoiceSelect value="" label={t('relic.swapWith')} testId={`relic-swap-${groupId}-${material.index}`}
          options={[
            { value: '', label: t('relic.swapPlaceholder'), disabled: true },
            ...swapTargets.map((target) => ({ value: `${target.position.groupId}:${target.position.index}`, label: target.label })),
          ]}
          onChange={(raw) => {
            const [g, i] = raw.split(':').map(Number)
            if (Number.isFinite(g) && Number.isFinite(i)) onSwap({ groupId: g, index: i })
          }} />
      ) : null}

      <span className={LABEL_CLASS}>
        {t('relic.affixesOf', { group: relics.groupNames[String(material.type)] ?? '' })}
      </span>
      {affixes.map((affix, index) => (
        <AffixRow key={index} relics={relics} affix={affix} index={index} inactive={material.inactive[index] ?? false}
          others={affixes.filter((_, at) => at !== index)} pool={pool} k2={k2} testPrefix={testPrefix}
          onChange={(next) => onAffixes(affixes.map((entry, at) => (at === index ? next : entry)))}
          onRemove={() => onAffixes(affixes.filter((_, at) => at !== index))} />
      ))}
      <button type="button" onClick={addAffix} className={`${BUTTON_CLASS} min-h-8 px-2.5 py-1`}
        disabled={!canAdd} data-testid={`${testPrefix}-add`}>
        {/* `used` rather than `count`, which i18next reads as a plural selector. */}
        {t('relic.addAffix', { used: affixes.length, max })}
      </button>
      {over > 0 ? (
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300" data-testid={`${testPrefix}-capped`}>
          {t('relic.cappedOut', { over, cap: result.cap })}
        </p>
      ) : null}

      <ResonanceLadder relics={relics} groupId={groupId} scoredGrade={result.resonanceGrade} cap={result.cap}
        activeCount={material.activeCount} k1={k1} season={season} server={server}
        testId={`relic-resonance-${groupId}-${material.index}`} />
    </div>
  )
}

function RelicCard({ relics, slot, result, k1, k2, season, server, swapTargets, onChange, onSwap }: {
  relics: Relics; slot: RelicSlotState; result: RelicSlotResult
  k1: number; k2: number; season: number | undefined; server: RelicServer
  swapTargets: (from: Position) => { position: Position; label: string }[]
  onChange: (next: RelicSlotState) => void; onSwap: (from: Position, to: Position) => void
}) {
  const { t } = useTranslation()
  const positionLabel = usePositionLabel(relics)
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
  const choose = (at: number) => (spec ? patch({ materialType: materialTypeAt(groupId, at) }) : setViewed(at))

  return (
    <article className="flex min-w-0 flex-col rounded-md border border-border bg-card"
      data-testid={`relic-card-${groupId}`} aria-label={title}>
      <header className="flex min-w-0 items-start justify-between gap-2 border-b border-border p-2.5">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{t('relic.affixCap', { cap: result.cap })}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs font-semibold text-muted-foreground">{t('relic.slotTotal')}</div>
          <div className={TYPE.total} data-testid={`relic-total-${groupId}`}>{result.total.toLocaleString()}</div>
        </div>
      </header>

      <div className="space-y-2 p-2.5">
        <div>
          <span className={LABEL_CLASS}>{t('relic.artifact')}</span>
          <ArtifactCell relics={relics} groupId={groupId} artifact={result.artifact}
            onSelect={(artifactId) => patch({ artifactId })} />
          {/* Every line of the effect text, deliberately untruncated. */}
          <p className={PROSE_CLASS}>{result.artifact ? result.artifact.description : t('relic.artifactPlaceholder')}</p>
        </div>
        <GradeSlider relics={relics} grade={slot.grade} scoredGrade={result.resonanceGrade} groupId={groupId}
          onChange={(grade) => patch({ grade })} />
      </div>

      <div className={`${SECTION_CLASS} space-y-1.5`}>
        {/* The same two-button row on every card, so the material panels and
            their resonance ladders line up across the three columns. */}
        <span className={LABEL_CLASS}>{t(spec ? 'relic.materialType' : 'relic.materialSlots')}</span>
        <div className="flex gap-1.5" role="group" aria-label={t(spec ? 'relic.materialType' : 'relic.materialSlots')}>
          {Array.from({ length: MATERIAL_SLOTS }, (_, at) => (
            <button key={at} type="button" aria-pressed={at === index} onClick={() => choose(at)}
              data-testid={`relic-material-tab-${groupId}-${at}`}
              className={`${BUTTON_CLASS} min-h-8 flex-1 gap-1 px-2.5 py-1 ${at === index ? TAB_ACTIVE : ''}`}>
              {positionLabel(groupId, at)}
              {!spec && !active.includes(at) ? <span className="text-amber-700 dark:text-amber-300">{t('relic.strategicOnly')}</span> : null}
              {(slot.materials[at]?.length ?? 0) > 0 ? <span className="tabular-nums opacity-70">·{slot.materials[at].length}</span> : null}
            </button>
          ))}
        </div>
        <p className={PROSE_CLASS}>{t(spec ? 'relic.materialSpecHint' : 'relic.materialSlotsHint')}</p>

        {material ? (
          <MaterialPanel relics={relics} slot={slot} material={material} result={result} k1={k1} k2={k2}
            season={season} server={server} swapTargets={swapTargets({ groupId, index })}
            onAffixes={(affixes) => patch({ materials: slot.materials.map((list, at) => (at === index ? affixes : list)) })}
            onSwap={(to) => onSwap({ groupId, index }, to)} />
        ) : null}
      </div>

      <div className={`${SECTION_CLASS} mt-auto`} data-testid={`relic-breakdown-${groupId}`}>
        <dl className="space-y-0.5 text-xs">
          <Line label={t('relic.assembly')} value={result.assemblyScore} />
          <Line label={t('relic.resonance')} value={result.resonanceScore} />
          <Line label={t('relic.affixScore')} value={result.affixScore} />
          <Line label={t('relic.slotTotal')} value={result.total} strong />
        </dl>
        {material && material.applies && material.resonanceStats.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground" data-testid={`relic-resonance-stats-${groupId}`}>
            {material.resonanceStats.map(([stat, value]) => (
              <li key={stat} className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span>{statName(relics, stat)}</span>
                {/* The table value scaled by k1 and floored, which is what the panel prints. */}
                <span className="tabular-nums">
                  {t('relic.resonanceStat', {
                    value: formatStat(relics, stat, Math.floor(value * k1)),
                    mark: markForStat(relics, stat, value, season),
                  })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  )
}

function Line({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
      <dt className={strong ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>
        {value.toLocaleString()}
      </dd>
    </div>
  )
}

/**
 * A stored slot read against the dataset: the grade clamped to the ones a
 * player can hold, each affix re-resolved against its position's pool, and a
 * group or a second rare word repeated within a material dropped — those
 * cannot exist in game. Older single-list drafts put their affixes on the
 * position they were scored on.
 */
function restoreSlot(relics: Relics, groupId: number, stored: StoredRelicSlot | undefined, fresh: RelicSlotState): RelicSlotState {
  if (!stored) return fresh
  const grades = gradeOptions(relics)
  const grade = grades.includes(stored.grade)
    ? stored.grade
    : gradeRung(relics, stored.grade) && grades.length > 0
      ? Math.min(...grades.filter((g) => g >= stored.grade).concat(grades[grades.length - 1]))
      : fresh.grade
  const legacyType = relics.materials.items.find((entry) => entry.id === stored.materialId)?.type
  const materialType = groupId === SPEC_GROUP ? (stored.materialType ?? legacyType ?? 1) : undefined
  const lists: ChosenRelicAffix[][] = stored.materials
    ? stored.materials
    : Array.from({ length: MATERIAL_SLOTS }, (_, at) =>
      at === (groupId === SPEC_GROUP ? specIndex({ materialType }) : 0) ? stored.affixes ?? [] : [])
  const materials = Array.from({ length: MATERIAL_SLOTS }, (_, at) => {
    const pool = typePool(relics, materialTypeAt(groupId, at))
    const kept: ChosenRelicAffix[] = []
    for (const affix of lists[at] ?? []) {
      const source = pool.find((entry) => entry.id === affix.affixId)
        ?? pool.find((entry) => entry.stat === affix.stat && entry.value === affix.value && entry.mark === affix.mark)
      if (!source) continue
      const taken = usedGroups(pool, kept)
      if (taken.groups.has(source.groupId) || (taken.rare && isRareAffix(source))) continue
      kept.push(affixFrom(source))
    }
    return kept.slice(0, maxAffixes(relics))
  })
  return {
    groupId,
    artifactId: artifactsInGroup(relics, groupId).some((a) => a.id === stored.artifactId) ? stored.artifactId : fresh.artifactId,
    grade,
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
  const positionLabel = usePositionLabel(relics)
  const season = useMemo(() => currentSeason(relics), [relics])
  const [draft, setDraft] = useMemory(relicDraft)
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
  const setSlots = (update: (prev: RelicSlotState[]) => RelicSlotState[]) =>
    setDraft((prev) => ({ ...prev, slots: update(slots) }))

  /** Every other position holding the same material type, across all three slots. */
  const swapTargets = (from: Position) =>
    GROUP_IDS.flatMap((groupId) =>
      Array.from({ length: MATERIAL_SLOTS }, (_, index) => ({ groupId, index })),
    )
      .filter((to) => !(to.groupId === from.groupId && to.index === from.index))
      .filter((to) => materialTypeAt(to.groupId, to.index) === materialTypeAt(from.groupId, from.index))
      .map((position) => ({
        position,
        label: t('relic.swapOption', {
          group: relics.groupNames[String(position.groupId)] ?? '',
          slot: positionLabel(position.groupId, position.index),
        }),
      }))

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

  const k2 = k2For(relics, knowledgeLevel, season)
  const k1 = k1For(relics, knowledgeLevel, season)
  const results = useMemo(
    () => slots.map((slot) => evaluateRelicSlot(relics, slot, knowledgeLevel, season, server)),
    [relics, slots, knowledgeLevel, season, server],
  )
  const totals = useMemo(
    () =>
      results.reduce(
        (sum, r) => ({
          assembly: sum.assembly + r.assemblyScore,
          resonance: sum.resonance + r.resonanceScore,
          affix: sum.affix + r.affixScore,
          total: sum.total + r.total,
        }),
        { assembly: 0, resonance: 0, affix: 0, total: 0 },
      ),
    [results],
  )
  useEffect(() => {
    onTotals?.(totals)
  }, [onTotals, totals])

  return (
    <section className="space-y-3" data-testid="relic-section" aria-label={t('relic.title')}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          {/* A sub-heading: the page draws the group's own heading and rows above this. */}
          <h3 className="text-base font-semibold text-foreground">{t('relic.title')}</h3>
          <p className="mt-0.5 max-w-3xl text-xs leading-5 text-muted-foreground">{t('relic.hint')}</p>
        </div>
        <RelicServerToggle testId="relic-server" />
      </div>

      <KnowledgeBar relics={relics} level={knowledgeLevel} k1={k1} k2={k2} season={season} onChange={setKnowledgeLevel} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {slots.map((slot, index) => (
          <RelicCard key={slot.groupId} relics={relics} slot={slot} result={results[index]} k1={k1} k2={k2}
            season={season} server={server} swapTargets={swapTargets} onSwap={swap}
            onChange={(next) => setSlots((prev) => prev.map((entry, at) => (at === index ? next : entry)))} />
        ))}
      </div>

      <div className="rounded-md border border-border bg-card p-3" data-testid="relic-totals">
        <div className="text-xs font-semibold text-muted-foreground">{t('relic.grandTotal')}</div>
        <div className={`${TYPE.total} text-3xl`}>{totals.total.toLocaleString()}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
          <span>{t('relic.subtotalAssembly', { value: totals.assembly.toLocaleString() })}</span>
          <span>{t('relic.subtotalResonance', { value: totals.resonance.toLocaleString() })}</span>
          <span>{t('relic.subtotalAffix', { value: totals.affix.toLocaleString() })}</span>
        </div>
      </div>
    </section>
  )
}
