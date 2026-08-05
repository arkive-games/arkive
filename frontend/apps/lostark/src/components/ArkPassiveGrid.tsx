import { HoverCard, HoverCardContent, HoverCardTrigger } from '@gamemap/ui'
import type { Loadout } from '@/calc/types'
import type { ArkPassiveMeta, ArkPassiveTree } from '@/lib/data'
import { RichText, plainText } from './RichText'

/**
 * The three Ark Passive trees as cards, laid out like the ark grid cores:
 * medallion in the middle, points under it, and the tier/level dials on the
 * bottom line.
 *
 * The medallions are the game's own art — 18 icons from page `use_12` of
 * `EFUI_ICONATLAS_U`, six per tree at 64px cells. They could be split with
 * confidence because `tip.name.karma_<tree>01` wraps each karma name in its
 * tree's colour (gold / blue / green) and the sheet runs in exactly that order.
 *
 * The dials are deliberately asymmetric. BattlePoint Type 8 keys off the
 * evolution tier and Type 9 off the leap level; Enlightenment has neither. So
 * only the dial a tree actually scores through is editable, and the rest are
 * disabled rather than accepted-and-ignored.
 */

/** Which loadout field holds each tree's point total. */
const POINT_FIELD: Record<ArkPassiveTree['key'], keyof Loadout> = {
  evolution: 'arkEvolution',
  enlightenment: 'arkEnlightenment',
  leap: 'arkLeap',
}

/** Points are capped per tree in-game; 200 is the generous upper bound here. */
const MAX_POINTS = 200

/**
 * The client has no standalone word for this — `ui_title_total_point` is the
 * value format `{0}点`, not a label — so reuse the core cards' own wording.
 */
const POINTS_LABEL = '点数'

