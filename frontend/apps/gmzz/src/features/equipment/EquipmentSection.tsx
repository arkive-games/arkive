import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconBuildingCastle, IconChevronUp, IconSwords } from '@tabler/icons-react'
import { GzSelect } from '@/components/GzSelect'
import { IconTile } from '@/features/equipment/PickerModal'
import { TipOn } from '@/features/score/Tip'
import { useCharacterReadOnly, useSection } from '@/features/characters/CharacterProvider'
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger, Popover, PopoverContent, PopoverTrigger } from '@gamemap/ui'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import {
  equipmentIconUrl,
  evaluateLoadout,
  itemMode,
  itemsForSlot,
  maxAffixesFor,
  maxStageFor,
  clampRefine,
  familiesByGrace,
  refineLevelOf,
  refinePercentOf,
  REFINE_LEVELS,
  REFINE_PER_STAGE,
  rungsFor,
  statLabel,
  statLines,
  suitEffectText,
  suitThreshold,
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
  type SuitScore,
  type SuitTier,
} from '@/features/equipment/data'

/** The label on the pill beside an affix: gold extraordinary, grey normal, red contaminated. */
const TIER_KEY: Record<AffixTier, string> = {
  extraordinary: 'equip.tierExtraordinary',
  normal: 'equip.tierNormal',
  contaminated: 'equip.tierContaminated',
  special: 'equip.tierSpecial',
}

/** The wording of the two marks the item card draws — 冒险 for PVE, 竞技 for PVP. */
const KIND_KEY: Record<'pve' | 'pvp', string> = { pve: 'equip.kindAdventure', pvp: 'equip.kindArena' }

/** An item's PVE/PVP bucket: the mode when the tag is a known one, and its wording. */
type SuitKind = { mode: 'pve' | 'pvp' | null; label: string }

/* ------------------------------------------------------------------ helpers */

/** A freshly added affix: nothing picked yet, so it scores nothing until a stat is chosen. */
const EMPTY_AFFIX: ChosenAffix = { family: '', value: 0 }

/** An item's PVE/PVP bucket, read off the item card's own mark; null for an item with none. */
function kindOf(t: TFunction, equipment: Equipment, item: EquipItem | null): SuitKind | null {
  const mark = itemMode(equipment, item)
  if (!mark) return null
  return { mode: mark.mode, label: mark.mode ? t(KIND_KEY[mark.mode]) : mark.name }
}

/**
 * The PVE/PVP mark: crossed swords for 竞技, a keep for 副本, each in its own
 * colour. The icon alone carries its wording in a tooltip; it sits inside the
 * slot and picker buttons, so a tap on it opens the tooltip rather than the
 * button too. An unknown tag is shown as its text.
 */
function KindMark({ kind, withLabel = false }: { kind: SuitKind | null; withLabel?: boolean }) {
  if (!kind) return null
  if (!kind.mode) return <span className="gz-kind">{kind.label}</span>
  const Icon = kind.mode === 'pvp' ? IconSwords : IconBuildingCastle
  const mark = (
    <span className={`gz-kind ${kind.mode} ${withLabel ? 'wide' : ''}`} data-kind={kind.mode}
      onClick={withLabel ? undefined : (event) => event.stopPropagation()}>
      <Icon stroke={2} aria-hidden />
      {withLabel ? <span>{kind.label}</span> : null}
    </span>
  )
  return withLabel ? mark : <TipOn content={kind.label}>{mark}</TipOn>
}

