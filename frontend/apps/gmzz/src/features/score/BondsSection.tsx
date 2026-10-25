import { useMemo, useState } from 'react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { IconTile } from '@/features/equipment/PickerModal'
import type { HistoryResearchRank } from '@/features/fellows/data'
import { HistoryResearchSlider } from '@/features/fellows/HistoryResearchSlider'
import {
  activeAttributes,
  CALIBRATED_SKILL_LEVEL,
  MAX_SKILL_LEVEL,
  carriedPuppetSkill,
  clampSlots,
  clampStage,
  evaluatePuppets,
  hasMarks,
  historyRankById,
  historyRankFor,
  puppetSkillScore,
  type ActiveAttribute,
  type BondsDraft,
  type PuppetsResult,
} from '@/features/score/bonds'
import type { GenusResult, Rating, SpeciesResult } from '@/features/score/data'
import { GroupSection } from '@/features/score/GroupSection'
import { portraitUrl, type PartnerScoring, type SecretPartner } from '@/features/secretpartners/data'
import { TYPE } from '@/lib/typography'

/** The client's module keys for the two items this section derives. */
export const PUPPET_GAIN_MODULE = 'Bonds_PartnerGain'
export const PUPPET_SKILL_MODULE = 'Bonds_PartnerSkill'
export const HISTORY_MODULE = 'Bonds_FellowGain'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const NUMBER_CLASS = 'h-9 border-border bg-background text-sm tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]'
const LABEL_CLASS = `mb-0.5 block ${TYPE.label}`

export type BondsData = {
  partners: SecretPartner[] | null
  scoring: PartnerScoring | null
  ranks: HistoryResearchRank[] | null
}

/**
 * The 非凡人物 group: four items, three of them derived.
 *
 * 秘偶属性, 秘偶技能 and 历史研究 come with a calculator under their row and show
 * the figure it produced; 人脉技能 is a server value with no client formula, so
 * it keeps the typed box the other groups use. The derived scores
 * are computed by the page (they feed the same `evaluate` as everything else)
 * and arrive here already inside `group`.
 */
export default function BondsSection({
  group,
  rating,
  data,
  draft,
  setDraft,
  onScore,
}: {
  group: GenusResult
  rating: Rating
  data: BondsData
  draft: BondsDraft
  setDraft: (update: (prev: BondsDraft) => BondsDraft) => void
  onScore: (speciesId: number, value: number) => void
}) {
  const { t } = useTranslation()

  return (
    <GroupSection
      group={group}
      rating={rating}
      hint={t('bonds.hint')}
      onScore={onScore}
      present={(item) => {
        if (item.species.module === PUPPET_GAIN_MODULE) {
          return {
            kind: 'derived',
            calculator:
              data.partners && data.scoring ? (
                <PuppetCalculator partners={data.partners} scoring={data.scoring} draft={draft} setDraft={setDraft} />
              ) : (
                <p className={TYPE.body}>{t('bonds.unavailable')}</p>
              ),
          }
        }
        if (item.species.module === PUPPET_SKILL_MODULE) {
          return {
            kind: 'derived',
            calculator:
              data.partners && data.scoring ? (
                <PuppetSkillCalculator partners={data.partners} scoring={data.scoring} draft={draft} setDraft={setDraft} />
              ) : (
                <p className={TYPE.body}>{t('bonds.unavailable')}</p>
              ),
          }
        }
        if (item.species.module === HISTORY_MODULE) {
          return {
            kind: 'derived',
            calculator: data.ranks ? (
              <HistoryPicker ranks={data.ranks} item={item} draft={draft} setDraft={setDraft} />
            ) : (
              <p className={TYPE.body}>{t('bonds.unavailable')}</p>
            ),
          }
        }
        return { kind: 'typed', note: t('bonds.typedHint') }
      }}
    />
  )
}

/* ----------------------------------------------------------------- puppets */

/**
 * Every puppet in the dataset as a small icon, with its level typed underneath.
 * Level 0 means not owned. Clicking the icon deploys it (上阵), up to the slot
 * count; a full set greys out the rest rather than silently refusing the click.
 */
