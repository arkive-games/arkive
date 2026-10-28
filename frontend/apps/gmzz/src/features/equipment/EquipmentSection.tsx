import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconBuildingCastle, IconChevronDown, IconChevronUp, IconSwords } from '@tabler/icons-react'
import { IconTile } from '@/features/equipment/PickerModal'
import { useCharacterReadOnly, useSection } from '@/features/characters/CharacterProvider'
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger, Popover, PopoverContent, PopoverTrigger } from '@gamemap/ui'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import {
  activeSuits,
  equipmentIconUrl,
  averageProgress,
  clampAffixValue,
  counterpartFor,
  evaluatePiece,
  familiesFor,
  itemsForSlot,
  maxAffixesFor,
  maxStageFor,
  newPiece,
  clampRefine,
  familiesByGrace,
  refineLevelOf,
  refinePercentOf,
  REFINE_LEVELS,
  rungsFor,
  scoredSlots,
  statLabel,
  statLines,
  suitOf,
  suitScoreFor,
  suitThreshold,
  suitTierFor,
  wholeBodyTier,
  type AffixTier,
  type ChosenAffix,
  type EquipItem,
  type Equipment,
  type Grace,
  type PieceResult,
  type PieceState,
  type Rung,
  type ScoredAffix,
  type StatRange,
  type SuitTier,
  type Suit,
} from '@/features/equipment/data'

/** The label on the pill beside an affix: gold extraordinary, grey normal, red contaminated. */
const TIER_KEY: Record<AffixTier, string> = {
  extraordinary: 'equip.tierExtraordinary',
  normal: 'equip.tierNormal',
  contaminated: 'equip.tierContaminated',
  special: 'equip.tierSpecial',
}

/**
 * `Suit.tag` is the game's own bucket for a suit's items — 冒险套装 is worn
 * for PVE, 竞技套装 for PVP. Keyed on the tag text because that is what the
 * dataset carries; an unknown tag shows as itself rather than not at all.
 */
const SUIT_KINDS: Record<string, { mode: 'pve' | 'pvp'; key: string }> = {
  冒险套装: { mode: 'pve', key: 'equip.kindAdventure' },
  竞技套装: { mode: 'pvp', key: 'equip.kindArena' },
}

/** An item's PVE/PVP bucket: the mode when the tag is a known one, and its wording. */
type SuitKind = { mode: 'pve' | 'pvp' | null; label: string }

/** A sanity ceiling for the stored affix values; the game has no real one. */
const SCORE_CAP = 999999

/* ------------------------------------------------------------- persistence */

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
    refinePercent: clampRefine(piece.refinePercent),
    affixes: piece.affixes
      // An empty family is a freshly added row with nothing picked yet.
      .filter((affix) => affix.family === '' || families.includes(affix.family))
      .slice(0, maxAffixesFor(equipment, piece.slot, worn))
      .map((affix) => ({ family: affix.family, value: clampAffixValue(equipment, piece.slot, affix.family, readInt(affix.value, -SCORE_CAP, SCORE_CAP)) })),
  }
}

/* ------------------------------------------------------------------ helpers */

function readInt(raw: string | number, min: number, max: number): number {
  const whole = Math.trunc(Number(raw))
  if (!Number.isFinite(whole)) return 0
  return Math.min(Math.max(whole, min), max)
}

/** A freshly added affix: nothing picked yet, so it scores nothing until a stat is chosen. */
const EMPTY_AFFIX: ChosenAffix = { family: '', value: 0 }

/** The PVE/PVP bucket of an item's suit; null for an unaffiliated item. */
function suitKind(t: TFunction, suit: Suit | null): SuitKind | null {
  if (!suit) return null
  const known = SUIT_KINDS[suit.tag ?? '']
  if (known) return { mode: known.mode, label: t(known.key) }
  return suit.tag ? { mode: null, label: suit.tag } : null
}

/**
 * The PVE/PVP mark: crossed swords for 竞技, a keep for 副本, each in its own
 * colour, with the wording on hover. An unknown tag is shown as its text.
 */
