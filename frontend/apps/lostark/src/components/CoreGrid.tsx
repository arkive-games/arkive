import type { CoreSelection } from '@/calc/types'
import type { ArkGridSlot } from '@/lib/data'

/**
 * Lost Ark's item-grade colours. The client stores grades as 0-3 and names them
 * 英雄 / 传说 / 遗物 / 古代; these are the corresponding tints the game uses, kept
 * as a tinted border + wash so a filled slot reads at a glance.
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
  names,
  onChange,
}: {
  slots: ArkGridSlot[]
  cores: CoreSelection[]
  names: Record<string, string>
  onChange: (index: number, next: CoreSelection) => void
}) {
  return (
    // Three per row, two rows — the game's own arrangement.
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {slots.map((slot, i) => (
        <CoreCard
          key={slot.key}
          slot={slot}
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
  selection,
  names,
  onChange,
}: {
  slot: ArkGridSlot
  selection: CoreSelection
  names: Record<string, string>
  onChange: (next: CoreSelection) => void
}) {
  const slotName = names[slot.name_key] ?? slot.key
  // Which variant is currently in play. Only chaos sun/moon offer a choice; the
  // rest have one because grade alone decides their value.
  const variantIndex = Math.max(
    0,
    slot.variants.findIndex((v) => Object.values(v.grades).some((g) => g.core_id === selection.id)),
  )
  const variant = slot.variants[variantIndex]
  const gradeKey =
    Object.entries(variant?.grades ?? {}).find(([, g]) => g.core_id === selection.id)?.[0] ?? ''
  const style = gradeKey ? (GRADE_STYLE[gradeKey] ?? EMPTY) : EMPTY

  const grade = gradeKey ? variant.grades[gradeKey] : undefined
  // Only the thresholds this core actually unlocks, in ascending order.
  const points = Object.entries(grade?.points ?? {}).sort(
    (a, b) => Number(a[1]) - Number(b[1]),
  )
  const activeAt = points.findIndex(([index]) => index === String(selection.optionIndex))

  function pickGrade(nextGrade: string, nextVariant = variantIndex) {
    const v = slot.variants[nextVariant]
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
      <header className="flex items-center gap-2">
        {/* Circle placeholder. The real art is an Unreal Engine 3 texture in
            EFUI_ICONATLAS_*; swap in the frame once those decode. */}
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full border text-xs"
          style={{ borderColor: style.ring, background: style.wash, color: style.text }}
        >
          {slot.icon_index ?? '—'}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{slotName}</div>
          <div className="truncate text-xs" style={{ color: style.text }}>
            {gradeKey ? (names[grade!.name_key] ?? `Grade ${gradeKey}`) : '未装配'}
          </div>
        </div>
      </header>

      {slot.variants.length > 1 && (
        <label className="mt-2 block">
          <span className="text-xs text-muted">类型</span>
          <select
            aria-label={`${slotName} 类型`}
            value={variantIndex}
            onChange={(e) => pickGrade(gradeKey || '0', Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm"
          >
            {slot.variants.map((v, vi) => (
              <option key={vi} value={vi}>
                {v.name_keys.map((k) => names[k] ?? k).join(' / ')}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="mt-2 block">
        <span className="text-xs text-muted">品质</span>
        <select
          aria-label={`${slotName} 品质`}
          value={gradeKey}
          onChange={(e) => pickGrade(e.target.value)}
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
          A range input over the eligible thresholds only. The slider index maps
          to a position in `points`, not to a raw P value, because the thresholds
          are irregular (10, 14, 17, 18, 19, 20) and a linear P slider would
          offer values the core cannot reach.
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
            onChange({
              id: selection.id,
              optionIndex: at < 0 ? 0 : Number(points[at][0]),
            })
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

      {grade && selection.optionIndex > 0 && grade.options[String(selection.optionIndex)] && (
        <p className="mt-2 whitespace-pre-line border-t border-line/60 pt-2 text-xs text-muted">
          {names[grade.options[String(selection.optionIndex)]] ?? ''}
        </p>
      )}
    </article>
  )
}
