import { useCallback, useMemo, useState, type ReactNode } from 'react'
import RangeField from '@/components/RangeField'
import PickerModal, { IconTile, type PickerOption } from '@/features/equipment/PickerModal'
import { gmzzMemory, isFiniteNumber, isNullableNumber, isRecord } from '@/lib/memory'
import { TYPE } from '@/lib/typography'
import { Input } from '@gamemap/ui'
import { useMemory } from '@gamemap/state-memory'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import {
  activeSuits,
  equipmentIconUrl,
  affixBounds,
  averageProgress,
  clampAffixValue,
  counterpartFor,
  evaluatePiece,
  familiesFor,
  itemsForSlot,
  maxAffixesFor,
  maxStageFor,
  newPiece,
  progressBounds,
  refineFromProgress,
  scoredSlots,
  statLines,
  suitOf,
  suitThreshold,
  suitTierFor,
  type AffixTier,
  type ChosenAffix,
  type EquipItem,
  type Equipment,
  type Grace,
  type PieceResult,
  type PieceState,
  type ScoredAffix,
  type StatRange,
  type Suit,
} from '@/features/equipment/data'

type LayoutMode = 'rows' | 'cards'

/**
 * The pip the game draws beside an affix: gold for extraordinary, grey for
 * normal, red for contaminated — the same ◆ the grace's pips use, so the two
 * read as one system.
 */
const TIER_PIP: Record<AffixTier, { className: string; labelKey: string }> = {
  extraordinary: { className: 'text-amber-400', labelKey: 'equip.tierExtraordinary' },
  normal: { className: 'text-zinc-400', labelKey: 'equip.tierNormal' },
  contaminated: { className: 'text-red-500', labelKey: 'equip.tierContaminated' },
  special: { className: 'text-sky-400', labelKey: 'equip.tierSpecial' },
}

/**
 * `Suit.tag` is the game's own bucket for a suit's items — 冒险套装 is worn
 * for PVE, 竞技套装 for PVP. Keyed on the tag text because that is what the
 * dataset carries; an unknown tag shows as itself rather than not at all.
 */
const SUIT_KIND_KEY: Record<string, string> = {
  冒险套装: 'equip.kindAdventure',
  竞技套装: 'equip.kindArena',
}

/** A sanity ceiling for the hand-typed affix values; the game has no real one. */
const SCORE_CAP = 999999

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const INPUT_CLASS = `h-7 border-border bg-background px-1.5 ${TYPE.control} tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]`
const SELECT_CLASS = `h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none ${FOCUS}`
const COMPACT_SELECT_CLASS = `h-7 w-full min-w-0 rounded-md border border-border bg-background px-1 ${TYPE.control} text-foreground outline-none ${FOCUS}`
const LABEL_CLASS = `mb-0.5 block ${TYPE.label}`
const BUTTON_CLASS = `inline-flex items-center justify-center rounded-md border border-border ${TYPE.control} font-medium text-muted-foreground transition-colors hover:border-[color:var(--arkive-nav-accent)] hover:text-foreground disabled:opacity-50 ${FOCUS}`
const SECTION_CLASS = 'border-t border-border/70 p-2.5'
const BADGE_CLASS = `inline-block shrink-0 rounded border border-border px-1 align-middle ${TYPE.control} font-medium leading-4 text-muted-foreground`
/** A grace's pips: one gold ◆ per extraordinary affix it counts, and no grey ones filling up to four. */
const PIP_CLASS = 'text-[color:var(--arkive-nav-accent)]'
/**
 * One affix: pip, stat, value, Mark, remove. The value and Mark columns are
 * fixed so they line up down the list and the stat takes what is left.
 */
const AFFIX_ROW_CLASS = 'grid min-w-0 grid-cols-[auto_minmax(0,1fr)_3.75rem_4rem_auto] items-center gap-1'
/**
 * The rows layout's columns: item, stats, enhancement, affixes, brand. Shared
 * by the header and every row so the two cannot drift apart. Five columns only
 * fit from `xl` up — at 1100px the affix column was squeezed to a word a line —
 * so below that a row stacks its cells with their own labels. The enhancement
 * column is wide because its stage track labels all nine steps.
 */
const ROW_GRID =
  'xl:grid-cols-[minmax(10rem,12rem)_minmax(10rem,11rem)_minmax(16rem,19rem)_minmax(0,2fr)_minmax(9rem,12rem)] xl:gap-5'

/* ------------------------------------------------------------- persistence */

type BatchState = { stage: number; badge: number }

/** The loadout as stored: what was picked, before it is checked against the dataset. */
type EquipmentDraft = { pieces: PieceState[]; batch: BatchState; suitChoice: number | null }

function isChosenAffix(value: unknown): value is ChosenAffix {
  return isRecord(value) && typeof value.family === 'string' && isFiniteNumber(value.value)
}