function KindMark({ kind, withLabel = false }: { kind: SuitKind | null; withLabel?: boolean }) {
  if (!kind) return null
  if (!kind.mode) return <span className="gz-kind">{kind.label}</span>
  const Icon = kind.mode === 'pvp' ? IconSwords : IconBuildingCastle
  return (
    <span className={`gz-kind ${kind.mode} ${withLabel ? 'wide' : ''}`} role="img" title={kind.label} aria-label={kind.label}
      data-kind={kind.mode}>
      <Icon stroke={2} aria-hidden />
      {withLabel ? <span aria-hidden>{kind.label}</span> : null}
    </span>
  )
}

/** `327~607` for a range, `1,960` for a single value. */
function rangeText({ min, max }: StatRange): string {
  return min === max ? min.toLocaleString() : `${min.toLocaleString()}~${max.toLocaleString()}`
}

/**
 * A dialog's title row. The close button is the shared dialog's own, sitting
 * in the corner the title leaves free.
 */
export function DialogHead({ title }: { title: string }) {
  return (
    <div className="gz-dlg-head">
      <DialogTitle asChild><h3>{title}</h3></DialogTitle>
    </div>
  )
}

/**
 * The head of a piece's or a relic's dialog: the icon with 更换 along its
 * foot, the title (slot · name) with a line under it, and the score at the
 * end unless the dialog shows it elsewhere. It stands in for a separate title
 * row, so it carries the dialog title.
 */
export function ItemHead({ icon, title, sub, scoreLabel, score, scoreTestId, swapLabel, swapTestId, onSwap }: {
  icon: ReactNode
  title: string
  sub: ReactNode
  scoreLabel?: string
  score?: string
  scoreTestId?: string
  swapLabel: string
  swapTestId: string
  onSwap: () => void
}) {
  return (
    <div className="gz-ehead">
      <div className="gz-eic">
        {icon}
        <button type="button" className="swap" onClick={onSwap} data-testid={swapTestId}>{swapLabel}</button>
      </div>
      <div className="t">
        <DialogTitle asChild><h3>{title}</h3></DialogTitle>
        <small>{sub}</small>
      </div>
      {score === undefined ? null : (
        <span className="s">
          <small>{scoreLabel}</small>
          <b className="num" data-testid={scoreTestId}>{score}</b>
        </span>
      )}
    </div>
  )
}

/**
 * A choice grid opened inside a dialog, framed so it reads as one panel: two
 * rows show and the third peeks under a fade, the rest scroll. With
 * `onCollapse` it ends on an explicit 收起.
 */
export function PickBox({ children, onCollapse, collapseTestId }: {
  children: ReactNode
  onCollapse?: () => void
  collapseTestId?: string
}) {
  const { t } = useTranslation()
  return (
    <div className="gz-pickbox">
      {children}
      {onCollapse ? (
        <button type="button" className="gz-pickbox-close" onClick={onCollapse} data-testid={collapseTestId}>
          <IconChevronUp stroke={2} aria-hidden />{t('equip.collapse')}
        </button>
      ) : null}
    </div>
  )
}

/** A labelled range slider with its value read out at the end. */
export function RangeRow({ label, value, min = 0, max, output, testId, onChange }: {
  label: string
  value: number
  min?: number
  max: number
  output: string
  testId: string
  onChange: (value: number) => void
}) {
  return (
    <label className="gz-rng">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={value} aria-label={label} data-testid={testId}
        onChange={(event) => onChange(Number(event.target.value))} />
      <output className="num" data-testid={`${testId}-value`}>{output}</output>
    </label>
  )
}

/**
 * The enhancement stage and the refinement (精炼度), each its own slider. The
 * refinement steps by level (`REFINE_LEVELS`), so it only lands on figures the
 * game can show.
 */
function EnhanceRanges({ stage, refine, maxStage, testIdPrefix, onStage, onRefine }: {
  stage: number
  refine: number
  maxStage: number
  testIdPrefix: string
  onStage: (stage: number) => void
  onRefine: (refine: number) => void
}) {
  const { t } = useTranslation()
  const level = refineLevelOf(refine)
  return (
    <div className="gz-frm">
      <RangeRow label={t('equip.enhanceStage')} value={stage} max={maxStage} output={t('equip.stageOption', { stage })}
        testId={`${testIdPrefix}-stage`} onChange={onStage} />
      <RangeRow label={t('equip.refinePercent')} value={level} max={REFINE_LEVELS}
        output={t('equip.refineLevel', { value: refinePercentOf(level), level, max: REFINE_LEVELS })}
        testId={`${testIdPrefix}-refine`} onChange={(next) => onRefine(refinePercentOf(next))} />
    </div>
  )
}

