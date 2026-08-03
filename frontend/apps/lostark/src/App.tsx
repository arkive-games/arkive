import { useEffect, useMemo, useState } from 'react'
import { armourGroups, evaluate, productAmp, weaponOptions } from '@/calc/engine'
import type { Loadout, Role } from '@/calc/types'
import { loadDataset, type Dataset } from '@/lib/data'
import { Field, NumberField, Section, SelectField } from '@/components/Fields'
import { ScoreRail } from '@/components/ScoreRail'

const STORAGE_KEY = 'lostark.loadout.v1'

function defaultLoadout(): Loadout {
  return {
    role: 'dps',
    combatLevel: 70,
    itemLevel: 1640,
    armourGroup: '',
    weaponId: '',
    weaponQuality: 0,
    arkEvolution: 0,
    arkEnlightenment: 0,
    arkLeap: 0,
    karmaEvolutionStage: 0,
    karmaLeapLevel: 0,
    cores: Array.from({ length: 6 }, () => ({ id: '', optionIndex: 0 })),
    orbId: '',
  }
}

function restore(): Loadout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultLoadout()
    return { ...defaultLoadout(), ...(JSON.parse(raw) as Partial<Loadout>) }
  } catch {
    return defaultLoadout()
  }
}

export default function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadout, setLoadout] = useState<Loadout>(restore)

  useEffect(() => {
    loadDataset().then(setData).catch((e: Error) => setError(e.message))
  }, [])

  // Debounced autosave; the loadout is small so JSON cost is irrelevant.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(loadout))
      } catch { /* private mode */ }
    }, 300)
    return () => clearTimeout(id)
  }, [loadout])

  const set = <K extends keyof Loadout>(key: K, value: Loadout[K]) =>
    setLoadout((l) => ({ ...l, [key]: value }))

  const coeffs = data ? data[loadout.role] : null

  const result = useMemo(() => {
    if (!data || !coeffs) return null
    return evaluate(loadout, coeffs, data.gear)
  }, [data, coeffs, loadout])

  const itemLevels = useMemo(
    () => (data ? Object.keys(data.gear).map(Number).sort((a, b) => a - b) : []),
    [data],
  )

  const groups = useMemo(
    () => (data ? armourGroups(data.gear, loadout.itemLevel) : []),
    [data, loadout.itemLevel],
  )
  const weapons = useMemo(
    () => (data ? weaponOptions(data.gear, loadout.itemLevel) : []),
    [data, loadout.itemLevel],
  )

  // Changing item level can invalidate the selected set or weapon, so re-anchor
  // to the first valid option rather than silently computing from a missing id.
  useEffect(() => {
    if (groups.length && !groups.includes(loadout.armourGroup)) {
      setLoadout((l) => ({ ...l, armourGroup: groups[0] }))
    }
  }, [groups, loadout.armourGroup])
  useEffect(() => {
    if (weapons.length && !weapons.some((w) => w.id === loadout.weaponId)) {
      setLoadout((l) => ({ ...l, weaponId: weapons[0].id }))
    }
  }, [weapons, loadout.weaponId])

  const coreOptions = useMemo(() => {
    if (!data || !coeffs) return []
    return Object.keys(coeffs.ark_core_values)
      .map((id) => ({
        id,
        label: data.names[data.cores[id]?.name_key ?? ''] ?? id,
        grade: data.cores[id]?.grade ?? 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
  }, [data, coeffs])

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">战斗力计算器</h1>
        <p className="mt-4 rounded-lg border border-line bg-panel p-4 text-sm text-muted">
          数据加载失败：{error}
          <br />
          请确认 <code>data-lostark</code> 已生成（<code>uv run python -m lostark emit</code>）。
        </p>
      </main>
    )
  }

  if (!data || !coeffs || !result) {
    return <main className="p-6 text-sm text-muted">加载中…</main>
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          战斗力计算器
        </h1>
        <div
          role="tablist"
          aria-label="角色类型"
          className="flex gap-1 rounded-full border border-line bg-panel p-1"
        >
          {(['dps', 'support'] as Role[]).map((role) => (
            <button
              key={role}
              role="tab"
              aria-selected={loadout.role === role}
              onClick={() => set('role', role)}
              className={`rounded-full px-4 py-1 text-sm transition ${
                loadout.role === role
                  ? 'bg-accent text-bg font-medium'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {role === 'dps' ? '输出' : '辅助'}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem] lg:items-start">
        <div className="space-y-4">
          <Section title="装备">
            <SelectField
              label="装备等级"
              value={String(loadout.itemLevel)}
              onChange={(v) => set('itemLevel', Number(v))}
              options={itemLevels.map((lv) => ({ value: String(lv), label: String(lv) }))}
            />
            <SelectField
              label="防具套装"
              value={loadout.armourGroup}
              onChange={(v) => set('armourGroup', v)}
              options={groups.map((g) => ({ value: g, label: g }))}
            />
            <SelectField
              label="武器"
              value={loadout.weaponId}
              onChange={(v) => set('weaponId', v)}
              options={weapons.map((w) => ({
                value: w.id,
                label: `${w.id} · ${w.attack.toLocaleString('zh-CN')}`,
              }))}
            />
            <NumberField
              label="武器品质"
              value={loadout.weaponQuality}
              min={0}
              max={100}
              onChange={(v) => set('weaponQuality', v)}
            />
            <NumberField
              label="战斗等级"
              value={loadout.combatLevel}
              min={55}
              max={70}
              onChange={(v) => set('combatLevel', v)}
            />
          </Section>

          <Section title="方舟被动 / 业力">
            <NumberField
              label="进化"
              value={loadout.arkEvolution}
              min={0}
              max={200}
              onChange={(v) => set('arkEvolution', v)}
            />
            <NumberField
              label="顿悟"
              value={loadout.arkEnlightenment}
              min={0}
              max={200}
              onChange={(v) => set('arkEnlightenment', v)}
            />
            <NumberField
              label="飞跃"
              value={loadout.arkLeap}
              min={0}
              max={200}
              onChange={(v) => set('arkLeap', v)}
            />
            <NumberField
              label="进化阶段"
              value={loadout.karmaEvolutionStage}
              min={0}
              max={6}
              onChange={(v) => set('karmaEvolutionStage', v)}
            />
            {coeffs.leap_karma_rate !== undefined && (
              <NumberField
                label="飞跃等级"
                value={loadout.karmaLeapLevel}
                min={0}
                max={100}
                onChange={(v) => set('karmaLeapLevel', v)}
              />
            )}
          </Section>

          <Section title="方舟星阵核心">
            {loadout.cores.map((core, i) => (
              <Field key={i} label={`核心 ${i + 1}`}>
                <div className="flex gap-2">
                  <select
                    aria-label={`核心 ${i + 1}`}
                    value={core.id}
                    onChange={(e) => {
                      const cores = [...loadout.cores]
                      cores[i] = { ...cores[i], id: e.target.value }
                      set('cores', cores)
                    }}
                    className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-sm"
                  >
                    <option value="">未装配</option>
                    {coreOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`核心 ${i + 1} 点数`}
                    value={core.optionIndex}
                    disabled={!core.id}
                    onChange={(e) => {
                      const cores = [...loadout.cores]
                      cores[i] = { ...cores[i], optionIndex: Number(e.target.value) }
                      set('cores', cores)
                    }}
                    className="w-24 rounded-md border border-line bg-bg px-2 py-1 text-sm disabled:opacity-40"
                  >
                    <option value={0}>未激活</option>
                    {Object.entries(data.cores[core.id]?.option_points ?? {}).map(
                      ([index, threshold]) => (
                        <option key={index} value={index}>
                          {threshold}P
                        </option>
                      ),
                    )}
                  </select>
                </div>
              </Field>
            ))}
          </Section>

          <Section title="乐园宝珠">
            <SelectField
              label="宝珠"
              value={loadout.orbId}
              onChange={(v) => set('orbId', v)}
              options={[
                { value: '', label: '无' },
                ...Object.keys(coeffs.orb_values).map((id) => ({ value: id, label: id })),
              ]}
            />
          </Section>
        </div>

        <ScoreRail result={result} total={productAmp(result.components[0].amps)} />
      </div>

      <footer className="mt-10 text-xs text-muted">
        系数与名称取自游戏客户端数据表（<code>EFTable_BattlePoint</code> 等），
        由 <code>tools/apps/lostark</code> 导出。公式结构参考{' '}
        <a
          className="underline hover:text-ink"
          href="https://lostark-cn.pages.dev/html/dps"
          target="_blank"
          rel="noreferrer"
        >
          命运方舟工具箱
        </a>
        。数据生成于 {new Date(data.version.generatedAt).toLocaleString('zh-CN')}。
      </footer>
    </div>
  )
}
