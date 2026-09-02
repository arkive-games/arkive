import { useEffect, useCallback, useMemo, useState, type ReactNode } from 'react'
import RangeField from '@/components/RangeField'
import PickerModal, { IconTile, type PickerOption } from '@/features/equipment/PickerModal'
import { Input } from '@gamemap/ui'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import {
  activeSuits,
  equipmentIconUrl,
  averageProgress,
  bodyFor,
  evaluatePiece,
  familiesFor,
  itemsForSlot,
  ladderFor,
  markForValue,
  maxStageFor,
  newPiece,
  progressBounds,
  refineFromProgress,
  scoredSlots,
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
  type Suit,
} from '@/features/equipment/data'

type LayoutMode = 'rows' | 'cards'

/** The tiers a player can roll. `special` exists in the data but is not one. */
const TIER_LABEL_KEY = {
  extraordinary: 'equip.tierExtraordinary',
  normal: 'equip.tierNormal',
  contaminated: 'equip.tierContaminated',
} satisfies Partial<Record<AffixTier, string>>
const TIER_OPTIONS = Object.keys(TIER_LABEL_KEY) as (keyof typeof TIER_LABEL_KEY)[]

/**
 * `Suit.tag` is the game's own bucket for a suit's items — 冒险套装 is worn
 * for PVE, 竞技套装 for PVP. Keyed on the tag text because that is what the
 * dataset carries; an unknown tag shows as itself rather than not at all.
 */
const SUIT_KIND_KEY: Record<string, string> = {
  冒险套装: 'equip.kindAdventure',
  竞技套装: 'equip.kindArena',
}

const MAX_AFFIXES = 5
/** Every grace tops out at four extraordinary affixes, so the pip row is fixed. */
const GRACE_PIPS = 4
/** A sanity ceiling for the hand-typed affix values; the game has no real one. */
const SCORE_CAP = 999999

const INPUT_CLASS =
  'h-9 border-border bg-background text-sm tabular-nums shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]'
const SELECT_CLASS =
  'h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'
const LABEL_CLASS = 'mb-0.5 block text-xs font-semibold text-muted-foreground'
const BUTTON_CLASS =
  'inline-flex items-center justify-center rounded-md border border-border text-xs font-medium text-muted-foreground transition-colors hover:border-[color:var(--arkive-nav-accent)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)] disabled:opacity-50'
const SECTION_CLASS = 'border-t border-border/70 p-2.5'
const BADGE_CLASS =
  'inline-block shrink-0 rounded border border-border px-1 align-middle text-xs font-medium leading-4 text-muted-foreground'
const PIP_ON = 'text-[color:var(--arkive-nav-accent)]'
const PIP_OFF = 'text-muted-foreground/40'
const AFFIX_ROW_CLASS =
  'grid min-w-0 grid-cols-[minmax(4rem,0.9fr)_minmax(4.5rem,1.2fr)_minmax(4rem,0.8fr)_auto_auto] items-center gap-1'
/**
 * The rows layout's columns: item, enhancement, brand, affixes. Shared by the
 * header and every row so the two cannot drift apart. Four columns only fit
 * from `lg` up — at tablet width the affix column was left too narrow for its
 * own button — so below that a row stacks its cells with their own labels.
 */
const ROW_GRID = 'lg:grid-cols-[minmax(13rem,18rem)_minmax(9rem,12rem)_minmax(0,8.5rem)_minmax(0,1.5fr)] lg:gap-3'

function readInt(raw: string, min: number, max: number): number {
  const whole = Math.trunc(Number(raw))
  if (!Number.isFinite(whole)) return min
  return Math.min(Math.max(whole, min), max)
}

/** A fresh affix; the family is kept when the new tier still offers it. */
function affixFor(equipment: Equipment, slot: number, tier: AffixTier, family?: string): ChosenAffix {
  const families = familiesFor(equipment, slot, tier)
  const chosen = family !== undefined && families.includes(family) ? family : families[0] ?? ''
  return { tier, family: chosen, value: ladderFor(equipment, slot, tier, chosen)[0]?.[1] ?? 0 }
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
      <span className={`${LABEL_CLASS} ${hidden ? 'lg:sr-only' : ''}`}>{label}</span>
      {children}
    </div>
  )
}