/**
 * One whole-loadout set: what it is, the tier reached and its score, and the
 * stats it grants in the tooltip, labelled by family. A set not reached says
 * so with a dash.
 */
function BonusTier({ equipment, tier, label, title }: { equipment: Equipment; tier: SuitTier | null; label: string; title: string | null }) {
  return (
    <span title={tier ? tier.stats.map(([key, amount]) => `${statLabel(equipment, key)} +${amount.toLocaleString()}`).join('\n') : undefined}>
      {label}&nbsp;<b className="num">{title ?? '—'}</b>
    </span>
  )
}

function AffixRow({
  equipment,
  slot,
  index,
  affix,
  families,
  onChange,
  onRemove,
}: {
  equipment: Equipment
  slot: number
  index: number
  affix: ScoredAffix
  /** The slot's families, those a grace can be made of first. */
  families: string[]
  onChange: (next: ChosenAffix) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const rungs = affix.family === '' ? [] : rungsFor(equipment, slot, affix.family)
  // The rung this value stands on: the one the classifier matched.
  const current = rungs.find(({ tier, rung }) => tier === affix.tier && rung[0] === affix.mark)
  const rungKey = (tier: AffixTier, rung: Rung) => `${tier}:${rung[1]}`
  // The arrows walk the rungs by value, across tiers: contaminated, normal, extraordinary.
  const byValue = [...rungs].sort((a, b) => a.rung[1] - b.rung[1])
  const at = current ? byValue.indexOf(current) : -1
  const stepTo = (offset: number) => {
    const next = at < 0 ? undefined : byValue[at + offset]
    return next ? () => onChange({ family: affix.family, value: next.rung[1] }) : undefined
  }
  const up = stepTo(1)
  const down = stepTo(-1)
  const [valueOpen, setValueOpen] = useState(false)
  const signed = (value: number) => (value > 0 ? `+${value}` : String(value))
  return (
    <div className="gz-aff eq" data-testid={`equip-affix-${slot}-${index}`}>
      {affix.family === '' ? <span className="gz-pip" aria-hidden /> : (
        <span className={`gz-pip ${affix.tier}`} data-tier={affix.tier}>{t(TIER_KEY[affix.tier])}</span>
      )}
      <select
        value={affix.family}
        aria-label={t('equip.affixFamily')}
        data-testid={`equip-affix-family-${slot}-${index}`}
        // A new stat starts on its best rung, the one a player is usually reaching for.
        onChange={(event) => {
          const raw = event.target.value
          onChange({ family: raw, value: raw === '' ? 0 : rungsFor(equipment, slot, raw)[0]?.rung[1] ?? 0 })
        }}
      >
        <option value="">{t('equip.affixPick')}</option>
        {families.map((family) => <option key={family} value={family}>{family}</option>)}
      </select>
      {/* The value between −/+ that walk its rungs; the picker jumps straight to one. */}
      <span className="gz-val">
        <button type="button" disabled={!down} onClick={down} aria-label={t('equip.rungDown')}
          data-testid={`equip-affix-value-${slot}-${index}-down`}>−</button>
        <Popover open={valueOpen} onOpenChange={setValueOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="v num" disabled={rungs.length === 0} aria-label={t('equip.affixValue')}
              data-testid={`equip-affix-value-${slot}-${index}`}>
              {current ? signed(current.rung[1]) : '—'}
              <IconChevronDown stroke={2} aria-hidden />
            </button>
          </PopoverTrigger>
          {/* Every rung at once, grouped by tier: chips in a grid, nothing to scroll. */}
          <PopoverContent side="bottom" align="center" collisionPadding={8} className="gz-valpop"
            data-testid={`equip-affix-value-${slot}-${index}-menu`}>
            {(['extraordinary', 'normal', 'contaminated'] as AffixTier[]).map((tier) => {
              const list = rungs.filter((entry) => entry.tier === tier)
              return list.length === 0 ? null : (
                <section key={tier}>
                  <span className={`gz-pip ${tier}`}>{t(TIER_KEY[tier])}</span>
                  <div className="grid">
                    {list.map(({ rung }) => (
                      <button key={rungKey(tier, rung)} type="button" className="num"
                        aria-pressed={current?.tier === tier && current.rung[1] === rung[1]}
                        onClick={() => { onChange({ family: affix.family, value: rung[1] }); setValueOpen(false) }}
                        data-testid={`equip-affix-value-${slot}-${index}-${tier}-${rung[1]}`}>
                        <b>{signed(rung[1])}</b>
                        <small>{rung[0].toLocaleString()}</small>
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
          </PopoverContent>
        </Popover>
        <button type="button" disabled={!up} onClick={up} aria-label={t('equip.rungUp')}
          data-testid={`equip-affix-value-${slot}-${index}-up`}>+</button>
      </span>
      <span className="end">
        <span className="mk num">{current ? current.rung[0].toLocaleString() : '—'}</span>
        <button type="button" className="gz-rm" onClick={onRemove} aria-label={t('equip.removeAffix')}
          data-testid={`equip-affix-remove-${slot}-${index}`}>×</button>
      </span>
    </div>
  )
}

/**
 * A piece at a glance: icon, slot and gear level, name, its tags and its
 * score. Everything that is edited sits behind it, in the piece's dialog, so
 * the eight slots fit on one screen.
 */
function PieceSlot({ result, slotName, kind, onOpen }: {
  result: PieceResult
  slotName: string
  kind: SuitKind | null
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const { item, state } = result
  const tags = [
    t('equip.stageOption', { stage: state.enhanceStage }),
    t('equip.refineTag', { value: clampRefine(state.refinePercent) }),
    result.extraordinaryCount > 0 ? t('equip.extraordinaryTag', { n: result.extraordinaryCount }) : null,
    result.grace?.name ?? null,
  ].filter((tag): tag is string => tag !== null)
  const label = [slotName, item?.gearLevel != null ? t('equip.levelTag', { level: item.gearLevel }) : null].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className={`gz-slot ${item ? '' : 'empty'}`}
      data-testid={`equip-open-${state.slot}`}
    >
      <IconTile quality={item?.quality ?? null} src={item ? equipmentIconUrl(item.icon) : undefined} alt={item?.name ?? ''} label="?" className="ic" />
      <span className="nm">
        <span className="kind"><span className="lb" title={label}>{label}</span><KindMark kind={kind} /></span>
        <b>{item ? item.name : t('equip.emptySlot')}</b>
      </span>
      <span className="s num" data-testid={`equip-slot-score-${state.slot}`}>{result.total.toLocaleString()}</span>
      <span className="tags">
        {tags.map((tag) => <span key={tag}>{tag}</span>)}
      </span>
    </button>
  )
}

/** The slot's items, searchable by name, inline in the piece's dialog. */
function ItemPicker({ equipment, slot, professionId, selectedId, onSelect, onCollapse }: {
  equipment: Equipment
  slot: number
  professionId: number | null
  selectedId: number | null
  onSelect: (id: number) => void
  onCollapse?: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const items = useMemo(() => itemsForSlot(equipment, slot, professionId), [equipment, professionId, slot])
  const needle = query.trim().toLocaleLowerCase()
  const shown = needle ? items.filter((item) => `${item.name} ${item.flavour ?? ''}`.toLocaleLowerCase().includes(needle)) : items
  return (
    <PickBox onCollapse={onCollapse} collapseTestId={`equip-picker-collapse-${slot}`}>
      <input className="gz-inp" type="search" value={query} placeholder={t('equip.pickerSearch')} aria-label={t('equip.pickerSearch')}
        onChange={(event) => setQuery(event.target.value)} data-testid="equip-picker-search" />
      <div className="gz-picker">
        {shown.length === 0 ? <p className="note">{t('equip.pickerEmpty')}</p> : shown.map((item) => {
          const kind = suitKind(t, suitOf(equipment, item))
          return (
            <button key={item.id} type="button" className={`gz-pick ${item.id === selectedId ? 'on' : ''}`}
              aria-pressed={item.id === selectedId} onClick={() => onSelect(item.id)} data-testid={`equip-picker-option-${item.id}`}>
              {/* The PVE/PVP mark sits on the icon's corner. */}
              <span className="icw">
                <IconTile quality={item.quality} src={equipmentIconUrl(item.icon)} alt="" className="ic" />
                <KindMark kind={kind} />
              </span>
              <b>{item.name}</b>
              <small>{t('equip.levelTag', { level: item.gearLevel ?? '—' })}</small>
            </button>
          )
        })}
      </div>
    </PickBox>
  )
}

/**
 * One piece's dialog: the item with a button to swap it, its stats,
 * enhancement, affixes, the four figures they come to, and last the one
 * destructive action. An empty slot opens straight on the item list. The
 * dialog is portalled out of the page's read-only fieldset, so it carries its
 * own.
 */
function PieceDialog({ equipment, graces, slotName, kind, result, readOnly, professionId, onPatch }: {
  equipment: Equipment
  graces: Grace[]
  slotName: string
  kind: SuitKind | null
  result: PieceResult
  readOnly: boolean
  professionId: number | null
  onPatch: (patch: Partial<PieceState>) => void
}) {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(false)
  const { item, state } = result
  const slot = state.slot
  const picker = (
    <ItemPicker equipment={equipment} slot={slot} professionId={professionId} selectedId={state.itemId}
      onSelect={(id) => { onPatch({ itemId: id }); setPicking(false) }}
      onCollapse={item ? () => setPicking(false) : undefined} />
  )
  if (!item) {
    return (
      <DialogContent className="gz-dlg" data-testid={`equip-dialog-${slot}`}>
        <DialogHead title={t('equip.pickerTitle', { slot: slotName })} />
        <fieldset disabled={readOnly}>{picker}</fieldset>
      </DialogContent>
    )
  }
  const maxAffixes = maxAffixesFor(equipment, slot, item)
  const families = familiesByGrace(equipment, graces, slot)
  const affixes = result.affixes
  const plain = (list: ScoredAffix[]): ChosenAffix[] => list.map(({ family, value }) => ({ family, value }))
  const write = (next: ChosenAffix[]) => onPatch({ affixes: next })
  const lines = statLines(equipment, item.baseStats, result.enhanceStats)
  const grace = result.grace
  return (
    <DialogContent className="gz-dlg" data-testid={`equip-dialog-${slot}`}>
      <fieldset disabled={readOnly}>
        <ItemHead
          icon={<IconTile quality={item.quality} src={equipmentIconUrl(item.icon)} alt="" className="ic" />}
          title={`${slotName} · ${item.name}`}
          sub={<>{t('equip.pickerDetail', { level: item.gearLevel ?? '—', quality: item.quality })}<KindMark kind={kind} withLabel /></>}
          swapLabel={picking ? t('equip.collapse') : t('equip.swap')}
          swapTestId={`equip-open-picker-${slot}`}
          onSwap={() => setPicking((open) => !open)}
        />
        {/* The base stats and the piece's score share one line, aligned at the foot. */}
        <div className="gz-statrow">
          <div className="gz-stats" data-testid={`equip-stats-${slot}`}>
            {lines.map((line) => (
              <span key={line.key}>
                {line.label} <b className="num">{rangeText(line.base)}</b>
                {line.gain.max > 0 ? ` +${rangeText(line.gain)}` : null}
              </span>
            ))}
          </div>
          <span className="gz-escore">
            <small>{t('equip.pieceScoreLabel')}</small>
            <b className="num" data-testid={`equip-score-${slot}`}>{result.total.toLocaleString()}</b>
          </span>
        </div>
        {picking ? picker : null}

        {/* One form on one grid: the sliders and the affix rows share their
            label, body and end columns, and the add button spans them all. */}
        <div className="gz-form">
          <EnhanceRanges stage={state.enhanceStage} refine={clampRefine(state.refinePercent)} maxStage={maxStageFor(equipment, slot)}
            testIdPrefix={`equip-${slot}`} onStage={(stage) => onPatch({ enhanceStage: stage })}
            onRefine={(refine) => onPatch({ refinePercent: clampRefine(refine) })} />
          <div className="gz-affs">
            {affixes.map((affix, index) => (
              <AffixRow key={index} equipment={equipment} slot={slot} index={index} affix={affix} families={families}
                onChange={(next) => write(plain(affixes).map((entry, at) => (at === index ? next : entry)))}
                onRemove={() => write(plain(affixes).filter((_, at) => at !== index))} />
            ))}
          </div>
          <div className="gz-addrow">
            <button type="button" className="gz-add" disabled={affixes.length >= maxAffixes}
              onClick={() => write([...plain(affixes), EMPTY_AFFIX])} data-testid={`equip-affix-add-${slot}`}>
              {/* `used` rather than `count`, which i18next reads as a plural selector. */}
              {t('equip.addAffix', { used: affixes.length, max: maxAffixes })}
            </button>
          </div>
        </div>

        <div className="gz-kv" data-testid={`equip-reforge-${slot}`}>
          <div>{t('equip.baseScore')}<b className="num" data-testid={`equip-base-score-${slot}`}>{result.baseScore.toLocaleString()}</b></div>
          <div>
            {t('equip.reforgeScoreLabel')}<b className="num">{result.reforgeScore.toLocaleString()}</b>
            <small>{t('equip.bonusIncluded', { n: result.extraordinaryBonus.toLocaleString() })}</small>
          </div>
          <div>
            {t('equip.grace')}<b>{grace ? grace.name : '—'}</b>
            {grace ? <small>{'◆'.repeat(grace.extraordinaryCount)}</small>
              : result.extraordinaryCount >= 2 ? <small>{t('equip.noGrace')}</small> : null}
          </div>
          <div>
            {t('equip.enhanceRefineShort')}
            <b className="num" data-testid={`equip-${slot}-enhance-score`}>{result.enhanceScore.toLocaleString()}</b>
            <small>{t('equip.stageOption', { stage: state.enhanceStage })} · {t('equip.refineTag', { value: clampRefine(state.refinePercent) })}</small>
          </div>
        </div>
        {grace ? <p className="note" style={{ marginTop: '.625rem' }}>{grace.brief1}</p> : null}
        {result.brand ? (
          <>
            <div className="sub">{t('equip.brand')} · {result.brand.name}</div>
            <p className="note">{result.brand.effect}</p>
          </>
        ) : null}
      </fieldset>
      {/* Outside the fieldset so a read-only viewer can still close. Every
          change applies as it is made; Confirm only closes. */}
      <div className="gz-dlg-foot split">
        <button type="button" className="gz-btn warn" disabled={readOnly} onClick={() => onPatch({ itemId: null })}
          data-testid={`equip-unequip-${slot}`}>
          {t('equip.unequip')}
        </button>
        <DialogClose asChild>
          <button type="button" className="gz-btn pri" data-testid={`equip-done-${slot}`}>{t('equip.done')}</button>
        </DialogClose>
      </div>
    </DialogContent>
  )
}

/**
 * 统一强化: sets every piece's stage and refinement at once. The sliders are
 * a draft until applied, so trying a value costs the loadout nothing; the
 * content remounts on each open, which starts the draft from the last batch.
 */
function BatchDialog({ maxStage, stage, refine, readOnly, onApply }: {
  maxStage: number; stage: number; refine: number; readOnly: boolean
  onApply: (stage: number, refine: number) => void
}) {
  const { t } = useTranslation()
  const [draftStage, setDraftStage] = useState(stage)
  const [draftRefine, setDraftRefine] = useState(refine)
  return (
    <DialogContent className="gz-dlg sm" size="sm" data-testid="equip-batch-dialog">
      <DialogHead title={t('equip.batchEnhance')} />
      <fieldset disabled={readOnly}>
        <p className="note">{t('equip.batchHint')}</p>
        <EnhanceRanges stage={draftStage} refine={draftRefine} maxStage={maxStage} testIdPrefix="equip-batch"
          onStage={setDraftStage} onRefine={(value) => setDraftRefine(clampRefine(value))} />
        <div className="gz-dlg-foot">
          <DialogClose asChild>
            <button type="button" className="gz-btn">{t('equip.cancel')}</button>
          </DialogClose>
          <DialogClose asChild>
            <button type="button" className="gz-btn pri" data-testid="equip-batch-apply" onClick={() => onApply(draftStage, draftRefine)}>
              {t('equip.batchApply')}
            </button>
          </DialogClose>
        </div>
      </fieldset>
    </DialogContent>
  )
}

/** The four 装备 items as the page's rating grades them. */
export type EquipmentTotals = { base: number; enhance: number; reforge: number; suit: number; total: number }

export default function EquipmentSection({
  equipment,
  graces,
  professionId,
  onTotals,
}: {
  equipment: Equipment
  graces: Grace[]
  /**
   * Reports the four subtotals whenever they change, so the page can grade
   * them against the rating's benchmarks alongside everything else.
   */
  onTotals?: (totals: EquipmentTotals) => void
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
  const [draft, setDraft] = useSection('equipment')
  // Which slot's detail dialog is open.
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const readOnly = useCharacterReadOnly()

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
  const openIndex = results.findIndex((result) => result.state.slot === openSlot)
  const averagePercent = useMemo(() => averageProgress(results), [results])
  const items = useMemo(() => results.map((r) => r.item), [results])
  const active = useMemo(() => activeSuits(equipment, items), [equipment, items])
  // Each live suit scored from its own pieces; only one suit can be active in
  // game, so the player's pick counts, and the best-scoring one stands in
  // until they pick.
  const suitScores = useMemo(
    () => active.map((entry) => ({ ...entry, ...suitScoreFor(equipment, entry.suit, items) })),
    [active, equipment, items],
  )
  const bestSuit = suitScores.reduce<(typeof suitScores)[number] | null>(
    (best, entry) => (best === null || entry.total > best.total ? entry : best),
    null,
  )
  const chosenSuit = suitScores.find((entry) => entry.suit.id === suitChoice) ?? bestSuit
  // The whole-loadout enhancement set — 全身+3 and up — is part of the
  // enhancement score, not of any one piece.
  const bodyTier = useMemo(() => wholeBodyTier(equipment, pieces.map((piece) => piece.enhanceStage)), [equipment, pieces])
  // The refinement set — type 2, gated on the average enhancement percentage
  // across the loadout — is the other whole-body bonus, and like the first it
  // counts towards the enhancement part.
  const refineTier = useMemo(() => suitTierFor(equipment, 2, averagePercent), [equipment, averagePercent])
  const suitNeed = Math.min(...equipment.suits.suits.map(suitThreshold))
  const slotNames = useMemo(() => new Map(equipment.slots.map((slot) => [slot.id, slot.name])), [equipment])
  const kindOf = (item: EquipItem | null) => suitKind(t, suitOf(equipment, item))

  // The game's four parts: 基础, 强化 (the pieces' plus both whole-body sets),
  // 词条 (the reforge, affixes and bonus together) and 套装.
  const totals = useMemo(() => {
    const pieceSums = results.reduce(
      (sum, r) => ({
        base: sum.base + r.baseScore,
        pieces: sum.pieces + r.enhanceScore,
        reforge: sum.reforge + r.reforgeScore,
      }),
      { base: 0, pieces: 0, reforge: 0 },
    )
    const suit = chosenSuit?.total ?? 0
    const enhance = pieceSums.pieces + (bodyTier?.mark ?? 0) + (refineTier?.mark ?? 0)
    return { ...pieceSums, enhance, suit, total: pieceSums.base + enhance + pieceSums.reforge + suit }
  }, [bodyTier, chosenSuit, refineTier, results])
  useEffect(() => {
    onTotals?.(totals)
  }, [onTotals, totals])

  const patchPiece = (index: number, patch: Partial<PieceState>) =>
    writePieces(pieces.map((piece, at) => (at === index ? { ...piece, ...patch } : piece)))
  const globalMaxStage = equipment.enhancement.maxStage
  // A slot with a shorter ladder is capped at its own end rather than set past it.
  const applyBatch = (stage: number, refine: number) => {
    setDraft((prev) => ({
      ...prev,
      batch: { stage, badge: refine },
      pieces: pieces.map((piece) => ({
        ...piece,
        enhanceStage: Math.min(stage, maxStageFor(equipment, piece.slot)),
        refinePercent: clampRefine(refine),
      })),
    }))
  }

  return (
    <section className="space-y-2.5" data-testid="equip-section" aria-label={t('equip.title')}>
      <div className="gz-panel-head">
        <h3>{t('equip.worn')}</h3>
        <span className="meta">{t('equip.slotHint')}</span>
        <div className="acts">
          <Dialog>
            <DialogTrigger asChild>
              <button type="button" disabled={readOnly} className="gz-chip" data-testid="equip-batch-open"
                title={`${t('equip.stageOption', { stage: batch.stage })} · ${t('equip.refineTag', { value: clampRefine(batch.badge) })}`}>
                {t('equip.batchEnhance')}
              </button>
            </DialogTrigger>
            <BatchDialog maxStage={globalMaxStage} stage={batch.stage} refine={clampRefine(batch.badge)}
              readOnly={readOnly} onApply={applyBatch} />
          </Dialog>
        </div>
      </div>

      <div className="gz-slots" data-testid="equip-cards">
        {results.map((result) => (
          <PieceSlot
            key={result.state.slot}
            result={result}
            slotName={slotNames.get(result.state.slot) ?? ''}
            kind={kindOf(result.item)}
            onOpen={() => setOpenSlot(result.state.slot)}
          />
        ))}
      </div>

      <div className="gz-eqfoot">
        {/* The two whole-loadout sets: what each reached and the stats it grants. */}
        <div className="gz-wb" data-testid="equip-body-tier">
          <BonusTier equipment={equipment} tier={bodyTier} label={t('equip.bodyBonus')}
            title={bodyTier ? t('equip.bodyTier', { stage: bodyTier.requiredStage ?? 0, mark: (bodyTier.mark ?? 0).toLocaleString() }) : null} />
          <BonusTier equipment={equipment} tier={refineTier}
            label={t('equip.refineAverage', { percent: averagePercent.toLocaleString(undefined, { maximumFractionDigits: 2 }) })}
            title={refineTier ? `+${(refineTier.mark ?? 0).toLocaleString()}` : null} />
        </div>

        <div className="gz-suit">
          <b>{t('equip.suit')}</b>
          {suitScores.length === 0 ? (
            <span data-testid="equip-suit-active">
              {t('equip.suitNone', { need: Number.isFinite(suitNeed) ? suitNeed : '—' })}
            </span>
          ) : (
            // Only one suit can be in effect, so the live ones are a choice: the
            // chosen one is highlighted and scores; with a single live suit there
            // is nothing to choose and it is taken as is.
            <div className="gz-seg" role="group" aria-label={t('equip.suitChoose')}>
              {suitScores.map((entry) => {
                const chosen = entry.suit.id === chosenSuit?.suit.id
                return (
                  <button
                    key={entry.suit.id}
                    type="button"
                    aria-pressed={chosen}
                    disabled={readOnly || suitScores.length === 1}
                    onClick={() => setDraft((prev) => ({ ...prev, suitChoice: entry.suit.id }))}
                    className="gz-chip"
                    // `effect2`/`effect3` are not shown: the client substitutes
                    // `{AllRaceHurtPlus_N}` at runtime from formula refs this
                    // pipeline cannot evaluate, so they would render as raw placeholders.
                    title={entry.effects.map((effect) =>
                      t('equip.suitEffectScore', { pieces: effect.pieces, level: effect.gearLevel, score: effect.score.toLocaleString() })).join('\n')}
                    data-testid={`equip-suit-${entry.suit.id}`}
                    data-chosen={chosen}
                  >
                    {t('equip.suitActive', { name: entry.suit.fullName || entry.suit.name, pieces: entry.count })}
                    <small className="num">{entry.total.toLocaleString()}</small>
                  </button>
                )
              })}
            </div>
          )}
          <span className="s num">{t('equip.suitScore', { score: totals.suit.toLocaleString() })}</span>
        </div>
      </div>

      <Dialog open={openIndex >= 0} onOpenChange={(open) => { if (!open) setOpenSlot(null) }}>
        {openIndex >= 0 ? (
          <PieceDialog
            key={results[openIndex].state.slot}
            equipment={equipment}
            graces={graces}
            slotName={slotNames.get(results[openIndex].state.slot) ?? ''}
            kind={kindOf(results[openIndex].item)}
            result={results[openIndex]}
            readOnly={readOnly}
            professionId={professionId}
            onPatch={(patch) => patchPiece(openIndex, patch)}
          />
        ) : null}
      </Dialog>
    </section>
  )
}
