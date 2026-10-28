import { useMemo, useState, type ReactNode } from 'react'
import { IconChevronDown, IconSparkles } from '@tabler/icons-react'
import { Dialog, DialogContent, DialogTrigger } from '@gamemap/ui'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { DialogHead } from '@/features/equipment/EquipmentSection'
import { IconTile } from '@/features/equipment/PickerModal'
import { formatResearchAttribute, type Fellow, type FellowRelation, type HistoryResearchRank } from '@/features/fellows/data'
import {
  activeAttributes,
  carriedPuppetSkill,
  clampSlots,
  clampStage,
  evaluatePuppets,
  hasMarks,
  clampSkillLevel,
  historyRankFor,
  puppetSkillBase,
  puppetSkillScore,
  talentMark,
  TIER_STEP_PER_MILLE,
  type ActiveAttribute,
  type BondsDraft,
  type PuppetSkillScore,
} from '@/features/score/bonds'
import LevelAllDialog from '@/features/score/LevelAllDialog'
import { Stepper } from '@/features/score/Stepper'
import { useCharacterReadOnly } from '@/features/characters/CharacterProvider'
import type { GenusResult, Rating, SpeciesResult } from '@/features/score/data'
import FellowSkillCalculator from '@/features/score/FellowSkillSection'
import { carriedFellowSkill, fellowBase, fellowS, relationResearchPoints, starMap } from '@/features/score/fellowSkill'
import { GroupSection } from '@/features/score/GroupSection'
import { Tip, TipOn } from '@/features/score/Tip'
import { portraitUrl, type PartnerScoring, type SecretPartner } from '@/features/secretpartners/data'
import { SERVER_LAUNCH, serverDay } from '@/lib/server'
import { TYPE } from '@/lib/typography'

/** The client's module keys for the two items this section derives. */
export const PUPPET_GAIN_MODULE = 'Bonds_PartnerGain'
export const PUPPET_SKILL_MODULE = 'Bonds_PartnerSkill'
export const HISTORY_MODULE = 'Bonds_FellowGain'
export const FELLOW_SKILL_MODULE = 'Bonds_FellowSkill'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'

/** A figure for a tooltip: at most two decimals, grouped. */
const fmt = (value: number) => Number(value.toFixed(2)).toLocaleString()

export type BondsData = {
  partners: SecretPartner[] | null
  /** Already capped to today's puppet level (`scoringOnDay`); `levelUnlockDays` is kept whole. */
  scoring: PartnerScoring | null
  ranks: HistoryResearchRank[] | null
  fellows: Fellow[] | null
  relations: FellowRelation[] | null
  /** The highest skill level the chosen role and divinity level allow; null until the rating loads. */
  skillCap: number | null
  /** Skill levels relics add on top of the shared level; shown, never scored. */
  relicSkillBonus: number
}

const KNOWN = new Set([PUPPET_GAIN_MODULE, PUPPET_SKILL_MODULE, HISTORY_MODULE, FELLOW_SKILL_MODULE])

/**
 * The 非凡人物 group: all four items derived.
 *
 * Below the ledger sit two panels side by side — 秘偶 (the lineup, which
 * scores 秘偶属性 and 秘偶技能) and 人脉 (the roster, which scores 人脉技能).
 * Each opens on one row level with the other's: the deploy slots and carried
 * skill, and the 历史研究 rank the relations add up to. The derived scores
 * are computed by the page (they feed the same `evaluate` as everything else)
 * and arrive here already inside `group`.
 */
export default function BondsSection({
  group,
  rating,
  data,
  draft,
  setDraft,
}: {
  group: GenusResult
  rating: Rating
  data: BondsData
  draft: BondsDraft
  setDraft: (update: (prev: BondsDraft) => BondsDraft) => void
}) {
  const { t } = useTranslation()
  const unavailable = <p className={TYPE.body}>{t('bonds.unavailable')}</p>
  const formula = useBondsFormula(data, draft)

  return (
    <GroupSection
      group={group}
      rating={rating}
      present={(item) => (KNOWN.has(item.species.module) ? { kind: 'derived' } : { kind: 'unsupported' })}
      formula={formula}
      after={
        <>
          <div className="gz-split">
            {data.partners && data.scoring ? (
              <PuppetLineup partners={data.partners} scoring={data.scoring} draft={draft} setDraft={setDraft} />
            ) : unavailable}
            {data.fellows && data.relations ? (
              <FellowSkillCalculator fellows={data.fellows} relations={data.relations} draft={draft} setDraft={setDraft}
                lead={data.ranks ? <HistoryResearch ranks={data.ranks} relations={data.relations} draft={draft} /> : null} />
            ) : unavailable}
          </div>
        </>
      }
    />
  )
}

