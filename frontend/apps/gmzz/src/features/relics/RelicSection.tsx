import { useEffect, useMemo, useState } from 'react'
import { useMemory } from '@gamemap/state-memory'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import RangeField from '@/components/RangeField'
import PickerModal, { IconTile, type PickerOption } from '@/features/equipment/PickerModal'
import { gmzzMemory, isFiniteNumber, isNullableNumber, isRecord } from '@/lib/memory'
import { TYPE } from '@/lib/typography'
import { iconUrl } from '@/lib/urls'
import {
  affixValue, artifactsInGroup, currentSeason, effectiveAffixCap, effectiveGrade, evaluateRelicSlot, formatStat,
  gradeOptions, gradeRung, isRareAffix, k1For, k2For, knowledgeLadder, markForStat, maxAffixes,
  newRelicSlot, poolRungs, poolStats, rareAffixes, rareEffect, slotMaterialType, statName, typePool,
  type Artifact, type ChosenRelicAffix, type PoolAffix, type Relics, type RelicServer, type RelicSlotState,
} from '@/features/relics/data'

/**
 * A slot as stored. Drafts written before the material picker was dropped
 * carry the material item's id instead of its type; it is read once, to
 * recover the type of a 特化 slot, and never written again.
 */
type StoredRelicSlot = RelicSlotState & { materialId?: number | null }

/**
 * The three slots as stored. `knowledgeLevel` is null until the player moves
 * it, so the dataset's first level applies; `server` is where the resonance is
 * scored (see `effectiveGrade`), and is absent in drafts written before it
 * existed, which read as the local server.
 */
type RelicDraft = { knowledgeLevel: number | null; slots: StoredRelicSlot[]; server?: RelicServer }

function isRelicAffix(value: unknown): value is ChosenRelicAffix {
  return (
    isRecord(value) &&
    typeof value.stat === 'string' &&
    isFiniteNumber(value.value) &&
    isFiniteNumber(value.mark) &&
    (value.affixId === undefined || isFiniteNumber(value.affixId)) &&
    (value.scaled === undefined || typeof value.scaled === 'boolean')
  )
}

function isRelicSlotState(value: unknown): value is StoredRelicSlot {
  return (
    isRecord(value) &&
    isFiniteNumber(value.groupId) &&
    isNullableNumber(value.artifactId) &&
    isFiniteNumber(value.grade) &&
    (value.materialType === undefined || isFiniteNumber(value.materialType)) &&
    (value.materialId === undefined || isNullableNumber(value.materialId)) &&
    Array.isArray(value.affixes) &&
    value.affixes.every(isRelicAffix)
  )
}

function isRelicDraft(value: unknown): value is RelicDraft {
  return (
    isRecord(value) &&
    isNullableNumber(value.knowledgeLevel) &&
    Array.isArray(value.slots) &&
    value.slots.every(isRelicSlotState) &&
    (value.server === undefined || value.server === 'local' || value.server === 'cross')
  )
}

const SERVERS: RelicServer[] = ['local', 'cross']

/** The three 封印物 items as the page's rating grades them. */
export type RelicTotals = { assembly: number; resonance: number; affix: number; total: number }

/** The relic inputs survive a reload; a calculator's configuration is a draft, so it takes that class's thirty-day life. */
const relicDraft = gmzzMemory.draft('score/relics', {
  default: (): RelicDraft => ({ knowledgeLevel: null, slots: [] }),
  validate: isRelicDraft,
})

/**
 * The panel's three slots. 1 攻击 and 2 防御 are fixed — an artifact's `groupId`
 * *is* the slot it goes in, and so is the material type it takes. 3 特化 is the
 * only slot that takes either, so it is the only one that asks.
 */
const GROUP_IDS = [1, 2, 3]
const SPEC_GROUP = 3
/** The two material types: 1 攻击, 2 防御. There are no others to choose between. */
const MATERIAL_TYPES = [1, 2]

