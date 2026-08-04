import { HoverCard, HoverCardContent, HoverCardTrigger } from '@gamemap/ui'
import type { CoreSelection } from '@/calc/types'
import type { ArkGridSlot, ArkGridVariant } from '@/lib/data'

/**
 * Lost Ark's item-grade colours. The client stores grades as 0-3 and names them
 * 英雄 / 传说 / 遗物 / 古代; these are the corresponding tints, kept as a border
 * plus wash so a filled slot reads at a glance.
 */
const GRADE_STYLE: Record<string, { ring: string; wash: string; text: string }> = {
  '0': { ring: 'oklch(0.62 0.20 300)', wash: 'oklch(0.62 0.20 300 / 0.16)', text: 'oklch(0.82 0.14 300)' },
  '1': { ring: 'oklch(0.74 0.16 75)', wash: 'oklch(0.74 0.16 75 / 0.16)', text: 'oklch(0.86 0.13 80)' },
  '2': { ring: 'oklch(0.66 0.19 40)', wash: 'oklch(0.66 0.19 40 / 0.16)', text: 'oklch(0.82 0.15 45)' },
  '3': { ring: 'oklch(0.86 0.07 95)', wash: 'oklch(0.86 0.07 95 / 0.14)', text: 'oklch(0.92 0.06 95)' },
}

const EMPTY = { ring: 'var(--color-line)', wash: 'transparent', text: 'var(--color-muted)' }

export function CoreGrid({
  slots,
  cores,
  classId,
  names,
  onChange,
}: {
  slots: ArkGridSlot[]
  cores: CoreSelection[]
  classId: number
  names: Record<string, string>
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
  onChange,
}: {
  slot: ArkGridSlot
  classId: number
  selection: CoreSelection
  names: Record<string, string>
  onChange: (next: CoreSelection) => void
}) {
  const slotName = names[slot.name_key] ?? slot.key
  // Chaos slots are shared across classes and stored under "0".
  const variants: ArkGridVariant[] =
    slot.by_class[slot.class_agnostic ? '0' : String(classId)] ?? []

  const variantIndex = Math.max(
    0,
    variants.findIndex((v) => Object.values(v.grades).some((g) => g.core_id === selection.id)),
  )
  const variant = variants[variantIndex]
  const gradeKey =
    Object.entries(variant?.grades ?? {}).find(([, g]) => g.core_id === selection.id)?.[0] ?? ''
  const style = gradeKey ? (GRADE_STYLE[gradeKey] ?? EMPTY) : EMPTY
  const grade = gradeKey ? variant.grades[gradeKey] : undefined

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
   * Option effects STACK: reaching 20P means every threshold up to 20P is live,
   * not just the last one. So the hovercard lists all of them cumulatively.
   */
  const stacked = grade
    ? points
        .slice(0, activeStop)
        .map(([index, threshold]) => ({
          threshold,
          text: names[grade.options[index] ?? ''] ?? '',
        }))
        .filter((row) => row.text)
    : []

  function pick(nextVariant: number, nextGrade: string) {
    const v = variants[nextVariant]
    if (!nextGrade || !v?.grades[nextGrade]) {
      onChange({ id: '', optionIndex: 0 })
      return
    }
    onChange({ id: v.grades[nextGrade].core_id, optionIndex: 0 })
  }

  return (
    <article
      className="rounded-xl border p-3 transition-colors"
      style={{ borderColor: style.ring, background: style.wash }}
    >
      {/* Row 1 — which core, and at what quality. */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="text-xs text-muted">核心</span>
          <select
            aria-label={`${slotName} 核心`}
            value={variantIndex}
            onChange={(e) => pick(Number(e.target.value), gradeKey || '0')}
            className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm"
          >
            {variants.map((v, vi) => (
              <option key={vi} value={vi}>
                {names[v.name_key] ?? v.name_key}
                {Object.values(v.grades).every((g) => !g.scores) ? '（无战力）' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-muted">品质</span>
          <select
            aria-label={`${slotName} 品质`}
            value={gradeKey}
            onChange={(e) => pick(variantIndex, e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm"
          >
            <option value="">未装配</option>
            {Object.entries(variant?.grades ?? {}).map(([g, info]) => (
              <option key={g} value={g}>
                {names[info.name_key] ?? `Grade ${g}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Row 2 — the icon, large. It carries the hovercard, so it is the thing
          you reach for to read what the core actually does. */}
      <div className="my-3 flex justify-center">
        <HoverCard openDelay={120} closeDelay={120}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              aria-label={`${slotName} 效果`}
              className="relative grid size-20 cursor-help place-items-center rounded-full transition-transform hover:scale-105"
            >
              {/* The game's own socket ring (arkpassive_i1_nopack), used for
                  both empty and filled slots so the frame never moves. */}
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
                <img
                  src={`cores/${slot.key}.png`}
                  alt=""
                  width={56}
                  height={56}
                  className="relative"
                />
              ) : (
                <span
                  aria-hidden
                  className="relative text-2xl font-light leading-none text-muted"
                >
                  +
                </span>
              )}
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            side="right"
            align="start"
            className="max-h-[22rem] w-80 overflow-auto border-line bg-panel text-ink"
          >
            {/* The slot name lives here rather than on the card, keeping the
                card itself to just the three controls. */}
            <div className="text-sm font-medium">{slotName}</div>
            {gradeKey ? (
              <div className="mt-0.5 text-xs" style={{ color: style.text }}>
                {names[variant.name_key] ?? ''} · {names[grade!.name_key] ?? ''}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">未装配核心。</p>
            )}
            {gradeKey && stacked.length === 0 && (
              <p className="mt-2 text-xs text-muted">尚未激活任何点数。</p>
            )}
            {stacked.length > 0 && (
              <ul className="mt-2 space-y-2 border-t border-line/60 pt-2">
                {stacked.map((row) => (
                  <li key={row.threshold} className="flex gap-2 text-xs">
                    <span
                      className="shrink-0 font-medium tabular-nums"
                      style={{ color: style.text }}
                    >
                      {row.threshold}P
                    </span>
                    <span className="whitespace-pre-line text-muted">{row.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Row 3 — the point slider. */}
      <div>
        <div className="flex items-baseline justify-between text-xs text-muted">
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
        <div className="flex justify-between text-xs text-muted">
          {Array.from({ length: stopCount }, (_, stop) => (
            <span
              key={stop}
              className={stop === activeStop ? 'text-ink' : ''}
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
