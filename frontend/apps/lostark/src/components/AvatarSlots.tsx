import type { AvatarMeta } from '@/lib/statPanels'
import { SelectField } from './Fields'
import { plainText } from './RichText'

/**
 * The four stat-bearing avatar slots, each with the client's three grades.
 *
 * The amp is a **main-stat percentage**, not combat power, which is why looking for
 * it in `EFTable_BattlePoint` never worked: the 35-member
 * `tip.name.enum_battlepointtype_*` enum has no avatar member. It lives on the item
 * — `Item.Type = 9` -> `StaticOptionId0` -> `ItemGradeOptionStatic` with
 * `AddonType00 = 2` on stat 7/8/9, the percentage variants of Str/Agi/Int.
 *
 * 0.5% / 1% / 2% by grade in all four slots, which is exactly the value set the fan
 * site published — so the calculator's arithmetic was right all along and only its
 * source was second-hand.
 *
 * Face 1, face 2, the instrument and the footstep effect are absent because the
 * client gives them no option at all, and the 上下装 garment is absent because its
 * 2% is exactly an epic top plus an epic bottom (see `combinedSlot`).
 */
export function AvatarSlots({
  meta,
  names,
  selected,
  onChange,
}: {
  meta: AvatarMeta
  names: Record<string, string>
  /** One option id per slot, in `meta.slots` order; '' for an empty slot. */
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const none = plainText(names[meta.uiKeys.none] ?? '')
  const gradeName = (grade: number) => {
    const found = meta.grades.find((g) => g.grade === grade)
    return plainText(names[found?.name_key ?? ''] ?? String(grade))
  }

  const total = selected.reduce((sum, id) => {
    const option = meta.options.find((o) => o.id === id)
    return sum + (option?.amp ?? 0)
  }, 0)

  return (
    <>
      {meta.slots.map((slot, i) => (
        <SelectField
          key={slot.key}
          label={plainText(names[slot.name_key] ?? slot.key)}
          value={selected[i] ?? ''}
          onChange={(v) => {
            const next = [...selected]
            next[i] = v
            onChange(next)
          }}
          options={[
            { value: '', label: none || '—' },
            ...meta.options
              .filter((o) => o.slot_key === slot.key)
              .map((o) => ({
                value: o.id,
                label: `${gradeName(o.grade)} +${(o.amp * 100).toFixed(2)}%`,
              })),
          ]}
        />
      ))}
      <p className="text-sm text-muted-foreground">
        主属性 +{(total * 100).toFixed(2)}%。
        {' '}
        上下装连体时装占用上装与下装两格，其加成正好等于两件同阶单品之和（
        {(meta.combinedSlot.amp * 100).toFixed(0)}% = 上装 + 下装 ·{' '}
        {gradeName(meta.combinedSlot.grade)}），故不另设选项。
      </p>
    </>
  )
}