function PuppetCalculator({
  partners,
  scoring,
  draft,
  setDraft,
}: {
  partners: SecretPartner[]
  scoring: PartnerScoring
  draft: BondsDraft
  setDraft: (update: (prev: BondsDraft) => BondsDraft) => void
}) {
  const { t } = useTranslation()
  const result = useMemo(
    () => evaluatePuppets(draft.puppets, partners, scoring, draft.dominateSlots),
    [draft.puppets, draft.dominateSlots, partners, scoring],
  )
  const entries = new Map(draft.puppets.map((entry) => [entry.partnerId, entry]))
  const rows = new Map(result.rows.map((row) => [row.partner.id, row]))
  const slotsFull = result.dominated >= result.slots
  // Best first, so the puppets a player is likely to own lead the grid.
  const ordered = useMemo(() => [...partners].sort((a, b) => b.quality - a.quality || a.id - b.id), [partners])

  const update = (partnerId: number, patch: Partial<{ stage: number; dominated: boolean }>) =>
    setDraft((prev) => {
      const exists = prev.puppets.some((entry) => entry.partnerId === partnerId)
      const puppets = exists
        ? prev.puppets.map((entry) => (entry.partnerId === partnerId ? { ...entry, ...patch } : entry))
        : [...prev.puppets, { partnerId, stage: 0, dominated: false, ...patch }]
      return { ...prev, puppets }
    })

  return (
    <div className="space-y-2" data-testid="bonds-puppets">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="block w-32">
          <span className={LABEL_CLASS}>{t('bonds.slots')}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={scoring.maxDominateSlots}
            value={result.slots}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, dominateSlots: clampSlots(Number(event.target.value), scoring) }))
            }
            className={NUMBER_CLASS}
            data-testid="bonds-slots"
          />
        </label>
        <span className={`${TYPE.valueMuted} ${slotsFull ? 'text-foreground' : ''}`} data-testid="bonds-dominated">
          {t('bonds.dominated', { used: result.dominated, slots: result.slots })}
        </span>
        <span className={TYPE.body}>{t('bonds.gridHint', { max: scoring.maxStar })}</span>
      </div>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
        {ordered.map((partner) => {
          const entry = entries.get(partner.id)
          const row = rows.get(partner.id)
          const level = clampStage(entry?.stage ?? 0, scoring)
          const deployed = row?.dominated ?? false
          // The stored flag, not the effective one: a puppet still marked
          // deployed after the slot count dropped must stay clickable so the
          // mark can be cleared, rather than lurking until a slot frees up.
          const stored = entry?.dominated ?? false
          const canDeploy = level >= 1 && (stored || !slotsFull)
          return (
            <li key={partner.id} className="flex min-w-0 flex-col items-center gap-1" data-testid={`bonds-puppet-${partner.id}`}>
              <button
                type="button"
                aria-pressed={stored}
                disabled={!canDeploy}
                title={partner.name}
                aria-label={t('bonds.deployToggle', { name: partner.name })}
                onClick={() => update(partner.id, { dominated: !stored })}
                className={`relative rounded-md p-0.5 transition ${FOCUS} ${deployed ? 'ring-2 ring-[color:var(--arkive-nav-accent)]' : stored ? 'ring-2 ring-border' : ''} ${level < 1 ? 'opacity-40 grayscale' : ''} disabled:cursor-not-allowed`}
                data-testid={`bonds-dominate-${partner.id}`}
              >
                <IconTile quality={partner.quality} src={partner.portrait ? portraitUrl(partner.portrait) : undefined} alt={partner.name} label={partner.name.slice(0, 1)} className="size-12" />
                {deployed ? (
                  <span className="absolute -right-1 -top-1 rounded bg-primary px-1 text-xs font-semibold text-primary-foreground">
                    {t('bonds.dominate')}
                  </span>
                ) : null}
              </button>
              <span className="w-full truncate text-center text-xs text-muted-foreground">{partner.name}</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={scoring.maxStar}
                value={level}
                aria-label={t('bonds.levelFor', { name: partner.name })}
                onChange={(event) => {
                  const next = clampStage(Number(event.target.value), scoring)
                  if (next < 1) {
                    update(partner.id, { stage: 0, dominated: false })
                    setDraft((prev) => (prev.skillPartnerId === partner.id ? { ...prev, skillPartnerId: null } : prev))
                  } else update(partner.id, { stage: next })
                }}
                className="h-7 w-16 border-border bg-background px-1 text-center text-xs tabular-nums shadow-none"
                data-testid={`bonds-stage-${partner.id}`}
              />
              <span className={TYPE.valueMuted} data-testid={`bonds-score-${partner.id}`}>
                {row ? (hasMarks(partner) ? Math.round(row.score).toLocaleString() : '—') : ''}
              </span>
            </li>
          )
        })}
      </ul>

      <p className={TYPE.body}>
        {t('bonds.formula', {
          inRate: scoring.inDominateRate,
          outRate: scoring.nonDominateRate,
        })}
      </p>

      <ActiveAttributes result={result} scoring={scoring} />
    </div>
  )
}