/** `+12` after an item's name: its enhancement stage, as the item card reads it. */
function StageMark({ stage }: { stage: number }) {
  const { t } = useTranslation()
  return <span className="gz-lv num">{t('equip.stageOption', { stage })}</span>
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
  title: ReactNode
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
      <input type="range" min={min} max={max} value={value} data-testid={testId}
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
 * One whole-loadout set as a card: where the loadout stands, the score the tier
 * reached counts (its tooltip says what the tier asks for), and the stats it
 * grants, labelled by family.
 */
function BonusTier({ equipment, tier, need, label, value, testId }: {
  equipment: Equipment
  tier: SuitTier | null
  /** What the reached tier (or, with none, the first one) asks for. */
  need: string
  label: string
  /** Where the loadout stands: the stage every piece has reached, or the average refinement. */
  value: string
  testId: string
}) {
  return (
    <div className={`gz-wbc ${tier ? 'on' : ''}`} data-testid={testId}>
      <div className="hd">
        <span>{label}</span>
        <b className="num">{value}</b>
        {/* What the tier asks for is the score's tooltip. */}
        <TipOn title={label} content={need}>
          <span className="s num gz-hov" tabIndex={0}>{tier ? (tier.mark ?? 0).toLocaleString() : '—'}</span>
        </TipOn>
      </div>
      {tier && tier.stats.length > 0 ? (
        <div className="st">
          {tier.stats.map(([key, amount]) => (
            <span key={key}>{statLabel(equipment, key)} <b className="num">+{amount.toLocaleString()}</b></span>
          ))}
        </div>
      ) : null}
    </div>
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
      <GzSelect
        value={affix.family}
        label={t('equip.affixFamily')}
        testId={`equip-affix-family-${slot}-${index}`}
        // An unpicked row reads "Pick a stat", which cannot be picked back.
        options={[
          ...(affix.family === '' ? [{ value: '', label: t('equip.affixPick'), disabled: true }] : []),
          ...families.map((family) => ({ value: family, label: family })),
        ]}
        // A new stat starts on its best rung, the one a player is usually reaching for.
        onChange={(raw) => onChange({ family: raw, value: raw === '' ? 0 : rungsFor(equipment, slot, raw)[0]?.rung[1] ?? 0 })}
      />
      {/* The value between −/+ that walk its rungs; the picker jumps straight to one. */}
      <span className="gz-val">
        <button type="button" disabled={!down} onClick={down} aria-label={t('equip.rungDown')}
          data-testid={`equip-affix-value-${slot}-${index}-down`}>−</button>
        <Popover open={valueOpen} onOpenChange={setValueOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="v num" disabled={rungs.length === 0} aria-label={`${t('equip.affixValue')} ${current ? signed(current.rung[1]) : '—'}`}
              data-testid={`equip-affix-value-${slot}-${index}`}>
              {current ? signed(current.rung[1]) : '—'}
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
        {current ? (
          <TipOn content={t('equip.affixMarkHint')}>
            <span className="mk num gz-hov" tabIndex={0}>{current.rung[0].toLocaleString()}</span>
          </TipOn>
        ) : <span className="mk num">—</span>}
        <button type="button" className="gz-rm" onClick={onRemove} aria-label={t('equip.removeAffix')}
          data-testid={`equip-affix-remove-${slot}-${index}`}>×</button>
      </span>
    </div>
  )
}

/**
 * A piece at a glance: icon, slot and gear level, name with its enhancement
 * stage after it, its tags and its score. Everything that is edited sits
 * behind it, in the piece's dialog, so the eight slots fit on one screen.
 */
function PieceSlot({ result, slotName, kind, onOpen }: {
  result: PieceResult
  slotName: string
  kind: SuitKind | null
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const { item, state } = result
  // One diamond per rolled affix: gold extraordinary, white normal, red contaminated.
  const rolled = result.affixes.filter((affix) => affix.family !== '')
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
        <span className="kind">
          <span className="lb">{[slotName, item?.gearLevel != null ? t('equip.levelTag', { level: item.gearLevel }) : null].filter(Boolean).join(' · ')}</span>
          <KindMark kind={kind} />
        </span>
        <b>
          <span className="n">{item ? item.name : t('equip.emptySlot')}</span>
          {item ? <StageMark stage={state.enhanceStage} /> : null}
          {item ? <span className="gz-rf num">({clampRefine(state.refinePercent)}%)</span> : null}
        </b>
      </span>
      <span className="s num" data-testid={`equip-slot-score-${state.slot}`}>{result.total.toLocaleString()}</span>
      {item ? (
        <span className="tags">
          {rolled.length > 0 ? (
            <span className="gz-dia" data-testid={`equip-slot-affixes-${state.slot}`}>
              {rolled.map((affix, at) => <i key={at} className={affix.tier} aria-hidden>◆</i>)}
            </span>
          ) : null}
          {result.grace ? <span className="gr">{result.grace.name}</span> : null}
        </span>
      ) : null}
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
        {shown.length === 0 ? <p className="note">{t('equip.pickerEmpty')}</p> : shown.map((item) => (
          <button key={item.id} type="button" className={`gz-pick ${item.id === selectedId ? 'on' : ''}`}
            aria-pressed={item.id === selectedId} onClick={() => onSelect(item.id)} data-testid={`equip-picker-option-${item.id}`}>
            {/* The PVE/PVP mark sits on the icon's corner. */}
            <span className="icw">
              <IconTile quality={item.quality} src={equipmentIconUrl(item.icon)} alt="" className="ic" />
              <KindMark kind={kindOf(t, equipment, item)} />
            </span>
            <b>{item.name}</b>
            <small>{t('equip.levelTag', { level: item.gearLevel ?? '—' })}</small>
          </button>
        ))}
      </div>
    </PickBox>
  )
}

/**
 * The effects a piece carries, each a heading (kind · name) over its text:
 * first the 恩赐 the extraordinary affixes trigger, then the 神话词条 and the
 * 烙印 that come with the item.
 */
function PieceEffects({ result, healing }: { result: PieceResult; healing: boolean }) {
  const { t } = useTranslation()
  const slot = result.state.slot
  const myth = result.item?.myth
  const grace = result.grace
  // A healer reads the healing form where the game words one; anyone else the damage form.
  const pick = (damage: string, heal: string | undefined) => (healing && heal ? heal : damage)
  return (
    <>
      {grace ? (
        <div className="gz-fx" data-kind="grace" data-testid={`equip-grace-${slot}`}>
          <div className="sub">
            {t('equip.grace')} · {grace.name}
            <span className="meta gz-pips">{'◆'.repeat(grace.extraordinaryCount)}</span>
          </div>
          <p className="note">{pick(grace.brief1, grace.brief2)}</p>
        </div>
      ) : result.extraordinaryCount >= 2 ? (
        <div className="gz-fx" data-kind="grace" data-testid={`equip-grace-${slot}`}>
          <div className="sub">{t('equip.grace')}</div>
          <p className="note">{t('equip.noGrace')}</p>
        </div>
      ) : null}
      {myth ? (
        <div className="gz-fx" data-kind="myth" data-testid={`equip-myth-${slot}`}>
          <div className="sub">{t('equip.myth')} · {myth.name}</div>
          <p className="note">{pick(myth.effect, myth.healEffect)}</p>
        </div>
      ) : null}
      {result.brand ? (
        <div className="gz-fx" data-kind="brand" data-testid={`equip-brand-${slot}`}>
          <div className="sub">{t('equip.brand')} · {result.brand.name}</div>
          <p className="note">{result.brand.effect}</p>
        </div>
      ) : null}
    </>
  )
}

/**
 * One piece's dialog: the item with a button to swap it, its stats and the
 * three scores the piece adds up to, enhancement and affixes, the effects it
 * carries, and last the one destructive action. An empty slot opens straight
 * on the item list. The dialog is portalled out of the page's read-only
 * fieldset, so it carries its own.
 */
function PieceDialog({ equipment, graces, slotName, kind, result, readOnly, professionId, healing, onPatch }: {
  equipment: Equipment
  graces: Grace[]
  slotName: string
  kind: SuitKind | null
  result: PieceResult
  readOnly: boolean
  professionId: number | null
  /** Whether the character's talent tree is a healing one; see `HEALING_TREES`. */
  healing: boolean
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
  const n = (value: number) => value.toLocaleString()
  return (
    <DialogContent className="gz-dlg" data-testid={`equip-dialog-${slot}`}>
      <fieldset disabled={readOnly}>
        <ItemHead
          icon={<IconTile quality={item.quality} src={equipmentIconUrl(item.icon)} alt="" className="ic" />}
          title={<>{slotName} · {item.name} <StageMark stage={state.enhanceStage} /></>}
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
          <TipOn content={t('equip.pieceBreakdown', { base: n(result.baseScore), enhance: n(result.enhanceScore), reforge: n(result.reforgeScore), total: n(result.total) })}>
            <span className="gz-escore" tabIndex={0}>
              <small className="gz-hov">{t('equip.pieceScoreLabel')}</small>
              <b className="num" data-testid={`equip-score-${slot}`}>{n(result.total)}</b>
            </span>
          </TipOn>
        </div>
        {/* The three scores the piece adds up to, each with how it is worked out. */}
        <div className="gz-kv gz-eqkv" data-testid={`equip-reforge-${slot}`}>
          <div>
            <span className="lab">{t('equip.baseScore')}</span>
            <TipOn title={t('equip.baseScore')} content={t('equip.baseHint')}>
              <b className="num gz-hov" tabIndex={0} data-testid={`equip-base-score-${slot}`}>{n(result.baseScore)}</b>
            </TipOn>
          </div>
          <div>
            <span className="lab">{t('equip.enhanceRefineShort')}</span>
            <TipOn title={t('equip.enhanceRefineShort')} content={t('equip.enhanceHint', { per: REFINE_PER_STAGE, level: result.refineLevel, max: REFINE_LEVELS, score: n(result.enhanceScore) })}>
              <b className="num gz-hov" tabIndex={0} data-testid={`equip-${slot}-enhance-score`}>{n(result.enhanceScore)}</b>
            </TipOn>
            <small>{t('equip.stageOption', { stage: state.enhanceStage })} · {t('equip.refineTag', { value: clampRefine(state.refinePercent) })}</small>
          </div>
          <div>
            <span className="lab">{t('equip.reforgeScoreLabel')}</span>
            <TipOn title={t('equip.reforgeScoreLabel')} content={t('equip.reforgeHint', { mark: n(result.affixMark), bonus: n(result.extraordinaryBonus), score: n(result.reforgeScore), n: result.extraordinaryCount })}>
              <b className="num gz-hov" tabIndex={0}>{n(result.reforgeScore)}</b>
            </TipOn>
            <small>{t('equip.bonusIncluded', { n: n(result.extraordinaryBonus) })}</small>
          </div>
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

        <PieceEffects result={result} healing={healing} />
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
 * What a live suit's effects come to, for its tooltip: each piece-count effect
 * the worn pieces reach, with the stats it grants at the gear level it runs at
 * and its score, and those not reached as such.
 */
function SuitEffects({ entry }: { entry: SuitScore }) {
  const { t } = useTranslation()
  return (
    <ul className="gz-suitfx" data-testid={`equip-suit-effects-${entry.suit.id}`}>
      {entry.suit.pieceCounts.map((pieces) => {
        const effect = entry.effects.find((reached) => reached.pieces === pieces)
        return (
          <li key={pieces} className={effect ? 'on' : ''}>
            <b>{t('equip.suitPieces', { pieces })}{effect ? <small className="num">{t('equip.suitAtLevel', { level: effect.gearLevel })}</small> : null}</b>
            <span className="tx">
              {effect ? suitEffectText(entry.suit, pieces, effect.gearLevel) : t('equip.suitEffectOffShort', { count: entry.count })}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Each live piece-count effect's score and how it is worked out, for the suit score's tooltip. */
function suitScoreLines(t: TFunction, equipment: Equipment, entry: SuitScore | null): string {
  if (!entry || entry.effects.length === 0) return t('equip.eqSuitNone')
  return entry.effects.map((effect) => {
    const formula = equipment.suits.levelScores?.[String(entry.suit.pieceCounts.indexOf(effect.pieces) + 1)]
    const line = formula
      ? t('equip.suitEffectScoreLine', { perLevel: formula.perLevel, level: effect.gearLevel, origin: formula.origin, score: effect.score.toLocaleString() })
      : effect.score.toLocaleString()
    return `${t('equip.suitPieces', { pieces: effect.pieces })}：${line}`
  }).join('\n')
}

/** A suit's short name, its kind as the game tags it: 冒险 or 竞技. */
const suitShort = (suit: SuitScore['suit']) => suit.tag?.replace(/套装$/, '') || suit.name

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
  healing = false,
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
  /** Whether the character heals: item effects then read their healing form. */
  healing?: boolean
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useSection('equipment')
  // Which slot's detail dialog is open.
  const [openSlot, setOpenSlot] = useState<number | null>(null)
  const readOnly = useCharacterReadOnly()

  // What is scored: the stored draft checked against the dataset and the
  // pathway (see `evaluateLoadout`), the same reading the formula marks take.
  const loadout = useMemo(
    () => evaluateLoadout(equipment, graces, draft, professionId),
    [draft, equipment, graces, professionId],
  )
  const { pieces, results, averagePercent, bodyTier, refineTier, suitScores, chosenSuit } = loadout
  const { batch } = draft
  const writePieces = useCallback(
    (next: PieceState[]) => setDraft((prev) => ({ ...prev, pieces: next })),
    [setDraft],
  )
  const openIndex = results.findIndex((result) => result.state.slot === openSlot)
  const suitNeed = Math.min(...equipment.suits.suits.map(suitThreshold))
  const slotNames = useMemo(() => new Map(equipment.slots.map((slot) => [slot.id, slot.name])), [equipment])

  // The game's four parts: 基础, 强化 (the pieces' plus both whole-body sets),
  // 词条 (the reforge, affixes and bonus together) and 套装.
  const { base, enhance, reforge, suit, total } = loadout.totals
  const totals = useMemo(() => ({ base, enhance, reforge, suit, total }), [base, enhance, reforge, suit, total])
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

  // What each whole-loadout set asks for: the tier reached, or the first one.
  const firstTier = (type: number) => equipment.suits.tiers
    .filter((tier) => tier.type === type)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0))[0] ?? null
  const bodyNeed = bodyTier ?? firstTier(1)
  const refineNeed = refineTier ?? firstTier(2)
  const percent = averagePercent.toLocaleString(undefined, { maximumFractionDigits: 2 })
  const n = (value: number) => value.toLocaleString()

  return (
    <section className="space-y-2.5" aria-label={t('equip.title')} data-testid="equip-section">
      <div className="gz-panel-head">
        <h3>{t('equip.worn')}</h3>
        <span className="meta">{t('equip.slotHint')}</span>
        <div className="acts">
          {/* The loadout's total, split into the game's four parts on hover. */}
          <TipOn content={t('equip.totalBreakdown', { base: n(base), enhance: n(enhance), reforge: n(reforge), suit: n(suit) })}>
            <span className="gz-eqtotal" tabIndex={0} data-testid="equip-totals">
              <span className="gz-hov">{t('equip.totalScore')}</span> <b className="num">{n(total)}</b>
            </span>
          </TipOn>
          <Dialog>
            <DialogTrigger asChild>
              <button type="button" disabled={readOnly} className="gz-chip" data-testid="equip-batch-open">
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
            kind={kindOf(t, equipment, result.item)}
            onOpen={() => setOpenSlot(result.state.slot)}
          />
        ))}
      </div>

      <div className="gz-eqfoot">
        {/* The two whole-loadout sets: where each stands, the stats it grants
            and the score it counts, and what it asks for. */}
        <div className="gz-wb">
          <BonusTier equipment={equipment} tier={bodyTier} testId="equip-body-tier"
            label={t('equip.bodyBonus')}
            value={bodyTier ? t('equip.stageOption', { stage: bodyTier.requiredStage ?? 0 }) : '—'}
            need={bodyNeed ? t('equip.bodyTierNeed', { pieces: bodyNeed.requiredPieces ?? pieces.length, stage: bodyNeed.requiredStage ?? 0 }) : ''} />
          <BonusTier equipment={equipment} tier={refineTier} testId="equip-refine-tier"
            label={t('equip.refineLabel')}
            value={`${percent}%`}
            need={refineNeed ? t('equip.refineTierNeed', { percent: refineNeed.requiredAveragePercent ?? 0 }) : ''} />
        </div>

        <div className="gz-suit">
          {/* One head line, as the set cards have: title, the live suits, the score. */}
          <div className="hd">
          <span>{t('equip.suit')}</span>
          {suitScores.length === 0 ? (
            <span data-testid="equip-suit-active">
              {t('equip.suitNone', { need: Number.isFinite(suitNeed) ? suitNeed : '—' })}
            </span>
          ) : (
            // Only one suit can be in effect, so the live ones are a choice: the
            // chosen one is highlighted and scores; with a single live suit there
            // is nothing to choose and it is taken as is. Each one's effects, at
            // the gear level they run at, are listed under the row; with two
            // live, a note says why only the chosen one counts.
            <div className="gz-seg" role="group" aria-label={t('equip.suitChoose')}>
              {suitScores.map((entry) => {
                const chosen = entry.suit.id === chosenSuit?.suit.id
                return (
                  <span key={entry.suit.id} className="gz-suitopt">
                    <button
                      type="button"
                      aria-pressed={chosen}
                      disabled={readOnly || suitScores.length === 1}
                      onClick={() => setDraft((prev) => ({ ...prev, suitChoice: entry.suit.id }))}
                      className="gz-chip"
                      data-testid={`equip-suit-${entry.suit.id}`}
                      data-chosen={chosen}
                    >
                      {/* The kind and score; the suit's full name and pieces worn are the tooltip. */}
                      <TipOn content={t('equip.suitActive', { name: entry.suit.fullName || entry.suit.name, pieces: entry.count })}>
                        <span className="gz-hov">{suitShort(entry.suit)}</span>
                      </TipOn>
                      <small className="num">{n(entry.total)}</small>
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          <TipOn title={t('equip.suit')} content={suitScoreLines(t, equipment, chosenSuit)}>
            <span className="s num gz-hov" tabIndex={0} data-testid="equip-suit-score">{n(suit)}</span>
          </TipOn>
          </div>
          {suitScores.length > 1 ? <p className="note">{t('equip.suitChooseHint')}</p> : null}
          {chosenSuit ? <SuitEffects entry={chosenSuit} /> : null}
        </div>
      </div>

      <Dialog open={openIndex >= 0} onOpenChange={(open) => { if (!open) setOpenSlot(null) }}>
        {openIndex >= 0 ? (
          <PieceDialog
            key={results[openIndex].state.slot}
            equipment={equipment}
            graces={graces}
            slotName={slotNames.get(results[openIndex].state.slot) ?? ''}
            kind={kindOf(t, equipment, results[openIndex].item)}
            result={results[openIndex]}
            readOnly={readOnly}
            professionId={professionId}
            healing={healing}
            onPatch={(patch) => patchPiece(openIndex, patch)}
          />
        ) : null}
      </Dialog>
    </section>
  )
}
