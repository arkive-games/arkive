import { useMemo, useState } from 'react'
import { IconChevronDown, IconSparkles } from '@tabler/icons-react'
import { Dialog, DialogContent, DialogTrigger } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { DialogHead } from '@/features/equipment/EquipmentSection'
import { IconTile } from '@/features/equipment/PickerModal'
import type { Fellow, FellowRelation, HistoryResearchRank } from '@/features/fellows/data'
import {
  carriedPuppetSkill,
  clampSlots,
  clampStage,
  evaluatePuppets,
  hasMarks,
  clampSkillLevel,
  historyRankFor,
  puppetSkillScore,
  talentMark,
  type BondsDraft,
} from '@/features/score/bonds'
import LevelAllDialog from '@/features/score/LevelAllDialog'
import { Stepper } from '@/features/score/Stepper'
import { useCharacterReadOnly } from '@/features/characters/CharacterProvider'
import type { GenusResult, Rating } from '@/features/score/data'
import FellowSkillCalculator from '@/features/score/FellowSkillSection'
import { relationResearchPoints, starMap } from '@/features/score/fellowSkill'
import { GroupSection } from '@/features/score/GroupSection'
import { portraitUrl, type PartnerScoring, type SecretPartner } from '@/features/secretpartners/data'
import { TYPE } from '@/lib/typography'

/** The client's module keys for the two items this section derives. */
export const PUPPET_GAIN_MODULE = 'Bonds_PartnerGain'
export const PUPPET_SKILL_MODULE = 'Bonds_PartnerSkill'
export const HISTORY_MODULE = 'Bonds_FellowGain'
export const FELLOW_SKILL_MODULE = 'Bonds_FellowSkill'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'

export type BondsData = {
  partners: SecretPartner[] | null
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

  return (
    <GroupSection
      group={group}
      rating={rating}
      present={(item) => (KNOWN.has(item.species.module) ? { kind: 'derived' } : { kind: 'unsupported' })}
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

/* ------------------------------------------------------------- puppet lineup */

/**
 * Which puppet's skill is carried: a field showing the choice, opening a
 * fixed-size dialog of the owned puppets, best skill first, after an automatic
 * option that always takes the best.
 */
function CarryPicker({ options, auto, carried, readOnly, onPick }: {
  options: { partner: SecretPartner; skill: { score: number } }[]
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
        <button type="button" className={`gz-select gz-carry-field ${FOCUS}`} disabled={readOnly} aria-label={t('bonds.skillPuppet')}
          data-testid="bonds-carry-slot">
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
              <span className="t"><b>{partner.name}</b><small>{partner.skill.name}</small></span>
              <span className="s num">{skill.score.toLocaleString()}</span>
            </button>
          ))}
          {options.length === 0 ? <p className="note">{t('bonds.carryEmpty')}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
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
        <span className="meta num" data-testid="bonds-dominated">{t('bonds.dominated', { used: result.dominated, slots: result.slots })}</span>
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
            // The whole card toggles the deploy, the stepper aside. The portrait
            // stays the keyboard's button; its click bubbles here like any other.
            <li key={partner.id} className={`gz-person ${isDeployed ? 'on' : ''} ${level < 1 ? 'zero' : ''} ${canDeploy ? '' : 'fixed'}`}
              data-testid={`bonds-puppet-${partner.id}`}
              onClick={(event) => {
                if (!canDeploy || (event.target as HTMLElement).closest('.gz-mini')) return
                update(partner.id, { dominated: !stored })
              }}>
              <button
                type="button"
                aria-pressed={stored}
                disabled={!canDeploy}
                title={partner.name}
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
              <b title={partner.name}>{partner.name}</b>
              <Stepper variant="mini" value={level} min={0} max={scoring.maxStar} label={t('bonds.levelFor', { name: partner.name })}                testId={`bonds-stage-${partner.id}`}
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
  const { t } = useTranslation()
  const total = relationResearchPoints(relations, starMap(draft.fellows ?? []))
  const current = historyRankFor(ranks, total)
  const next = [...ranks].sort((a, b) => a.score - b.score).find((rank) => rank.score > total)

  return (
    <div className="gz-research gz-foot-row" data-testid="bonds-history">
      <span className="rank" data-testid="bonds-research-total">{t('bonds.researchTitle')}{'　'}{current ? current.name : t('bonds.rankNone')}</span>
      <small className="num">
        {t('bonds.researchLine', { points: total.toLocaleString() })}
        {next ? ` · ${t('bonds.researchNext', { name: next.name, points: next.score.toLocaleString() })}` : ` · ${t('bonds.rankTop')}`}
      </small>
    </div>
  )
}