/** An affix's option value: an ordinary stat by key, a rare word by its pool id. */
const STAT_PREFIX = 'stat:'
const RARE_PREFIX = 'rare:'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const SELECT_CLASS = `h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none ${FOCUS}`
const BUTTON_CLASS = `inline-flex items-center justify-center rounded-md border border-border text-xs font-medium text-muted-foreground transition-colors hover:border-[color:var(--arkive-nav-accent)] hover:text-foreground disabled:opacity-50 ${FOCUS}`
const CELL_CLASS = `flex w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background p-2 text-left transition-colors hover:border-[color:var(--arkive-nav-accent)] ${FOCUS}`
const NUMBER_CLASS = 'h-9 border-border bg-background text-sm tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]'
const LABEL_CLASS = `mb-0.5 block ${TYPE.label}`
const SECTION_CLASS = 'border-t border-border/70 p-2.5'
const PROSE_CLASS = `mt-0.5 whitespace-pre-line ${TYPE.body}`

/** `Artifact.tag` is a usage bucket: 1 副本, 2 竞技, 3 通用. */
const TAG_KEY: Record<number, string> = { 1: 'relic.tagDungeon', 2: 'relic.tagArena', 3: 'relic.tagGeneral' }

function affixFrom(rung: PoolAffix): ChosenRelicAffix {
  return { stat: rung.stat, value: rung.value, mark: rung.mark, affixId: rung.id, scaled: rung.scaled }
}

type ChoiceOption = { value: string | number; label: string }

/** A native select; `groups` renders labelled option groups instead of a flat list. */
function ChoiceSelect({ value, options = [], groups, label, testId, onChange }: {
  value: string | number; options?: ChoiceOption[]; groups?: { label: string; options: ChoiceOption[] }[]
  label: string; testId: string; onChange: (raw: string) => void
}) {
  const render = (list: ChoiceOption[]) =>
    list.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)
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

