import type { Result } from '@/calc/types'

const fmt = (n: number) => n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const pct = (n: number) => `${(n * 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}%`

/**
 * Sticky score rail: the number stays in view while the form scrolls, so it
 * visibly moves as you type. On phones it collapses to a bar at the top and the
 * breakdown follows underneath.
 */
export function ScoreRail({ result }: { result: Result }) {
  const multi = result.components.length > 1

  return (
    <aside className="sticky top-4 space-y-3 max-lg:static">
      <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
        <div className="text-xs text-muted">{multi ? '辅助战斗力' : result.components[0].label}</div>
        <div className="text-3xl font-semibold tabular-nums tracking-tight">
          {fmt(result.total)}
        </div>
        {multi && (
          // Each half is rounded before summing, so showing them makes the
          // total auditable rather than mysterious.
          <div className="mt-1 flex gap-3 text-xs text-muted">
            {result.components.map((c) => (
              <span key={c.key}>
                {c.label} <span className="tabular-nums text-ink">{fmt(c.score)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-muted">
        <span className="font-medium text-ink">部分系统尚未纳入计算。</span>
        当前已覆盖：装备、战斗等级、武器品质、方舟被动与业力、星阵核心、首饰词条、宝石、卡牌、牧场特技、乐园宝珠。
        尚未覆盖：刻印、手镯、超越、时装、远征队加成。
        因此这里的数值低于游戏内实际战斗力，仅可用于比较上述系统的相对收益。
      </p>

      <div className="rounded-xl border border-line bg-panel/70 px-4 py-3 backdrop-blur">
        <h2 className="mb-2 text-xs font-medium text-muted">战力构成</h2>
        <dl className="space-y-1 text-xs">
          <Row label="基础攻击力" value={fmt(result.baseAttack)} />
          <Row label="主属性" value={fmt(result.mainStat)} />
          <Row label="武器攻击力" value={fmt(result.weaponAttack)} />
          {result.maxHp !== undefined && (
            <Row label="最大生命值" value={fmt(result.maxHp)} />
          )}
        </dl>

        {result.components.map((c) => (
          <Component key={c.key} component={c} />
        ))}
      </div>
    </aside>
  )
}

function Component({ component }: { component: Result['components'][number] }) {
  // Only rows that actually contribute; a list of zeros hides the signal.
  const active = component.amps
    .filter((a) => a.value !== 0)
    .sort((a, b) => b.value - a.value)
  const total = component.amps.reduce((acc, a) => acc * (1 + a.value), 1)

  return (
    <section className="mt-3 border-t border-line pt-2">
      <h3 className="mb-1 text-xs font-medium text-muted">{component.label}</h3>
      <dl className="space-y-1 text-xs">
        <Row label="基础" value={fmt(component.base)} />
        <Row label="总增幅" value={`×${total.toFixed(4)}`} />
      </dl>
      {active.length === 0 ? (
        <p className="mt-1 text-xs text-muted">暂无增幅</p>
      ) : (
        <ul className="mt-1 space-y-1">
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
    </section>
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
