import type { EngravingSlot } from '@/calc/types'
import type { Engraving, EngravingMeta } from '@/lib/data'
import { RichText, plainText } from './RichText'
import { EngravingPicker } from './EngravingPicker'

/**
 * The five engraving slots as columns, each with the game's own icon.
 *
 * The roster is the 43 GENERAL engravings. Class engravings are excluded: the
 * rework turned them into class identities, and the client agrees — none of the
 * 52 has an amp grid.
 *
 * Icons come from `Ability.Icon` + `Ability.IconIndex`, which together name a
 * SPRITE FILE (`Buff_71`), not a cell coordinate — `IconInfo.loa` resolves it to
 * a page and pixel offset. Every engraving resolves, so the placeholder branch
 * below is defensive only; it used to fire for four of them under a wrong model
 * that walked the atlas as a flat 64px grid.
 *
 * The two dials are the axes of the client's growth code,
 * `20 * stone + 1 + 4 * (grade - 2) + level`: a book grade+level, and a stone
 * level. Only two slots may carry a stone, matching the game; the rest disable
 * rather than accepting a value that would overstate the score.
 */

/** The game allows a stone level on at most two engravings. */
const MAX_STONE_SLOTS = 2

/** 遗物 — the grade a real build runs, so the one a fresh pick lands on. */
const DEFAULT_GRADE = 4

export function EngravingGrid({
  meta,
  names,
  slots,
  /** Names that carry combat power for this role, for the （无战力）marker. */
  scoring,
  role,
  amps,
  onChange,
}: {
  meta: EngravingMeta
  names: Record<string, string>
  slots: EngravingSlot[]
  scoring: Set<string>
  /** Which amp channel to read; decides which grid cells exist. */
  role: 'dps' | 'support'
  /** Each slot's own combat-power contribution, for the card corner. */
  amps: number[]
  onChange: (index: number, next: EngravingSlot) => void
}) {
  // Sorted so the ones that actually move the score come first: 15 of the 43
  // score nothing, and alphabetical order buries the useful ones.
  const options = Object.values(meta.engravings)
    .map((e) => ({ engraving: e, name: plainText(names[e.name_key] ?? e.slug) }))
    .sort((a, b) => {
      const sa = scoring.has(a.name) ? 0 : 1
      const sb = scoring.has(b.name) ? 0 : 1
      return sa - sb || a.name.localeCompare(b.name)
    })

  const stoneUsed = slots.filter((s) => s.name && s.stone > 0).length

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {slots.map((slot, i) => (
        <EngravingCard
          key={i}
          index={i}
          slot={slot}
          options={options}
          meta={meta}
          names={names}
          scoring={scoring}
          role={role}
          amp={amps[i] ?? 0}
          // A slot keeps its own stone select once it has one; only slots
          // without a stone are locked out when two are already spent.
          stoneLocked={slot.stone === 0 && stoneUsed >= MAX_STONE_SLOTS}
          onChange={(next) => onChange(i, next)}
        />
      ))}
    </div>
  )
}