function formatTotal(attribute: ActiveAttribute) {
  return attribute.format === 'percent'
    ? `${Number((attribute.value * 100).toFixed(2))}%`
    : Number(attribute.value.toFixed(2)).toLocaleString()
}

/** Every attribute the owned puppets grant right now, summed. */
function ActiveAttributes({ result, scoring }: { result: PuppetsResult; scoring: PartnerScoring }) {
  const { t } = useTranslation()
  const totals = useMemo(() => activeAttributes(result, scoring), [result, scoring])
  return (
    <div className="border-t border-border pt-2" data-testid="bonds-attributes">
      <span className={LABEL_CLASS}>{t('bonds.activeAttributes')}</span>
      {totals.length === 0 ? (
        <p className={TYPE.body}>{t('bonds.activeAttributesNone')}</p>
      ) : (
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-4 gap-y-1">
          {totals.map((attribute) => (
            <div key={attribute.key} className="flex min-w-0 items-baseline justify-between gap-2" data-testid={`bonds-attribute-${attribute.key}`}>
              <dt className="truncate text-sm text-muted-foreground" title={t('bonds.activeAttributeSources', { count: attribute.sources })}>
                {attribute.name}
              </dt>
              <dd className="text-sm font-medium tabular-nums text-foreground">+{formatTotal(attribute)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {t('bonds.activeAttributesHint', { inRate: scoring.inDominateRate, outRate: scoring.nonDominateRate })}
      </p>
    </div>
  )
}

/* -------------------------------------------------------------- puppet skill */

function PuppetSkillCalculator({
  partners,
  scoring,
  draft,
  setDraft,
}: {
  partners: SecretPartner[]
  scoring: PartnerScoring
  draft: BondsDraft
  setDraft: (update: (prev: BondsDraft) => BondsDraft) => void
}) {
  const { t } = useTranslation()
  const skillLevel = draft.puppetSkillLevel ?? CALIBRATED_SKILL_LEVEL
  const carried = carriedPuppetSkill(draft.puppets, partners, scoring, draft.skillPartnerId, skillLevel)
  // Owned puppets with their skill score at the current skill level, best first.
  const owned = useMemo(() => {
    const levels = new Map(draft.puppets.map((entry) => [entry.partnerId, clampStage(entry.stage, scoring)]))
    return partners
      .filter((partner) => (levels.get(partner.id) ?? 0) >= 1)
      .map((partner) => ({ partner, result: puppetSkillScore(partner, levels.get(partner.id) ?? 0, skillLevel) }))
      .sort((a, b) => b.result.score - a.result.score || b.partner.quality - a.partner.quality || a.partner.id - b.partner.id)
  }, [draft.puppets, partners, scoring, skillLevel])
  const chosen = owned.some((row) => row.partner.id === draft.skillPartnerId) ? draft.skillPartnerId : null
  const pick = (id: number | null) => setDraft((prev) => ({ ...prev, skillPartnerId: id }))
  const nextTier = carried
    ? carried.partner.upgrades.find((upgrade) => upgrade.tier === carried.result.tier + 1)
    : undefined

  return (
    <div className="space-y-2" data-testid="bonds-puppet-skill">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)]">
        <div className="min-w-0">
          <span className={LABEL_CLASS}>{t('bonds.skillPuppet')}</span>
          <button
            type="button"
            aria-pressed={chosen === null}
            disabled={owned.length === 0}
            onClick={() => pick(null)}
            className={`h-9 rounded-md border px-3 text-sm transition ${FOCUS} ${chosen === null ? 'border-[color:var(--arkive-nav-accent)] text-foreground' : 'border-border text-muted-foreground'} disabled:cursor-not-allowed disabled:opacity-50`}
            data-testid="bonds-skill-best"
          >
            {t('bonds.skillPuppetBest')}
          </button>
        </div>
        <label className="block">
          <span className={LABEL_CLASS}>{t('bonds.skillLevel')}</span>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_SKILL_LEVEL}
            value={skillLevel}
            onChange={(event) => {
              const value = Math.trunc(Number(event.target.value))
              setDraft((prev) => ({ ...prev, puppetSkillLevel: Number.isFinite(value) && value >= 1 ? value : null }))
            }}
            className={NUMBER_CLASS}
            data-testid="bonds-skill-level"
          />
        </label>
      </div>
      {owned.length > 0 ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2" data-testid="bonds-skill-puppets">
          {owned.map(({ partner, result }) => {
            const carrying = carried?.partner.id === partner.id
            return (
              <li key={partner.id} className="flex min-w-0 flex-col items-center gap-1">
                <button
                  type="button"
                  aria-pressed={chosen === partner.id}
                  title={`${partner.name} · ${partner.skill.name}`}
                  aria-label={t('bonds.skillPick', { name: partner.name, skill: partner.skill.name })}
                  onClick={() => pick(chosen === partner.id ? null : partner.id)}
                  className={`relative rounded-md p-0.5 transition ${FOCUS} ${carrying ? 'ring-2 ring-[color:var(--arkive-nav-accent)]' : ''}`}
                  data-testid={`bonds-skill-puppet-${partner.id}`}
                >
                  <IconTile quality={partner.quality} src={partner.portrait ? portraitUrl(partner.portrait) : undefined} alt={partner.name} label={partner.name.slice(0, 1)} className="size-12" />
                  {carrying ? (
                    <span className="absolute -right-1 -top-1 rounded bg-primary px-1 text-xs font-semibold text-primary-foreground">
                      {t('bonds.skillCarried')}
                    </span>
                  ) : null}
                </button>
                <span className="w-full truncate text-center text-xs text-muted-foreground">{partner.skill.name || partner.name}</span>
                <span className={TYPE.valueMuted}>
                  {t('bonds.skillTierShort', { tier: result.tier })} · {result.score.toLocaleString()}
                  {result.estimated ? '*' : ''}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
      {carried ? (
        <p className={TYPE.body}>
          {t('bonds.skillTier', { name: carried.partner.name, tier: carried.result.tier })}
          {nextTier ? ` ${t('bonds.skillNextTier', { level: nextTier.requiredStage })}` : ''}
          {carried.result.estimated ? ` ${t('bonds.skillEstimated')}` : ''}
        </p>
      ) : (
        <p className={TYPE.body}>{t('bonds.skillNone')}</p>
      )}
      <p className={TYPE.body}>{t('bonds.skillFormula')}</p>
    </div>
  )
}

/* ----------------------------------------------------------------- history */

function HistoryPicker({
  ranks,
  item,
  draft,
  setDraft,
}: {
  ranks: HistoryResearchRank[]
  item: SpeciesResult
  draft: BondsDraft
  setDraft: (update: (prev: BondsDraft) => BondsDraft) => void
}) {
  const { t } = useTranslation()
  // What was typed into the points box. Not stored: the rank it resolves to is,
  // and the box is a shortcut to picking that rank.
  const [points, setPoints] = useState('')
  const current = historyRankById(ranks, draft.historyRankId)
  const sorted = useMemo(() => [...ranks].sort((a, b) => a.score - b.score), [ranks])
  const next = current ? sorted[sorted.findIndex((rank) => rank.id === current.id) + 1] : sorted[0]

  const pickRank = (id: number | null) => {
    setPoints('')
    setDraft((prev) => ({ ...prev, historyRankId: id }))
  }
  const typePoints = (raw: string) => {
    setPoints(raw)
    const value = Number(raw)
    if (raw === '' || !Number.isFinite(value)) return
    setDraft((prev) => ({ ...prev, historyRankId: historyRankFor(ranks, value)?.id ?? null }))
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]" data-testid="bonds-history">
      <div className="min-w-0">
        <span className={LABEL_CLASS}>{t('bonds.rank')}</span>
        <HistoryResearchSlider ranks={ranks} value={current?.id ?? null} onChange={pickRank} allowNone testId="bonds-rank" />
        <span className="mt-1 block text-xs text-muted-foreground">
          {next
            ? t('bonds.rankNext', { name: next.name, points: next.score.toLocaleString(), mark: (next.mark - item.score).toLocaleString() })
            : t('bonds.rankTop')}
        </span>
      </div>
      <label className="block">
        <span className={LABEL_CLASS}>{t('bonds.points')}</span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={points}
          placeholder={current ? String(current.score) : '0'}
          onChange={(event) => typePoints(event.target.value)}
          className={NUMBER_CLASS}
          data-testid="bonds-points"
        />
        <span className="mt-0.5 block text-xs text-muted-foreground">{t('bonds.pointsHint')}</span>
      </label>
    </div>
  )
}