export function ArkPassiveGrid({
  meta,
  names,
  loadout,
  hasLeapKarma,
  onChange,
}: {
  meta: ArkPassiveMeta
  names: Record<string, string>
  loadout: Loadout
  /** Support coefficients omit the leap karma rate, so the dial is hidden. */
  hasLeapKarma: boolean
  onChange: (patch: Partial<Loadout>) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {meta.trees.map((tree) => (
        <TreeCard
          key={tree.key}
          tree={tree}
          uiKeys={meta.uiKeys}
          names={names}
          loadout={loadout}
          hasLeapKarma={hasLeapKarma}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

function TreeCard({
  tree,
  uiKeys,
  names,
  loadout,
  hasLeapKarma,
  onChange,
}: {
  tree: ArkPassiveTree
  uiKeys: Record<string, string>
  names: Record<string, string>
  loadout: Loadout
  hasLeapKarma: boolean
  onChange: (patch: Partial<Loadout>) => void
}) {
  const name = plainText(names[tree.name_key] ?? tree.key)
  const karmaName = names[tree.karma_name_key] ?? ''
  const points = Number(loadout[POINT_FIELD[tree.key]] ?? 0)

  // The tier drives the medallion. Evolution's is a real dial (Type 8); the
  // other two trees have no tier in the tables, so their medallion tracks the
  // points instead of offering a control that would not score.
  const tier = tree.rank_scores
    ? loadout.karmaEvolutionStage
    : points > 0
      ? Math.min(tree.tiers, Math.max(1, Math.ceil((points / MAX_POINTS) * tree.tiers)))
      : 0

  const showLevel = tree.level_scores && hasLeapKarma
  const lit = tier > 0

  return (
    <article
      className="rounded-xl border p-3 transition-colors"
      style={{
        borderColor: lit ? tree.colour : 'var(--border)',
        background: lit
          ? `color-mix(in oklab, ${tree.colour} 10%, transparent)`
          : 'transparent',
      }}
    >
      {/* Row 1 — which tree. The name is the client's own enum label. */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-medium" style={{ color: lit ? tree.colour : undefined }}>
          {name}
        </span>
        <span className="text-sm text-muted-foreground">
          {format(names[uiKeys.tier], tier)}
        </span>
      </div>

      {/* Row 2 — the medallion, centred, carrying the hovercard. */}
      <div className="my-3 flex justify-center">
        <HoverCard openDelay={120} closeDelay={120}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              aria-label={`${name} 业力`}
              className="relative grid size-28 cursor-help place-items-center rounded-full transition-transform hover:scale-105"
            >
              <span
                aria-hidden
                className="absolute inset-[6%] rounded-full"
                style={{
                  background: lit
                    ? `radial-gradient(circle at 50% 45%, color-mix(in oklab, ${tree.colour} 45%, transparent), transparent 70%)`
                    : 'transparent',
                }}
              />
              {lit ? (
                <img
                  src={`karma/${tree.key}_${tier}.png`}
                  alt=""
                  width={104}
                  height={104}
                  className="relative"
                />
              ) : (
                <span
                  aria-hidden
                  className="relative grid size-full place-items-center rounded-full border border-dashed border-border text-4xl font-light leading-none text-muted-foreground"
                >
                  +
                </span>
              )}
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            side="right"
            align="start"
            className="w-72 border-border bg-card text-foreground"
          >
            <div className="text-base font-medium">
              {karmaName ? <RichText text={karmaName} /> : name}
            </div>
            <dl className="mt-2 space-y-1 text-sm">
              <Row label={POINTS_LABEL} value={format(names[uiKeys.point], points)} />
              <Row label={unit(names[uiKeys.tier])} value={format(names[uiKeys.tier], tier)} />
              {showLevel ? (
                <Row label="等级" value={String(loadout.karmaLeapLevel)} />
              ) : null}
            </dl>
            {/* Say which dial actually moves the score, so a disabled control
                does not read as a bug. */}
            <p className="mt-2 text-xs text-muted-foreground">
              {tree.rank_scores
                ? '阶位与点数均计入战斗力。'
                : showLevel
                  ? '等级与点数均计入战斗力；阶位仅用于图标。'
                  : '仅点数计入战斗力；阶位仅用于图标。'}
            </p>
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Row 3 — points, above the bottom line. */}
      <label className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{POINTS_LABEL}</span>
        <input
          type="number"
          aria-label={`${name} 点数`}
          min={0}
          max={MAX_POINTS}
          value={points}
          onChange={(e) => onChange({ [POINT_FIELD[tree.key]]: clamp(e.target.value, 0, MAX_POINTS) })}
          className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right text-base"
        />
      </label>

      {/* Bottom line — tier and level. Each is present only where the client
          gives the tree that dial. */}
      <div className="mt-2 flex items-end gap-2 border-t border-border pt-2">
        <label className="min-w-0 flex-1">
          <span className="block text-sm text-muted-foreground">{unit(names[uiKeys.tier])}</span>
          <select
            aria-label={`${name} 阶位`}
            value={tier}
            disabled={!tree.rank_scores}
            onChange={(e) => onChange({ karmaEvolutionStage: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-base disabled:opacity-40"
          >
            {Array.from({ length: tree.tiers + 1 }, (_, i) => (
              <option key={i} value={i}>
                {i === 0 ? '—' : i}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1">
          <span className="block text-sm text-muted-foreground">等级</span>
          <input
            type="number"
            aria-label={`${name} 等级`}
            min={0}
            max={100}
            value={showLevel ? loadout.karmaLeapLevel : 0}
            disabled={!showLevel}
            onChange={(e) => onChange({ karmaLeapLevel: clamp(e.target.value, 0, 100) })}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-right text-base disabled:opacity-40"
          />
        </label>
      </div>
    </article>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/** Fill a game format string's `{0}` (e.g. `{0}P`, `{0}阶位`). */
function format(template: string | undefined, value: number): string {
  if (!template) return String(value)
  return plainText(template).replace(/\{0\}/g, String(value))
}

/**
 * The bare unit from a game format string — `{0}阶位` -> `阶位`.
 *
 * The client only ships these as value formats, so a label has to be derived.
 * Rendering the format itself put a literal `{0}点` on the card.
 */
function unit(template: string | undefined): string {
  return plainText(template ?? '')
    .replace(/\{\d\}/g, '')
    .trim()
}

function clamp(raw: string, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}
