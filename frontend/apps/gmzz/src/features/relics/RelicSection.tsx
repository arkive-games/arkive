import { useMemo, useState } from 'react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import RangeField from '@/components/RangeField'
import PickerModal, { IconTile, type PickerOption } from '@/features/equipment/PickerModal'
import { iconUrl } from '@/lib/urls'
import {
  artifactsInGroup, currentSeason, displayedValue, effectiveAffixCap, evaluateRelicSlot,
  gradeOptions, gradeRung, k2For, knowledgeLadder, markForStat, materialsForGroup, maxAffixes,
  newRelicSlot, poolFor, poolRungs, poolStats,
  type Artifact, type ChosenRelicAffix, type Material, type PoolAffix, type Relics, type RelicSlotState,
} from '@/features/relics/data'

/**
 * The panel's three slots. 1 攻击 and 2 防御 are fixed — an artifact's `groupId`
 * *is* the slot it goes in, so there is nothing to choose there. 3 特化 is the
 * only slot that takes either material type, so it is the only one that asks.
 */
const GROUP_IDS = [1, 2, 3]
const SPEC_GROUP = 3
/** The material types 特化 accepts: 1 fills from 攻击, 2 from 防御. */
const SPEC_TYPES = [1, 2]

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const SELECT_CLASS = `h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none ${FOCUS}`
const BUTTON_CLASS = `inline-flex items-center justify-center rounded-md border border-border text-xs font-medium text-muted-foreground transition-colors hover:border-[color:var(--arkive-nav-accent)] hover:text-foreground disabled:opacity-50 ${FOCUS}`
const CELL_CLASS = `flex w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background p-2 text-left transition-colors hover:border-[color:var(--arkive-nav-accent)] ${FOCUS}`
const NUMBER_CLASS = 'h-9 border-border bg-background text-sm tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]'
const LABEL_CLASS = 'mb-0.5 block text-xs font-semibold text-muted-foreground'
const SECTION_CLASS = 'border-t border-border/70 p-2.5'
const PROSE_CLASS = 'mt-0.5 whitespace-pre-line text-xs leading-5 text-muted-foreground'

/** `Artifact.tag` is a usage bucket: 1 副本, 2 竞技, 3 通用. */
const TAG_KEY: Record<number, string> = { 1: 'relic.tagDungeon', 2: 'relic.tagArena', 3: 'relic.tagGeneral' }

function affixFrom(rung: PoolAffix): ChosenRelicAffix {
  return { stat: rung.stat, value: rung.value, mark: rung.mark, affixId: rung.id }
}