function isPieceState(value: unknown): value is PieceState {
  return (
    isRecord(value) &&
    isFiniteNumber(value.slot) &&
    isNullableNumber(value.itemId) &&
    isFiniteNumber(value.enhanceStage) &&
    isFiniteNumber(value.refinePercent) &&
    Array.isArray(value.affixes) &&
    value.affixes.every(isChosenAffix)
  )
}

function isEquipmentDraft(value: unknown): value is EquipmentDraft {
  return (
    isRecord(value) &&
    Array.isArray(value.pieces) &&
    value.pieces.every(isPieceState) &&
    isRecord(value.batch) &&
    isFiniteNumber(value.batch.stage) &&
    isFiniteNumber(value.batch.badge) &&
    isNullableNumber(value.suitChoice)
  )
}

/**
 * The loadout survives a reload. A calculator's inputs are a draft in the
 * state-memory sense — costly to retype, not a record of progress — so it takes
 * that class's thirty-day life. Only the fields listed in `isEquipmentDraft`
 * are ever read back.
 */
const equipmentDraft = gmzzMemory.draft('score/equipment', {
  default: (): EquipmentDraft => ({ pieces: [], batch: { stage: 0, badge: 0 }, suitChoice: null }),
  validate: isEquipmentDraft,
})

const equipmentLayout = gmzzMemory.preference('score/equipment-layout', {
  default: 'rows' as LayoutMode,
  validate: (value: unknown): value is LayoutMode => value === 'rows' || value === 'cards',
})

/**
 * A stored piece checked against the dataset it is about to be scored with.
 *
 * The draft outlives the data: an item can leave the dataset, a ladder can
 * shorten, and a weapon belongs to one pathway. Each is corrected here rather
 * than trusted, so a stale draft degrades to an empty slot instead of a piece
 * that scores nothing for no visible reason. A weapon of another pathway is
 * swapped for this pathway's counterpart — every weapon has one per pathway —
 * and only dropped when there is none. The stored draft itself is left alone,
 * so switching the pathway back brings the original weapon back.
 */
function sanitizePiece(equipment: Equipment, piece: PieceState, professionId: number | null): PieceState {
  const maxStage = maxStageFor(equipment, piece.slot)
  const stored = equipment.items.find((item) => item.id === piece.itemId && item.slot === piece.slot) ?? null
  const worn = stored ? counterpartFor(equipment, stored, professionId) : null
  const enhanceStage = Math.min(Math.max(Math.trunc(piece.enhanceStage), 0), maxStage)
  const families = familiesFor(equipment, piece.slot)
  return {
    slot: piece.slot,
    itemId: worn?.id ?? null,
    enhanceStage,
    refinePercent: enhanceStage === 0 ? 0 : Math.min(Math.max(Math.trunc(piece.refinePercent), 0), 100),
    affixes: piece.affixes
      .filter((affix) => families.includes(affix.family))
      .slice(0, maxAffixesFor(equipment, piece.slot))
      .map((affix) => ({ family: affix.family, value: clampAffixValue(equipment, piece.slot, affix.family, readInt(affix.value, -SCORE_CAP, SCORE_CAP)) })),
  }
}

/* ------------------------------------------------------------------ helpers */

function readInt(raw: string | number, min: number, max: number): number {
  const whole = Math.trunc(Number(raw))
  if (!Number.isFinite(whole)) return 0
  return Math.min(Math.max(whole, min), max)
}

/** A fresh affix of the slot's first family, at the top of its ladder or 0 if it has none. */
function affixFor(equipment: Equipment, slot: number, family?: string): ChosenAffix {
  const families = familiesFor(equipment, slot)
  const chosen = family !== undefined && families.includes(family) ? family : families[0] ?? ''
  const ladder = equipment.affixes.bySlot[String(slot)]
  const top = ladder?.extraordinary?.[chosen]?.[0]?.[1] ?? ladder?.normal?.[chosen]?.[0]?.[1] ?? 0
  return { family: chosen, value: top }
}

/** The PVE/PVP marker for an item's suit; empty for an unaffiliated item. */
function suitKind(t: TFunction, suit: Suit | null): string {
  if (!suit) return ''
  const key = SUIT_KIND_KEY[suit.tag ?? '']
  return key ? t(key) : suit.tag ?? ''
}

/** `hidden` keeps the label for screens narrower than the rows grid, and screen readers, only. */
function Cell({
  label,
  hidden = false,
  className = '',
  children,
}: {
  label: string
  hidden?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className={`${LABEL_CLASS} ${hidden ? 'xl:sr-only' : ''}`}>{label}</span>
      {children}
    </div>
  )
}

type FieldProps = { label: string; testId: string }

/**
 * An integer field that may be left blank. Blank means 0, but the box is not
 * snapped to "0" while it is being edited: clearing it to retype would
 * otherwise leave a "0" the next digits append to. `draft` holds the raw text
 * while the field has focus and is dropped on blur, so an outside change still
 * shows through. `commit` runs on blur with the value as typed, for a bound
 * that must not bite mid-keystroke — clamping "3" up to 48 on the way to
 * "308" would make the number untypable.
 */