type FieldProps = { label: string; testId: string }

function NumberField({
  value,
  max,
  label,
  testId,
  onValue,
}: FieldProps & { value: number; max: number; onValue: (value: number) => void }) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      value={value}
      placeholder="0"
      onChange={(event) => onValue(readInt(event.target.value, 0, max))}
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
  onValue,
  children,
}: FieldProps & { value: string | number; onValue: (raw: string) => void; children: ReactNode }) {
  return (
    <select
      value={value}
      onChange={(event) => onValue(event.target.value)}
      className={SELECT_CLASS}
      aria-label={label}
      data-testid={testId}
    >
      {children}
    </select>
  )
}

/**
 * Stage and badge-percentage sliders, the pair the game's own panel shows.
 *
 * The second slider runs over the stage's window of the whole-ladder
 * percentage (37..49 at +3 of 8), which is the figure printed under the badge;
 * the in-stage refinement it stores is derived from that.
 */
function EnhanceSliders({
  stage,
  badge,
  maxStage,
  testIdPrefix,
  onStage,
  onBadge,
}: {
  stage: number
  badge: number
  maxStage: number
  testIdPrefix: string
  onStage: (stage: number) => void
  onBadge: (badge: number) => void
}) {
  const { t } = useTranslation()
  const bounds = progressBounds(maxStage, stage)
  const stageText = (value: number) => t('equip.stageOption', { stage: value })
  const percentText = (value: number) => t('equip.percentValue', { value })
  return (
    <>
      <RangeField
        heading
        label={t('equip.enhanceStage')}
        min={0}
        max={maxStage}
        value={stage}
        valueText={stageText(stage)}
        minLabel={stageText(0)}
        maxLabel={stageText(maxStage)}
        testId={`${testIdPrefix}-stage`}
        onChange={onStage}
      />
      <RangeField
        heading
        label={t('equip.refinePercent')}
        min={bounds.min}
        max={bounds.max}
        value={badge}
        valueText={percentText(badge)}
        minLabel={percentText(bounds.min)}
        maxLabel={percentText(bounds.max)}
        testId={`${testIdPrefix}-refine`}
        onChange={onBadge}
      />
    </>
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
    />
  )
}

/** Name, `+stage`, PVE/PVP marker, subtitle and the score split — shared by both layouts. */
function PieceHeader({ result, kind, subtitle }: { result: PieceResult; kind: string; subtitle: string }) {
  const { t } = useTranslation()
  const rest = result.enhanceScore + result.affixMark + result.graceScore
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-bold text-foreground">
        {result.item ? result.item.name : t('equip.emptySlot')}
        <span className="ml-1 tabular-nums text-muted-foreground">+{result.state.enhanceStage}</span>
      </div>
      {/* The marker sits on the short line: a long name already truncates, and it must not take the marker with it. */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">{subtitle}</span>
        {kind ? <span className={BADGE_CLASS}>{kind}</span> : null}
      </div>
      <div className="text-xs tabular-nums text-muted-foreground">
        {t('equip.scoreSplit', { base: result.baseScore, rest })}
      </div>
    </div>
  )
}

