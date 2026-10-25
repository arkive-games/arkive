import { useMemo, useState } from 'react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import PickerModal, { IconTile, type PickerOption } from '@/features/equipment/PickerModal'
import type { Fellow, FellowRelation, HistoryResearchRank } from '@/features/fellows/data'
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
  talentMark,
  type ActiveAttribute,
  type BondsDraft,
  type PuppetsResult,
} from '@/features/score/bonds'
import type { GenusResult, Rating, SpeciesResult } from '@/features/score/data'
import FellowSkillCalculator from '@/features/score/FellowSkillSection'
import { GroupSection } from '@/features/score/GroupSection'
import { portraitUrl, type PartnerScoring, type SecretPartner } from '@/features/secretpartners/data'
import { TYPE } from '@/lib/typography'

/** The client's module keys for the two items this section derives. */
export const PUPPET_GAIN_MODULE = 'Bonds_PartnerGain'
export const PUPPET_SKILL_MODULE = 'Bonds_PartnerSkill'
export const HISTORY_MODULE = 'Bonds_FellowGain'
export const FELLOW_SKILL_MODULE = 'Bonds_FellowSkill'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const NUMBER_CLASS = 'h-9 border-border bg-background text-sm tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]'
const LABEL_CLASS = `mb-0.5 block ${TYPE.label}`

export type BondsData = {
  partners: SecretPartner[] | null
  scoring: PartnerScoring | null
  ranks: HistoryResearchRank[] | null
  fellows: Fellow[] | null
  relations: FellowRelation[] | null
}

/**
 * The 非凡人物 group: all four items derived.
 *
 * Each comes with a calculator under its row and shows the figure it produced.
 * 秘偶属性 and 秘偶技能 share one lineup, drawn under 秘偶属性; 人脉技能 has its own
 * roster of connections and stars. The two skill items follow formulas fitted
 * to in-game readings rather than client code. The derived scores
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
                <PuppetLineup partners={data.partners} scoring={data.scoring} draft={draft} setDraft={setDraft} />
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
                <PuppetSkillSummary partners={data.partners} scoring={data.scoring} draft={draft} />
              ) : (
                <p className={TYPE.body}>{t('bonds.unavailable')}</p>
              ),
          }
        }
        if (item.species.module === FELLOW_SKILL_MODULE) {
          return {
            kind: 'derived',
            calculator:
              data.fellows && data.relations ? (
                <FellowSkillCalculator fellows={data.fellows} relations={data.relations} draft={draft} setDraft={setDraft} />
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

/* ------------------------------------------------------------- puppet lineup */

type Picking = 'deploy' | 'carry' | null

/**
 * The lineup: 秘偶属性 and 秘偶技能 off one roster, the way the game's own
 * lineup screen works.
 *
 * The bar at the top holds the deploy slots (上阵) and the carried skill; a
 * slot opens a picker sorted by the score that slot is about, so choosing who
 * to deploy and whose skill to carry is a pick from a ranked list rather than a
 * mode to switch. The grid below is where levels are typed (0 means not owned);
 * clicking an icon there is a shortcut for deploy only, so one click never has
 * two meanings.
 */
