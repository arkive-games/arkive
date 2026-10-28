import { Minus, Plus } from 'lucide-react'
import content from '../locales/zh-CN.json'

const text = content.wiki.professions

/**
 * A small capsule: − and + either side of the level, with a bar for how far
 * up it is. `index` walks the rows a page holds; `current` and `top` are the
 * levels those rows stand for.
 */
export function LevelStepper({ index, last, current, top, onChange }: {
  index: number
  last: number
  current: number
  top: number
  onChange: (index: number) => void
}) {
  const button = 'grid size-7 place-items-center rounded-full bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)] transition-[background-color,color,transform] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] hover:bg-[color:var(--arkive-nav-active)] hover:text-white active:scale-90 disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground/50'

  return (
    <div
      role="group"
      aria-label={text.levelPicker}
      className="flex shrink-0 items-center gap-0.5 rounded-full bg-card p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_var(--border)]"
    >
      <button type="button" aria-label={text.levelDown} disabled={index === 0} onClick={() => onChange(Math.max(0, index - 1))} className={button}>
        <Minus aria-hidden="true" className="size-3.5" strokeWidth={2.8} />
      </button>
      <span aria-live="polite" className="relative flex min-w-14 items-baseline justify-center gap-0.5 pb-1 tabular-nums leading-tight">
        <span className="text-xs font-semibold text-muted-foreground">Lv</span>
        <b className="text-base font-extrabold">{current}</b>
        <span className="text-xs font-semibold text-muted-foreground">/{top}</span>
        <span aria-hidden="true" className="absolute inset-x-1.5 bottom-0 h-0.5 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-[image:var(--arkive-warm-search)] transition-[width] duration-300"
            style={{ width: `${Math.round((current / Math.max(1, top)) * 100)}%` }}
          />
        </span>
      </span>
      <button type="button" aria-label={text.levelUp} disabled={index >= last} onClick={() => onChange(Math.min(last, index + 1))} className={button}>
        <Plus aria-hidden="true" className="size-3.5" strokeWidth={2.8} />
      </button>
    </div>
  )
}
