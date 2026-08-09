import type { MouseEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CircleHelp, ListTree, Plus, Sparkles, Star, X, Zap } from 'lucide-react'
import { cn } from '@gamemap/ui'
import { OverflowMarquee } from '@gamemap/map-shell'
import type { BreedingPal, Combo, Gender, NameMap } from '../../lib/breeding'
import { palIconUrl } from '../../lib/breeding'
import { formatPalId, palIdText } from '../../lib/palId'
import { PalHover } from '../catalog/components'

// Per-Pal display metadata used by a recipe card (icon, Paldeck id, breeding
// power, legendary flag), keyed by Pal id.
export interface RecipeMetaEntry {
  icon?: string
  zukanIndex: number
  zukanIndexSuffix: string
  rank: number
  legendary?: boolean
}
export type RecipeMeta = Map<string, RecipeMetaEntry>

export function buildRecipeMeta(pals: BreedingPal[]): RecipeMeta {
  return new Map(
    pals.map((p) => [
      p.id,
      {
        icon: p.icon,
        zukanIndex: p.zukanIndex,
        zukanIndexSuffix: p.zukanIndexSuffix,
        rank: p.rank,
        legendary: p.legendary,
      },
    ]),
  )
}

/**
 * How a recipe (and the pickers above it) is laid out:
 * - `row` — the desktop line: `A + B = C` as inline chips (icon + name + meta).
 * - `tile` — phones: three squares in one line, in the same visual language as
 *   the building / technology tiles (metadata strip, icon, name).
 * - `compact` — phone result cards matching the multi-generation route cards.
 */
export type BreedingVariant = 'row' | 'tile' | 'compact'

// Gold ring + glow marking a legendary Pal's icon (self-bred only).
export const LEGENDARY_ICON = 'ring-2 ring-amber-400 shadow-[0_0_6px_1px_rgba(251,191,36,0.55)]'

// The amber "special combo" pill, shared by both card variants (floating on the
// row card's top edge, inline in the tile card's bottom bar).
const UNIQUE_PILL =
  'inline-flex items-center gap-1 rounded-full border border-amber-400/70 bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300'

function localizedPalId(value: string | undefined, locale: string): string | undefined {
  return locale.startsWith('zh') ? value?.replace(/^No\./, '编号 ') : value
}

export function GenderMark({ g }: { g?: Gender }) {
  if (!g) return null
  return (
    <span
      className={g === 'M' ? 'font-semibold text-sky-500' : 'font-semibold text-pink-500'}
      title={g === 'M' ? 'Male' : 'Female'}
    >
      {g === 'M' ? '♂' : '♀'}
    </span>
  )
}

