import type { BraceletLine, BraceletMeta } from '@/lib/data'
import { RichText, plainText } from './RichText'
import { SearchSelect } from './SearchSelect'

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
            {/* Title left, this column's own contribution right. */}
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium">{groupName(column)}</span>
              <Amp value={line?.amp[role] ?? 0} />
            </div>
            <div className="mt-2">
              <SearchSelect
                ariaLabel={groupName(column)}
                options={lines.map((l) => ({
                  value: l.id,
                  label: plainLabel(l, names),
                  search: l.id,
                  meta: l.amp[role] ? (
                    <span className="shrink-0 text-xs tabular-nums text-accent">
                      +{(l.amp[role] * 100).toFixed(2)}%
                    </span>
                  ) : undefined,
                }))}
                value={current}
                onChange={(next) => {
                  const list = [...selected]
                  list[i] = next
                  onChange(list)
                }}
                labels={{
                  empty: '未选择',
                  search: '搜索词条…',
                  notFound: '没有匹配的词条',
                }}
              />
            </div>
            {/* The full effect text, with the game's own colour spans. Option
                elements cannot carry markup, so it goes below the select. */}
            <p className="mt-2 min-h-8 text-xs leading-relaxed">
              {line ? (
                <RichText text={lineText(line, names)} />
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
 * A one-line label for the list.
 *
 * Effect text runs long and carries newlines, so it is flattened here and shown
 * in full under the picker. The amp rides along as the row's `meta` rather than
 * being glued onto the label, so it stays right-aligned.
 */
function plainLabel(line: BraceletLine, names: Record<string, string>): string {
  return plainText(lineText(line, names)).replace(/\s+/g, ' ').trim()
}

/**
 * The text for one line: its effect description, or `<stat name> +<value>`.
 *
 * A flat stat line (`option_type === 2`) has a name and a number, and the name
 * alone does not identify the line — the combat-trait column offers 会心 at ten
 * different values. So the value is appended, which is how the game's own tooltip
 * reads it. Composing a client name with the row's own number is not the same as
 * inventing a name.
 */
function lineText(line: BraceletLine, names: Record<string, string>): string {
  const name = line.name_key ? names[line.name_key] : undefined
  if (line.option_type === 2 && name) return `${name} +${line.value}`
  return name ?? fallback(line)
}

/** A card's own contribution, for the top-right corner. */
function Amp({ value }: { value: number }) {
  if (!value) return <span className="shrink-0 text-xs text-muted-foreground">—</span>
  return (
    <span className="shrink-0 text-xs tabular-nums text-accent">
      +{(value * 100).toFixed(2)}%
    </span>
  )
}

/**
 * Label for the stat ids that still have no name anywhere.
 *
 * `ItemOptionAlias` names none of the basic or combat-trait ids, but `ArkPassive`
 * and `SkillBuff` between them recover seven of the eight (see
 * `bracelets.STAT_NAME_KEYS`), so this now covers `KeyStat 11` alone — six lines,
 * identified by id and value rather than by an invented name. They carry no combat
 * power, so nothing is lost but the wording.
 */
function fallback(line: BraceletLine): string {
  return line.stat !== null ? `属性 ${line.stat} +${line.value}` : `效果 ${line.id}`
}
