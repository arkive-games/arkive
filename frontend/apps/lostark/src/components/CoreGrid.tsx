import { useId, useState } from 'react'
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
  const tipId = useId()
  const [open, setOpen] = useState(false)

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
  const activeAt = points.findIndex(([index]) => index === String(selection.optionIndex))

  /**
   * Option effects STACK: reaching 20P means every threshold up to 20P is live,
   * not just the last one. So the hovercard lists all of them cumulatively.
   */
  const stacked = grade
    ? points
        .slice(0, activeAt + 1)
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
      className="relative rounded-xl border p-3 transition-colors"
      style={{ borderColor: style.ring, background: style.wash }}
    >
      <header className="flex items-center gap-2">
        {/* Hovering the icon reveals the stacked effects, which get long. */}
        <button
          type="button"
          aria-label={`${slotName} 效果`}
          aria-describedby={stacked.length ? tipId : undefined}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className="grid size-9 shrink-0 cursor-help place-items-center rounded-full border text-xs"
          style={{ borderColor: style.ring, background: style.wash, color: style.text }}
        >
          {/* Circle placeholder; the real art is a UE3 texture in
              EFUI_ICONATLAS_*, swapped in once those decode. */}
          {slot.icon_index ?? '—'}
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{slotName}</div>
          <div className="truncate text-xs" style={{ color: style.text }}>
            {gradeKey ? (names[grade!.name_key] ?? `Grade ${gradeKey}`) : '未装配'}
          </div>
        </div>
      </header>

      {open && stacked.length > 0 && (
        <div
          id={tipId}
          role="tooltip"
          className="absolute left-3 right-3 top-14 z-20 max-h-72 overflow-auto rounded-lg border border-line bg-panel p-3 text-xs shadow-xl"
        >
          <div className="mb-1 font-medium text-ink">
            {names[variant.name_key] ?? ''} · 已激活效果
          </div>
          <ul className="space-y-1.5">
            {stacked.map((row) => (
              <li key={row.threshold} className="flex gap-2">
                <span className="shrink-0 tabular-nums" style={{ color: style.text }}>
                  {row.threshold}P
                </span>
                <span className="whitespace-pre-line text-muted">{row.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="mt-2 block">
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

      <label className="mt-2 block">
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

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-xs text-muted">
          <span>点数</span>
          <span className="tabular-nums" style={{ color: style.text }}>
            {activeAt >= 0 ? `${points[activeAt][1]}P` : '未激活'}
          </span>
        </div>
        {/*
          A range over the eligible thresholds only. The value is a position in
          `points`, not a raw P: the thresholds are irregular (10, 14, 17, 18,
          19, 20) and a linear P slider would offer values the core cannot reach.
        */}
        <input
          type="range"
          aria-label={`${slotName} 点数`}
          min={-1}
          max={points.length - 1}
          step={1}
          value={activeAt}
          disabled={!gradeKey || points.length === 0}
          onChange={(e) => {
            const at = Number(e.target.value)
            onChange({ id: selection.id, optionIndex: at < 0 ? 0 : Number(points[at][0]) })
          }}
          className="mt-1 w-full accent-accent disabled:opacity-40"
        />
        <div className="flex justify-between text-xs text-muted">
          {points.map(([index, threshold]) => (
            <span key={index} className={index === String(selection.optionIndex) ? 'text-ink' : ''}>
              {threshold}
            </span>
          ))}
        </div>
      </div>
    </article>
  )
}
