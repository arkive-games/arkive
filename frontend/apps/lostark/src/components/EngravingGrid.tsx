import { HoverCard, HoverCardContent, HoverCardTrigger } from '@gamemap/ui'
import type { EngravingSlot } from '@/calc/types'
import type { Engraving, EngravingMeta } from '@/lib/data'
import { RichText, plainText } from './RichText'

/**
 * The five engraving slots as columns, each with the game's own icon.
 *
 * The roster is the 43 GENERAL engravings. Class engravings are excluded: the
 * rework turned them into class identities, and the client agrees — none of the
 * 52 has an amp grid.
 *
 * Icons come from `Ability.Icon` + `Ability.IconIndex`: the group names an atlas
 * and the index is a cell across its pages at 64px. Four of the 43 have no icon
 * at all — their atlas group ships no texture — so those render a placeholder.
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
                // usual `+`; an engraving whose atlas group ships no texture
                // gets its first character, so four real picks do not read as
                // unselected.
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
                此刻印在客户端中没有图标资源。
              </p>
            ) : null}
            {/* The four descriptions that held unresolved <$...> directives were
                all class engravings, so none remain — the guard stays as a
                regression net. */}
            {desc && !desc.includes('<$') ? (
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

      <select
        aria-label={label}
        value={slot.name}
        onChange={(e) => {
          const name = e.target.value
          // Picking an engraving with no grade yet lands on 遗物, and clearing
          // the slot drops the grade with it so an empty slot never keeps one.
          onChange({
            ...slot,
            name,
            grade: name ? (slot.grade || DEFAULT_GRADE) : 0,
            // The growth code has no level 0, so a fresh pick starts at 1.
            book: name ? Math.max(1, slot.book) : 0,
          })
        }}
        className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
      >
        <option value="">无</option>
        {options.map((o) => (
          <option key={o.engraving.slug} value={o.name}>
            {o.name}
            {scoring.has(o.name) ? '' : '（无战力）'}
          </option>
        ))}
      </select>

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
