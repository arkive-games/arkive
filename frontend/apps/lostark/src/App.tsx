import { useEffect, useMemo, useRef, useState } from 'react'
import { armourGroups, evaluate, weaponOptions } from '@/calc/engine'
import type { Loadout, Role, SupportClass } from '@/calc/types'
import { loadDataset, type Dataset } from '@/lib/data'
import {
  dpsBraceletLines,
  dpsEngravingBase,
  supportBraceletLines,
  supportEngravingBase,
} from '@/calc/fansite.generated'
import {
  STORAGE_KEY,
  defaultLoadout,
  exportLoadout,
  parseLoadout,
  restoreLoadout,
} from '@/lib/loadout'
import { Field, NumberField, Section, SelectField } from '@/components/Fields'
import { ScoreRail } from '@/components/ScoreRail'
import { CoreGrid } from '@/components/CoreGrid'

export default function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [loadout, setLoadout] = useState<Loadout>(restoreLoadout)

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

  function download() {
    const blob = new Blob([exportLoadout(loadout)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lostark-${loadout.role}-${loadout.itemLevel}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importFile(file: File) {
    try {
      const { loadout: next, rejected } = parseLoadout(JSON.parse(await file.text()))
      setLoadout(next)
      setNotice(
        rejected.length
          ? `已导入，但忽略了 ${rejected.length} 项：${rejected.slice(0, 3).join('；')}`
          : '已导入',
      )
    } catch (e) {
      setNotice(`导入失败：${(e as Error).message}`)
    }
  }

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
        <div className="flex gap-2">
          <button
            onClick={download}
            className="rounded-md border border-line px-3 py-1 text-xs hover:border-accent"
          >
            导出
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            className="rounded-md border border-line px-3 py-1 text-xs hover:border-accent"
          >
            导入
          </button>
          <button
            onClick={() => {
              setLoadout(defaultLoadout())
              setNotice('已清空')
            }}
            className="rounded-md border border-line px-3 py-1 text-xs hover:border-accent"
          >
            清空
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            aria-label="导入配装文件"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
        </div>
      </header>

      {notice && (
        <p
          role="status"
          className="mb-3 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-muted"
        >
          {notice}
        </p>
      )}

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
            <SelectField
              label="神选武器"
              value={loadout.chosenWeaponId}
              onChange={(v) => set('chosenWeaponId', v)}
              options={[
                { value: '', label: '普通武器' },
                ...Object.entries(coeffs.chosen_weapon_values).map(([id, amp]) => ({
                  value: id,
                  label: `+${(amp * 100).toFixed(2)}%`,
                })),
              ]}
            />
            <NumberField
              label="武器品质"
              value={loadout.weaponQuality}
              min={0}
              max={100}
              onChange={(v) => set('weaponQuality', v)}
            />
            {loadout.role === 'support' && (
              <SelectField
                label="职业"
                value={loadout.supportClass}
                onChange={(v) => set('supportClass', v as SupportClass)}
                options={[
                  { value: 'bard', label: '吟游诗人 / 墨灵' },
                  { value: 'paladin', label: '圣骑士' },
                ]}
              />
            )}
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
            <CoreGrid
              slots={data.slots[loadout.role]}
              cores={loadout.cores}
              names={data.names}
              onChange={(i, next) => {
                const list = [...loadout.cores]
                list[i] = next
                set('cores', list)
              }}
            />
          </Section>

          <Section title="手镯">
            <p className="text-xs text-muted">系数来自参考站，非游戏数据表。</p>
            {loadout.braceletLines.map((id, i) => (
              <SelectField
                key={i}
                label={`手镯词条 ${i + 1}`}
                value={id}
                onChange={(v) => {
                  const list = [...loadout.braceletLines]
                  list[i] = v
                  set('braceletLines', list)
                }}
                options={[
                  { value: '', label: '无' },
                  ...(loadout.role === 'support' ? supportBraceletLines : dpsBraceletLines).map(
                    (l) => ({ value: l.id, label: `${l.side} +${(l.value * 100).toFixed(2)}%` }),
                  ),
                ]}
              />
            ))}
          </Section>

          <Section title="刻印">
            <p className="text-xs text-muted">系数来自参考站，非游戏数据表。</p>
            {loadout.engravings.map((eng, i) => (
              <div key={i} className="flex gap-2">
                <select
                  aria-label={`刻印 ${i + 1}`}
                  value={eng.name}
                  onChange={(e) => {
                    const list = [...loadout.engravings]
                    list[i] = { ...list[i], name: e.target.value }
                    set('engravings', list)
                  }}
                  className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-sm"
                >
                  <option value="">无</option>
                  {Object.keys(
                    loadout.role === 'support' ? supportEngravingBase : dpsEngravingBase,
                  ).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <select
                  aria-label={`刻印 ${i + 1} 遗物书`}
                  value={eng.book}
                  disabled={!eng.name}
                  onChange={(e) => {
                    const list = [...loadout.engravings]
                    list[i] = { ...list[i], book: Number(e.target.value) }
                    set('engravings', list)
                  }}
                  className="w-20 rounded-md border border-line bg-bg px-2 py-1 text-sm disabled:opacity-40"
                >
                  {[0, 1, 2, 3, 4].map((v) => <option key={v} value={v}>书 {v}</option>)}
                </select>
                <select
                  aria-label={`刻印 ${i + 1} 能力石`}
                  value={eng.stone}
                  disabled={!eng.name}
                  onChange={(e) => {
                    const list = [...loadout.engravings]
                    list[i] = { ...list[i], stone: Number(e.target.value) }
                    set('engravings', list)
                  }}
                  className="w-20 rounded-md border border-line bg-bg px-2 py-1 text-sm disabled:opacity-40"
                >
                  {[0, 1, 2, 3, 4].map((v) => <option key={v} value={v}>石 {v}</option>)}
                </select>
              </div>
            ))}
          </Section>

          <Section title="时装与远征队">
            <p className="text-xs text-muted">系数来自参考站，非游戏数据表。</p>
            {['头部', '上装', '下装', '武器'].map((slot, i) => (
              <SelectField
                key={slot}
                label={slot}
                value={loadout.avatars[i] ?? '无'}
                onChange={(v) => {
                  const list = [...loadout.avatars]
                  list[i] = v
                  set('avatars', list)
                }}
                options={['无', '稀有', '英雄', '传说'].map((t) => ({ value: t, label: t }))}
              />
            ))}
            {(['crit', 'spec', 'swift'] as const).map((k) => (
              <NumberField
                key={k}
                label={{ crit: '会心', spec: '专长', swift: '迅捷' }[k]}
                value={loadout.roster[k]}
                min={0}
                max={99999}
                onChange={(v) => set('roster', { ...loadout.roster, [k]: v })}
              />
            ))}
          </Section>

          <Section title="首饰词条">
            <p className="text-xs text-muted">项链、耳环×2、戒指×2，每件 3 条；各条独立相乘。</p>
            {['项链', '耳环 1', '耳环 2', '戒指 1', '戒指 2'].map((piece, p) => (
              <div key={piece} className="space-y-1">
                <div className="text-xs text-muted">{piece}</div>
                {[0, 1, 2].map((n) => {
                  const idx = p * 3 + n
                  return (
                    <select
                      key={n}
                      aria-label={`${piece} 词条 ${n + 1}`}
                      value={loadout.accessoryLines[idx] ?? ''}
                      onChange={(e) => {
                        const lines = [...loadout.accessoryLines]
                        lines[idx] = e.target.value
                        set('accessoryLines', lines)
                      }}
                      className="w-full rounded-md border border-line bg-bg px-2 py-1 text-sm"
                    >
                      <option value="">无</option>
                      {Object.entries(coeffs.accessory_line_values).map(([id, amp]) => (
                        <option key={id} value={id}>
                          +{(amp * 100).toFixed(2)}%
                        </option>
                      ))}
                    </select>
                  )
                })}
              </div>
            ))}
          </Section>

          <Section title="宝石">
            <p className="text-xs text-muted">
              最多 {loadout.gems.length} 颗；每颗独立相乘。
            </p>
            {loadout.gems.map((gem, i) => (
              <Field key={i} label={`宝石 ${i + 1}`}>
                <div className="flex gap-2">
                  <select
                    aria-label={`宝石 ${i + 1} 层级`}
                    value={gem.tier}
                    onChange={(e) => {
                      const gems = [...loadout.gems]
                      gems[i] = { ...gems[i], tier: e.target.value }
                      set('gems', gems)
                    }}
                    className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-sm"
                  >
                    <option value="">未镶嵌</option>
                    {Object.keys(coeffs.gem_values).map((t) => (
                      <option key={t} value={t}>
                        T{t}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`宝石 ${i + 1} 等级`}
                    value={gem.level}
                    disabled={!gem.tier}
                    onChange={(e) => {
                      const gems = [...loadout.gems]
                      gems[i] = { ...gems[i], level: Number(e.target.value) }
                      set('gems', gems)
                    }}
                    className="w-24 rounded-md border border-line bg-bg px-2 py-1 text-sm disabled:opacity-40"
                  >
                    {Object.keys(coeffs.gem_values[gem.tier] ?? {}).map((lv) => (
                      <option key={lv} value={lv}>
                        {lv} 级
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
            ))}
          </Section>

          <Section title="卡牌与牧场">
            <SelectField
              label="卡牌套装"
              value={loadout.cardSetId}
              onChange={(v) => set('cardSetId', v)}
              options={[
                { value: '', label: '无' },
                ...Object.keys(coeffs.card_set_values).map((id) => ({ value: id, label: id })),
              ]}
            />
            <SelectField
              label="觉醒阶段"
              value={String(loadout.cardStage)}
              onChange={(v) => set('cardStage', Number(v))}
              options={[
                { value: '0', label: '未觉醒' },
                ...Object.keys(coeffs.card_set_values[loadout.cardSetId] ?? {}).map((st) => ({
                  value: st,
                  label: `${st} 阶`,
                })),
              ]}
            />
            <SelectField
              label="牧场特技"
              value={loadout.petRanchId}
              onChange={(v) => set('petRanchId', v)}
              options={[
                { value: '', label: '无' },
                ...Object.entries(coeffs.pet_ranch_values).map(([id, amp]) => ({
                  value: id,
                  label: `+${(amp * 100).toFixed(2)}%`,
                })),
              ]}
            />
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

        <ScoreRail result={result} />
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