function BrandNote({ result }: { result: PieceResult }) {
  if (!result.brand) return null
  return (
    <div className="min-w-0">
      <div className="text-sm font-semibold text-[color:var(--arkive-nav-accent)]">{result.brand.name}</div>
      <p className="whitespace-pre-line text-xs leading-5 text-muted-foreground">{result.brand.effect}</p>
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

function EnhanceControls({ equipment, result, onPatch }: PieceControlProps) {
  const { t } = useTranslation()
  const { slot, enhanceStage } = result.state
  const maxStage = maxStageFor(equipment, slot)
  const ladderStages = bodyFor(equipment, slot)?.stages.length ?? maxStage

  return (
    <div className="min-w-0 space-y-1">
      <EnhanceSliders
        stage={enhanceStage}
        badge={badgeOf(result.progressPercent, maxStage, enhanceStage)}
        maxStage={maxStage}
        testIdPrefix={`equip-${slot}`}
        // The in-stage refinement is kept across a stage change, so "+3 at
        // half" becomes "+4 at half" rather than snapping back to the floor.
        onStage={(stage) => onPatch({ enhanceStage: stage })}
        onBadge={(badge) => onPatch({ refinePercent: refineFromProgress(maxStage, enhanceStage, badge) })}
      />
      <div className="text-xs tabular-nums text-muted-foreground">
        {t('equip.enhanceDerived', { score: result.enhanceScore, stages: ladderStages })}
      </div>
    </div>
  )
}

function GraceNote({ result }: { result: PieceResult }) {
  const { t } = useTranslation()
  const grace = result.grace
  if (!grace) {
    const extraordinary = result.state.affixes.filter((affix) => affix.tier === 'extraordinary').length
    return extraordinary >= 2 ? <p className="text-xs text-muted-foreground">{t('equip.noGrace')}</p> : null
  }
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-bold text-foreground">{grace.name}</span>
        <span className="text-xs" aria-hidden>
          {Array.from({ length: GRACE_PIPS }, (_, pip) => (
            <span key={pip} className={pip < grace.extraordinaryCount ? PIP_ON : PIP_OFF}>◆</span>
          ))}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('equip.graceScore', { score: result.graceScore })}
        </span>
      </div>
      <p className="whitespace-pre-line text-xs leading-5 text-muted-foreground">{grace.brief1}</p>
    </div>
  )
}