function PuppetLineup({
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
  const [picking, setPicking] = useState<Picking>(null)
  const skillLevel = draft.puppetSkillLevel ?? CALIBRATED_SKILL_LEVEL
  const result = useMemo(
    () => evaluatePuppets(draft.puppets, partners, scoring, draft.dominateSlots),
    [draft.puppets, draft.dominateSlots, partners, scoring],
  )
  const carried = carriedPuppetSkill(draft.puppets, partners, scoring, draft.skillPartnerId, skillLevel)
  const entries = new Map(draft.puppets.map((entry) => [entry.partnerId, entry]))
  const rows = new Map(result.rows.map((row) => [row.partner.id, row]))
  const slotsFull = result.dominated >= result.slots
  const autoCarry = !result.rows.some((row) => row.partner.id === draft.skillPartnerId)
  // Best first, so the puppets a player is likely to own lead the grid.
  const ordered = useMemo(() => [...partners].sort((a, b) => b.quality - a.quality || a.id - b.id), [partners])

  // Each owned puppet's two figures: its attributes as if deployed, and its skill.
  const owned = useMemo(
    () =>
      result.rows.map((row) => {
        const stage = clampStage(row.entry.stage, scoring)
        return {
          partner: row.partner,
          deployScore: hasMarks(row.partner) ? talentMark(row.partner, stage) * scoring.inDominateRate : null,
          skill: puppetSkillScore(row.partner, stage, skillLevel),
        }
      }),
    [result.rows, scoring, skillLevel],
  )
  const figures = new Map(owned.map((row) => [row.partner.id, row]))

  const update = (partnerId: number, patch: Partial<{ stage: number; dominated: boolean }>) =>
    setDraft((prev) => {
      const exists = prev.puppets.some((entry) => entry.partnerId === partnerId)
      const puppets = exists
        ? prev.puppets.map((entry) => (entry.partnerId === partnerId ? { ...entry, ...patch } : entry))
        : [...prev.puppets, { partnerId, stage: 0, dominated: false, ...patch }]
      return { ...prev, puppets }
    })

  const tile = (partner: SecretPartner, className = 'size-12') => (
    <IconTile quality={partner.quality} src={partner.portrait ? portraitUrl(partner.portrait) : undefined} alt={partner.name} label={partner.name.slice(0, 1)} className={className} />
  )

  const deployOptions: PickerOption[] = owned
    .filter((row) => !(entries.get(row.partner.id)?.dominated ?? false))
    .sort((a, b) => (b.deployScore ?? -1) - (a.deployScore ?? -1))
    .map((row) => ({
      id: row.partner.id,
      name: row.partner.name,
      detail: t('bonds.pickDeployDetail', { score: row.deployScore === null ? '—' : Math.round(row.deployScore).toLocaleString() }),
      quality: row.partner.quality,
      iconUrl: row.partner.portrait ? portraitUrl(row.partner.portrait) : undefined,
    }))
  const carryOptions: PickerOption[] = [...owned]
    .sort((a, b) => b.skill.score - a.skill.score || b.partner.quality - a.partner.quality)
    .map((row) => ({
      id: row.partner.id,
      name: `${row.partner.name} · ${row.partner.skill.name}`,
      detail: t('bonds.pickCarryDetail', { tier: row.skill.tier, score: row.skill.score.toLocaleString() }) + (row.skill.estimated ? '*' : ''),
      quality: row.partner.quality,
      iconUrl: row.partner.portrait ? portraitUrl(row.partner.portrait) : undefined,
      keywords: row.partner.skill.name,
    }))

  const deployed = result.rows.filter((row) => row.dominated)
  const emptySlots = Math.max(0, result.slots - deployed.length)

  return (
    <div className="space-y-3" data-testid="bonds-puppets">
      {/* The lineup bar. */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 rounded-md border border-border p-2" data-testid="bonds-lineup">
        <div className="min-w-0">
          <span className={LABEL_CLASS} data-testid="bonds-dominated">
            {t('bonds.dominated', { used: result.dominated, slots: result.slots })}
          </span>
          <ul className="flex flex-wrap gap-2">
            {deployed.map((row) => (
              <li key={row.partner.id} className="relative" data-testid={`bonds-slot-${row.partner.id}`}>
                <div title={row.partner.name}>{tile(row.partner)}</div>
                <button
                  type="button"
                  aria-label={t('bonds.undeploy', { name: row.partner.name })}
                  onClick={() => update(row.partner.id, { dominated: false })}
                  className={`absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-xs text-muted-foreground hover:text-foreground ${FOCUS}`}
                  data-testid={`bonds-undeploy-${row.partner.id}`}
                >
                  ✕
                </button>
              </li>
            ))}
            {Array.from({ length: emptySlots }, (_, index) => (
              <li key={`empty-${index}`}>
                <button
                  type="button"
                  disabled={deployOptions.length === 0}
                  onClick={() => setPicking('deploy')}
                  aria-label={t('bonds.addDeploy')}
                  title={t('bonds.addDeploy')}
                  className={`flex size-12 items-center justify-center rounded border border-dashed border-border text-lg text-muted-foreground transition hover:border-[color:var(--arkive-nav-accent)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
                  data-testid="bonds-slot-empty"
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          <span className={LABEL_CLASS}>{t('bonds.skillPuppet')}</span>
          <button
            type="button"
            disabled={owned.length === 0}
            onClick={() => setPicking('carry')}
            className={`flex h-12 items-center gap-2 rounded border border-border pr-3 text-left transition hover:border-[color:var(--arkive-nav-accent)] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
            data-testid="bonds-carry-slot"
          >
            {carried ? tile(carried.partner) : <span className="size-12" />}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">
                {carried ? carried.partner.skill.name || carried.partner.name : t('bonds.skillNone')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {carried
                  ? `${autoCarry ? `${t('bonds.skillPuppetBest')} · ` : ''}${t('bonds.pickCarryDetail', { tier: carried.result.tier, score: carried.result.score.toLocaleString() })}`
                  : ''}
              </span>
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block w-24">
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
          <label className="block w-24">
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
      </div>

      <p className={TYPE.body}>{t('bonds.gridHint', { max: scoring.maxStar })}</p>

      {/* The roster: every puppet, its level, and both of its figures. */}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
        {ordered.map((partner) => {
          const entry = entries.get(partner.id)
          const row = rows.get(partner.id)
          const figure = figures.get(partner.id)
          const level = clampStage(entry?.stage ?? 0, scoring)
          const isDeployed = row?.dominated ?? false
          const isCarried = carried?.partner.id === partner.id
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
                className={`relative rounded-md p-0.5 transition ${FOCUS} ${isDeployed ? 'ring-2 ring-[color:var(--arkive-nav-accent)]' : stored ? 'ring-2 ring-border' : ''} ${level < 1 ? 'opacity-40 grayscale' : ''} disabled:cursor-not-allowed`}
                data-testid={`bonds-dominate-${partner.id}`}
              >
                {tile(partner)}
                {isDeployed ? (
                  <span className="absolute -right-1 -top-1 rounded bg-primary px-1 text-xs font-semibold text-primary-foreground">
                    {t('bonds.dominate')}
                  </span>
                ) : null}
                {isCarried ? (
                  <span className="absolute -bottom-1 -left-1 rounded bg-secondary px-1 text-xs font-semibold text-secondary-foreground" data-testid={`bonds-carried-${partner.id}`}>
                    {t('bonds.skillCarried')}
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
              {row && figure ? (
                <span className="text-center text-xs leading-4 tabular-nums text-muted-foreground" data-testid={`bonds-score-${partner.id}`}>
                  <span className="block">{t('bonds.attrShort', { score: hasMarks(partner) ? Math.round(row.score).toLocaleString() : '—' })}</span>
                  <span className="block">
                    {t('bonds.skillShort', { score: figure.skill.score.toLocaleString() })}
                    {figure.skill.estimated ? '*' : ''}
                  </span>
                </span>
              ) : null}
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

      <PickerModal
        open={picking === 'deploy'}
        onOpenChange={(open) => setPicking(open ? 'deploy' : null)}
        title={t('bonds.pickDeployTitle')}
        options={deployOptions}
        selectedId={null}
        onSelect={(id) => update(id, { dominated: true })}
        testIdPrefix="bonds-pick-deploy"
      />
      <PickerModal
        open={picking === 'carry'}
        onOpenChange={(open) => setPicking(open ? 'carry' : null)}
        title={t('bonds.pickCarryTitle')}
        options={carryOptions}
        selectedId={autoCarry ? null : (draft.skillPartnerId ?? null)}
        onSelect={(id) => setDraft((prev) => ({ ...prev, skillPartnerId: id }))}
        testIdPrefix="bonds-pick-carry"
        footer={
          <button
            type="button"
            aria-pressed={autoCarry}
            onClick={() => {
              setDraft((prev) => ({ ...prev, skillPartnerId: null }))
              setPicking(null)
            }}
            className={`h-9 w-full rounded-md border text-sm transition ${FOCUS} ${autoCarry ? 'border-[color:var(--arkive-nav-accent)] text-foreground' : 'border-border text-muted-foreground'}`}
            data-testid="bonds-skill-best"
          >
            {t('bonds.skillPuppetBest')}
          </button>
        }
      />
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

/**
 * The 秘偶技能 row's explanation. The carried puppet is chosen in the lineup
 * under 秘偶属性, so this only says what it scored and why.
 */
function PuppetSkillSummary({
  partners,
  scoring,
  draft,
}: {
  partners: SecretPartner[]
  scoring: PartnerScoring
  draft: BondsDraft
}) {
  const { t } = useTranslation()
  const carried = carriedPuppetSkill(draft.puppets, partners, scoring, draft.skillPartnerId, draft.puppetSkillLevel)
  const nextTier = carried
    ? carried.partner.upgrades.find((upgrade) => upgrade.tier === carried.result.tier + 1)
    : undefined
  return (
    <div className="space-y-1" data-testid="bonds-puppet-skill">
      {carried ? (
        <p className={TYPE.body}>
          {t('bonds.skillTier', { name: carried.partner.name, tier: carried.result.tier })}
          {nextTier ? ` ${t('bonds.skillNextTier', { level: nextTier.requiredStage })}` : ''}
          {carried.result.estimated ? ` ${t('bonds.skillEstimated')}` : ''}
        </p>
      ) : (
        <p className={TYPE.body}>{t('bonds.skillNone')}</p>
      )}
      <p className={TYPE.body}>{t('bonds.skillFromLineup')} {t('bonds.skillFormula')}</p>
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