/* ------------------------------------------------------------------ formulas */

/** The tier multiplier `1 + 0.215 × (tier − 1)`, as the integer arithmetic in `puppetSkillScore` has it. */
function tierMultiplier(tier: number): string {
  return String((1000 + TIER_STEP_PER_MILLE * (tier - 1)) / 1000)
}

/**
 * How each of the four items is calculated, with the draft's own figures put
 * through the same functions the page scores with, so the question mark on a
 * ledger line shows the arithmetic behind the number beside it.
 */
function useBondsFormula(data: BondsData, draft: BondsDraft): (item: SpeciesResult) => ReactNode {
  const { t } = useTranslation()
  const skillLevel = clampSkillLevel(draft.puppetSkillLevel)
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join('\n\n')

  return (item) => {
    const { partners, scoring, ranks, fellows, relations } = data
    switch (item.species.module) {
      case PUPPET_GAIN_MODULE: {
        if (!partners || !scoring) return null
        const result = evaluatePuppets(draft.puppets, partners, scoring, draft.dominateSlots)
        const marks = (deployed: boolean) => result.rows.filter((row) => row.dominated === deployed).reduce((sum, row) => sum + row.mark, 0)
        const rates = { inRate: scoring.inDominateRate, outRate: scoring.nonDominateRate }
        return join(
          t('bonds.formula', rates),
          t('bonds.formulaLive', {
            ...rates,
            deployed: fmt(marks(true)),
            bench: fmt(marks(false)),
            sum: fmt(result.rows.reduce((sum, row) => sum + row.score, 0)),
            total: result.total.toLocaleString(),
          }),
        )
      }
      case PUPPET_SKILL_MODULE: {
        const carried = partners && scoring ? carriedPuppetSkill(draft.puppets, partners, scoring, draft.skillPartnerId, skillLevel) : null
        const base = carried ? puppetSkillBase(carried.partner.quality, skillLevel) : undefined
        const live = carried && base !== undefined && carried.result.tier >= 1
          ? t('bonds.skillFormulaLive', {
              name: carried.partner.name,
              tier: carried.result.tier,
              level: skillLevel,
              base: base.toLocaleString(),
              mult: tierMultiplier(carried.result.tier),
              score: carried.result.score.toLocaleString(),
            })
          : t('bonds.skillNone')
        return join(t('bonds.skillFormula'), live, carried?.result.estimated ? t('bonds.skillEstimated') : null)
      }
      case FELLOW_SKILL_MODULE: {
        const carried = fellows && relations
          ? carriedFellowSkill(draft.fellows ?? [], fellows, relations, draft.fellowSkillId, draft.fellowRelationId, skillLevel)
          : null
        const live = carried
          ? t('bonds.fellowFormulaLive', {
              name: carried.fellow.shortName || carried.fellow.name,
              star: carried.star,
              base: fellowBase(carried.fellow.quality, skillLevel).toLocaleString(),
              // S is kept in twentieths; shown as the plain number the formula names.
              s: fmt(fellowS(carried.star, carried.relation?.quality ?? 0, carried.tier).scaled / 20),
              score: carried.score.toLocaleString(),
              plain: carried.base.toLocaleString(),
              added: (carried.score - carried.base).toLocaleString(),
            })
          : t('bonds.fellowNone')
        return join(t('bonds.fellowFormula'), live, carried?.estimated ? t('bonds.fellowTipEstimated') : null)
      }
      case HISTORY_MODULE: {
        if (!ranks || !relations) return t('bonds.historyFormula')
        const points = relationResearchPoints(relations, starMap(draft.fellows ?? []))
        const rank = historyRankFor(ranks, points)
        return join(
          t('bonds.historyFormula'),
          rank
            ? t('bonds.historyFormulaLive', { points: points.toLocaleString(), rank: rank.name, mark: rank.mark.toLocaleString() })
            : t('bonds.historyFormulaNone', { points: points.toLocaleString() }),
        )
      }
      default:
        return null
    }
  }
}

