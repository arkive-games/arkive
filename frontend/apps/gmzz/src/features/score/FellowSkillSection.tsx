import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import PickerModal, { IconTile, type PickerOption } from '@/features/equipment/PickerModal'
import { fellowPortraitUrl, fellowSkillIconUrl, type Fellow, type FellowRelation } from '@/features/fellows/data'
import { clampSkillLevel, type BondsDraft } from '@/features/score/bonds'
import { FormulaHint } from '@/features/score/FormulaHint'
import { SkillLevelField } from '@/features/score/SkillLevelField'
import {
  carriedFellowSkill,
  fellowOptions,
  GOLD_FELLOW,
  MAX_FELLOW_STAR,
  relationTierName,
  starMap,
  type FellowSkillResult,
} from '@/features/score/fellowSkill'
import { TYPE } from '@/lib/typography'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const LABEL_CLASS = `mb-0.5 block ${TYPE.label}`
/** What a relation adds on top of the base, in the green the equipment split uses. */
const GAIN_CLASS = 'text-emerald-700 dark:text-emerald-300'

/**
 * The 人脉技能 calculator: every connection with a star picker, the relation
 * tiers that follow from those stars, and the one skill carried.
 *
 * A relation's tier is never typed — it is the lowest star among its members
 * plus one, so the stars alone settle it. The only choice left is which
 * relation the carried skill is scored with when it belongs to several that
 * boost it; quality-0 relations boost nothing and are not offered.
 */