export function PalChip({
  id,
  names,
  meta,
  gender,
  emphasis,
}: {
  id: string
  names: NameMap
  meta: RecipeMeta
  gender?: Gender
  emphasis?: boolean
}) {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en-US'
  const m = meta.get(id)
  const pid = m ? formatPalId(m.zukanIndex, m.zukanIndexSuffix) : undefined
  return (
    <PalHover id={id} side="top" align="center">
    <Link
      to="/pals/$id"
      params={{ id }}
      className="group flex min-w-0 items-center gap-1.5"
    >
      {m?.icon ? (
        <img
          src={palIconUrl(m.icon)}
          alt=""
          loading="lazy"
          className={cn(
            'size-7 shrink-0 rounded-full bg-black/5 object-contain dark:bg-white/10',
            m.legendary && LEGENDARY_ICON,
          )}
        />
      ) : null}
      <span className="flex min-w-0 flex-col leading-tight">
        <span
          className={cn(
            'truncate decoration-primary/40 underline-offset-2 group-hover:text-primary group-hover:underline',
            emphasis && 'font-semibold',
          )}
        >
          {names[id] ?? id}
          <GenderMark g={gender} />
        </span>
        <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
          {pid ? (
            <span>
              {localizedPalId(pid.text, locale)}
              {pid.accent ? <span className="text-primary">{pid.accent}</span> : null}
            </span>
          ) : null}
          {m ? (
            <span className="inline-flex items-center gap-0.5">
              <Zap className="size-2.5 shrink-0" />
              {m.rank}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
    </PalHover>
  )
}

export function CompactPalNode({
  id,
  names,
  meta,
  gender,
  emphasis,
  unique,
}: {
  id: string
  names: NameMap
  meta: RecipeMeta
  gender?: Gender
  emphasis?: boolean
  unique?: boolean
}) {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en-US'
  const m = meta.get(id)
  const name = names[id] ?? id
  const idText = m ? localizedPalId(palIdText(formatPalId(m.zukanIndex, m.zukanIndexSuffix)), locale) : undefined
  const metaText = m ? [idText, String(m.rank)].filter(Boolean).join(' ') : ''
  return (
    <PalHover id={id} side="top" align="center">
      <Link
        to="/pals/$id"
        params={{ id }}
        title={name}
        className={cn(
          'flex min-w-0 flex-col overflow-hidden rounded-md border bg-background transition-colors hover:border-primary/60 hover:bg-accent',
          unique ? 'border-amber-400/70 bg-amber-400/10' : 'border-primary/25',
          emphasis && 'border-primary/40 bg-primary/5',
        )}
      >
        <span className="flex min-w-0 items-center gap-0.5 px-1 py-1">
          {m?.icon ? (
            <img
              src={palIconUrl(m.icon)}
              alt=""
              loading="lazy"
              className={cn(
                'size-6 shrink-0 rounded-full bg-black/5 object-contain dark:bg-white/10',
                m.legendary && LEGENDARY_ICON,
              )}
            />
          ) : null}
          <span className={cn('flex min-w-0 flex-1 items-center text-xs leading-tight', emphasis && 'font-semibold')}>
            <OverflowMarquee text={name} auto className="min-w-0 flex-1" />
            <GenderMark g={gender} />
          </span>
        </span>
        {m ? (
          <span className="flex min-w-0 border-t border-primary/15 bg-primary/5 px-1 py-0.5 text-xs leading-tight tabular-nums text-foreground dark:text-white">
            <OverflowMarquee
              text={metaText}
              auto
              className="min-w-0 flex-1"
              contentClassName="inline-flex min-w-full items-center justify-center gap-1 text-center"
            >
              {idText ? <span>{idText}</span> : null}
              <span className="inline-flex items-center gap-0.5">
                <Zap className="size-3 shrink-0" />
                {m.rank}
              </span>
            </OverflowMarquee>
          </span>
        ) : null}
      </Link>
    </PalHover>
  )
}

// --- square tiles (phones) ---------------------------------------------------
// The `tile` variant's building blocks, also used by the picker row (PalPicker)
// so the selection squares and the recipe squares are the same object. They live
// here next to `PalChip`, the row-variant sibling, so the two never drift.

/**
 * Tile geometry: a square box clipping its own content. `overflow-hidden` is
 * load-bearing — an overflow-visible grid item gets an automatic minimum size
 * from its text, which would stretch the box taller than a square on the
 * narrowest phones; clipping keeps it exactly square at any column width.
 */
export const TILE_FRAME =
  'flex aspect-square w-full min-w-0 flex-col overflow-hidden rounded-md border text-left shadow-sm transition'
/**
 * Muted metadata strip on top (the building tile's type + `#id` line). Tight
 * `gap-0.5`: at 320px a tile header has ~66px to fit a label and a 13px glyph.
 */
export const TILE_HEADER =
  'flex shrink-0 items-center gap-0.5 bg-muted px-1 py-0.5 text-xs tabular-nums text-foreground dark:text-white'
export const TILE_FOOTER = 'shrink-0 px-1 pb-1'
export const TILE_NAME = 'flex min-w-0 items-center justify-center text-center text-xs font-medium leading-tight'
/**
 * Second footer line (breeding power). Dropped below 360px, where a third text
 * row would leave the icon barely 16px tall — the number is still one tap away
 * in the picker list and the pal hover card.
 *
 * Why it isn't in the header next to the Paldeck id, like the building tile's
 * type + `#id`: breeding power is a 4-digit number for 215 of the 299 Pals, and
 * `No.001` + `⚡3050` measures ~98px against the ~89px a tile has to spend on a
 * 390px phone — one of them would always be truncated.
 */
export const TILE_META =
  'hidden items-center justify-center gap-1 text-xs leading-tight tabular-nums text-foreground min-[360px]:flex dark:text-white'

/**
 * The tile's icon: a circle that takes whatever height the header and footer
 * leave, so one markup serves a 320px viewport (~27px icon) and a phablet
 * (~50px) with no breakpoint juggling. `flex-1 min-h-0` sets the height,
 * `aspect-square` derives the width from it, and the image is absolutely
 * positioned so it never reintroduces a percentage-height dependency.
 */
export function TileIcon({ icon, legendary }: { icon?: string; legendary?: boolean }) {
  return (
    <span
      className={cn(
        'relative my-0.5 aspect-square min-h-0 flex-1 self-center rounded-full bg-black/5 dark:bg-white/10',
        legendary && LEGENDARY_ICON,
      )}
    >
      {icon ? (
        <img
          src={palIconUrl(icon)}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full rounded-full object-contain"
        />
      ) : null}
    </span>
  )
}

/** Empty-picker glyph: a dashed circle reading "tap to choose" (see PalPicker). */
export function TileIconPlaceholder() {
  return (
    <span className="relative my-0.5 flex aspect-square min-h-0 flex-1 items-center justify-center self-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground">
      <Plus className="size-4" />
    </span>
  )
}

/**
 * Stands in for a Pal that will never be chosen: the planner's middle slot,
 * where the partner is whatever the search finds rather than an input. Solid
 * (not dashed like {@link TileIconPlaceholder}) because the tile IS set — it
 * carries the generation budget — so it must not read as an empty picker.
 */
export function TileIconUnknown() {
  return (
    <span className="relative my-0.5 flex aspect-square min-h-0 flex-1 items-center justify-center self-center rounded-full bg-black/5 text-muted-foreground dark:bg-white/10">
      <CircleHelp className="size-4" />
    </span>
  )
}

/** The `+` / `=` between two tiles: an `auto` grid column of its own. */
export function TileSep({ children }: { children: string }) {
  return (
    <span data-testid="breeding-tile-sep" className="shrink-0 text-center text-sm text-muted-foreground">
      {children}
    </span>
  )
}

/**
 * Paldeck id (with its variant-suffix accent) filling the tile's header strip.
 * Uncatalogued Pals still render the empty strip, so every tile in a row keeps
 * the same icon size.
 */
export function TilePalId({ meta }: { meta?: RecipeMetaEntry }) {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? 'en-US'
  const pid = meta ? formatPalId(meta.zukanIndex, meta.zukanIndexSuffix) : undefined
  if (!pid) return <span className="min-w-0 flex-1" />
  return (
    <span className="min-w-0 flex-1 truncate">
      {localizedPalId(pid.text, locale)}
      {pid.accent ? <span className="text-primary">{pid.accent}</span> : null}
    </span>
  )
}

/** Breeding power (CombiRank) with its lightning glyph. */
export function TileRank({ rank }: { rank: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      <Zap className="size-3 shrink-0" />
      {rank}
    </span>
  )
}

/**
 * One Pal as a square tile: the Paldeck id on the strip, the icon, then the name
 * and its breeding power below. Same link target and hover card as
 * {@link PalChip}, so the tile row loses none of the row layout's affordances.
 */
export function PalTile({
  id,
  names,
  meta,
  gender,
  emphasis,
}: {
  id: string
  names: NameMap
  meta: RecipeMeta
  gender?: Gender
  emphasis?: boolean
}) {
  const m = meta.get(id)
  const name = names[id] ?? id
  return (
    <PalHover id={id} side="top" align="center">
      <Link
        to="/pals/$id"
        params={{ id }}
        data-testid="breeding-tile"
        title={name}
        className={cn(TILE_FRAME, 'border-border bg-background hover:border-primary/60 hover:bg-accent')}
      >
        <span className={TILE_HEADER}>
          <TilePalId meta={m} />
        </span>
        <TileIcon icon={m?.icon} legendary={m?.legendary} />
        <span className={TILE_FOOTER}>
          <span className={cn(TILE_NAME, emphasis && 'font-semibold')}>
            <OverflowMarquee text={name} auto className="min-w-0 flex-1" />
            <GenderMark g={gender} />
          </span>
          {m ? (
            <span className={TILE_META}>
              <TileRank rank={m.rank} />
            </span>
          ) : null}
        </span>
      </Link>
    </PalHover>
  )
}

// --- recipe card -------------------------------------------------------------

/**
 * The card's buttons: favourite first, then the drill-down — or, on a card that
 * IS the drill-down, a × that collapses it instead (`onClose` replaces
 * `onSelect`'s slot; a focused node cannot be expanded again).
 *
 * Order matters: the tile variant stacks these vertically beside the squares,
 * and the user asked for the star on top with the tree/× under it.
 */
function CardActions({
  fav,
  onSelect,
  selectLabel,
  onClose,
  closeLabel,
  roomy,
}: Pick<RecipeCardProps, 'fav' | 'onSelect' | 'selectLabel' | 'onClose' | 'closeLabel'> & { roomy: boolean }) {
  const btn = cn('rounded text-muted-foreground hover:bg-accent hover:text-foreground', roomy ? 'p-2' : 'p-1')
  return (
    <>
      {fav ? (
        <button
          type="button"
          onClick={fav.onToggle}
          aria-label={fav.label}
          aria-pressed={fav.isFav}
          title={fav.label}
          data-testid="breeding-fav"
          className={btn}
        >
          <Star className={cn('size-4', fav.isFav && 'fill-amber-400 text-amber-400')} />
        </button>
      ) : null}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          title={closeLabel}
          data-testid="breeding-collapse"
          className={btn}
        >
          <X className="size-4" />
        </button>
      ) : onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          aria-label={selectLabel}
          title={selectLabel}
          data-testid="breeding-expand"
          className={btn}
        >
          <ListTree className="size-4" />
        </button>
      ) : null}
    </>
  )
}

