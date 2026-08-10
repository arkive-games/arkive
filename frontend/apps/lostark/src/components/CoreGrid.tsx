import { HoverCard, HoverCardContent, HoverCardTrigger } from '@gamemap/ui'
import type { CoreSelection } from '@/calc/types'
import type { ArkGridSlot, ArkGridVariant } from '@/lib/data'
import { RichText, plainText } from './RichText'

/**
 * Item-grade tints, resolved from CSS so a theme flip carries them.
 *
 * The values live in index.css because the game's art is tuned for a dark UI:
 * 古代's pale cream works as a border on dark but is unreadable as text on
 * white, so the light theme needs its own set. Keeping them here as literals
 * meant the label vanished in light mode.
 */
const GRADE_STYLE: Record<string, { ring: string; wash: string; text: string }> =
  Object.fromEntries(
    ['0', '1', '2', '3'].map((g) => [
      g,
      {
        ring: `var(--grade-${g}-ring)`,
        // color-mix keeps the wash tied to the ring rather than duplicating a
        // hand-picked alpha per grade per theme.
        wash: `color-mix(in oklab, var(--grade-${g}-ring) 12%, transparent)`,
        text: `var(--grade-${g}-text)`,
      },
    ]),
  )

const EMPTY = { ring: 'var(--border)', wash: 'transparent', text: 'var(--muted-foreground)' }

/** 遗物 — the quality a real build runs, so the one a fresh pick lands on. */
const DEFAULT_GRADE = '2'

export function CoreGrid({
  slots,
  cores,
  classId,
  names,
  amps,
  onChange,
}: {
  slots: ArkGridSlot[]
  cores: CoreSelection[]
  classId: number
  names: Record<string, string>
  /** Each slot's own combat-power contribution, for the card corner. */
  amps: number[]
  onChange: (index: number, next: CoreSelection) => void
}) {
  return (
    // Three per row over two rows — the game's own arrangement.
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {slots.map((slot, i) => (
        <CoreCard
          key={slot.key}
          slot={slot}
          classId={classId}
          selection={cores[i] ?? { id: '', optionIndex: 0 }}
          names={names}
          amp={amps[i] ?? 0}
          onChange={(next) => onChange(i, next)}
        />
      ))}
    </div>
  )
}