export default function FellowSkillCalculator({
  fellows,
  relations,
  skillCap,
  relicSkillBonus,
  draft,
  setDraft,
}: {
  fellows: Fellow[]
  relations: FellowRelation[]
  skillCap: number | null
  relicSkillBonus: number
  draft: BondsDraft
  setDraft: (update: (prev: BondsDraft) => BondsDraft) => void
}) {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(false)
  const entries = useMemo(() => draft.fellows ?? [], [draft.fellows])
  const stars = useMemo(() => starMap(entries), [entries])
  const skillLevel = clampSkillLevel(draft.puppetSkillLevel)
  const carried = carriedFellowSkill(entries, fellows, relations, draft.fellowSkillId, draft.fellowRelationId, skillLevel)
  const autoCarry = draft.fellowSkillId == null || !stars.has(draft.fellowSkillId)
  const ordered = useMemo(() => [...fellows].sort((a, b) => b.quality - a.quality || a.order - b.order || a.id - b.id), [fellows])
  // One row per quality, gold first, so the two tiers of connection read apart.
  const groups = useMemo(
    () =>
      [...new Set(ordered.map((fellow) => fellow.quality))].map((quality) => ({
        quality,
        fellows: ordered.filter((fellow) => fellow.quality === quality),
      })),
    [ordered],
  )
  const options = new Map(fellows.map((fellow) => [fellow.id, fellowOptions(fellow, relations, stars, skillLevel)]))
  // The relations the carried skill can be scored with; a relation-less option is not one.
  const carriedOptions = carried ? (options.get(carried.fellow.id) ?? []).filter((option) => option.relation !== null) : []

  const setStar = (fellowId: number, star: number | null) =>
    setDraft((prev) => {
      const rest = (prev.fellows ?? []).filter((entry) => entry.fellowId !== fellowId)
      if (star === null) {
        return { ...prev, fellows: rest, fellowSkillId: prev.fellowSkillId === fellowId ? null : prev.fellowSkillId }
      }
      return { ...prev, fellows: [...rest, { fellowId, star }] }
    })
  const carry = (fellowId: number | null) => setDraft((prev) => ({ ...prev, fellowSkillId: fellowId, fellowRelationId: null }))

  /** Every connection in a quality row set to one star, or all marked not owned. */
  const setAll = (list: Fellow[], star: number | null) =>
    setDraft((prev) => {
      const ids = new Set(list.map((fellow) => fellow.id))
      const rest = (prev.fellows ?? []).filter((entry) => !ids.has(entry.fellowId))
      if (star === null) {
        return { ...prev, fellows: rest, fellowSkillId: prev.fellowSkillId != null && ids.has(prev.fellowSkillId) ? null : prev.fellowSkillId }
      }
      return { ...prev, fellows: [...rest, ...list.map((fellow) => ({ fellowId: fellow.id, star }))] }
    })
  const tile = (fellow: Fellow, className = 'size-12') => (
    <IconTile quality={fellow.quality} src={fellow.portrait ? fellowPortraitUrl(fellow.portrait) : undefined} alt={fellow.name} label={fellow.name.slice(0, 1)} className={className} />
  )
  const tierLabel = (relation: FellowRelation | null, tier: number) => {
    const name = relation ? relationTierName(relation, tier) : ''
    return name ? t('bonds.relationTierNamed', { tier, name }) : t('bonds.relationTier', { tier })
  }
  const describe = (result: FellowSkillResult) =>
    result.relation
      ? t('bonds.fellowWithRelation', { star: result.star, relation: result.relation.name, tier: result.tier, score: result.score.toLocaleString() })
      : t('bonds.fellowNoRelation', { star: result.star, score: result.score.toLocaleString() })

  const carryOptions: PickerOption[] = ordered
    .map((fellow) => options.get(fellow.id)?.[0])
    .filter((result): result is FellowSkillResult => result !== undefined)
    .sort((a, b) => b.score - a.score || b.fellow.quality - a.fellow.quality)
    .map((result) => ({
      id: result.fellow.id,
      name: `${result.fellow.shortName || result.fellow.name} · ${result.fellow.skill.name}`,
      detail: describe(result) + (result.estimated ? '*' : ''),
      quality: result.fellow.quality,
      iconUrl: result.fellow.skill.icon ? fellowSkillIconUrl(result.fellow.skill.icon) : undefined,
      keywords: `${result.fellow.name} ${result.fellow.skill.name}`,
    }))

  return (
    <div className="space-y-3" data-testid="bonds-fellows">
      <SkillLevelField value={skillLevel} cap={skillCap} relicBonus={relicSkillBonus} testId="bonds-fellow-skill-level"
        onChange={(level) => setDraft((prev) => ({ ...prev, puppetSkillLevel: level }))} />
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 rounded-md border border-border p-2">
        <div className="min-w-0">
          <span className={LABEL_CLASS}>{t('bonds.fellowCarried')}</span>
          <button
            type="button"
            disabled={carryOptions.length === 0}
            onClick={() => setPicking(true)}
            title={carried && autoCarry ? t('bonds.skillPuppetBest') : undefined}
            // A fixed width, so switching the carried skill never moves what sits beside it.
            className={`flex h-12 w-72 items-center gap-2 rounded border border-border pr-3 text-left transition hover:border-[color:var(--arkive-nav-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
            data-testid="bonds-fellow-carry"
          >
            {carried ? tile(carried.fellow) : <span className="size-12 shrink-0" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {carried ? carried.fellow.skill.name || carried.fellow.name : t('bonds.fellowNone')}
              </span>
              {carried ? (
                <span className="block truncate text-xs tabular-nums text-foreground" data-testid="bonds-fellow-carry-score">
                  {t('bonds.fellowStar', { star: carried.star })} · {carried.score.toLocaleString()}{carried.estimated ? '*' : ''}
                  <span className="ml-1 text-muted-foreground">
                    ({carried.base.toLocaleString()}
                    <span className={GAIN_CLASS}>{t('equip.pieceAdded', { added: (carried.score - carried.base).toLocaleString() })}</span>)
                  </span>
                </span>
              ) : null}
            </span>
          </button>
        </div>

        {carried ? (
          <div className="min-w-0" data-testid="bonds-fellow-relations">
            <span className={LABEL_CLASS}>{t('bonds.fellowRelation')}</span>
            {carriedOptions.length === 0 ? (
              <p className="flex h-12 items-center text-sm text-muted-foreground" data-testid="bonds-fellow-relation-none">
                {t('bonds.fellowRelationNone')}
              </p>
            ) : (
            <div className="flex flex-wrap gap-2">
              {carriedOptions.map((option) => {
                const active = option.relation?.id === carried?.relation?.id
                return (
                  <button
                    key={option.relation?.id ?? 0}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDraft((prev) => ({ ...prev, fellowSkillId: option.fellow.id, fellowRelationId: option.relation?.id ?? null }))}
                    className={`h-12 w-40 rounded-md border px-2 py-1 text-left text-xs transition ${FOCUS} ${active ? 'border-[color:var(--arkive-nav-accent)] text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
                    data-testid={`bonds-fellow-relation-${option.relation?.id ?? 0}`}
                  >
                    <span className="block truncate font-semibold">{option.relation?.name}</span>
                    <span className="flex justify-between gap-2 tabular-nums">
                      <span className="truncate">{tierLabel(option.relation, option.tier)}</span>
                      <span className={GAIN_CLASS}>+{(option.score - option.base).toLocaleString()}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            )}
          </div>
        ) : null}

      </div>

      <p className={TYPE.body}>{t('bonds.fellowGridHint')}</p>

      {groups.map((group) => (
        <div key={group.quality} data-testid={`bonds-fellow-row-${group.quality}`}>
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={TYPE.label}>{t(group.quality === GOLD_FELLOW ? 'bonds.fellowGold' : 'bonds.fellowPurple')}</span>
            <StarPresets testId={`bonds-fellow-set-${group.quality}`} label={t('bonds.fellowSetRow')} onPick={(star) => setAll(group.fellows, star)} />
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2">
            {group.fellows.map((fellow) => {
              const star = stars.get(fellow.id)
              const isCarried = carried?.fellow.id === fellow.id
              return (
                <li key={fellow.id} className="flex min-w-0 flex-col items-center gap-1" data-testid={`bonds-fellow-${fellow.id}`}>
                  <button
                    type="button"
                    disabled={star === undefined}
                    aria-pressed={isCarried}
                    title={fellow.skill.name}
                    aria-label={t('bonds.fellowCarryToggle', { name: fellow.name })}
                    onClick={() => carry(fellow.id)}
                    className={`relative rounded-md p-0.5 transition ${FOCUS} ${isCarried ? 'ring-2 ring-[color:var(--arkive-nav-accent)]' : ''} ${star === undefined ? 'opacity-40 grayscale' : ''} disabled:cursor-not-allowed`}
                  >
                    {tile(fellow, 'size-16')}
                    {isCarried ? (
                      <span className="absolute -bottom-1 -left-1 rounded bg-secondary px-1 text-xs font-semibold text-secondary-foreground">
                        {t('bonds.skillCarried')}
                      </span>
                    ) : null}
                  </button>
                  <span className="w-full truncate text-center text-xs text-muted-foreground">{fellow.shortName || fellow.name}</span>
                  <StarPicker star={star} name={fellow.name} testId={`bonds-fellow-star-${fellow.id}`} onChange={(next) => setStar(fellow.id, next)} />
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {t('bonds.formulaLabel')}
        <FormulaHint testId="bonds-fellow-formula">{t('bonds.fellowFormula')}</FormulaHint>
      </div>

      <PickerModal
        open={picking}
        onOpenChange={setPicking}
        title={t('bonds.fellowPickTitle')}
        options={carryOptions}
        selectedId={autoCarry ? null : (draft.fellowSkillId ?? null)}
        onSelect={(id) => carry(id)}
        testIdPrefix="bonds-pick-fellow"
        footer={
          <button
            type="button"
            aria-pressed={autoCarry}
            onClick={() => {
              carry(null)
              setPicking(false)
            }}
            className={`h-9 w-full rounded-md border text-sm transition ${FOCUS} ${autoCarry ? 'border-[color:var(--arkive-nav-accent)] text-foreground' : 'border-border text-muted-foreground'}`}
            data-testid="bonds-fellow-best"
          >
            {t('bonds.skillPuppetBest')}
          </button>
        }
      />
    </div>
  )
}


/**
 * A connection's stars, set with one click. Clicking the lit top star steps it
 * down one; the first star cycles 1★ → 0★ → not owned → 1★, so not owned is
 * reachable without a control of its own. A not-owned connection shows faint
 * hollow stars, 0★ plain hollow ones.
 */
function StarPicker({ star, name, testId, onChange }: {
  star: number | undefined; name: string; testId: string; onChange: (star: number | null) => void
}) {
  const { t } = useTranslation()
  const owned = star !== undefined
  const next = (value: number): number | null => {
    if (value === 1) return !owned ? 1 : star === 1 ? 0 : star === 0 ? null : 1
    return owned && star === value ? value - 1 : value
  }
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={t('bonds.fellowStarFor', { name })} data-testid={testId}
      data-star={owned ? star : 'none'}>
      {Array.from({ length: MAX_FELLOW_STAR }, (_, index) => {
        const value = index + 1
        const lit = owned && value <= star
        return (
          <button key={value} type="button" aria-label={t('bonds.fellowStar', { star: value })} aria-pressed={owned && star === value}
            onClick={() => onChange(next(value))}
            className={`inline-flex size-4 items-center justify-center text-sm leading-none ${lit ? 'text-amber-500' : owned ? 'text-muted-foreground/60 hover:text-amber-400' : 'text-muted-foreground/25 hover:text-amber-400'} ${FOCUS}`}
            data-testid={`${testId}-${value}`}>
            {lit ? '★' : '☆'}
          </button>
        )
      })}
    </div>
  )
}

/** One click to set a whole list: not owned, or any star count. */
function StarPresets({ label, testId, onPick }: { label: string; testId: string; onPick: (star: number | null) => void }) {
  const { t } = useTranslation()
  const presets: (number | null)[] = [null, ...Array.from({ length: MAX_FELLOW_STAR + 1 }, (_, star) => star)]
  return (
    <div className="flex flex-wrap items-center gap-1" data-testid={testId}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {presets.map((star) => (
        <button key={star ?? 'none'} type="button" onClick={() => onPick(star)}
          className={`inline-flex h-6 items-center rounded border border-border px-1.5 text-xs text-muted-foreground transition-colors hover:border-[color:var(--arkive-nav-accent)] hover:text-foreground ${FOCUS}`}
          data-testid={`${testId}-${star ?? 'none'}`}>
          {star === null ? t('bonds.fellowNotOwned') : t('bonds.fellowStar', { star })}
        </button>
      ))}
    </div>
  )
}