export interface RecipeCardProps {
  f: Combo
  names: NameMap
  meta: RecipeMeta
  uniqueLabel: string
  /** When provided, renders a favourite-toggle star. */
  fav?: { isFav: boolean; onToggle: () => void; label: string }
  /**
   * Drop the `= C` result, showing only the `A + B` parents. Used by the Paldeck
   * breeding section, where every recipe produces the same (current) Pal, so the
   * result is redundant — and dropping it leaves room for the full parent chips
   * in that narrow column.
   *
   * Ignored by the `tile` and `compact` phone variants, which always draw all
   * three Pals so every result card keeps the same geometry.
   */
  hideResult?: boolean
  /**
   * Makes the whole card clickable (clicks on inner links/buttons keep their
   * own behavior) and adds a tree icon-button as the keyboard-accessible
   * affordance. Used to drill into how to breed this recipe's parents.
   */
  onSelect?: () => void
  /** Accessible label / tooltip for the select affordance. */
  selectLabel?: string
  /**
   * Collapses the drill-down this card heads. Takes `onSelect`'s slot in the
   * action column and renders a × — the card is already expanded, so offering
   * "expand" again would be a no-op.
   */
  onClose?: () => void
  /** Accessible label / tooltip for the collapse affordance. */
  closeLabel?: string
  /**
   * `tile` switches to the phone layout (three squares in one line). Threaded
   * from the page rather than read from `useIsMobile()` here, so the Paldeck's
   * breeding section — a narrow column with its own height bookkeeping — keeps
   * the compact chip rows it was built around.
   */
  variant?: BreedingVariant
}

