import type { BraceletLine, BraceletMeta } from '@/lib/data'
import { RichText, plainText } from './RichText'

/**
 * Bracelet option lines as three columns — 基本效果 / 战斗特性 / 刻印效果.
 *
 * Three because that is what the game offers: every shipped bracelet pool
 * (`2133…` tier 3, `2134…` tier 4) exposes exactly groups 01/02/03. A fourth
 * group (`option_group_04`, 特殊效果) exists but only the legacy pool
 * `910000010` uses it, so it is not a column.
 *
 * The lines and their amps come from the client — `ItemGradeOptionRandom`
 * filtered to `sys.bracelet.*`, with BattlePoint Types 19/20/21 supplying the
 * combat power. That replaces a hand-copied fan-site table which turned out to
 * be a strict subset: the client reproduces all 45 of its values and adds 65
 * more, and its heal column was half the game's amp with 0.0175 rounded to
 * 0.017.
 */
export function BraceletColumns({
  meta,
  names,
  role,
  selected,
  onChange,
}: {
  meta: BraceletMeta
  names: Record<string, string>
  role: 'dps' | 'support'
  /** One selected line id per column; '' for an empty slot. */
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const groupName = (key: string) => {
    const group = meta.groups.find((g) => g.key === key)
    return plainText(names[group?.name_key ?? ''] ?? key)
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {meta.columns.map((column, i) => {
        const lines = meta.lines.filter((l) => l.group_key === column)
        const current = selected[i] ?? ''
        const line = lines.find((l) => l.id === current)
        return (
          <div key={column} className="min-w-0 rounded-xl border border-border bg-card p-3">
            <div className="text-sm font-medium">{groupName(column)}</div>
            <select
              aria-label={groupName(column)}
              value={current}
              onChange={(e) => {
                const next = [...selected]
                next[i] = e.target.value
                onChange(next)
              }}
              className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-base"
            >
              <option value="">未选择</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {label(l, names, role)}
                </option>
              ))}
            </select>
            {/* The full effect text, with the game's own colour spans. Option
                elements cannot carry markup, so it goes below the select. */}
            <p className="mt-2 min-h-8 text-xs leading-relaxed">
              {line ? (
                <RichText text={names[line.name_key ?? ''] ?? fallback(line)} />
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/**
 * A one-line label for the dropdown.
 *
 * Effect text runs long and carries newlines, so it is truncated here and shown
 * in full under the select. Lines that score are suffixed with their amp, since
 * that is what the picker is actually for.
 */
function label(line: BraceletLine, names: Record<string, string>, role: 'dps' | 'support'): string {
  const text = plainText(names[line.name_key ?? ''] ?? fallback(line))
    .replace(/\s+/g, ' ')
    .trim()
  const short = text.length > 34 ? `${text.slice(0, 33)}…` : text
  const amp = line.amp[role]
  return amp ? `${short} · +${(amp * 100).toFixed(2)}%` : short
}

/**
 * Label for the eight stat ids the client names in code rather than in a table.
 *
 * No table maps `StatType` to a GameMsg key — a scan of all 779 databases finds
 * nothing — so rather than invent a name these are identified by their id and
 * value. They carry no combat power, so nothing is lost but the wording.
 */
function fallback(line: BraceletLine): string {
  return line.stat !== null ? `属性 ${line.stat} +${line.value}` : `效果 ${line.id}`
}
