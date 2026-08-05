import { HoverCard, HoverCardContent, HoverCardTrigger } from '@gamemap/ui'
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
  onChange,
}: {
  meta: EngravingMeta
  names: Record<string, string>
  slots: EngravingSlot[]
  scoring: Set<string>
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
  stoneLocked,
  onChange,
}: {
  index: number
  slot: EngravingSlot
  options: { engraving: Engraving; name: string }[]
  meta: EngravingMeta
  names: Record<string, string>
  scoring: Set<string>
  stoneLocked: boolean
  onChange: (next: EngravingSlot) => void
}) {
  const label = `刻印 ${index + 1}`
  const picked = options.find((o) => o.name === slot.name)?.engraving
  const grade = meta.grades.find((g) => g.grade === slot.grade)
  const desc = picked?.desc_key ? names[picked.desc_key] : undefined
  const effect = picked ? effectText(picked, slot, names) : undefined

  return (
    <article className="min-w-0 rounded-xl border border-border bg-card p-3">
      {/* The icon, centred, carrying the description hovercard. */}
      <div className="flex justify-center">
        <HoverCard openDelay={120} closeDelay={120}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              aria-label={`${label} 效果`}
              className="relative grid size-16 cursor-help place-items-center rounded-md transition-transform hover:scale-105"
            >
              {picked?.icon_slug ? (
                <img
                  src={`engravings/${picked.icon_slug}.png`}
                  alt=""
                  width={64}
                  height={64}
                  className="rounded-md"
                />
              ) : (
                // Two different empties. A slot with nothing in it gets the
                // usual `+`; an engraving with no resolvable sprite gets its
                // first character so it does not read as unselected. No
                // engraving currently takes the second branch.
                <span
                  aria-hidden
                  className={`grid size-full place-items-center rounded-md border border-dashed leading-none ${
                    slot.name
                      ? 'border-accent/50 text-xl font-medium text-foreground'
                      : 'border-border text-2xl font-light text-muted-foreground'
                  }`}
                >
                  {slot.name ? slot.name.slice(0, 1) : '+'}
                </span>
              )}
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            side="right"
            align="start"
            className="max-h-80 w-72 overflow-auto border-border bg-card text-foreground"
          >
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
              <p className="mt-1 text-xs text-muted-foreground">
                客户端中未能解析此刻印的图标。
              </p>
            ) : null}
            {/* The scaled effect text. Ability.Desc is fixed at one level (怨恨
                reads "4%" there no matter the books or stone), so it is only the
                fallback when no channel resolves. */}
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
          </HoverCardContent>
        </HoverCard>
      </div>

      <div className="mt-2">
        <EngravingPicker
          label={label}
          options={options}
          value={slot.name}
          scoring={scoring}
          labels={{
            // NOT uiKeys.empty: that resolves to "未装备刻印。", a tooltip
            // sentence rather than a control label, and it overflows the trigger.
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
      </div>

      <label className="mt-2 block">
        <span className="text-xs text-muted-foreground">品质</span>
        <select
          aria-label={`${label} 品质`}
          value={slot.grade}
          disabled={!slot.name}
          onChange={(e) => onChange({ ...slot, grade: Number(e.target.value) })}
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-40"
        >
          <option value={0}>—</option>
          {/* Only the growth ladder: epic / legend / relic. 基本 (grade 1) is
              not on it — the amp grid's book axis starts at epic, so offering it
              would index a cell the client does not define. */}
          {meta.grades
            .filter((g) => meta.bookGrades.includes(g.grade))
            .map((g) => (
              <option key={g.grade} value={g.grade}>
                {plainText(names[g.name_key] ?? String(g.grade))}
              </option>
            ))}
        </select>
      </label>

      <div className="mt-2 flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="text-xs text-muted-foreground">等级</span>
          <select
            aria-label={`${label} 等级`}
            value={slot.book}
            disabled={!slot.name}
            onChange={(e) => onChange({ ...slot, book: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-40"
          >
            {/* 1-based: the growth code has no level 0 within a grade. */}
            {Array.from({ length: meta.bookMaxLevel }, (_, i) => i + 1).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1">
          {/* sys.ability.spec_tooltip_grade_0 — the client's word for the stone. */}
          <span className="text-xs text-muted-foreground">
            {plainText(names[meta.uiKeys.stone] ?? '') || '能力石'}
          </span>
          <select
            aria-label={`${label} 能力石`}
            value={slot.stone}
            disabled={!slot.name || stoneLocked}
            title={stoneLocked ? '最多两个刻印可镶嵌能力石' : undefined}
            onChange={(e) => onChange({ ...slot, stone: Number(e.target.value) })}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-40"
          >
            {Array.from({ length: meta.stoneMaxLevel + 1 }, (_, i) => i).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  )
}

/** Grade number -> the channel that carries its per-level additions. */
const GRADE_CHANNEL: Record<number, 'legend' | 'relic'> = { 3: 'legend', 4: 'relic' }

/**
 * The engraving's effect text with every number scaled to the current dials.
 *
 * `AbilitySpecification` splits an engraving's tooltip into channels: `base`
 * holds the complete sentence, and `legend` / `relic` / `stone` hold per-level
 * ADDITIONS to the same specs. So a spec's displayed value is
 * `base + gradeChannel[level] + stoneChannel[stoneLevel]`, and only the base
 * channel's sentence is rendered — the others read "additional {0}" and would be
 * double-counting if shown alongside it.
 *
 * 英雄 (grade 2) has no channel of its own: the client folds the four epic books
 * into the base row, which is why the base channel has a single step.
 *
 * A tooltip's `{0}`, `{1}` … index this channel's `specs` in order, while
 * `values[step]` is a 4-array indexed by `spec.index - 1` (SpecValue1..4).
 *
 * These are RAW tooltip values, deliberately not the combat power: 尖刺重锤
 * grants 36% crit damage but scores 0.1141.
 */
function effectText(
  engraving: Engraving,
  slot: EngravingSlot,
  names: Record<string, string>,
): string | undefined {
  const base = engraving.effect.find((c) => c.key === 'base')
  const tooltip = base?.tooltip_key ? names[base.tooltip_key] : undefined
  if (!base || !tooltip) return undefined

  const gradeKey = GRADE_CHANNEL[slot.grade]
  const gradeCh = gradeKey ? engraving.effect.find((c) => c.key === gradeKey) : undefined
  const stoneCh =
    slot.stone > 0 ? engraving.effect.find((c) => c.key === 'stone') : undefined

  return tooltip.replace(/\{(\d+)\}/g, (whole, slotIndex: string) => {
    const spec = base.specs[Number(slotIndex)]
    if (!spec) return whole
    const i = spec.index - 1
    const total =
      (base.values['1']?.[i] ?? 0) +
      (gradeCh?.values[String(slot.book)]?.[i] ?? 0) +
      (stoneCh?.values[String(slot.stone)]?.[i] ?? 0)
    const unit = spec.unit_key ? (names[spec.unit_key] ?? '') : ''
    return `${(spec.negative ? -total : total).toFixed(spec.digits)}${unit}`
  })
}