function EngravingCard({
  index,
  slot,
  options,
  meta,
  names,
  scoring,
  role,
  amp,
  stoneLocked,
  onChange,
}: {
  index: number
  slot: EngravingSlot
  options: { engraving: Engraving; name: string }[]
  meta: EngravingMeta
  names: Record<string, string>
  scoring: Set<string>
  role: 'dps' | 'support'
  amp: number
  stoneLocked: boolean
  onChange: (next: EngravingSlot) => void
}) {
  const label = `刻印 ${index + 1}`
  const picked = options.find((o) => o.name === slot.name)?.engraving
  const grade = meta.grades.find((g) => g.grade === slot.grade)
  const desc = picked?.desc_key ? names[picked.desc_key] : undefined
  const effect = picked ? effectText(picked, slot, names) : undefined

  /**
   * Which (grade, level) pairs the client's grid actually defines.
   *
   * The growth code is `20*stone + 1 + 4*(grade-2) + level`, but the lattice is
   * NOT full: at stone 0 the grid starts at code 5, so 英雄 (grade 2) exists only
   * at level 4 — the client represents epic as a COMPLETE four-book set and has
   * no partial epic cells. Offering 英雄 levels 1-3 let the picker select a cell
   * that resolves to nothing and silently scored 0.
   *
   * Derived from the grid rather than hard-coded, so it cannot drift from the
   * data. An engraving with no grid at all (15 of the 43 score nothing) keeps the
   * full lattice, since no choice there changes the score.
   */
  const grid = picked?.amp[role] ?? {}
  const hasGrid = Object.keys(grid).length > 0
  const defines = (grade: number, level: number) =>
    !hasGrid || String(20 * slot.stone + 1 + 4 * (grade - 2) + level) in grid

  const gradeOptions = meta.grades.filter(
    (g) =>
      meta.bookGrades.includes(g.grade) &&
      Array.from({ length: meta.bookMaxLevel }, (_, i) => i + 1).some((lv) =>
        defines(g.grade, lv),
      ),
  )
  const levelOptions = Array.from({ length: meta.bookMaxLevel }, (_, i) => i + 1).filter((lv) =>
    defines(slot.grade, lv),
  )

  const tooltip = (
    <>
      <div className="text-base font-medium">
        {slot.name ? (
          // The grade's own colour, from sys.engrave.name_color_grade_*.
          <RichText
            text={
              grade
                ? (names[meta.gradeColourKeys[String(grade.grade)]] ?? '{0}').replace(
                    '{0}',
                    slot.name,
                  )
                : slot.name
            }
          />
        ) : (
          (plainText(names[meta.uiKeys.empty] ?? '') || '未选择')
        )}
      </div>
      {picked && !picked.icon_slug ? (
        <p className="mt-1 text-xs text-muted-foreground">客户端中未能解析此刻印的图标。</p>
      ) : null}
      {/* The scaled effect text. Ability.Desc is fixed at one level (怨恨 reads
          "4%" there no matter the books or stone), so it is only the fallback
          when no channel resolves. */}
      {effect ? (
        <p className="mt-2 whitespace-pre-line text-xs leading-relaxed">
          <RichText text={effect} />
        </p>
      ) : desc && !desc.includes('<$') ? (
        <p className="mt-2 text-xs leading-relaxed">
          <RichText text={desc} />
        </p>
      ) : null}
      {slot.name && !scoring.has(slot.name) ? (
        <p className="mt-2 text-xs text-muted-foreground">
          游戏数据表中此刻印没有战斗力系数，计为 0。
        </p>
      ) : null}
    </>
  )

  return (
    <article className="min-w-0 rounded-xl border border-border bg-card p-3">
      {/* Slot number left, this card's own contribution right. */}
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {amp ? (
          <span className="shrink-0 text-xs tabular-nums text-accent">
            +{(amp * 100).toFixed(2)}%
          </span>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* The tile IS the picker trigger: large icon over the name. */}
      <EngravingPicker
        label={label}
        options={options}
        value={slot.name}
        scoring={scoring}
        tooltip={tooltip}
        labels={{
          // NOT uiKeys.empty: that resolves to "未装备刻印。", a tooltip
          // sentence rather than a control label, and it overflows the tile.
          empty: '未选择',
          search: '搜索刻印…',
          notFound: '没有匹配的刻印',
          noPower: '无战力',
        }}
        onChange={(name) =>
          onChange({
            ...slot,
            name,
            // Picking lands on 遗物, and the growth code has no level 0.
            // Clearing drops both so an empty slot never keeps them.
            grade: name ? slot.grade || DEFAULT_GRADE : 0,
            book: name ? Math.max(1, slot.book) : 0,
          })
        }
      />

      {/* Quality, then level and stone. Each carries its own name in its
          options rather than in a label above it — 等级 and 能力石 have no empty
          state (level starts at 1, stone 0 is a real value), so a placeholder
          alone could not identify them. */}
      <div className="mt-2">
        <select
          aria-label={`${label} 品质`}
          value={slot.grade}
          disabled={!slot.name}
          onChange={(e) => {
            const grade = Number(e.target.value)
            // 英雄 exists only at level 4, so a grade change can invalidate the
            // current level; snap to the first the new grade defines rather than
            // leaving a selection that resolves to no cell.
            const valid = Array.from({ length: meta.bookMaxLevel }, (_, i) => i + 1).filter(
              (lv) => defines(grade, lv),
            )
            onChange({
              ...slot,
              grade,
              book: grade && !valid.includes(slot.book) ? (valid[0] ?? slot.book) : slot.book,
            })
          }}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-40"
        >
          <option value={0}>品质</option>
          {/* Only grades the grid defines a cell for. 基本 (grade 1) is never on
              the ladder, and 英雄 drops out unless a level resolves. */}
          {gradeOptions.map((g) => (
            <option key={g.grade} value={g.grade}>
              {plainText(names[g.name_key] ?? String(g.grade))}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex gap-2">
        <div className="min-w-0 flex-1">
          <select
            aria-label={`${label} 等级`}
            value={slot.book}
            disabled={!slot.name}
            onChange={(e) => onChange({ ...slot, book: Number(e.target.value) })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-40"
          >
            {/* 1-based (the growth code has no level 0 within a grade) and
                filtered to the levels this grade defines — 英雄 only has level 4.
                级 is the client's own unit, from ui_title_arkpassive_level. */}
            {levelOptions.map((v) => (
              <option key={v} value={v}>
                {v}级
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <select
            aria-label={`${label} 能力石`}
            value={slot.stone}
            disabled={!slot.name || stoneLocked}
            title={stoneLocked ? '最多两个刻印可镶嵌能力石' : undefined}
            onChange={(e) => onChange({ ...slot, stone: Number(e.target.value) })}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-40"
          >
            {/* 石 abbreviates sys.ability.spec_tooltip_grade_0 (能力石); the full
                word does not fit beside the level in a fifth of the row. */}
            {Array.from({ length: meta.stoneMaxLevel + 1 }, (_, i) => i).map((v) => (
              <option key={v} value={v}>
                石{v}
              </option>
            ))}
          </select>
        </div>
      </div>
    </article>
  )
}

/**
 * Ladder grade -> the channel carrying its per-level additions.
 *
 * Epic has no channel of its own: the client folds a complete four-book epic set
 * into the `base` row, which is why `base` has a single step.
 */
const GRADE_CHANNEL: Record<number, 'legend' | 'relic'> = { 3: 'legend', 4: 'relic' }

function effectText(
  engraving: Engraving,
  slot: EngravingSlot,
  names: Record<string, string>,
): string | undefined {
  const base = engraving.effect.find((c) => c.key === 'base')
  const tooltip = base?.tooltip_key ? names[base.tooltip_key] : undefined
  if (!base || !tooltip) return undefined

  const channel = (key: string) => engraving.effect.find((c) => c.key === key)
  const stoneCh = slot.stone > 0 ? channel('stone') : undefined

  /**
   * Every lower ladder grade at its max level, plus this grade at `level`.
   * Sorted so a future grade slots in without reordering by hand.
   */
  const ladder = Object.entries(GRADE_CHANNEL)
    .map(([g, key]) => ({ grade: Number(g), key }))
    .sort((a, b) => a.grade - b.grade)
  const steps = ladder
    .filter((rung) => rung.grade <= slot.grade)
    .map((rung) => ({
      ch: channel(rung.key),
      // A rung below the selected grade is maxed; the selected grade is at the
      // chosen level.
      step: rung.grade === slot.grade ? slot.book : maxStep(channel(rung.key)),
    }))

  return tooltip.replace(/\{(\d+)\}/g, (whole, slotIndex: string) => {
    const spec = base.specs[Number(slotIndex)]
    if (!spec) return whole
    const i = spec.index - 1
    const total =
      (base.values['1']?.[i] ?? 0) +
      steps.reduce((sum, s) => sum + (s.ch?.values[String(s.step)]?.[i] ?? 0), 0) +
      (stoneCh?.values[String(slot.stone)]?.[i] ?? 0)
    const unit = spec.unit_key ? (names[spec.unit_key] ?? '') : ''
    return `${(spec.negative ? -total : total).toFixed(spec.digits)}${unit}`
  })
}

/** The highest step a channel defines, as a string key. */
function maxStep(channel: { values: Record<string, number[]> } | undefined): string {
  if (!channel) return '0'
  return String(Math.max(...Object.keys(channel.values).map(Number)))
}