/** `''` is the empty selection — a slot with no material yet has no option to show. */
function ChoiceSelect({ value, options, label, testId, onChange }: {
  value: string | number; options: { value: string | number; label: string }[]
  label: string; testId: string; onChange: (raw: string) => void
}) {
  return (
    <select value={value} className={SELECT_CLASS} aria-label={label} data-testid={testId}
      onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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

function AffixRow({ affix, index, pool, k2, testPrefix, onChange, onRemove }: {
  affix: ChosenRelicAffix; index: number; pool: PoolAffix[]; k2: number; testPrefix: string
  onChange: (next: ChosenRelicAffix) => void; onRemove: () => void
}) {
  const { t } = useTranslation()
  const rungs = poolRungs(pool, affix.stat)

  return (
    <div className="grid min-w-0 grid-cols-[minmax(4.5rem,1fr)_minmax(5.5rem,1.3fr)_auto] items-center gap-1">
      <ChoiceSelect value={affix.stat} label={t('relic.affixStat')} testId={`${testPrefix}-stat-${index}`}
        options={poolStats(pool).map((stat) => ({ value: stat, label: stat }))}
        onChange={(raw) => {
          const next = poolRungs(pool, raw)[0]
          if (next) onChange(affixFrom(next))
        }} />
      {/* Keyed by the pool row's own id: two rungs of one stat can share a value,
          so the value alone is not a unique handle. */}
      <ChoiceSelect value={affix.affixId ?? ''} label={t('relic.affixRung')} testId={`${testPrefix}-rung-${index}`}
        options={rungs.map((rung) => ({
          value: rung.id,
          label: t('relic.rungOption', { value: displayedValue(rung.value, k2), mark: rung.mark }),
        }))}
        onChange={(raw) => {
          const next = rungs.find((rung) => rung.id === Number(raw))
          if (next) onChange(affixFrom(next))
        }} />
      <button type="button" onClick={onRemove} className={`${BUTTON_CLASS} size-7`}
        aria-label={t('relic.removeAffix')} data-testid={`${testPrefix}-remove-${index}`}>
        ×
      </button>
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
        <span className="text-sm font-semibold tabular-nums text-foreground" data-testid={`relic-grade-value-${groupId}`}>
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
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground" data-testid="relic-k2">
          {t('relic.k2Resolved', { k2 })}
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('relic.knowledgeHint')}</p>
    </div>
  )
}

function RelicCard({ relics, slot, result, k2, season, onChange }: {
  relics: Relics; slot: RelicSlotState; result: ReturnType<typeof evaluateRelicSlot>
  k2: number; season: number | undefined; onChange: (next: RelicSlotState) => void
}) {
  const { t } = useTranslation()
  const groupId = slot.groupId
  const materials = materialsForGroup(relics, groupId)
  const material: Material | null = materials.find((entry) => entry.id === slot.materialId) ?? null
  // Cards 1 and 2 accept one type only, so their type follows the group and the
  // choice is not rendered; the derived value still filters the list.
  const specType = material?.type ?? SPEC_TYPES[0]
  const offered = groupId === SPEC_GROUP ? materials.filter((entry) => entry.type === specType) : materials
  const pool = poolFor(relics, material?.poolSet ?? null)
  const cap = effectiveAffixCap(relics, slot.grade)
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
    if (type === specType) return
    onChange({ ...slot, materialId: materials.find((entry) => entry.type === type)?.id ?? null, affixes: [] })
  }

  return (
    <article className="flex min-w-0 flex-col rounded-md border border-border bg-card"
      data-testid={`relic-card-${groupId}`} aria-label={title}>
      <header className="flex min-w-0 items-start justify-between gap-2 border-b border-border p-2.5">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{t('relic.affixCap', { cap })}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs font-semibold text-muted-foreground">{t('relic.slotTotal')}</div>
          <div className="text-2xl font-bold tabular-nums text-foreground" data-testid={`relic-total-${groupId}`}>
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
              {SPEC_TYPES.map((type) => (
                <button key={type} type="button" aria-pressed={type === specType} onClick={() => chooseType(type)}
                  data-testid={`relic-material-type-${type}`}
                  className={`${BUTTON_CLASS} min-h-8 flex-1 px-2.5 py-1 ${
                    type === specType
                      ? 'border-[color:var(--arkive-nav-accent)] bg-[color:var(--arkive-filter-active)] text-foreground'
                      : ''
                  }`}>
                  {relics.groupNames[String(type)] ?? String(type)}
                </button>
              ))}
            </div>
            <p className={PROSE_CLASS}>{t('relic.materialTypeExclusive')}</p>
          </div>
        ) : null}

        <div>
          <span className={LABEL_CLASS}>{t('relic.material')}</span>
          {/* Changing the material changes the pool, so the affixes cannot survive it. */}
          <ChoiceSelect value={material?.id ?? ''} label={t('relic.material')} testId={`relic-material-${groupId}`}
            options={offered.map((entry) => ({ value: entry.id, label: entry.name }))}
            onChange={(raw) => onChange({ ...slot, materialId: Number(raw), affixes: [] })} />
          {material ? <p className={PROSE_CLASS}>{material.description}</p> : null}
        </div>

        <span className={LABEL_CLASS}>{t('relic.affixes')}</span>
        {slot.affixes.map((affix, index) => (
          <AffixRow key={index} affix={affix} index={index} pool={pool} k2={k2} testPrefix={testPrefix}
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
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground" data-testid={`relic-resonance-${groupId}`}>
            {result.resonanceStats.map(([stat, value]) => (
              <li key={stat} className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span>{stat}</span>
                <span className="tabular-nums">
                  {t('relic.resonanceStat', { value, mark: markForStat(relics, stat, value, season) })}
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

export default function RelicSection({ relics }: { relics: Relics }) {
  const { t } = useTranslation()
  const season = useMemo(() => currentSeason(relics), [relics])
  const [knowledgeLevel, setKnowledgeLevel] = useState(
    () => knowledgeLadder(relics, season).find((rung) => rung.level != null)?.level ?? 0,
  )
  const [slots, setSlots] = useState<RelicSlotState[]>(() =>
    GROUP_IDS.map((groupId) => ({
      ...newRelicSlot(groupId, relics.promotion.worstGrade),
      // Pre-picked so a card shows real effects on first paint. The scorer
      // ignores `artifactId`, so this changes no number.
      artifactId: artifactsInGroup(relics, groupId)[0]?.id ?? null,
      materialId: materialsForGroup(relics, groupId)[0]?.id ?? null,
    })),
  )

  const k2 = k2For(relics, knowledgeLevel, season)
  const results = useMemo(
    () => slots.map((slot) => evaluateRelicSlot(relics, slot, knowledgeLevel, season)),
    [relics, slots, knowledgeLevel, season],
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

  return (
    <section className="space-y-3" data-testid="relic-section" aria-label={t('relic.title')}>
      <div className="border-b border-border pb-3">
        <h2 className="text-xl font-bold text-foreground">{t('relic.title')}</h2>
        <p className="mt-0.5 max-w-3xl text-xs leading-5 text-muted-foreground">{t('relic.hint')}</p>
      </div>

      <KnowledgeBar relics={relics} level={knowledgeLevel} k2={k2} season={season} onChange={setKnowledgeLevel} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {slots.map((slot, index) => (
          <RelicCard key={slot.groupId} relics={relics} slot={slot} result={results[index]} k2={k2} season={season}
            onChange={(next) => setSlots((prev) => prev.map((entry, at) => (at === index ? next : entry)))} />
        ))}
      </div>

      <div className="rounded-md border border-border bg-card p-3" data-testid="relic-totals">
        <div className="text-xs font-semibold text-muted-foreground">{t('relic.grandTotal')}</div>
        <div className="text-3xl font-bold tabular-nums text-foreground">{totals.total.toLocaleString()}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
          <span>{t('relic.subtotalAssembly', { value: totals.assembly.toLocaleString() })}</span>
          <span>{t('relic.subtotalResonance', { value: totals.resonance.toLocaleString() })}</span>
          <span>{t('relic.subtotalAffix', { value: totals.affix.toLocaleString() })}</span>
        </div>
      </div>
    </section>
  )
}
