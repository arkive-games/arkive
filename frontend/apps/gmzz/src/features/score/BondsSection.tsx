import { useMemo, useState } from 'react'
import { IconPlus, IconX } from '@tabler/icons-react'
import { Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import RangeField from '@/components/RangeField'
import PickerModal, { IconTile, type PickerOption } from '@/features/equipment/PickerModal'
import type { HistoryResearchRank } from '@/features/fellows/data'
import {
  clampSlots,
  clampStage,
  evaluatePuppets,
  hasMarks,
  historyRankById,
  historyRankFor,
  type BondsDraft,
  type PuppetResult,
} from '@/features/score/bonds'
import type { GenusResult, Rating, SpeciesResult } from '@/features/score/data'
import { GroupSection } from '@/features/score/GroupSection'
import { portraitUrl, type PartnerScoring, type SecretPartner } from '@/features/secretpartners/data'
import { TYPE } from '@/lib/typography'

/** The client's module keys for the two items this section derives. */
export const PUPPET_GAIN_MODULE = 'Bonds_PartnerGain'
export const HISTORY_MODULE = 'Bonds_FellowGain'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const SELECT_CLASS = `h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none ${FOCUS}`
const NUMBER_CLASS = 'h-9 border-border bg-background text-sm tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]'
const BUTTON_CLASS = `inline-flex h-9 items-center justify-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-[color:var(--arkive-nav-accent)] hover:text-foreground disabled:opacity-50 ${FOCUS}`
const ICON_BUTTON_CLASS = `inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-[color:var(--arkive-nav-accent)] hover:text-foreground ${FOCUS}`
const LABEL_CLASS = `mb-0.5 block ${TYPE.label}`
const CHECK_CLASS = `size-4 cursor-pointer accent-[color:var(--arkive-nav-accent)] ${FOCUS}`

export type BondsData = {
  partners: SecretPartner[] | null
  scoring: PartnerScoring | null
  ranks: HistoryResearchRank[] | null
}

/**
 * The 非凡人物 group: four items, two of them derived.
 *
 * 秘偶属性 and 历史研究 come with a calculator under their row and show the
 * figure it produced; 秘偶技能 and 人脉技能 are server values with no client
 * formula, so they keep the typed box the other groups use. The derived scores
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const result = useMemo(
    () => evaluatePuppets(draft.puppets, partners, scoring, draft.dominateSlots),
    [draft.puppets, draft.dominateSlots, partners, scoring],
  )
  const owned = new Set(draft.puppets.map((entry) => entry.partnerId))
  const remaining = partners.filter((partner) => !owned.has(partner.id))
  const slotsFull = result.dominated >= result.slots

  const options: PickerOption[] = remaining.map((partner) => ({
    id: partner.id,
    name: partner.name,
    detail: partner.attributes.map((attribute) => attribute.name).join(' · '),
    quality: partner.quality,
    iconUrl: partner.portrait ? portraitUrl(partner.portrait) : undefined,
    keywords: partner.category,
  }))

  const add = (ids: number[]) =>
    setDraft((prev) => ({
      ...prev,
      puppets: [...prev.puppets, ...ids.map((partnerId) => ({ partnerId, stage: 1, dominated: false }))],
    }))
  const update = (partnerId: number, patch: Partial<{ stage: number; dominated: boolean }>) =>
    setDraft((prev) => ({
      ...prev,
      puppets: prev.puppets.map((entry) => (entry.partnerId === partnerId ? { ...entry, ...patch } : entry)),
    }))
  const remove = (partnerId: number) =>
    setDraft((prev) => ({ ...prev, puppets: prev.puppets.filter((entry) => entry.partnerId !== partnerId) }))

  return (
    <div className="space-y-2" data-testid="bonds-puppets">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:items-end">
        <label className="block">
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
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t('bonds.slotsHint', { max: scoring.maxDominateSlots })}
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BUTTON_CLASS} onClick={() => setPickerOpen(true)} disabled={remaining.length === 0} data-testid="bonds-add">
            <IconPlus className="size-4" stroke={1.8} aria-hidden />
            {t('bonds.add')}
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => add(remaining.map((partner) => partner.id))} disabled={remaining.length === 0} data-testid="bonds-add-all">
            {t('bonds.addAll', { count: remaining.length })}
          </button>
          <span className={`${TYPE.valueMuted} ${slotsFull ? 'text-foreground' : ''}`} data-testid="bonds-dominated">
            {t('bonds.dominated', { used: result.dominated, slots: result.slots })}
          </span>
        </div>
      </div>

      {result.rows.length === 0 ? (
        <p className={`rounded-md border border-dashed border-border p-3 text-center ${TYPE.body}`}>{t('bonds.empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {result.rows.map((row) => (
            <PuppetRow
              key={row.partner.id}
              row={row}
              scoring={scoring}
              slotsFull={slotsFull}
              onStage={(stage) => update(row.partner.id, { stage })}
              onDominate={(dominated) => update(row.partner.id, { dominated })}
              onRemove={() => remove(row.partner.id)}
            />
          ))}
        </ul>
      )}

      <p className={TYPE.body}>
        {t('bonds.formula', {
          inRate: scoring.inDominateRate,
          outRate: scoring.nonDominateRate,
        })}
      </p>

      <PickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(id) => add([id])}
        options={options}
        selectedId={null}
        title={t('bonds.pickerTitle')}
        testIdPrefix="bonds-picker"
      />
    </div>
  )
}

function PuppetRow({
  row,
  scoring,
  slotsFull,
  onStage,
  onDominate,
  onRemove,
}: {
  row: PuppetResult
  scoring: PartnerScoring
  slotsFull: boolean
  onStage: (stage: number) => void
  onDominate: (dominated: boolean) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const { partner, entry } = row
  const stage = clampStage(entry.stage, scoring)
  const scorable = hasMarks(partner)
  // A ticked box past the slot count is shown unticked: that puppet is not
  // getting the slot, and a tick that counts for nothing would mislead.
  const checked = row.dominated
  const canDominate = checked || !slotsFull

  return (
    <li
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 rounded-md border border-border bg-background p-2 md:grid-cols-[auto_minmax(8rem,12rem)_minmax(0,1fr)_auto_minmax(6rem,7rem)_auto]"
      data-testid={`bonds-puppet-${partner.id}`}
    >
      <IconTile quality={partner.quality} src={partner.portrait ? portraitUrl(partner.portrait) : undefined} alt={partner.name} label={partner.name.slice(0, 1)} />
      <div className="min-w-0">
        <div className={`truncate ${TYPE.name}`}>{partner.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {scorable ? partner.attributes.map((attribute) => attribute.name).join(' · ') : t('bonds.noMarks')}
        </div>
      </div>
      <button type="button" className={`${ICON_BUTTON_CLASS} md:order-last`} onClick={onRemove} aria-label={t('bonds.remove', { name: partner.name })} data-testid={`bonds-remove-${partner.id}`}>
        <IconX className="size-4" stroke={1.8} aria-hidden />
      </button>

      <div className="col-span-3 md:col-span-1">
        <RangeField
          label={t('bonds.stage')}
          min={1}
          max={scoring.maxStar}
          value={stage}
          valueText={t('bonds.stageValue', { stage })}
          minLabel="1"
          maxLabel={String(scoring.maxStar)}
          showValue
          testId={`bonds-stage-${partner.id}`}
          onChange={onStage}
        />
      </div>

      <label className="col-span-2 flex items-center gap-1.5 md:col-span-1">
        <input
          type="checkbox"
          className={CHECK_CLASS}
          checked={checked}
          disabled={!canDominate}
          onChange={(event) => onDominate(event.target.checked)}
          data-testid={`bonds-dominate-${partner.id}`}
        />
        <span className={`${TYPE.control} ${checked ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{t('bonds.dominate')}</span>
      </label>

      <div className="text-right md:text-left">
        <div className={TYPE.value} data-testid={`bonds-score-${partner.id}`}>
          {Math.round(row.score).toLocaleString()}
        </div>
        <div className={TYPE.valueMuted}>{t('bonds.rowMark', { mark: row.mark.toLocaleString(), rate: row.rate })}</div>
      </div>
    </li>
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
  const tiers = useMemo(() => {
    const groups = new Map<number, HistoryResearchRank[]>()
    for (const rank of sorted) groups.set(rank.rank, [...(groups.get(rank.rank) ?? []), rank])
    return [...groups.entries()]
  }, [sorted])
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
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]" data-testid="bonds-history">
      <label className="block">
        <span className={LABEL_CLASS}>{t('bonds.rank')}</span>
        <select
          value={current?.id ?? ''}
          className={SELECT_CLASS}
          onChange={(event) => pickRank(event.target.value === '' ? null : Number(event.target.value))}
          data-testid="bonds-rank"
        >
          <option value="">{t('bonds.rankNone')}</option>
          {tiers.map(([tier, members]) => (
            <optgroup key={tier} label={t('bonds.rankTier', { tier })}>
              {members.map((rank) => (
                <option key={rank.id} value={rank.id}>
                  {t('bonds.rankOption', { name: rank.name, mark: rank.mark.toLocaleString() })}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {next
            ? t('bonds.rankNext', { name: next.name, points: next.score.toLocaleString(), mark: (next.mark - item.score).toLocaleString() })
            : t('bonds.rankTop')}
        </span>
      </label>
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