function AffixRow({ relics, affix, index, pool, k2, testPrefix, onChange, onRemove }: {
  relics: Relics; affix: ChosenRelicAffix; index: number; pool: PoolAffix[]; k2: number; testPrefix: string
  onChange: (next: ChosenRelicAffix) => void; onRemove: () => void
}) {
  const { t } = useTranslation()
  const source = pool.find((entry) => entry.id === affix.affixId)
  const rare = source && isRareAffix(source) ? source : null
  const rungs = poolRungs(pool, affix.stat)
  const show = (entry: PoolAffix) => formatStat(relics, entry.stat, affixValue(entry, k2))

  return (
    <div className="min-w-0">
      {/* A rare word's name is longer and its value fixed, so its picker takes the wider column. */}
      <div className={`grid min-w-0 items-center gap-1 ${
        rare ? 'grid-cols-[minmax(7rem,1.6fr)_minmax(5rem,1fr)_auto]' : 'grid-cols-[minmax(5rem,1fr)_minmax(5.5rem,1.2fr)_auto]'
      }`}>
        {/* One list for both kinds: an ordinary stat picks its rung next, a rare
            word is a single fixed rung with an effect of its own. */}
        <ChoiceSelect value={rare ? `${RARE_PREFIX}${rare.id}` : `${STAT_PREFIX}${affix.stat}`}
          label={t('relic.affixStat')} testId={`${testPrefix}-stat-${index}`}
          groups={[
            {
              label: t('relic.affixOrdinary'),
              options: poolStats(pool).map((stat) => ({ value: `${STAT_PREFIX}${stat}`, label: statName(relics, stat) })),
            },
            {
              label: t('relic.affixRare'),
              options: rareAffixes(pool).map((entry) => ({
                value: `${RARE_PREFIX}${entry.id}`,
                label: t('relic.rareOption', { name: entry.name ?? '', stat: statName(relics, entry.stat) }),
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
      {rare ? (
        <p className="mt-0.5 text-xs leading-5 text-amber-700 dark:text-amber-300" data-testid={`${testPrefix}-effect-${index}`}>
          <span className="font-semibold">{t('relic.rareName', { name: rare.name ?? '' })}</span>
          {rareEffect(relics, rare, k2)}
        </p>
      ) : null}
    </div>
  )
}

function GradeSlider({ relics, grade, groupId, onChange }: {
  relics: Relics; grade: number; groupId: number; onChange: (grade: number) => void
}) {
  const { t } = useTranslation()
  const grades = gradeOptions(relics)
  // `gradeOptions` sorts ascending and a lower grade is better, so the best end
  // of the track is its left end.
  const best = grades[0] ?? grade
  const worst = grades[grades.length - 1] ?? grade
  const rung = gradeRung(relics, grade)
  const valueText = t('relic.gradeOption', { grade, mark: rung?.mark ?? 0 })

  return (
    <div>
      <span className={LABEL_CLASS}>{t('relic.grade')}</span>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`${TYPE.name} tabular-nums`} data-testid={`relic-grade-value-${groupId}`}>
          {valueText}
        </span>
        {grade === best ? (
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{t('relic.bestGrade')}</span>
        ) : null}
      </div>
      <RangeField label={t('relic.grade')} min={best} max={worst} value={grade} valueText={valueText}
        minLabel={t('relic.gradeEndBest', { grade: best })} maxLabel={t('relic.gradeEndWorst', { grade: worst })}
        testId={`relic-grade-${groupId}`} onChange={onChange} />
      {rung && rung.note !== '' ? <p className={PROSE_CLASS}>{rung.note}</p> : null}
    </div>
  )
}

function KnowledgeBar({ relics, level, k2, season, onChange }: {
  relics: Relics; level: number; k2: number; season: number | undefined; onChange: (level: number) => void
}) {
  const { t } = useTranslation()
  // `level` and `k2` are nullable in the table; a rung missing its level cannot
  // be selected at all, so it is dropped rather than offered as a blank.
  const rungs = useMemo(
    () => knowledgeLadder(relics, season).flatMap((r) => (r.level == null ? [] : [{ level: r.level, k2: r.k2 ?? 0 }])),
    [relics, season],
  )
  const first = rungs[0]
  const last = rungs[rungs.length - 1]
  const min = first?.level ?? 0
  const max = last?.level ?? 0
  const commit = (value: number) => onChange(Math.min(max, Math.max(min, Number.isFinite(value) ? value : min)))

  return (
    <div className="rounded-md border border-border bg-card p-3" data-testid="relic-knowledge-bar">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block w-24 shrink-0">
          <span className={LABEL_CLASS}>{t('relic.knowledge')}</span>
          <Input type="number" inputMode="numeric" min={min} max={max} value={level} className={NUMBER_CLASS}
            data-testid="relic-knowledge" onChange={(event) => commit(Math.trunc(Number(event.target.value)))} />
        </label>
        <div className="min-w-48 flex-1">
          <RangeField label={t('relic.knowledge')} min={min} max={max} value={level} onChange={commit}
            valueText={t('relic.knowledgeOption', { level, k2 })}
            minLabel={t('relic.knowledgeOption', { level: min, k2: first?.k2 ?? 0 })}
            maxLabel={t('relic.knowledgeOption', { level: max, k2: last?.k2 ?? 0 })}
            testId="relic-knowledge-range" />
        </div>
        <span className={`shrink-0 ${TYPE.name} tabular-nums`} data-testid="relic-k2">
          {t('relic.k2Resolved', { k2 })}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('relic.knowledgeHint')}</p>
    </div>
  )
}

function RelicCard({ relics, slot, result, k1, k2, season, onChange }: {
  relics: Relics; slot: RelicSlotState; result: ReturnType<typeof evaluateRelicSlot>
  k1: number; k2: number; season: number | undefined; onChange: (next: RelicSlotState) => void
}) {
  const { t } = useTranslation()
  const groupId = slot.groupId
  // Cards 1 and 2 accept one type only, so their type follows the group and the
  // choice is not rendered.
  const materialType = slotMaterialType(slot)
  const pool = useMemo(() => typePool(relics, materialType), [relics, materialType])
  // The cap follows the grade the server scores at, not the grade owned.
  const cap = effectiveAffixCap(relics, result.resonanceGrade)
  const max = maxAffixes(relics)
  const testPrefix = `relic-affix-${groupId}`
  const title = t('relic.groupTitle', { group: relics.groupNames[String(groupId)] ?? '' })

  const patch = (next: Partial<RelicSlotState>) => onChange({ ...slot, ...next })
  const writeAffixes = (affixes: ChosenRelicAffix[]) => patch({ affixes })

  const addAffix = () => {
    const stat = poolStats(pool)[0]
    const next = stat === undefined ? undefined : poolRungs(pool, stat)[0]
    if (next) writeAffixes([...slot.affixes, affixFrom(next)])
  }

  // The two material types are mutually exclusive: they draw from different
  // pools, so affixes chosen under one cannot survive the other.
  const chooseType = (type: number) => {
    if (type === materialType) return
    onChange({ ...slot, materialType: type, affixes: [] })
  }

  return (
    <article className="flex min-w-0 flex-col rounded-md border border-border bg-card"
      data-testid={`relic-card-${groupId}`} aria-label={title}>
      <header className="flex min-w-0 items-start justify-between gap-2 border-b border-border p-2.5">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">
            {t('relic.affixCap', { cap })}
            {result.resonanceGrade !== slot.grade ? ` · ${t('relic.scoredAsGrade', { grade: result.resonanceGrade })}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs font-semibold text-muted-foreground">{t('relic.slotTotal')}</div>
          <div className={TYPE.total} data-testid={`relic-total-${groupId}`}>
            {result.total.toLocaleString()}
          </div>
        </div>
      </header>

      <div className="space-y-2 p-2.5">
        <div>
          <span className={LABEL_CLASS}>{t('relic.artifact')}</span>
          <ArtifactCell relics={relics} groupId={groupId} artifact={result.artifact}
            onSelect={(artifactId) => patch({ artifactId })} />
          {/* Every line of the effect text, deliberately untruncated. */}
          <p className={PROSE_CLASS}>
            {result.artifact ? result.artifact.description : t('relic.artifactPlaceholder')}
          </p>
        </div>
        <GradeSlider relics={relics} grade={slot.grade} groupId={groupId} onChange={(grade) => patch({ grade })} />
      </div>

      <div className={`${SECTION_CLASS} space-y-1.5`}>
        {groupId === SPEC_GROUP ? (
          <div>
            <span className={LABEL_CLASS}>{t('relic.materialType')}</span>
            <div className="flex gap-1.5">
              {MATERIAL_TYPES.map((type) => (
                <button key={type} type="button" aria-pressed={type === materialType} onClick={() => chooseType(type)}
                  data-testid={`relic-material-type-${type}`}
                  className={`${BUTTON_CLASS} min-h-8 flex-1 px-2.5 py-1 ${
                    type === materialType
                      ? 'border-[color:var(--arkive-nav-accent)] bg-[color:var(--arkive-filter-active)] text-foreground'
                      : ''
                  }`}>
                  {t('relic.materialTypeOption', { group: relics.groupNames[String(type)] ?? String(type) })}
                </button>
              ))}
            </div>
            <p className={PROSE_CLASS}>{t('relic.materialTypeExclusive')}</p>
          </div>
        ) : null}

        <span className={LABEL_CLASS}>
          {t('relic.affixesOf', { group: relics.groupNames[String(materialType)] ?? '' })}
        </span>
        {slot.affixes.map((affix, index) => (
          <AffixRow key={index} relics={relics} affix={affix} index={index} pool={pool} k2={k2} testPrefix={testPrefix}
            onChange={(next) => writeAffixes(slot.affixes.map((entry, at) => (at === index ? next : entry)))}
            onRemove={() => writeAffixes(slot.affixes.filter((_, at) => at !== index))} />
        ))}
        <button type="button" onClick={addAffix} className={`${BUTTON_CLASS} min-h-8 px-2.5 py-1`}
          disabled={slot.affixes.length >= max || pool.length === 0}
          data-testid={`relic-affix-add-${groupId}`}>
          {/* `used` rather than `count`, which i18next reads as a plural selector. */}
          {t('relic.addAffix', { used: slot.affixes.length, max })}
        </button>
        {result.cappedOut > 0 ? (
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300" data-testid={`relic-capped-${groupId}`}>
            {t('relic.cappedOut', { over: result.cappedOut, cap })}
          </p>
        ) : null}
      </div>

      <div className={`${SECTION_CLASS} mt-auto`} data-testid={`relic-breakdown-${groupId}`}>
        <dl className="space-y-0.5 text-xs">
          <Line label={t('relic.assembly')} value={result.assemblyScore} />
          <Line label={t('relic.resonance')} value={result.resonanceScore} />
          <Line label={t('relic.affixScore')} value={result.affixScore} />
          <Line label={t('relic.slotTotal')} value={result.total} strong />
        </dl>
        {result.resonanceStats.length > 0 ? (
          <div className="mt-1.5" data-testid={`relic-resonance-${groupId}`}>
            {/* The bonus 非凡共鸣 grants for the words that take effect: it grows
                with every word, up to the grade's cap. */}
            <div className="text-xs font-semibold text-foreground">
              {t('relic.resonanceBonus', { active: result.activeAffixes })}
            </div>
            <ul className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
              {result.resonanceStats.map(([stat, value]) => (
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
          </div>
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

export default function RelicSection({ relics, onTotals }: {
  relics: Relics
  /** Reports the three subtotals whenever they change, for the page's rating rows. */
  onTotals?: (totals: RelicTotals) => void
}) {
  const { t } = useTranslation()
  const season = useMemo(() => currentSeason(relics), [relics])
  const [draft, setDraft] = useMemory(relicDraft)
  const server: RelicServer = draft.server ?? 'local'
  const setServer = (next: RelicServer) => setDraft((prev) => ({ ...prev, server: next }))
  const knowledgeLevel = useMemo(() => {
    const ladder = knowledgeLadder(relics, season)
    const known = ladder.some((rung) => rung.level === draft.knowledgeLevel)
    return known ? (draft.knowledgeLevel as number) : ladder.find((rung) => rung.level != null)?.level ?? 0
  }, [draft.knowledgeLevel, relics, season])
  const setKnowledgeLevel = (level: number) => setDraft((prev) => ({ ...prev, knowledgeLevel: level }))
  // One slot per group: the stored one when there is one, checked against the
  // dataset — a grade it no longer knows falls back to the start, an affix its
  // type's pool no longer has is dropped — otherwise a fresh slot. Pre-picked so
  // a card shows real effects on first paint. The scorer ignores `artifactId`,
  // so this changes no number.
  const slots = useMemo<RelicSlotState[]>(
    () =>
      GROUP_IDS.map((groupId) => {
        const fresh: RelicSlotState = {
          ...newRelicSlot(groupId, relics.promotion.worstGrade),
          artifactId: artifactsInGroup(relics, groupId)[0]?.id ?? null,
        }
        const stored = draft.slots.find((slot) => slot.groupId === groupId)
        if (!stored) return fresh
        // An older draft names a material item; its type is all that is kept.
        const legacyType = relics.materials.items.find((entry) => entry.id === stored.materialId)?.type ?? undefined
        const materialType = slotMaterialType({ groupId, materialType: stored.materialType ?? legacyType })
        const pool = typePool(relics, materialType)
        const affixes = stored.affixes.flatMap((affix) => {
          const source = pool.find((entry) => entry.id === affix.affixId)
            ?? pool.find((entry) => entry.stat === affix.stat && entry.value === affix.value && entry.mark === affix.mark)
          return source ? [affixFrom(source)] : []
        })
        return {
          groupId,
          artifactId: artifactsInGroup(relics, groupId).some((a) => a.id === stored.artifactId) ? stored.artifactId : fresh.artifactId,
          grade: gradeRung(relics, stored.grade) ? stored.grade : fresh.grade,
          materialType,
          affixes: affixes.slice(0, maxAffixes(relics)),
        }
      }),
    [draft.slots, relics],
  )
  const setSlots = (update: (prev: RelicSlotState[]) => RelicSlotState[]) =>
    setDraft((prev) => ({ ...prev, slots: update(slots) }))

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
        <div className="shrink-0">
          <span className={LABEL_CLASS}>{t('relic.server')}</span>
          <div className="inline-flex overflow-hidden rounded-md border border-border" role="group" aria-label={t('relic.server')}>
            {SERVERS.map((entry, index) => (
              <button
                key={entry}
                type="button"
                aria-pressed={entry === server}
                onClick={() => setServer(entry)}
                className={`inline-flex min-h-9 items-center px-3 ${TYPE.control} font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)] ${index > 0 ? 'border-l border-border' : ''} ${
                  entry === server
                    ? 'bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
                data-testid={`relic-server-${entry}`}
              >
                {t(entry === 'local' ? 'relic.serverLocal' : 'relic.serverCross', {
                  grade: effectiveGrade(relics, relics.promotion.bestGrade, entry),
                })}
              </button>
            ))}
          </div>
          <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">{t('relic.serverHint')}</p>
        </div>
      </div>

      <KnowledgeBar relics={relics} level={knowledgeLevel} k2={k2} season={season} onChange={setKnowledgeLevel} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {slots.map((slot, index) => (
          <RelicCard key={slot.groupId} relics={relics} slot={slot} result={results[index]} k1={k1} k2={k2} season={season}
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
