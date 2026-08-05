import { useEffect, useMemo, useRef, useState } from 'react'
import { ShellTopBar, ThemeToggle } from '@gamemap/map-shell'
import { BuildInfo, SiteFooter } from '@gamemap/ui'
import changelog from './changelog.json'
import { armourGroups, evaluate, weaponOptions } from '@/calc/engine'
import type { Loadout } from '@/calc/types'
import { loadDataset, type Dataset } from '@/lib/data'
import {
  dpsEngravingBase,
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
import { BraceletColumns } from '@/components/BraceletColumns'
import { EngravingGrid } from '@/components/EngravingGrid'
import { ArkPassiveGrid } from '@/components/ArkPassiveGrid'

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

  const currentClass = data?.classes.find((c) => c.id === loadout.classId)
  const currentSub = currentClass?.subclasses[loadout.subclassIndex]

  // The sub-class decides the role, so the two stay in step rather than being
  // separately settable and able to disagree.
  useEffect(() => {
    if (currentSub && currentSub.role !== loadout.role) {
      setLoadout((l) => ({ ...l, role: currentSub.role }))
    }
  }, [currentSub, loadout.role])

  function setClass(classId: number, subclassIndex: number) {
    // Order-slot cores are class-specific, so a class change invalidates them.
    setLoadout((l) => ({
      ...l,
      classId,
      subclassIndex,
      cores: l.cores.map(() => ({ id: '', optionIndex: 0 })),
    }))
  }

  const coeffs = data ? data[loadout.role] : null

  /**
   * Engraving names the amp tables actually score.
   *
   * The client ships 95 engravings but the fan-site tables cover far fewer, and
   * the amps are still fan-site sourced (no BattlePoint Type is keyed by
   * AbilityEngrave ids). Marking the rest rather than hiding them keeps the
   * picker honest: an engraving that scores 0 says so.
   */
  const scoringEngravings = useMemo(
    () =>
      new Set(
        Object.keys(loadout.role === 'support' ? supportEngravingBase : dpsEngravingBase),
      ),
    [loadout.role],
  )

  const result = useMemo(() => {
    if (!data || !coeffs) return null
    return evaluate(loadout, coeffs, data.gear, data.bracelets.lines)
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
        <p className="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          数据加载失败：{error}
          <br />
          请确认 <code>data-lostark</code> 已生成（<code>uv run python -m lostark emit</code>）。
        </p>
      </main>
    )
  }

  if (!data || !coeffs || !result) {
    return <main className="p-6 text-sm text-muted-foreground">加载中…</main>
  }

  // entries[0] is this app's current version by convention.
  const version = (changelog.entries[0]?.version ?? '0.0.0') as string

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <ShellTopBar
        classNames={{
          root: 'sticky top-0 z-20 border-b border-border bg-card/70 text-card-foreground backdrop-blur-md',
        }}
        leftSlot={
          <span className="flex items-baseline gap-2">
            {/* An h1, not a span: it is the page's title, and the tests and
                screen readers both look for it by heading role. */}
            <h1 className="text-lg font-semibold tracking-tight">战斗力计算器</h1>
            <span className="text-sm text-muted-foreground">v{version}</span>
          </span>
        }
        rightExtras={
          <>
            <ThemeToggle labels={{ auto: '自动', light: '浅色', dark: '深色' }} />
            <BuildInfo
              commit={__BUILD_GIT_COMMIT__}
              buildTime={__BUILD_TIME__}
              dev={import.meta.env.DEV}
            />
          </>
        }
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="职业"
            value={loadout.classId}
            onChange={(e) => setClass(Number(e.target.value), 0)}
            className="rounded-md border border-border bg-card px-2 py-1 text-sm"
          >
            {data.classes
              .filter((c) => c.subclasses.length > 0)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {data.names[c.name_key ?? ''] ?? c.internal_name}
                </option>
              ))}
          </select>
          <div
            role="tablist"
            aria-label="职业刻印"
            className="flex gap-1 rounded-full border border-border bg-card p-1"
          >
            {(currentClass?.subclasses ?? []).map((sub, i) => (
              <button
                key={sub.ability_id}
                role="tab"
                aria-selected={loadout.subclassIndex === i}
                onClick={() => setClass(loadout.classId, i)}
                className={`rounded-full px-3 py-1 text-sm transition ${
                  loadout.subclassIndex === i
                    ? 'bg-accent text-bg font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {data.names[sub.name_key] ?? sub.name_key}
                <span className="ml-1 text-sm opacity-70">
                  {sub.role === 'support' ? '辅助' : '输出'}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={download}
            className="rounded-md border border-border px-3 py-1 text-sm hover:border-accent"
          >
            导出
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            className="rounded-md border border-border px-3 py-1 text-sm hover:border-accent"
          >
            导入
          </button>
          <button
            onClick={() => {
              setLoadout(defaultLoadout())
              setNotice('已清空')
            }}
            className="rounded-md border border-border px-3 py-1 text-sm hover:border-accent"
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
      </div>

      {notice && (
        <p
          role="status"
          className="mb-3 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
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
            <NumberField
              label="战斗等级"
              value={loadout.combatLevel}
              min={55}
              max={70}
              onChange={(v) => set('combatLevel', v)}
            />
          </Section>

          {/* The section title is the client's own: sys.arkpassive.ui_title. */}
          <Section title={data.names[data.arkPassive.uiKeys.title] ?? '方舟被动'}>
            <ArkPassiveGrid
              meta={data.arkPassive}
              names={data.names}
              loadout={loadout}
              hasLeapKarma={coeffs.leap_karma_rate !== undefined}
              onChange={(patch) => setLoadout((l) => ({ ...l, ...patch }))}
            />
          </Section>

          <Section title="方舟星阵核心">
            <CoreGrid
              slots={data.slots[loadout.role]}
              cores={loadout.cores}
              classId={loadout.classId}
              names={data.names}
              onChange={(i, next) => {
                const list = [...loadout.cores]
                list[i] = next
                set('cores', list)
              }}
            />
          </Section>

          {/* tip.name.enum_equipslot_bracelet */}
          <Section title={data.names[data.bracelets.uiKeys.slot] ?? '手镯'}>
            <BraceletColumns
              meta={data.bracelets}
              names={data.names}
              role={loadout.role}
              selected={loadout.braceletLines}
              onChange={(next) => set('braceletLines', next)}
            />
          </Section>

          {/* sys.ability.engrave_spec_title */}
          <Section title={data.names[data.engravings.uiKeys.panel_title] ?? '刻印'}>
            <p className="text-sm text-muted-foreground">
              刻印名称与图标取自游戏客户端；系数仍来自参考站——客户端没有以刻印 id
              为键的战斗力表，因此无可替代。
            </p>
            <EngravingGrid
              meta={data.engravings}
              names={data.names}
              slots={loadout.engravings}
              scoring={scoringEngravings}
              onChange={(i, next) => {
                const list = [...loadout.engravings]
                list[i] = next
                set('engravings', list)
              }}
            />
          </Section>

          <Section title="时装与远征队">
            <p className="text-sm text-muted-foreground">系数来自参考站，非游戏数据表。</p>
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
            <p className="text-sm text-muted-foreground">项链、耳环×2、戒指×2，每件 3 条；各条独立相乘。</p>
            {['项链', '耳环 1', '耳环 2', '戒指 1', '戒指 2'].map((piece, p) => (
              <div key={piece} className="space-y-1">
                <div className="text-sm text-muted-foreground">{piece}</div>
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
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
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
            <p className="text-sm text-muted-foreground">
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
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"
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
                    className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-40"
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

      <p className="mt-10 text-sm text-muted-foreground">
        系数与名称取自游戏客户端数据表（<code>EFTable_BattlePoint</code> 等），
        由 <code>tools/apps/lostark</code> 导出。公式结构参考{' '}
        <a
          className="underline hover:text-foreground"
          href="https://lostark-cn.pages.dev/html/dps"
          target="_blank"
          rel="noreferrer"
        >
          命运方舟工具箱
        </a>
        。数据生成于 {new Date(data.version.generatedAt).toLocaleString('zh-CN')}。
      </p>
      </main>

      <SiteFooter
        homeUrl={import.meta.env.VITE_HOME_URL}
        githubUrl={import.meta.env.VITE_GITHUB_URL}
        icpBeian={import.meta.env.VITE_ICP_BEIAN}
      />
    </div>
  )
}