function NumberField({
  value,
  min,
  max,
  placeholder = '0',
  label,
  testId,
  onValue,
  commit,
}: FieldProps & {
  value: number
  min: number
  max: number
  placeholder?: string
  onValue: (value: number) => void
  commit?: (value: number) => number
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft ?? (value === 0 ? '' : value)}
      placeholder={placeholder}
      onChange={(event) => {
        const raw = event.target.value
        setDraft(raw)
        onValue(raw.trim() === '' ? 0 : readInt(raw, min, max))
      }}
      onBlur={() => {
        setDraft(null)
        if (commit) {
          const settled = commit(value)
          if (settled !== value) onValue(settled)
        }
      }}
      className={INPUT_CLASS}
      aria-label={label}
      data-testid={testId}
    />
  )
}

function Picker({
  value,
  label,
  testId,
  className = SELECT_CLASS,
  onValue,
  children,
}: FieldProps & { value: string | number; className?: string; onValue: (raw: string) => void; children: ReactNode }) {
  return (
    <select
      value={value}
      onChange={(event) => onValue(event.target.value)}
      className={className}
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </select>
  )
}

/**
 * Stage and badge-percentage sliders, the pair the game's own panel shows,
 * stacked, with the score they come to above them.
 *
 * The stage track has every step marked and labelled "+N" above it, the
 * current one picked out; the badge-percentage track below runs over the
 * stage's window of the whole-ladder percentage (25..37 at +3 of 8), which is
 * what is printed under the badge, with its two ends and the current value
 * labelled underneath. So the two tracks sit together in the middle with their
 * scales outermost, and the scales are also the readings — there is no
 * separate reading to keep in step with them. The in-stage refinement that is
 * stored is derived from the badge value. At +0 the window is empty and the
 * second slider is disabled, since there is no stage being refined.
 */
function EnhanceSliders({
  stage,
  badge,
  maxStage,
  testIdPrefix,
  score,
  onStage,
  onBadge,
}: {
  stage: number
  badge: number
  maxStage: number
  testIdPrefix: string
  /** Omitted for the batch sliders, which drive every piece and have no score of their own. */
  score?: number
  onStage: (stage: number) => void
  onBadge: (badge: number) => void
}) {
  const { t } = useTranslation()
  const bounds = progressBounds(maxStage, stage)
  const stageText = (value: number) => t('equip.stageOption', { stage: value })
  const percentText = (value: number) => t('equip.percentValue', { value })
  return (
    <div className="min-w-0">
      {score !== undefined ? (
        <div className={`mb-1.5 ${TYPE.value}`} data-testid={`${testIdPrefix}-enhance-score`}>
          {t('equip.enhanceDerived', { score: score.toLocaleString() })}
        </div>
      ) : null}
      <RangeField
        label={t('equip.enhanceStage')}
        min={0}
        max={maxStage}
        value={stage}
        valueText={stageText(stage)}
        minLabel={stageText(0)}
        maxLabel={stageText(maxStage)}
        tickLabel={stageText}
        labels="above"
        testId={`${testIdPrefix}-stage`}
        onChange={onStage}
      />
      <RangeField
        label={t('equip.refinePercent')}
        min={bounds.min}
        max={bounds.max}
        value={badge}
        valueText={percentText(badge)}
        minLabel={percentText(bounds.min)}
        maxLabel={percentText(bounds.max)}
        showValue
        testId={`${testIdPrefix}-refine`}
        onChange={onBadge}
      />
    </div>
  )
}

/** The badge percentage as the game prints it, kept inside the stage's window. */
function badgeOf(progressPercent: number, maxStage: number, stage: number): number {
  const bounds = progressBounds(maxStage, stage)
  return Math.min(bounds.max, Math.max(bounds.min, Math.floor(progressPercent)))
}

function IconPlaceholder({ item }: { item: EquipItem | null }) {
  return (
    <IconTile
      quality={item?.quality ?? null}
      src={item ? equipmentIconUrl(item.icon) : undefined}
      alt={item?.name ?? ''}
      label="?"
      className="size-14"
    />
  )
}

/** The piece's total, heading its column level with the base, enhancement and reforge scores that head the others. */
function PieceScore({ result }: { result: PieceResult }) {
  const { t } = useTranslation()
  return (
    <div className={`mb-1.5 ${TYPE.value}`} data-testid={`equip-score-${result.state.slot}`}>
      {t('equip.pieceScore', { score: result.total.toLocaleString() })}
    </div>
  )
}

/**
 * The piece's card face, one fact a line: name with `+stage`, the PVE/PVP
 * marker, subtype and gear level. Shared by both layouts.
 */