/* ------------------------------------------------------------- puppet lineup */

/**
 * Which puppet's skill is carried: a field showing the choice, opening a
 * fixed-size dialog of the owned puppets, best skill first, after an automatic
 * option that always takes the best.
 */
function CarryPicker({ options, auto, carried, readOnly, onPick }: {
  options: { partner: SecretPartner; skill: PuppetSkillScore }[]
  auto: boolean
  /** The puppet whose skill is carried now, chosen or automatic. */
  carried: SecretPartner | null
  readOnly: boolean
  onPick: (partnerId: number | null) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const pick = (partnerId: number | null) => { onPick(partnerId); setOpen(false) }
  const current = carried ? `${carried.name} · ${carried.skill.name}` : '—'
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={`gz-select gz-carry-field ${FOCUS}`} disabled={readOnly} data-testid="bonds-carry-slot">
          <span>{auto ? `${t('bonds.carryAuto')} · ${current}` : current}</span>
          <IconChevronDown aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent className="gz-dlg gz-carry-dlg" data-testid="bonds-carry-dialog">
        <DialogHead title={t('bonds.carryTitle')} />
        <div className="gz-carry-list">
          <button type="button" className="gz-carry-opt auto" aria-pressed={auto} onClick={() => pick(null)}
            data-testid="bonds-carry-auto">
            <span className="ic"><IconSparkles stroke={1.8} aria-hidden /></span>
            <span className="t"><b>{t('bonds.carryAuto')}</b><small>{t('bonds.skillPuppetBest')}</small></span>
          </button>
          {options.map(({ partner, skill }) => (
            <button key={partner.id} type="button" className="gz-carry-opt" aria-pressed={!auto && carried?.id === partner.id}
              onClick={() => pick(partner.id)} data-testid={`bonds-carry-option-${partner.id}`}>
              <IconTile quality={partner.quality} src={partner.portrait ? portraitUrl(partner.portrait) : undefined} alt=""
                label={partner.name.slice(0, 1)} className="ic" />
              <span className="t"><b>{partner.name}</b><small>{partner.skill.name} · {t('bonds.carryTier', { tier: skill.tier })}</small></span>
              <span className="s num">{skill.score.toLocaleString()}{skill.estimated ? '*' : ''}</span>
            </button>
          ))}
          {options.length === 0 ? <p className="note">{t('bonds.carryEmpty')}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The calendar date a server day starts on (08:00 UTC+8, which is 00:00 UTC), as YYYY-MM-DD. */
function serverDayDate(day: number): string {
  const launch = Date.UTC(SERVER_LAUNCH.year, SERVER_LAUNCH.month - 1, SERVER_LAUNCH.day)
  return new Date(launch + (day - 1) * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Today's puppet level cap, with the day it was read on and when the next
 * level opens. `scoring.maxStar` is already the day's cap; the unlock table
 * still lists every level, so the next one's day is the entry after the cap.
 */
function LevelCap({ scoring }: { scoring: PartnerScoring }) {
  const { t } = useTranslation()
  const day = useMemo(() => serverDay(), [])
  const days = scoring.levelUnlockDays ?? []
  const nextDay = days[scoring.maxStar]
  const content = [
    t('bonds.levelCapTip', { day, max: scoring.maxStar }),
    days.length === 0
      ? null
      : nextDay === undefined
        ? t('bonds.levelCapFull')
        : t('bonds.levelCapNext', { level: scoring.maxStar + 1, day: nextDay, date: serverDayDate(nextDay) }),
  ].filter(Boolean).join('\n')
  return (
    <TipOn content={content} title={t('bonds.levelCap', { max: scoring.maxStar })}>
      <span className="meta num gz-hov" data-testid="bonds-level-cap">{t('bonds.levelCap', { max: scoring.maxStar })}</span>
    </TipOn>
  )
}

function formatTotal(attribute: ActiveAttribute) {
  return attribute.format === 'percent'
    ? `${Number((attribute.value * 100).toFixed(2))}%`
    : Number(attribute.value.toFixed(2)).toLocaleString()
}

/** Every attribute the owned puppets grant right now, summed, behind one mark. */
function ActiveAttributesTip({ totals, scoring }: { totals: ActiveAttribute[]; scoring: PartnerScoring }) {
  const { t } = useTranslation()
  const content = (
    <>
      {totals.length === 0 ? (
        <p>{t('bonds.activeAttributesNone')}</p>
      ) : (
        <dl className="grid gap-x-4" data-testid="bonds-attributes">
          {totals.map((attribute) => (
            <div key={attribute.key} className="flex justify-between gap-4" data-testid={`bonds-attribute-${attribute.key}`}>
              <dt>{attribute.name} <span className="opacity-70">({t('bonds.activeAttributeSources', { count: attribute.sources })})</span></dt>
              <dd className="tabular-nums">+{formatTotal(attribute)}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-1 opacity-70">{t('bonds.activeAttributesHint', { inRate: scoring.inDominateRate, outRate: scoring.nonDominateRate })}</p>
    </>
  )
  return <Tip kind="info" title={t('bonds.activeAttributes')} content={content} on={totals.length > 0} testId="bonds-attributes-tip" />
}

/** What one puppet is worth: its attributes deployed and not, and its skill. */
function puppetTip(
  t: TFunction,
  partner: SecretPartner,
  level: number,
  scoring: PartnerScoring,
  skillLevel: number,
): string {
  if (level < 1) return t('bonds.puppetTipUnowned')
  const mark = talentMark(partner, level)
  const skill = puppetSkillScore(partner, level, skillLevel)
  const nextTier = partner.upgrades.find((upgrade) => upgrade.tier === skill.tier + 1)
  return [
    hasMarks(partner)
      ? `${t('bonds.puppetTipDeployed', { score: fmt(mark * scoring.inDominateRate) })}\n${t('bonds.puppetTipBench', { score: fmt(mark * scoring.nonDominateRate) })}`
      : t('bonds.puppetTipNoMarks'),
    t('bonds.puppetTipSkill', { name: partner.skill.name, tier: skill.tier, score: skill.score.toLocaleString() }) + (skill.estimated ? '*' : ''),
    nextTier ? t('bonds.skillNextTier', { level: nextTier.requiredStage }) : null,
    skill.estimated ? t('bonds.skillEstimated') : null,
  ].filter(Boolean).join('\n')
}

/**
 * The 秘偶 panel: 秘偶属性 and 秘偶技能 off one roster, the way the game's own
 * lineup screen works. A click on the card deploys or stands down; the stepper
 * on it sets the level (0 = not owned).
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
  const readOnly = useCharacterReadOnly()
  const skillLevel = clampSkillLevel(draft.puppetSkillLevel)
  const result = useMemo(
    () => evaluatePuppets(draft.puppets, partners, scoring, draft.dominateSlots),
    [draft.puppets, draft.dominateSlots, partners, scoring],
  )
  const totals = useMemo(() => activeAttributes(result, scoring), [result, scoring])
  const carried = carriedPuppetSkill(draft.puppets, partners, scoring, draft.skillPartnerId, skillLevel)
  const entries = new Map(draft.puppets.map((entry) => [entry.partnerId, entry]))
  const rows = new Map(result.rows.map((row) => [row.partner.id, row]))
  const slotsFull = result.dominated >= result.slots
  const autoCarry = !result.rows.some((row) => row.partner.id === draft.skillPartnerId)
  // Best first, so the puppets a player is likely to own lead the grid.
  const ordered = useMemo(() => [...partners].sort((a, b) => b.quality - a.quality || a.id - b.id), [partners])

  // Each owned puppet's attributes as if deployed, and its skill for the carry picker.
  const owned = result.rows.map((row) => {
    const stage = clampStage(row.entry.stage, scoring)
    return {
      partner: row.partner,
      deployScore: hasMarks(row.partner) ? talentMark(row.partner, stage) * scoring.inDominateRate : null,
      skill: puppetSkillScore(row.partner, stage, skillLevel),
    }
  })
  const carryOptions = [...owned].sort((a, b) => b.skill.score - a.skill.score || b.partner.quality - a.partner.quality)

  const update = (partnerId: number, patch: Partial<{ stage: number; dominated: boolean }>) =>
    setDraft((prev) => {
      const exists = prev.puppets.some((entry) => entry.partnerId === partnerId)
      const puppets = exists
        ? prev.puppets.map((entry) => (entry.partnerId === partnerId ? { ...entry, ...patch } : entry))
        : [...prev.puppets, { partnerId, stage: 0, dominated: false, ...patch }]
      return { ...prev, puppets }
    })

  // One click fills the slots with the owned puppets worth most deployed, and stands the rest down.
  const deployBest = () => {
    const best = new Set(
      owned
        .filter((row) => row.deployScore !== null)
        .sort((a, b) => (b.deployScore ?? 0) - (a.deployScore ?? 0) || b.partner.quality - a.partner.quality)
        .slice(0, result.slots)
        .map((row) => row.partner.id),
    )
    setDraft((prev) => ({ ...prev, puppets: prev.puppets.map((entry) => ({ ...entry, dominated: best.has(entry.partnerId) })) }))
  }

  return (
    <div className="gz-panel gz-tint" data-testid="bonds-puppets">
      <div className="gz-panel-head">
        <h3>{t('bonds.puppetsTitle')}</h3>
        <ActiveAttributesTip totals={totals} scoring={scoring} />
        <span className="meta num" data-testid="bonds-dominated">{t('bonds.dominated', { used: result.dominated, slots: result.slots })}</span>
        <LevelCap scoring={scoring} />
        <div className="acts">
          <button type="button" disabled={owned.length === 0 || result.slots === 0} onClick={deployBest} className="gz-chip"
            data-testid="bonds-deploy-best">
            {t('bonds.deployBest')}
          </button>
          {/* Every puppet, owned or not: levelling an unowned one adds it. */}
          <LevelAllDialog title={t('bonds.levelAllPuppets')} hint={t('bonds.levelAllPuppetsHint')} label={t('bonds.levelAllPuppetsLabel')}
            apply={t('bonds.levelAllPuppetsApply')} min={1} max={scoring.maxStar} initial={scoring.maxStar}
            format={(value) => String(value)} disabled={readOnly} testId="bonds-level-all"
            onApply={(value) => setDraft((prev) => {
              const stage = clampStage(value, scoring)
              const byId = new Map(prev.puppets.map((entry) => [entry.partnerId, entry]))
              return {
                ...prev,
                puppets: partners.map((partner) => {
                  const entry = byId.get(partner.id)
                  return entry ? { ...entry, stage } : { partnerId: partner.id, stage, dominated: false }
                }),
              }
            })} />
        </div>
      </div>

      <div className="gz-pickrow gz-foot-row" data-testid="bonds-lineup">
        <span>{t('bonds.slots')}</span>
        <Stepper value={result.slots} min={0} max={scoring.maxDominateSlots} label={t('bonds.slots')} testId="bonds-slots"
          disabled={readOnly} onChange={(value) => setDraft((prev) => ({ ...prev, dominateSlots: clampSlots(value, scoring) }))} />
        <span>{t('bonds.skillPuppet')}</span>
        <CarryPicker options={carryOptions} auto={autoCarry} carried={carried?.partner ?? null} readOnly={readOnly}
          onPick={(partnerId) => setDraft((prev) => ({ ...prev, skillPartnerId: partnerId }))} />
      </div>

      <ul className="gz-people pups">
        {ordered.map((partner) => {
          const entry = entries.get(partner.id)
          const row = rows.get(partner.id)
          const level = clampStage(entry?.stage ?? 0, scoring)
          const isDeployed = row?.dominated ?? false
          const isCarried = carried?.partner.id === partner.id
          // The stored flag, not the effective one: a puppet still marked
          // deployed after the slot count dropped must stay clickable so the
          // mark can be cleared, rather than lurking until a slot frees up.
          const stored = entry?.dominated ?? false
          const canDeploy = !readOnly && level >= 1 && (stored || !slotsFull)
          return (
            // The whole card toggles the deploy, the stepper and the name's
            // tooltip aside. The portrait stays the keyboard's button; its
            // click bubbles here like any other.
            <li key={partner.id} className={`gz-person ${isDeployed ? 'on' : ''} ${level < 1 ? 'zero' : ''} ${canDeploy ? '' : 'fixed'}`}
              data-testid={`bonds-puppet-${partner.id}`}
              onClick={(event) => {
                if (!canDeploy || (event.target as HTMLElement).closest('.gz-mini, .gz-hov')) return
                update(partner.id, { dominated: !stored })
              }}>
              <button
                type="button"
                aria-pressed={stored}
                disabled={!canDeploy}
                aria-label={t(stored ? 'bonds.undeploy' : 'bonds.deployToggle', { name: partner.name })}
                className="gz-face"
                data-testid={`bonds-dominate-${partner.id}`}
              >
                <IconTile quality={partner.quality} src={partner.portrait ? portraitUrl(partner.portrait) : undefined} alt={partner.name} label={partner.name.slice(0, 1)} className="size-14" />
              </button>
              {isDeployed ? <span className="gz-flag">{t('bonds.dominate')}</span> : null}
              {isCarried ? (
                <span className="gz-carry" data-testid={`bonds-carried-${partner.id}`}>{t('bonds.skillCarried')}</span>
              ) : null}
              <TipOn title={partner.name} content={puppetTip(t, partner, level, scoring, skillLevel)}>
                <b className="gz-hov" data-testid={`bonds-puppet-tip-${partner.id}`}>{partner.name}</b>
              </TipOn>
              <Stepper variant="mini" value={level} min={0} max={scoring.maxStar} label={t('bonds.levelFor', { name: partner.name })}
                testId={`bonds-stage-${partner.id}`}
                onChange={(value) => {
                  const next = clampStage(value, scoring)
                  if (next < 1) {
                    update(partner.id, { stage: 0, dominated: false })
                    setDraft((prev) => (prev.skillPartnerId === partner.id ? { ...prev, skillPartnerId: null } : prev))
                  } else update(partner.id, { stage: next })
                }} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ----------------------------------------------------------------- history */

/** The 历史研究 rank: it follows from the relations' tiers, which follow from the stars above. */
function HistoryResearch({ ranks, relations, draft }: {
  ranks: HistoryResearchRank[]
  relations: FellowRelation[]
  draft: BondsDraft
}) {
  const { t, i18n } = useTranslation()
  const total = relationResearchPoints(relations, starMap(draft.fellows ?? []))
  const current = historyRankFor(ranks, total)
  const next = [...ranks].sort((a, b) => a.score - b.score).find((rank) => rank.score > total)
  // A rank's attributes are cumulative, so the rank reached holds the whole bonus.
  const bonuses = current ? (
    <dl className="grid gap-x-4" data-testid="bonds-history-attributes">
      {current.attributes.map((attribute) => (
        <div key={attribute.key} className="flex justify-between gap-4">
          <dt>{attribute.name}</dt>
          <dd className="tabular-nums">{formatResearchAttribute(attribute, i18n.language)}</dd>
        </div>
      ))}
    </dl>
  ) : t('bonds.historyAttributesNone')

  return (
    <div className="gz-research gz-foot-row" data-testid="bonds-history">
      <span className="rank">
        <span data-testid="bonds-research-total">{t('bonds.researchTitle')}{'　'}{current ? current.name : t('bonds.rankNone')}</span>
        <Tip kind="info" on={current !== null} content={bonuses} testId="bonds-history-tip"
          title={current ? t('bonds.historyAttributes', { name: current.name }) : t('bonds.researchTitle')} />
      </span>
      <small className="num">
        {t('bonds.researchLine', { points: total.toLocaleString() })}
        {next ? ` · ${t('bonds.researchNext', { name: next.name, points: next.score.toLocaleString() })}` : ` · ${t('bonds.rankTop')}`}
      </small>
    </div>
  )
}