function CoreCard({
  slot,
  classId,
  selection,
  names,
  amp,
  onChange,
}: {
  slot: ArkGridSlot
  classId: number
  selection: CoreSelection
  names: Record<string, string>
  amp: number
  onChange: (next: CoreSelection) => void
}) {
  const slotName = names[slot.name_key] ?? slot.key
  // Chaos slots are shared across classes and stored under "0".
  const variants: ArkGridVariant[] =
    slot.by_class[slot.class_agnostic ? '0' : String(classId)] ?? []

  // -1 means no core chosen at all, which is distinct from "core chosen, no
  // grade": a core id encodes core AND grade, so without this the empty state
  // would silently display variant 0 as though it were equipped.
  const variantIndex = variants.findIndex((v) =>
    Object.values(v.grades).some((g) => g.core_id === selection.id),
  )
  const variant = variantIndex >= 0 ? variants[variantIndex] : undefined
  const gradeKey =
    Object.entries(variant?.grades ?? {}).find(([, g]) => g.core_id === selection.id)?.[0] ?? ''
  const style = gradeKey ? (GRADE_STYLE[gradeKey] ?? EMPTY) : EMPTY
  const grade = gradeKey ? variant?.grades[gradeKey] : undefined

  // Only the thresholds this core unlocks, ascending.
  const points = Object.entries(grade?.points ?? {}).sort((a, b) => Number(a[1]) - Number(b[1]))
  /**
   * Slider stop 0 is "not activated"; stop i selects points[i - 1]. Indexing
   * straight into `points` would leave the labels one position out of step,
   * because there is always one more stop than there are thresholds.
   */
  const stopCount = points.length + 1
  const activeStop = points.findIndex(([index]) => index === String(selection.optionIndex)) + 1

  /**
   * Every threshold the core offers, each flagged by whether the current point
   * total reaches it. Effects STACK, so all rows up to `activeStop` are live at
   * once; the rest are shown greyed so the card doubles as a preview of what
   * more points would buy.
   */
  const effects = grade
    ? points
        .map(([index, threshold], i) => ({
          threshold,
          text: names[grade.options[index] ?? ''] ?? '',
          active: i < activeStop,
        }))
        .filter((row) => row.text)
    : []

  function pick(nextVariant: number, nextGrade: string) {
    const v = nextVariant >= 0 ? variants[nextVariant] : undefined
    if (!v) {
      onChange({ id: '', optionIndex: 0 })
      return
    }
    // Picking a core with no grade yet lands on 遗物 (grade 2) — the quality
    // people actually run — falling back to the highest grade the core offers
    // when it has no 遗物 tier, then to its lowest.
    const grade = v.grades[nextGrade]
      ? nextGrade
      : (DEFAULT_GRADE in v.grades ? DEFAULT_GRADE : Object.keys(v.grades).sort().pop()) ??
        Object.keys(v.grades).sort()[0]
    if (!grade) {
      onChange({ id: '', optionIndex: 0 })
      return
    }
    onChange({ id: v.grades[grade].core_id, optionIndex: 0 })
  }

  return (
    <article
      className="rounded-xl border p-3 transition-colors"
      style={{ borderColor: style.ring, background: style.wash }}
    >
      {/* Row 1 — the slot's own name, and what this card contributes. The
          controls below carry their instruction as a placeholder option instead
          of a label, which buys the card a title without growing taller. */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium" style={{ color: gradeKey ? style.text : undefined }}>
          {slotName}
        </span>
        {amp ? (
          <span className="shrink-0 text-xs tabular-nums text-accent">
            +{(amp * 100).toFixed(2)}%
          </span>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Row 2 — which core, and at what quality. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select
          aria-label={`${slotName} 核心`}
          value={variantIndex}
          onChange={(e) => pick(Number(e.target.value), gradeKey)}
          className="min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value={-1}>核心</option>
          {variants.map((v, vi) => (
            <option key={vi} value={vi}>
              {plainText(names[v.name_key] ?? v.name_key)}
              {Object.values(v.grades).every((g) => !g.scores) ? '（无战力）' : ''}
            </option>
          ))}
        </select>
        <select
          aria-label={`${slotName} 品质`}
          value={gradeKey}
          disabled={variantIndex < 0}
          onChange={(e) => pick(variantIndex, e.target.value)}
          className="min-w-0 rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-40"
        >
          <option value="">品质</option>
          {Object.entries(variant?.grades ?? {}).map(([g, info]) => (
            <option key={g} value={g}>
              {names[info.name_key] ?? `Grade ${g}`}
            </option>
          ))}
        </select>
      </div>

      {/* Row 2 — the icon, large. It carries the hovercard, so it is the thing
          you reach for to read what the core actually does. */}
      <div className="my-3 flex justify-center">
        <HoverCard openDelay={120} closeDelay={120}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              aria-label={`${slotName} 效果`}
              className="relative grid size-28 cursor-help place-items-center rounded-full transition-transform hover:scale-105"
            >
              {/* Grade colour washing the socket's inner disc. Inset past the
                  frame's own bevel so the tint sits behind the art rather than
                  bleeding over the ring. */}
              <span
                aria-hidden
                className="absolute inset-[6%] rounded-full"
                style={{
                  background: gradeKey
                    ? `radial-gradient(circle at 50% 45%, color-mix(in oklab, ${style.ring} 55%, transparent), color-mix(in oklab, ${style.ring} 18%, transparent) 70%, transparent)`
                    : 'transparent',
                }}
              />
              {/* The game's own socket ring (arkpassive_i1_nopack), used for
                  both empty and filled slots so the frame never moves. Drawn
                  over the wash so its bevel stays crisp. */}
              <img
                src="cores/frame.png"
                alt=""
                aria-hidden
                className="absolute inset-0 size-full rounded-full"
              />
              {/* A grade-tinted ring over the socket, so quality still reads at
                  a glance now that the frame itself is fixed. */}
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border-2"
                style={{ borderColor: gradeKey ? style.ring : 'transparent' }}
              />
              {gradeKey ? (
                // Real game art, cropped from the use_13 sheet of
                // EFUI_ICONATLAS_U (row 2, columns 5-10 at 64px cells).
                // Upscaled past its native 64px: the frame's opening is most of
                // the card, and at 84px the art floated in the middle of it.
                <img
                  src={`cores/${slot.key}.png`}
                  alt=""
                  width={104}
                  height={104}
                  className="relative"
                />
              ) : (
                <span
                  aria-hidden
                  className="relative text-3xl font-normal leading-none text-muted-foreground"
                >
                  +
                </span>
              )}
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            side="right"
            align="start"
            className="max-h-[22rem] w-80 overflow-auto border-border bg-card text-foreground"
          >
            {/* The slot name is on the card now, so the card's own title is
                not repeated here; this leads with the equipped core. */}
            <div className="text-base font-medium">
              {variant ? plainText(names[variant.name_key] ?? variant.name_key) : slotName}
            </div>
            {gradeKey ? (
              <div className="mt-0.5 text-xs" style={{ color: style.text }}>
                {plainText(names[variant?.name_key ?? ''] ?? '')} · {plainText(names[grade?.name_key ?? ''] ?? '')}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">未装配核心。</p>
            )}
            {gradeKey && effects.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">该核心没有可显示的效果。</p>
            )}
            {effects.length > 0 && (
              <>
                <div className="mt-3 text-sm font-medium text-accent">核心属性</div>
                <ul className="mt-1 space-y-1.5">
                  {effects.map((row) => (
                    <li key={row.threshold} className="flex gap-2 text-sm leading-snug">
                      {/*
                        Matches the in-game tooltip: the point tag is bracketed
                        and gold once reached, grey before; the body is white with
                        the game's own accent colours, or flat grey when the
                        threshold is not active yet.
                      */}
                      <span
                        className="shrink-0 font-medium tabular-nums"
                        style={{ color: row.active ? 'var(--color-accent)' : 'var(--muted-foreground)' }}
                      >
                        [{row.threshold}P]
                      </span>
                      <span
                        className={`whitespace-pre-line ${row.active ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        <RichText text={row.text} muted={!row.active} />
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Row 3 — the point slider. */}
      <div>
        <div className="flex items-baseline justify-between text-sm text-muted-foreground">
          <span>点数</span>
          <span className="tabular-nums" style={{ color: style.text }}>
            {activeStop > 0 ? `${points[activeStop - 1][1]}P` : '未激活'}
          </span>
        </div>
        {/*
          A range over the eligible thresholds only. Stop 0 is "not activated";
          stop i selects points[i - 1]. The thresholds are irregular (10, 14, 17,
          18, 19, 20), so a linear P slider would offer values the core cannot
          reach, and indexing straight into them leaves the ticks one out of step.
        */}
        <input
          type="range"
          aria-label={`${slotName} 点数`}
          min={0}
          max={points.length}
          step={1}
          value={activeStop}
          disabled={!gradeKey || points.length === 0}
          onChange={(e) => {
            const stop = Number(e.target.value)
            onChange({
              id: selection.id,
              optionIndex: stop === 0 ? 0 : Number(points[stop - 1][0]),
            })
          }}
          className="mt-1 w-full accent-accent disabled:opacity-40"
        />
        {/* One label per stop, so the ticks line up with the thumb positions. */}
        <div className="flex justify-between text-sm text-muted-foreground">
          {Array.from({ length: stopCount }, (_, stop) => (
            <span
              key={stop}
              className={stop === activeStop ? 'text-foreground' : ''}
              title={stop === 0 ? '未激活' : undefined}
            >
              {stop === 0 ? '—' : points[stop - 1][1]}
            </span>
          ))}
        </div>
      </div>
    </article>
  )
}