function PieceHeader({ result, kind, subtitle }: { result: PieceResult; kind: string; subtitle: string }) {
  const { t } = useTranslation()
  return (
    <div className={`min-w-0 ${TYPE.body}`}>
      <div className={`truncate ${TYPE.name}`}>
        {result.item ? result.item.name : t('equip.emptySlot')}
        <span className="ml-1 tabular-nums text-muted-foreground">+{result.state.enhanceStage}</span>
      </div>
      {/* The marker keeps its line even when there is none, so the lines below sit at the same height on every piece. */}
      <div className="h-5">{kind ? <span className={BADGE_CLASS}>{kind}</span> : null}</div>
      <div className="truncate">{subtitle}</div>
    </div>
  )
}

/** `327~607` for a range, `1,960` for a single value. */
function rangeText({ min, max }: StatRange): string {
  return min === max ? min.toLocaleString() : `${min.toLocaleString()}~${max.toLocaleString()}`
}

/**
 * The base score, then the stat block the card reads: the item's base stats,
 * each with what the enhancement adds in brackets after it — `327~607 (+60)`
 * — before reforge and brand. A weapon's 攻击 is its `min~max` range.
 */
function StatBlock({ equipment, result }: { equipment: Equipment; result: PieceResult }) {
  const { t } = useTranslation()
  const lines = statLines(equipment, result.item?.baseStats ?? null, result.enhanceStats)
  return (
    <div className="min-w-0">
      <div className={`mb-1.5 ${TYPE.value}`} data-testid={`equip-base-score-${result.state.slot}`}>
        {t('equip.baseDerived', { score: result.baseScore.toLocaleString() })}
      </div>
      {lines.length === 0 ? (
        <p className={TYPE.body}>{t('equip.noStats')}</p>
      ) : (
        // One grid for the whole block, so the values and the bracketed gains each
        // line up in their own column rather than the gain pushing its value left.
        <dl
          className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] gap-x-1 gap-y-0.5 ${TYPE.valueMuted}`}
          data-testid={`equip-stats-${result.state.slot}`}
        >
          {lines.map((line) => (
            <div key={line.key} className="col-span-3 grid grid-cols-subgrid items-baseline">
              <dt className="truncate">{line.label}</dt>
              <dd className={`text-right ${TYPE.value}`}>{rangeText(line.base)}</dd>
              <dd className="text-emerald-700 dark:text-emerald-300">
                {line.gain.max > 0 ? t('equip.statGain', { gain: `+${rangeText(line.gain)}` }) : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function BrandNote({ result }: { result: PieceResult }) {
  const { t } = useTranslation()
  if (!result.brand) return <p className={TYPE.body}>{t('equip.noBrand')}</p>
  return (
    <div className="min-w-0">
      <div className={`${TYPE.name} text-[color:var(--arkive-nav-accent)]`}>{result.brand.name}</div>
      <p className={`whitespace-pre-line ${TYPE.body}`}>{result.brand.effect}</p>
    </div>
  )
}

type PieceProps = {
  equipment: Equipment
  slotName: string
  kind: string
  result: PieceResult
  onPatch: (patch: Partial<PieceState>) => void
  onOpenPicker: () => void
}
type PieceControlProps = Pick<PieceProps, 'equipment' | 'result' | 'onPatch'>

/** The refinement a freshly chosen stage starts at: complete, or none at +0. */
function refineForStage(stage: number): number {
  return stage > 0 ? 100 : 0
}

function EnhanceControls({ equipment, result, onPatch }: PieceControlProps) {
  const { slot, enhanceStage } = result.state
  const maxStage = maxStageFor(equipment, slot)

  return (
    <EnhanceSliders
      stage={enhanceStage}
      badge={badgeOf(result.progressPercent, maxStage, enhanceStage)}
      maxStage={maxStage}
      testIdPrefix={`equip-${slot}`}
      score={result.enhanceScore}
      // A stage is picked at its top — "+3" reads 37%, the figure a player
      // quotes — and the refinement slider then walks it down if need be.
      onStage={(stage) => onPatch({ enhanceStage: stage, refinePercent: refineForStage(stage) })}
      onBadge={(badge) => onPatch({ refinePercent: refineFromProgress(maxStage, enhanceStage, badge) })}
    />
  )
}

/**
 * The reforge score above, the grace below: the affix Marks and the
 * extraordinary bonus they carry on top, and under a gap the grace they
 * trigger — named for its effect, since it adds nothing of its own to the
 * score. The lower half stays empty when nothing fires, so the score sits at
 * the same height on every row.
 */
function ReforgeSummary({ result }: { result: PieceResult }) {
  const { t } = useTranslation()
  const grace = result.grace
  // The exact sum, shown in brackets when the game's rounding to five moved it.
  // The Marks are carried unrounded, so this is the only place they are rounded
  // to the whole number the card can show.
  const exact = Math.round(result.affixMark + result.extraordinaryBonus)
  return (
    <div className="min-w-0 space-y-2" data-testid={`equip-reforge-${result.state.slot}`}>
      <div>
        <div className={TYPE.value}>
          {t('equip.reforgeScore', { score: result.reforgeScore.toLocaleString() })}
          {exact !== result.reforgeScore ? (
            <span className={`ml-1 ${TYPE.valueMuted}`}>{t('equip.exactValue', { value: exact.toLocaleString() })}</span>
          ) : null}
        </div>
        <div className={TYPE.valueMuted}>
          {t('equip.reforgeParts', {
            mark: Math.round(result.affixMark).toLocaleString(),
            bonus: result.extraordinaryBonus.toLocaleString(),
          })}
        </div>
      </div>
      <div className="min-w-0">
        {grace ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className={TYPE.name}>{grace.name}</span>
              <span className={`${TYPE.control} ${PIP_CLASS}`} aria-hidden>
                {'◆'.repeat(grace.extraordinaryCount)}
              </span>
            </div>
            <p className={`whitespace-pre-line ${TYPE.body}`}>{grace.brief1}</p>
          </>
        ) : result.extraordinaryCount >= 2 ? (
          <p className={TYPE.body}>{t('equip.noGrace')}</p>
        ) : null}
      </div>
    </div>
  )
}

/** The gold / grey / red pip beside an affix, named for screen readers. */
function TierPip({ tier }: { tier: AffixTier }) {
  const { t } = useTranslation()
  const pip = TIER_PIP[tier]
  return (
    <span
      className={`shrink-0 ${TYPE.control} leading-none ${pip.className}`}
      role="img"
      aria-label={t(pip.labelKey)}
      title={t(pip.labelKey)}
      data-tier={tier}
    >
      ◆
    </span>
  )
}

function AffixField({
  equipment,
  slot,
  index,
  affix,
  onChange,
  onRemove,
}: {
  equipment: Equipment
  slot: number
  index: number
  affix: ScoredAffix
  onChange: (next: ChosenAffix) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const bounds = affixBounds(equipment, slot, affix.family)
  // The span the field will settle into, as its placeholder and its title: the
  // player sees what the stat can roll before typing, and after, if the number
  // moved on blur, why.
  const spanText = [bounds.negative, bounds.positive]
    .flatMap((span) => (span ? [`${span.min}~${span.max}`] : []))
    .join(' / ')
  return (
    <div className={AFFIX_ROW_CLASS} data-testid={`equip-affix-${slot}-${index}`}>
      <TierPip tier={affix.tier} />
      <Picker
        value={affix.family}
        label={t('equip.affixFamily')}
        testId={`equip-affix-family-${slot}-${index}`}
        className={COMPACT_SELECT_CLASS}
        // The value follows into the new family's bounds, so a 攻击 308 does not linger as an impossible 技能增强 308.
        onValue={(raw) => onChange({ family: raw, value: clampAffixValue(equipment, slot, raw, affix.value) })}
      >
        {familiesFor(equipment, slot).map((family) => (
          <option key={family} value={family}>{family}</option>
        ))}
      </Picker>
      <span title={spanText} className="min-w-0">
        <NumberField
          value={affix.value}
          min={bounds.negative?.min ?? bounds.positive?.min ?? -SCORE_CAP}
          max={bounds.positive?.max ?? bounds.negative?.max ?? SCORE_CAP}
          placeholder={bounds.positive ? `${bounds.positive.min}~${bounds.positive.max}` : '0'}
          label={t('equip.affixValue')}
          testId={`equip-affix-value-${slot}-${index}`}
          onValue={(value) => onChange({ family: affix.family, value })}
          commit={(value) => clampAffixValue(equipment, slot, affix.family, value)}
        />
      </span>
      <span className={`whitespace-nowrap text-right ${TYPE.valueMuted}`} data-testid={`equip-affix-mark-${slot}-${index}`}>
        {t('equip.affixMark', { mark: Math.round(affix.mark) })}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className={`${BUTTON_CLASS} size-7`}
        aria-label={t('equip.removeAffix')}
        data-testid={`equip-affix-remove-${slot}-${index}`}
      >
        ×
      </button>
    </div>
  )
}

/**
 * The affixes, one to a row on the left, with what the reforge comes to — its
 * score and the grace it triggers — beside them on the right. The tier is not
 * asked for: a negative value is a contaminated affix and a value past the
 * normal ladder is an extraordinary one, and the pip shows which the number
 * came to.
 */
function AffixEditor({ equipment, result, onPatch }: PieceControlProps) {
  const { t } = useTranslation()
  const { slot } = result.state
  const affixes = result.affixes
  const maxAffixes = maxAffixesFor(equipment, slot)
  const write = (next: ChosenAffix[]) => onPatch({ affixes: next })
  const plain = (list: ScoredAffix[]): ChosenAffix[] => list.map(({ family, value }) => ({ family, value }))

  return (
    // Side by side once the cell itself is wide enough — a container query,
    // since the same editor sits in a card a quarter of the page wide and in a
    // rows-layout column that is wider than that at any viewport.
    <div className="min-w-0 @container">
      <div className="flex min-w-0 flex-col gap-3 @min-[27rem]:flex-row @min-[27rem]:items-start">
        <div className="grid shrink-0 grid-cols-1 gap-y-1 @min-[27rem]:w-[17rem]">
          {affixes.map((affix, index) => (
            <AffixField
              key={index}
              equipment={equipment}
              slot={slot}
              index={index}
              affix={affix}
              onChange={(next) => write(plain(affixes).map((entry, at) => (at === index ? next : entry)))}
              onRemove={() => write(plain(affixes).filter((_, at) => at !== index))}
            />
          ))}
          <button
            type="button"
            disabled={affixes.length >= maxAffixes}
            onClick={() => write([...plain(affixes), affixFor(equipment, slot)])}
            className={`${BUTTON_CLASS} h-7 justify-self-start px-2`}
            data-testid={`equip-affix-add-${slot}`}
          >
            {/* `used` rather than `count`, which i18next reads as a plural selector. */}
            {t('equip.addAffix', { used: affixes.length, max: maxAffixes })}
          </button>
        </div>
        <ReforgeSummary result={result} />
      </div>
    </div>
  )
}

/** Column titles for the rows layout; the rows' own labels go screen-reader-only at `lg`. */
function RowHeader() {
  const { t } = useTranslation()
  return (
    <div
      className={`hidden px-2.5 ${TYPE.label} xl:grid ${ROW_GRID}`}
      aria-hidden
      data-testid="equip-rows-header"
    >
      <span>{t('equip.item')}</span>
      <span>{t('equip.stats')}</span>
      <span>{t('equip.enhance')}</span>
      <span>{t('equip.affixes')}</span>
      <span>{t('equip.brand')}</span>
    </div>
  )
}

function PieceRow({ equipment, slotName, kind, result, onPatch, onOpenPicker }: PieceProps) {
  const { t } = useTranslation()
  const controls: PieceControlProps = { equipment, result, onPatch }
  const typeName = equipment.types.find((type) => type.id === result.item?.typeId)?.name ?? slotName
  return (
    <article
      className={`grid gap-2 rounded-md border border-border bg-card p-2.5 xl:items-start ${ROW_GRID}`}
      data-testid={`equip-row-${result.state.slot}`}
    >
      <div className="min-w-0">
        <PieceScore result={result} />
        <button
          type="button"
          onClick={onOpenPicker}
          title={t('equip.itemLabel')}
          className={`flex w-full min-w-0 items-center gap-2 rounded-md border border-border bg-background/60 p-2 text-left transition-colors hover:border-[color:var(--arkive-nav-accent)] ${FOCUS}`}
          data-testid={`equip-open-picker-${result.state.slot}`}
        >
          <IconPlaceholder item={result.item} />
          <PieceHeader
            result={result}
            kind={kind}
            subtitle={t('equip.typeAndLevel', { type: typeName, level: result.item?.gearLevel ?? '—' })}
          />
        </button>
      </div>
      <Cell label={t('equip.stats')} hidden><StatBlock equipment={equipment} result={result} /></Cell>
      <Cell label={t('equip.enhance')} hidden><EnhanceControls {...controls} /></Cell>
      <Cell label={t('equip.affixes')} hidden><AffixEditor {...controls} /></Cell>
      <Cell label={t('equip.brand')} hidden>
        <BrandNote result={result} />
      </Cell>
    </article>
  )
}

function PieceCard({ equipment, slotName, kind, result, onPatch, onOpenPicker }: PieceProps) {
  const { t } = useTranslation()
  const controls: PieceControlProps = { equipment, result, onPatch }
  const typeName = equipment.types.find((type) => type.id === result.item?.typeId)?.name ?? slotName

  return (
    <article
      className="flex min-w-0 flex-col rounded-md border border-border bg-card"
      data-testid={`equip-card-${result.state.slot}`}
    >
      <div className="px-2.5 pt-2.5">
        <PieceScore result={result} />
      </div>
      <button
        type="button"
        onClick={onOpenPicker}
        title={t('equip.itemLabel')}
        className="flex min-w-0 items-center justify-between gap-2 border-b border-border p-2.5 pt-0 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)]"
        data-testid={`equip-open-picker-${result.state.slot}`}
      >
        <PieceHeader
          result={result}
          kind={kind}
          subtitle={t('equip.typeAndLevel', { type: typeName, level: result.item?.gearLevel ?? '—' })}
        />
        <IconPlaceholder item={result.item} />
      </button>
      <Cell label={t('equip.stats')} className="p-2.5"><StatBlock equipment={equipment} result={result} /></Cell>
      <Cell label={t('equip.enhance')} className={SECTION_CLASS}><EnhanceControls {...controls} /></Cell>
      <Cell label={t('equip.affixes')} className={SECTION_CLASS}><AffixEditor {...controls} /></Cell>
      <Cell label={t('equip.brand')} className={SECTION_CLASS}><BrandNote result={result} /></Cell>
    </article>
  )
}

export default function EquipmentSection({
  equipment,
  graces,
  professionId,
}: {
  equipment: Equipment
  graces: Grace[]
  /**
   * The character's pathway, owned by the page.
   *
   * It is a property of the character, not of the loadout — 途径技能 and the
   * 非凡人物 group will read the same value — so it lives one level up rather
   * than being chosen inside this section.
   */
  professionId: number | null
}) {
  const { t } = useTranslation()
  const slots = useMemo(() => scoredSlots(equipment, graces), [equipment, graces])
  const [layout, setLayout] = useMemory(equipmentLayout)
  const [draft, setDraft] = useMemory(equipmentDraft)
  // Which slot's picker is open. One modal for all eight pieces: they never open
  // together, and a modal per piece would mount eight dialogs' worth of portals.
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)

  // What is scored: the stored draft, one piece per scored slot, checked
  // against the dataset and the pathway. A slot the draft does not know starts
  // empty; a weapon the pathway cannot wear is shown empty but kept stored.
  const pieces = useMemo(
    () =>
      slots.map((slot) =>
        sanitizePiece(equipment, draft.pieces.find((piece) => piece.slot === slot.id) ?? newPiece(slot.id), professionId),
      ),
    [draft.pieces, equipment, professionId, slots],
  )
  const { batch, suitChoice } = draft
  const writePieces = useCallback(
    (next: PieceState[]) => setDraft((prev) => ({ ...prev, pieces: next })),
    [setDraft],
  )

  const results = useMemo(() => pieces.map((p) => evaluatePiece(equipment, graces, p)), [equipment, graces, pieces])
  const averagePercent = useMemo(() => averageProgress(results), [results])
  const active = useMemo(() => activeSuits(equipment, results.map((r) => r.item)), [equipment, results])
  const chosenSuit = active.find((entry) => entry.suit.id === suitChoice) ?? active[0] ?? null
  // Type 2 is the tier family gated on average enhancement, which is the one a
  // whole-loadout view can answer. It only means anything under a live suit.
  const suitTier = useMemo(
    () => (chosenSuit ? suitTierFor(equipment, 2, averagePercent) : null),
    [equipment, averagePercent, chosenSuit],
  )
  const suitNeed = Math.min(...equipment.suits.suits.map(suitThreshold))
  const slotNames = useMemo(() => new Map(equipment.slots.map((slot) => [slot.id, slot.name])), [equipment])
  const kindOf = (item: EquipItem | null) => suitKind(t, suitOf(equipment, item))

  const pickerOptions: PickerOption[] = useMemo(() => {
    if (pickerSlot === null) return []
    return itemsForSlot(equipment, pickerSlot, professionId).map((item) => ({
      id: item.id,
      name: item.name,
      detail: t('equip.pickerDetail', { level: item.gearLevel ?? '—', quality: item.quality }),
      badge: suitKind(t, suitOf(equipment, item)) || undefined,
      quality: item.quality,
      iconUrl: equipmentIconUrl(item.icon),
      keywords: item.flavour,
    }))
  }, [equipment, pickerSlot, professionId, t])

  const totals = useMemo(
    () =>
      results.reduce(
        (sum, r) => ({
          base: sum.base + r.baseScore,
          enhance: sum.enhance + r.enhanceScore,
          affix: sum.affix + r.affixMark,
          bonus: sum.bonus + r.extraordinaryBonus,
          reforge: sum.reforge + r.reforgeScore,
          total: sum.total + r.total,
        }),
        { base: 0, enhance: 0, affix: 0, bonus: 0, reforge: 0, total: 0 },
      ),
    [results],
  )

  const patchPiece = (index: number, patch: Partial<PieceState>) =>
    writePieces(pieces.map((piece, at) => (at === index ? { ...piece, ...patch } : piece)))
  const globalMaxStage = equipment.enhancement.maxStage
  // Every piece is converted against its own ladder, so a slot with a shorter
  // one is capped at its end rather than set past it.
  const applyBatch = (stage: number, badge: number) => {
    setDraft((prev) => ({
      ...prev,
      batch: { stage, badge },
      pieces: pieces.map((piece) => {
        const maxStage = maxStageFor(equipment, piece.slot)
        const enhanceStage = Math.min(stage, maxStage)
        return { ...piece, enhanceStage, refinePercent: refineFromProgress(maxStage, enhanceStage, badge) }
      }),
    }))
  }

  return (
    <section className="space-y-3" data-testid="equip-section" aria-label={t('equip.title')}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <h2 className={TYPE.sectionTitle}>{t('equip.title')}</h2>
          <p className={`mt-0.5 max-w-3xl ${TYPE.body}`}>{t('equip.hint')}</p>
        </div>
        <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border" role="group" aria-label={t('equip.layout')}>
          {(['rows', 'cards'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={layout === mode}
              onClick={() => setLayout(mode)}
              className={`inline-flex min-h-9 items-center gap-1.5 px-3 ${TYPE.control} font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)] ${mode === 'cards' ? 'border-l border-border' : ''} ${
                layout === mode
                  ? 'bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
              data-testid={`equip-layout-${mode}`}
            >
              {mode === 'rows' ? t('equip.layoutRows') : t('equip.layoutCards')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,1fr)]">
        <Cell label={t('equip.batchEnhance')}>
          <EnhanceSliders
            stage={batch.stage}
            badge={batch.badge}
            maxStage={globalMaxStage}
            testIdPrefix="equip-batch"
            // Picked at its top, like a single piece's stage.
            onStage={(stage) => applyBatch(stage, progressBounds(globalMaxStage, stage).max)}
            onBadge={(badge) => applyBatch(batch.stage, badge)}
          />
        </Cell>

        <Cell label={t('equip.suit')}>
          {active.length >= 2 ? (
            <Picker
              value={chosenSuit?.suit.id ?? ''}
              label={t('equip.suitChoose')}
              testId="equip-suit-choice"
              onValue={(raw) => setDraft((prev) => ({ ...prev, suitChoice: Number(raw) }))}
            >
              {active.map((entry) => (
                <option key={entry.suit.id} value={entry.suit.id}>
                  {t('equip.suitActive', { name: entry.suit.fullName || entry.suit.name, pieces: entry.count })}
                </option>
              ))}
            </Picker>
          ) : (
            <div className={TYPE.name} data-testid="equip-suit-active">
              {chosenSuit
                ? t('equip.suitActive', { name: chosenSuit.suit.fullName || chosenSuit.suit.name, pieces: chosenSuit.count })
                : t('equip.suitNone', { need: Number.isFinite(suitNeed) ? suitNeed : '—' })}
            </div>
          )}
          {chosenSuit ? (
            <div className={`mt-1 ${TYPE.body}`} data-testid="equip-suit-tier">
              {suitTier ? (
                <>
                  <span className={TYPE.value}>
                    {t('equip.suitTier', { level: suitTier.level ?? 0, mark: suitTier.mark ?? 0, percent: averagePercent.toFixed(1) })}
                  </span>
                  <p className="whitespace-pre-line">{suitTier.effect}</p>
                </>
              ) : (
                t('equip.suitNoTier', { percent: averagePercent.toFixed(1) })
              )}
              {/* `effect2`/`effect3` are not shown: the client substitutes
                  `{AllRaceHurtPlus_N}` at runtime from formula refs this pipeline
                  cannot evaluate, so they would render as raw placeholders. The
                  tier's own effect text above is already resolved. */}
            </div>
          ) : null}
        </Cell>

        <Cell label={t('equip.totalScore')}>
          <div data-testid="equip-totals">
            <div className={TYPE.total}>{totals.total.toLocaleString()}</div>
            <div className={`flex flex-wrap gap-x-3 ${TYPE.valueMuted}`}>
              <span>{t('equip.subtotalBase', { value: totals.base.toLocaleString() })}</span>
              <span>{t('equip.subtotalEnhance', { value: totals.enhance.toLocaleString() })}</span>
              <span>{t('equip.subtotalReforge', { value: totals.reforge.toLocaleString() })}</span>
            </div>
            <div className={`flex flex-wrap gap-x-3 ${TYPE.valueMuted}`}>
              <span>{t('equip.subtotalAffix', { value: Math.round(totals.affix).toLocaleString() })}</span>
              <span>{t('equip.subtotalBonus', { value: totals.bonus.toLocaleString() })}</span>
            </div>
          </div>
        </Cell>
      </div>

      <div
        className={layout === 'cards' ? 'grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4' : 'space-y-2'}
        data-testid={`equip-${layout}`}
      >
        {layout === 'rows' ? <RowHeader /> : null}
        {results.map((result, index) => {
          const slotName = slotNames.get(result.state.slot) ?? ''
          const onPatch = (patch: Partial<PieceState>) => patchPiece(index, patch)
          const props: PieceProps = {
            equipment, slotName, result, onPatch,
            kind: kindOf(result.item),
            onOpenPicker: () => setPickerSlot(result.state.slot),
          }
          const key = result.state.slot
          return layout === 'cards' ? <PieceCard key={key} {...props} /> : <PieceRow key={key} {...props} />
        })}
      </div>

      <PickerModal
        open={pickerSlot !== null}
        onOpenChange={(open) => setPickerSlot(open ? pickerSlot : null)}
        title={t('equip.pickerTitle', { slot: pickerSlot === null ? '' : slotNames.get(pickerSlot) ?? '' })}
        options={pickerOptions}
        selectedId={pieces.find((piece) => piece.slot === pickerSlot)?.itemId ?? null}
        onSelect={(id) => {
          const index = pieces.findIndex((piece) => piece.slot === pickerSlot)
          if (index >= 0) patchPiece(index, { itemId: id })
        }}
      />
    </section>
  )
}