/**
 * One breeding recipe. Normally `A + B = C`; with `hideResult` just `A + B`
 * (the parents). Width-flexible (the parent grid controls column count) so the
 * same card serves the wide calculator and the narrower Paldeck breeding
 * section. The star / expand actions are only rendered when `fav` / `onSelect`
 * are given.
 *
 * `variant='tile'` is the phone layout: the same recipe as ALWAYS three squares
 * in one line (it ignores `hideResult` — see that prop), separators between
 * them, and the actions in a column to their right.
 */
export function RecipeCard({
  f,
  names,
  meta,
  uniqueLabel,
  fav,
  hideResult,
  onSelect,
  selectLabel,
  onClose,
  closeLabel,
  variant = 'row',
}: RecipeCardProps) {
  // `onClose` and `onSelect` share one slot, so at most two buttons render.
  const buttonCount = (fav ? 1 : 0) + (onClose || onSelect ? 1 : 0)
  const hasActions = buttonCount > 0
  const actions = hasActions ? (
    <CardActions
      fav={fav}
      onSelect={onSelect}
      selectLabel={selectLabel}
      onClose={onClose}
      closeLabel={closeLabel}
      roomy={variant === 'tile'}
    />
  ) : null
  // Inner pal links and action buttons keep their own behavior.
  const onCardClick = onSelect
    ? (e: MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('a,button')) return
        onSelect()
      }
    : undefined

  if (variant === 'compact') {
    return (
      <div
        data-testid="breeding-recipe"
        title={f.unique ? uniqueLabel : undefined}
        data-unique={f.unique ? '' : undefined}
        className={cn(
          'overflow-hidden rounded-xl border bg-card text-sm shadow-sm',
          f.unique ? 'border-amber-400/70 ring-1 ring-amber-400/30' : 'border-primary/30',
          onSelect && 'cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/40',
        )}
        onClick={onCardClick}
      >
        {f.unique ? <span className="sr-only">{uniqueLabel}</span> : null}
        {onSelect || onClose ? (
          <div className="flex min-w-0 items-center justify-between gap-2 border-b border-primary/20 bg-primary/5 px-2.5 py-2">
            <span className="min-w-0 truncate font-medium">
              {names[f.a] ?? f.a}
              <span className="px-1.5 text-muted-foreground">→</span>
              {names[f.c] ?? f.c}
            </span>
            {actions ? <span className="flex shrink-0 items-center gap-0.5">{actions}</span> : null}
          </div>
        ) : null}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 px-2.5 py-2">
          <CompactPalNode id={f.a} names={names} meta={meta} gender={f.ag} />
          <span className="text-muted-foreground">+</span>
          <CompactPalNode id={f.b} names={names} meta={meta} gender={f.bg} unique={f.unique} />
          <span className="text-muted-foreground">=</span>
          <CompactPalNode id={f.c} names={names} meta={meta} emphasis />
        </div>
      </div>
    )
  }

  if (variant === 'tile') {
    return (
      <div
        data-testid="breeding-recipe"
        // The amber frame is the visual "special combo" signal here: a ~2.5rem
        // action column has no room for the pill, and a third item stacked in it
        // would outgrow the squares and stretch the card. `title` serves a mouse;
        // the sr-only span below carries the label for assistive tech, because
        // `aria-label` on a generic div is not reliably exposed.
        title={f.unique ? uniqueLabel : undefined}
        data-unique={f.unique ? '' : undefined}
        className={cn(
          'grid items-center gap-1 rounded-lg border p-1.5 text-sm',
          // `minmax(0,1fr)` tile columns + `auto` separator columns: the three
          // squares split whatever the separators leave, so the row fits a
          // 320px viewport without horizontal scrolling. The trailing `auto` is
          // the action column, which is only present when there is one.
          hasActions
            ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto]'
            : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]',
          f.unique ? 'border-amber-400/70 bg-amber-400/10 ring-1 ring-amber-400/30' : 'border-border bg-card',
          onSelect && 'cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/40',
        )}
        onClick={onCardClick}
      >
        {f.unique ? <span className="sr-only">{uniqueLabel}</span> : null}
        {/* Always three squares, even where `hideResult` asks for two: two
            squares stretch to half the row each and dwarf the three-square
            cards above them, so the drill-down sections would change size as
            you descend. The result tile is redundant inside a "how to breed X"
            section (it is always X) but keeping it holds the rhythm. */}
        <PalTile id={f.a} names={names} meta={meta} gender={f.ag} />
        <TileSep>+</TileSep>
        <PalTile id={f.b} names={names} meta={meta} gender={f.bg} />
        <TileSep>=</TileSep>
        <PalTile id={f.c} names={names} meta={meta} emphasis />
        {actions ? (
          // A column beside the squares rather than a bar under them: a row of
          // its own cost a whole line per card, and these cards stack. Two
          // buttons at most, so the column stays shorter than a square.
          <span className="flex flex-col items-center justify-center gap-0.5">{actions}</span>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative grid items-center gap-1.5 rounded-lg border px-3 py-2 text-sm',
        // Below sm this row layout wraps to two lines (A + B, then = C) so the
        // three names aren't crushed into unreadable truncations; sm+ keeps the
        // single-row A + B = C layout. The breeding page never renders this at
        // phone widths (it switches to `tile`), but the Paldeck's narrow
        // breeding column does.
        hideResult
          ? hasActions
            ? 'grid-cols-[1fr_auto_1fr_auto]'
            : 'grid-cols-[1fr_auto_1fr]'
          : hasActions
            ? 'grid-cols-[1fr_auto_1fr_auto] sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto]'
            : 'grid-cols-[1fr_auto_1fr] sm:grid-cols-[1fr_auto_1fr_auto_1fr]',
        f.unique
          ? 'border-amber-400/70 bg-amber-400/10 ring-1 ring-amber-400/30'
          : 'border-border bg-card',
        onSelect && 'cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/40',
      )}
      onClick={onCardClick}
    >
      {f.unique ? (
        <span
          className={cn(
            UNIQUE_PILL,
            'absolute -top-2',
            // Clear however many buttons the action cell holds, so the pill
            // never lands on one.
            buttonCount === 2 ? 'right-14' : buttonCount === 1 ? 'right-8' : 'right-2',
          )}
          title={uniqueLabel}
        >
          <Sparkles className="size-3" />
          {uniqueLabel}
        </span>
      ) : null}
      <PalChip id={f.a} names={names} meta={meta} gender={f.ag} />
      <span className="text-muted-foreground">+</span>
      <PalChip id={f.b} names={names} meta={meta} gender={f.bg} />
      {hideResult ? null : (
        // Phone: one full-width flex row below the parents. sm+: display
        // contents dissolves the wrapper so `=` and C are grid cells again.
        <span className="order-last col-span-full flex min-w-0 items-center gap-1.5 sm:contents">
          <span className="text-muted-foreground">=</span>
          <PalChip id={f.c} names={names} meta={meta} emphasis />
        </span>
      )}
      {actions ? <span className="ml-1 flex items-center">{actions}</span> : null}
    </div>
  )
}
