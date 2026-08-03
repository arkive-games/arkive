import type { Result } from '@/calc/types'

const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const pct = (n: number) => `${(n * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`

/**
 * Sticky score rail: the number stays in view while the form scrolls, so it
 * visibly moves as you type. On phones it collapses to a bar at the top and the
 * breakdown follows underneath.
 */
export function ScoreRail({ result, total }: { result: Result; total: number }) {
  const component = result.components[0]
  // Only rows that actually contribute; a list of zeros hides the signal.
  const active = component.amps
    .filter((a) => a.value !== 0)
    .sort((a, b) => b.value - a.value)

  return (
    <aside className="sticky top-4 space-y-3 max-lg:static">
      <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
        <div className="text-xs text-muted">{component.label}</div>
        <div className="text-3xl font-semibold tabular-nums tracking-tight">
          {fmt(result.total)}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-panel/70 px-4 py-3 backdrop-blur">
        <h2 className="mb-2 text-xs font-medium text-muted">战力构成</h2>
        <dl className="space-y-1 text-xs">
          <Row label="基础攻击力" value={fmt(result.baseAttack)} />
          <Row label="主属性" value={fmt(result.mainStat)} />
          <Row label="武器攻击力" value={fmt(result.weaponAttack)} />
          <Row label="基础战斗力" value={fmt(component.base)} />
          <Row label="总增幅" value={`×${total.toFixed(4)}`} />
        </dl>

        <h3 className="mb-1 mt-3 text-xs font-medium text-muted">增幅项</h3>
        {active.length === 0 ? (
          <p className="text-xs text-muted">暂无增幅</p>
        ) : (
          <ul className="space-y-1">
            {active.map((a) => (
              <li key={a.name} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 truncate text-muted">{a.name}</span>
                <span
                  className="h-1.5 rounded-full bg-accent/70"
                  style={{ width: `${Math.min(100, a.value * 200)}%` }}
                  aria-hidden
                />
                <span className="ml-auto tabular-nums">{pct(a.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