function AffixEditor({ equipment, result, onPatch }: PieceControlProps) {
  const { t } = useTranslation()
  const { slot, affixes } = result.state
  const write = (next: ChosenAffix[]) => onPatch({ affixes: next })
  const replace = (index: number, next: ChosenAffix) =>
    write(affixes.map((affix, position) => (position === index ? next : affix)))

  return (
    <div className="min-w-0 space-y-1.5">
      <GraceNote result={result} />
      {affixes.map((affix, index) => (
        <div key={index} className={AFFIX_ROW_CLASS}>
          <Picker
            value={affix.tier}
            label={t('equip.affixTier')}
            testId={`equip-affix-tier-${slot}-${index}`}
            onValue={(raw) => replace(index, affixFor(equipment, slot, raw as AffixTier, affix.family))}
          >
            {TIER_OPTIONS.map((tier) => (
              <option key={tier} value={tier}>{t(TIER_LABEL_KEY[tier])}</option>
            ))}
          </Picker>
          <Picker
            value={affix.family}
            label={t('equip.affixFamily')}
            testId={`equip-affix-family-${slot}-${index}`}
            onValue={(raw) => replace(index, affixFor(equipment, slot, affix.tier, raw))}
          >
            {familiesFor(equipment, slot, affix.tier).map((family) => (
              <option key={family} value={family}>{family}</option>
            ))}
          </Picker>
          <NumberField
            value={affix.value}
            max={SCORE_CAP}
            label={t('equip.affixValue')}
            testId={`equip-affix-value-${slot}-${index}`}
            onValue={(value) => replace(index, { ...affix, value })}
          />
          <span className="px-1 text-xs tabular-nums text-muted-foreground">
            {t('equip.affixMark', { mark: markForValue(ladderFor(equipment, slot, affix.tier, affix.family), affix.value) })}
          </span>
          <button
            type="button"
            onClick={() => write(affixes.filter((_, position) => position !== index))}
            className={`${BUTTON_CLASS} size-7`}
            aria-label={t('equip.removeAffix')}
            data-testid={`equip-affix-remove-${slot}-${index}`}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={affixes.length >= MAX_AFFIXES}
        onClick={() => write([...affixes, affixFor(equipment, slot, 'extraordinary')])}
        className={`${BUTTON_CLASS} min-h-8 px-2.5 py-1`}
        data-testid={`equip-affix-add-${slot}`}
      >
        {/* `used` rather than `count`, which i18next reads as a plural selector. */}
        {t('equip.addAffix', { used: affixes.length, max: MAX_AFFIXES })}
      </button>
    </div>
  )
}

/** Column titles for the rows layout; the rows' own labels go screen-reader-only at `lg`. */
function RowHeader() {
  const { t } = useTranslation()
  return (
    <div
      className={`hidden px-2.5 text-xs font-semibold text-muted-foreground lg:grid ${ROW_GRID}`}
      aria-hidden
      data-testid="equip-rows-header"
    >
      <span>{t('equip.item')}</span>
      <span>{t('equip.enhance')}</span>
      <span>{t('equip.brand')}</span>
      <span>{t('equip.affixes')}</span>
    </div>
  )
}

function PieceRow({ equipment, slotName, kind, result, onPatch, onOpenPicker }: PieceProps) {
  const { t } = useTranslation()
  const controls: PieceControlProps = { equipment, result, onPatch }
  return (
    <article
      className={`grid gap-2 rounded-md border border-border bg-card p-2.5 lg:items-start ${ROW_GRID}`}
      data-testid={`equip-row-${result.state.slot}`}
    >
      <button
        type="button"
        onClick={onOpenPicker}
        title={t('equip.itemLabel')}
        className="flex min-w-0 items-start gap-2 rounded-md border border-border bg-background/60 p-2 text-left transition-colors hover:border-[color:var(--arkive-nav-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]"
        data-testid={`equip-open-picker-${result.state.slot}`}
      >
        <IconPlaceholder item={result.item} />
        <PieceHeader
          result={result}
          kind={kind}
          subtitle={t('equip.slotAndLevel', { slot: slotName, level: result.item?.gearLevel ?? '—' })}
        />
      </button>
      <Cell label={t('equip.enhance')} hidden><EnhanceControls {...controls} /></Cell>
      {/* Stacked, an empty brand cell would be a bare label; in the grid it must stay to hold its column. */}
      <Cell label={t('equip.brand')} hidden className={result.brand ? '' : 'hidden lg:block'}>
        <BrandNote result={result} />
      </Cell>
      <Cell label={t('equip.affixes')} hidden><AffixEditor {...controls} /></Cell>
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
      <button
        type="button"
        onClick={onOpenPicker}
        title={t('equip.itemLabel')}
        className="flex min-w-0 items-start justify-between gap-2 border-b border-border p-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)]"
        data-testid={`equip-open-picker-${result.state.slot}`}
      >
        <PieceHeader
          result={result}
          kind={kind}
          subtitle={t('equip.typeAndLevel', { type: typeName, level: result.item?.gearLevel ?? '—' })}
        />
        <IconPlaceholder item={result.item} />
      </button>
      <Cell label={t('equip.enhance')} className="p-2.5"><EnhanceControls {...controls} /></Cell>
      <Cell label={t('equip.affixes')} className={SECTION_CLASS}><AffixEditor {...controls} /></Cell>
      {result.brand ? (
        <Cell label={t('equip.brand')} className={SECTION_CLASS}><BrandNote result={result} /></Cell>
      ) : null}
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
  const [layout, setLayout] = useState<LayoutMode>('rows')
  const [pieces, setPieces] = useState<PieceState[]>(() => slots.map((slot) => newPiece(slot.id)))
  // The batch sliders' own position. They push to every piece and never read
  // one back, so they need a value of their own to sit at.
  const [batch, setBatch] = useState({ stage: 0, badge: 0 })
  // The player's pick when two suits are live at once; otherwise unused, since
  // the suit follows from what is worn.
  const [suitChoice, setSuitChoice] = useState<number | null>(null)
  // Which slot's picker is open. One modal for all eight pieces: they never open
  // together, and a modal per piece would mount eight dialogs' worth of portals.
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)

  // A weapon from the previous pathway cannot be worn by the new one, so it is
  // dropped rather than left on screen as an unequippable piece.
  useEffect(() => {
    setPieces((prev) =>
      prev.map((piece) => {
        if (piece.itemId === null) return piece
        const wearable = itemsForSlot(equipment, piece.slot, professionId)
          .some((item) => item.id === piece.itemId)
        return wearable ? piece : { ...piece, itemId: null }
      }),
    )
  }, [equipment, professionId])

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
          grace: sum.grace + r.graceScore,
          total: sum.total + r.total,
        }),
        { base: 0, enhance: 0, affix: 0, grace: 0, total: 0 },
      ),
    [results],
  )

  const patchPiece = useCallback((index: number, patch: Partial<PieceState>) => {
    setPieces((prev) => prev.map((piece, at) => (at === index ? { ...piece, ...patch } : piece)))
  }, [])
  const globalMaxStage = equipment.enhancement.maxStage
  // Every piece is converted against its own ladder, so a slot with a shorter
  // one is capped at its end rather than set past it.
  const applyBatch = (stage: number, badge: number) => {
    setBatch({ stage, badge })
    setPieces((prev) =>
      prev.map((piece) => {
        const maxStage = maxStageFor(equipment, piece.slot)
        const enhanceStage = Math.min(stage, maxStage)
        return { ...piece, enhanceStage, refinePercent: refineFromProgress(maxStage, enhanceStage, badge) }
      }),
    )
  }

  return (
    <section className="space-y-3" data-testid="equip-section" aria-label={t('equip.title')}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-foreground">{t('equip.title')}</h2>
          <p className="mt-0.5 max-w-3xl text-xs leading-5 text-muted-foreground">{t('equip.hint')}</p>
        </div>
        <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border" role="group" aria-label={t('equip.layout')}>
          {(['rows', 'cards'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={layout === mode}
              onClick={() => setLayout(mode)}
              className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)] ${mode === 'cards' ? 'border-l border-border' : ''} ${
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

      <div className="grid gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)]">
        <Cell label={t('equip.batchEnhance')}>
          <div className="space-y-1">
            <EnhanceSliders
              stage={batch.stage}
              badge={batch.badge}
              maxStage={globalMaxStage}
              testIdPrefix="equip-batch"
              onStage={(stage) => applyBatch(stage, progressBounds(globalMaxStage, stage).min)}
              onBadge={(badge) => applyBatch(batch.stage, badge)}
            />
          </div>
        </Cell>

        <Cell label={t('equip.suit')}>
          {active.length >= 2 ? (
            <Picker
              value={chosenSuit?.suit.id ?? ''}
              label={t('equip.suitChoose')}
              testId="equip-suit-choice"
              onValue={(raw) => setSuitChoice(Number(raw))}
            >
              {active.map((entry) => (
                <option key={entry.suit.id} value={entry.suit.id}>
                  {t('equip.suitActive', { name: entry.suit.fullName || entry.suit.name, pieces: entry.count })}
                </option>
              ))}
            </Picker>
          ) : (
            <div className="text-sm font-semibold text-foreground" data-testid="equip-suit-active">
              {chosenSuit
                ? t('equip.suitActive', { name: chosenSuit.suit.fullName || chosenSuit.suit.name, pieces: chosenSuit.count })
                : t('equip.suitNone', { need: Number.isFinite(suitNeed) ? suitNeed : '—' })}
            </div>
          )}
          {chosenSuit ? (
            <div className="mt-1 text-xs leading-5 text-muted-foreground" data-testid="equip-suit-tier">
              {suitTier ? (
                <>
                  <span className="tabular-nums text-foreground">
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
            <div className="text-2xl font-bold tabular-nums text-foreground">{totals.total.toLocaleString()}</div>
            <div className="flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
              <span>{t('equip.subtotalBase', { value: totals.base.toLocaleString() })}</span>
              <span>{t('equip.subtotalEnhance', { value: totals.enhance.toLocaleString() })}</span>
              <span>{t('equip.subtotalAffix', { value: totals.affix.toLocaleString() })}</span>
              <span>{t('equip.subtotalGrace', { value: totals.grace.toLocaleString() })}</span>
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
