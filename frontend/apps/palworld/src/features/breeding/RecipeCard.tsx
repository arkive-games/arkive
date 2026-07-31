import type { MouseEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { ListTree, Plus, Sparkles, Star, Zap } from 'lucide-react'
import { cn } from '@gamemap/ui'
import type { BreedingPal, Combo, Gender, NameMap } from '../../lib/breeding'
import { palIconUrl } from '../../lib/breeding'
import { formatPalId } from '../../lib/palId'
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
 */
export type BreedingVariant = 'row' | 'tile'

// Gold ring + glow marking a legendary Pal's icon (self-bred only).
export const LEGENDARY_ICON = 'ring-2 ring-amber-400 shadow-[0_0_6px_1px_rgba(251,191,36,0.55)]'

// The amber "special combo" pill, shared by both card variants (floating on the
// row card's top edge, inline in the tile card's bottom bar).
const UNIQUE_PILL =
  'inline-flex items-center gap-1 rounded-full border border-amber-400/70 bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300'

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
  const m = meta.get(id)
  const pid = m ? formatPalId(m.zukanIndex, m.zukanIndexSuffix) : undefined
  return (
    <PalHover id={id}>
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
              {pid.text}
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
  'flex shrink-0 items-center gap-0.5 bg-muted px-1 py-0.5 text-xs tabular-nums text-muted-foreground'
export const TILE_FOOTER = 'shrink-0 px-1 pb-1'
export const TILE_NAME = 'block truncate text-center text-xs font-medium leading-tight'
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
  'hidden items-center justify-center gap-1 text-xs leading-tight tabular-nums text-muted-foreground min-[360px]:flex'

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
  const pid = meta ? formatPalId(meta.zukanIndex, meta.zukanIndexSuffix) : undefined
  if (!pid) return <span className="min-w-0 flex-1" />
  return (
    <span className="min-w-0 flex-1 truncate">
      {pid.text}
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
    <PalHover id={id}>
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
            {name}
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

/** The star / expand buttons, shared by both variants (roomier on tiles). */
function CardActions({
  fav,
  onSelect,
  selectLabel,
  roomy,
}: Pick<RecipeCardProps, 'fav' | 'onSelect' | 'selectLabel'> & { roomy: boolean }) {
  const btn = cn('rounded text-muted-foreground hover:bg-accent hover:text-foreground', roomy ? 'p-2' : 'p-1')
  return (
    <>
      {onSelect ? (
        <button type="button" onClick={onSelect} aria-label={selectLabel} title={selectLabel} className={btn}>
          <ListTree className="size-4" />
        </button>
      ) : null}
      {fav ? (
        <button
          type="button"
          onClick={fav.onToggle}
          aria-label={fav.label}
          aria-pressed={fav.isFav}
          title={fav.label}
          className={btn}
        >
          <Star className={cn('size-4', fav.isFav && 'fill-amber-400 text-amber-400')} />
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
 * `variant='tile'` is the phone layout: the same recipe as three squares in one
 * line (two with `hideResult`), separators between them, and the badge/actions
 * on a bottom bar.
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
  variant = 'row',
}: RecipeCardProps) {
  const hasActions = Boolean(fav || onSelect)
  const actions = hasActions ? (
    <CardActions fav={fav} onSelect={onSelect} selectLabel={selectLabel} roomy={variant === 'tile'} />
  ) : null
  // Inner pal links and action buttons keep their own behavior.
  const onCardClick = onSelect
    ? (e: MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('a,button')) return
        onSelect()
      }
    : undefined

  if (variant === 'tile') {
    return (
      <div
        data-testid="breeding-recipe"
        className={cn(
          'grid items-center gap-1 rounded-lg border p-1.5 text-sm',
          // `minmax(0,1fr)` tile columns + `auto` separator columns: the three
          // squares split whatever the separators leave, so the row fits a
          // 320px viewport (~77px per tile) without horizontal scrolling.
          hideResult
            ? 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'
            : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]',
          f.unique ? 'border-amber-400/70 bg-amber-400/10 ring-1 ring-amber-400/30' : 'border-border bg-card',
          onSelect && 'cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/40',
        )}
        onClick={onCardClick}
      >
        <PalTile id={f.a} names={names} meta={meta} gender={f.ag} />
        <TileSep>+</TileSep>
        <PalTile id={f.b} names={names} meta={meta} gender={f.bg} />
        {hideResult ? null : (
          <>
            <TileSep>=</TileSep>
            <PalTile id={f.c} names={names} meta={meta} emphasis />
          </>
        )}
        {f.unique || actions ? (
          // Bottom bar instead of the row card's floating badge + right-hand
          // action column: at phone widths the full card width belongs to the
          // three squares, and a row of its own gives the star / expand buttons
          // a comfortable touch target.
          <span className="col-span-full flex items-center gap-2 px-0.5">
            {f.unique ? (
              // `min-w-0` + truncate: a long translation of the label must eat
              // itself, never widen the card past the viewport.
              <span className={cn(UNIQUE_PILL, 'min-w-0')} title={uniqueLabel}>
                <Sparkles className="size-3 shrink-0" />
                <span className="truncate">{uniqueLabel}</span>
              </span>
            ) : null}
            {actions ? <span className="ml-auto flex shrink-0 items-center">{actions}</span> : null}
          </span>
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
            fav && onSelect ? 'right-14' : hasActions ? 'right-8' : 'right-2',
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
