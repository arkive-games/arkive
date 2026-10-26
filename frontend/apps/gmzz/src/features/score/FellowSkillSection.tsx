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
  relationTier,
  starMap,
  type FellowSkillResult,
} from '@/features/score/fellowSkill'
import { TYPE } from '@/lib/typography'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const LABEL_CLASS = `mb-0.5 block ${TYPE.label}`

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
  const byId = useMemo(() => new Map(fellows.map((fellow) => [fellow.id, fellow])), [fellows])
  const options = new Map(fellows.map((fellow) => [fellow.id, fellowOptions(fellow, relations, stars, skillLevel)]))
  const carriedOptions = carried ? (options.get(carried.fellow.id) ?? []) : []
  const boostRelations = useMemo(
    () => relations.filter((relation) => relation.quality === 1 || relation.quality === 2).sort((a, b) => a.order - b.order),
    [relations],
  )

  const setStar = (fellowId: number, star: number | null) =>
    setDraft((prev) => {
      const rest = (prev.fellows ?? []).filter((entry) => entry.fellowId !== fellowId)
      if (star === null) {
        return { ...prev, fellows: rest, fellowSkillId: prev.fellowSkillId === fellowId ? null : prev.fellowSkillId }
      }
      return { ...prev, fellows: [...rest, { fellowId, star }] }
    })
  const carry = (fellowId: number | null) => setDraft((prev) => ({ ...prev, fellowSkillId: fellowId, fellowRelationId: null }))

  /** Every connection in the list set to one star, or all marked not owned. */
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
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 rounded-md border border-border p-2">
        <div className="min-w-0">
          <span className={LABEL_CLASS}>{t('bonds.fellowCarried')}</span>
          <button
            type="button"
            disabled={carryOptions.length === 0}
            onClick={() => setPicking(true)}
            className={`flex h-12 items-center gap-2 rounded border border-border pr-3 text-left transition hover:border-[color:var(--arkive-nav-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
            data-testid="bonds-fellow-carry"
          >
            {carried ? tile(carried.fellow) : <span className="size-12" />}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {carried ? carried.fellow.skill.name || carried.fellow.name : t('bonds.fellowNone')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {carried ? `${autoCarry ? `${t('bonds.skillPuppetBest')} · ` : ''}${describe(carried)}${carried.estimated ? '*' : ''}` : ''}
              </span>
            </span>
          </button>
        </div>

        {carriedOptions.length > 1 ? (
          <div className="min-w-0" data-testid="bonds-fellow-relations">
            <span className={LABEL_CLASS}>{t('bonds.fellowRelation')}</span>
            <div className="flex flex-wrap gap-2">
              {carriedOptions.map((option) => {
                const active = option.relation?.id === carried?.relation?.id
                return (
                  <button
                    key={option.relation?.id ?? 0}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDraft((prev) => ({ ...prev, fellowSkillId: option.fellow.id, fellowRelationId: option.relation?.id ?? null }))}
                    className={`rounded-md border px-2 py-1 text-left text-xs transition ${FOCUS} ${active ? 'border-[color:var(--arkive-nav-accent)] text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
                    data-testid={`bonds-fellow-relation-${option.relation?.id ?? 0}`}
                  >
                    <span className="block font-semibold">{option.relation?.name}</span>
                    <span className="block tabular-nums">
                      {t('bonds.fellowRelationOption', { quality: option.relation?.quality ?? 0, tier: option.tier, score: option.score.toLocaleString() })}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <SkillLevelField value={skillLevel} cap={skillCap} relicBonus={relicSkillBonus} testId="bonds-fellow-skill-level"
          onChange={(level) => setDraft((prev) => ({ ...prev, puppetSkillLevel: level }))} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className={TYPE.body}>{t('bonds.fellowGridHint')}</p>
        <StarPresets testId="bonds-fellow-all" label={t('bonds.fellowSetAll')} onPick={(star) => setAll(ordered, star)} />
      </div>

      {groups.map((group) => (
        <div key={group.quality} data-testid={`bonds-fellow-row-${group.quality}`}>
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={TYPE.label}>{t(group.quality === GOLD_FELLOW ? 'bonds.fellowGold' : 'bonds.fellowPurple')}</span>
            <StarPresets testId={`bonds-fellow-set-${group.quality}`} label={t('bonds.fellowSetRow')} onPick={(star) => setAll(group.fellows, star)} />
          </div>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2">
            {group.fellows.map((fellow) => {
              const star = stars.get(fellow.id)
              const best = options.get(fellow.id)?.[0]
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
                  {best ? (
                    <span className="text-center text-xs tabular-nums text-muted-foreground" data-testid={`bonds-fellow-score-${fellow.id}`}>
                      {best.score.toLocaleString()}
                      {best.estimated ? '*' : ''}
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <div className="border-t border-border pt-2" data-testid="bonds-fellow-relation-list">
        <span className={LABEL_CLASS}>{t('bonds.fellowRelationList')}</span>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-x-4 gap-y-1">
          {boostRelations.map((relation) => {
            const tier = relationTier(relation, stars)
            return (
              <li key={relation.id} className="flex min-w-0 items-baseline justify-between gap-2 text-sm" data-testid={`bonds-relation-${relation.id}`}>
                <span className="min-w-0 truncate text-muted-foreground" title={relation.members.map((m) => byId.get(m.fellowId)?.name ?? m.fellowId).join(' · ')}>
                  {relation.name}
                  <span className="ml-1 text-xs">
                    {relation.members
                      .map((member) => {
                        const fellow = byId.get(member.fellowId)
                        const value = stars.get(member.fellowId)
                        return `${fellow?.shortName || fellow?.name || member.fellowId} ${value === undefined ? '—' : `${value}★`}`
                      })
                      .join(' / ')}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums text-foreground">
                  {t('bonds.fellowTier', { quality: relation.quality ?? 0, tier })}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

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
 * A connection's stars, set with one click: the stars themselves (clicking the
 * lit top star again steps it down to 0★), and a cross for not owned. A
 * not-owned connection shows hollow stars.
 */
function StarPicker({ star, name, testId, onChange }: {
  star: number | undefined; name: string; testId: string; onChange: (star: number | null) => void
}) {
  const { t } = useTranslation()
  const owned = star !== undefined
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={t('bonds.fellowStarFor', { name })} data-testid={testId}
      data-star={owned ? star : 'none'}>
      <button type="button" onClick={() => onChange(null)} aria-pressed={!owned} aria-label={t('bonds.fellowNotOwned')}
        className={`inline-flex size-5 items-center justify-center rounded text-xs ${owned ? 'text-muted-foreground hover:text-foreground' : 'bg-muted font-semibold text-foreground'} ${FOCUS}`}
        data-testid={`${testId}-none`}>
        ×
      </button>
      {Array.from({ length: MAX_FELLOW_STAR }, (_, index) => {
        const value = index + 1
        const lit = owned && value <= star
        return (
          <button key={value} type="button" aria-label={t('bonds.fellowStar', { star: value })} aria-pressed={owned && star === value}
            onClick={() => onChange(owned && star === value ? 0 : value)}
            className={`inline-flex size-4 items-center justify-center text-sm leading-none ${lit ? 'text-amber-500' : 'text-muted-foreground/50 hover:text-amber-400'} ${FOCUS}`}
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
