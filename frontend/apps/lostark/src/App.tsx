import { useEffect, useMemo, useRef, useState } from 'react'
import { ArkiveAccountControl } from '@gamemap/auth'
import { LocalDataDialog, localDataStringsFor, ShellTopBar, ThemeToggle } from '@gamemap/map-shell'
import { BuildInfo, SiteFooter } from '@gamemap/ui'
import changelog from './changelog.json'
import {
  armourGroups,
  engravingAmpFromClient,
  evaluate,
  weaponOptions,
  type EngravingAmpSource,
} from '@/calc/engine'
import type { Loadout } from '@/calc/types'
import { loadDataset, type Dataset } from '@/lib/data'
import {
  clearLoadout,
  defaultLoadout,
  exportLoadout,
  parseLoadout,
  restoreLoadout,
  saveLoadout,
} from '@/lib/loadout'
import {
  armourSetLabel,
  gradePalette,
  weaponLabel,
} from '@/lib/gearLabels'
import { Field, NumberField, Section, SelectField } from '@/components/Fields'
import { SearchSelect } from '@/components/SearchSelect'
import { ScoreRail } from '@/components/ScoreRail'
import { CoreGrid } from '@/components/CoreGrid'
import { BraceletColumns } from '@/components/BraceletColumns'
import { EngravingGrid } from '@/components/EngravingGrid'
import { plainText } from '@/components/RichText'
import { ArkPassiveGrid } from '@/components/ArkPassiveGrid'
import { AvatarSlots } from '@/components/AvatarSlots'
import { CombatStatFields } from '@/components/CombatStatFields'
import { EstherWeaponField } from '@/components/EstherWeaponField'

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
      saveLoadout(loadout)
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
   * Engraving amps keyed by the display name the loadout stores.
   *
   * From BattlePoint Type 10/11 via the client's reworked ability ids. Built once
   * per dataset so scoring is a map lookup rather than a scan of 43 rows.
   */
  const engravingsByName = useMemo(() => {
    const map = new Map<string, EngravingAmpSource>()
    if (!data) return map
    for (const e of Object.values(data.engravings.engravings)) {
      const name = plainText(data.names[e.name_key] ?? e.slug)
      map.set(name, { slug: e.slug, amp: e.amp, heal_amp: e.heal_amp })
    }
    return map
  }, [data])

  /**
   * Engraving names that carry combat power for the current role.
   *
   * 15 of the 43 general engravings score nothing in the client — defensive and
   * utility ones genuinely have no grid. Marking them rather than hiding them
   * keeps the picker honest.
   */
  const scoringEngravings = useMemo(() => {
    const out = new Set<string>()
    for (const [name, e] of engravingsByName) {
      if (Object.keys(e.amp[loadout.role]).length || Object.keys(e.heal_amp[loadout.role]).length) {
        out.add(name)
      }
    }
    return out
  }, [engravingsByName, loadout.role])

  /**
   * Each ark-grid slot's own contribution, so a card can show it in its corner
   * rather than making you find the matching row in the rail.
   */
  const coreAmps = useMemo(() => {
    if (!coeffs) return []
    return loadout.cores.map(
      (core) => (core.id ? coeffs.ark_core_values[core.id]?.[String(core.optionIndex)] : 0) ?? 0,
    )
  }, [coeffs, loadout.cores])

  /**
   * Each Ark Passive tree's contribution. Evolution and Leap fold in their karma
   * dial (BattlePoint Types 8 and 9) so the card corner matches what the tree as
   * a whole adds, not just its points.
   */
  const arkPassiveAmps = useMemo<Record<string, number>>(() => {
    if (!coeffs) return {} as Record<string, number>
    return {
      evolution:
        Math.max(0, (loadout.arkEvolution - 40) * coeffs.evolution_rate) +
        loadout.karmaEvolutionStage * coeffs.karma_stage_step,
      enlightenment: loadout.arkEnlightenment * coeffs.enlightenment_rate,
      leap:
        loadout.arkLeap * coeffs.leap_rate +
        (coeffs.leap_karma_rate !== undefined
          ? loadout.karmaLeapLevel * coeffs.leap_karma_rate
          : 0),
    }
  }, [coeffs, loadout])

  /** Each engraving slot's own contribution, from the client's growth grid. */
  const engravingAmps = useMemo(
    () =>
      // Both channels: a heal-only engraving (妙手回春 is the one) has an empty
      // score grid, so reading only the score channel showed "—" on a card that
      // was contributing 44.8% to the heal half. `scoringEngravings` already
      // checks both, so the two disagreed.
      loadout.engravings.map(
        (slot) =>
          engravingAmpFromClient(slot, loadout.role, engravingsByName) +
          engravingAmpFromClient(slot, loadout.role, engravingsByName, 'heal'),
      ),
    [loadout.engravings, loadout.role, engravingsByName],
  )

  const result = useMemo(() => {
    if (!data || !coeffs) return null
    return evaluate(
      loadout,
      coeffs,
      data.gear,
      data.bracelets.lines,
      engravingsByName,
      data.avatars.options,
    )
  }, [data, coeffs, loadout, engravingsByName])

  const itemLevels = useMemo(
    () => (data ? Object.keys(data.gear).map(Number).sort((a, b) => a - b) : []),
    [data],
  )

  /**
   * The armour sets on offer, named for the selected class.
   *
   * A stat template is listed once per main stat (Str / Agi / Int) with the same
   * numbers, and a class can only wear the one for its own stat — so the list is
   * narrowed to the sets the class has items for, which is also what makes each
   * label distinct. If nothing at this item level is named for the class — a
   * template the pipeline could not join to an item — every group is offered, so
   * the selector degrades to bare ids rather than to nothing.
   */
  const groups = useMemo(() => {
    if (!data) return []
    const all = armourGroups(data.gear, loadout.itemLevel)
    const named = all.filter((g) => data.gearItems?.sets[g]?.series[String(loadout.classId)])
    return named.length ? named : all
  }, [data, loadout.itemLevel, loadout.classId])
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
      <main className="arkive-content-page mx-auto max-w-[var(--arkive-content-reading)] pb-6">
        <h1 className="text-3xl font-bold">战斗力计算器</h1>
        <p className="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          数据加载失败：{error}
          <br />
          请确认 <code>data-lostark</code> 已生成（<code>uv run python -m lostark emit</code>）。
        </p>
      </main>
    )
  }

  if (!data || !coeffs || !result) {
    return (
      <main className="arkive-content-page pb-6 text-sm text-muted-foreground">
        加载中…
      </main>
    )
  }

  // entries[0] is this app's current version by convention.
  const version = (changelog.entries[0]?.version ?? '0.0.0') as string

  /** The client's own grade name (遗物 / 古代 / 神选英雄), or '' if unnamed. */
  const gradeName = (grade: number | undefined) => {
    const key = grade === undefined ? undefined : data.gearItems?.grades[String(grade)]
    return key ? data.names[key] ?? '' : ''
  }

  /**
   * A dot in the grade's own colour, from the palette in index.css.
   *
   * Esther has no colour there, so its dot is a transparent spacer: the rows
   * stay aligned without claiming a colour the palette does not carry.
   */
  const gradeDot = (grade: number | undefined) => {
    const palette = gradePalette(grade)
    return (
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{
          background: palette === null ? 'transparent' : `var(--grade-${palette}-ring)`,
        }}
      />
    )
  }

  const armourGrade = data.gearItems?.sets[loadout.armourGroup]?.grade
  const weaponGrade = data.gearItems?.weapons[loadout.weaponId]?.grade
  const weaponAttack = weapons.find((w) => w.id === loadout.weaponId)?.attack

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <ShellTopBar
        classNames={{
          root: 'sticky top-0 z-[var(--arkive-layer-sticky)] border-b border-border bg-card/70 text-card-foreground backdrop-blur-md',
        }}
        leftSlot={
          <span className="flex items-baseline gap-2">
            {/* An h1, not a span: it is the page's title, and the tests and
                screen readers both look for it by heading role. */}
            <h1 className="text-base font-semibold">战斗力计算器</h1>
            <span className="text-sm text-muted-foreground">v{version}</span>
          </span>
        }
        rightExtras={
          <>
            {/* This app has no i18n and renders Chinese throughout, so the
                locale is a literal rather than a lookup. */}
            <ArkiveAccountControl
              language="zh-CN"
              settings={{
                locale: 'zh-CN',
                site: { name: 'Lost Ark' },
                themeOptions: [
                  { value: 'auto', label: '自动' },
                  { value: 'light', label: '浅色' },
                  { value: 'dark', label: '深色' },
                ],
              }}
            />
            <ThemeToggle labels={{ auto: '自动', light: '浅色', dark: '深色' }} />
            <BuildInfo
              commit={__BUILD_GIT_COMMIT__}
              buildTime={__BUILD_TIME__}
              dev={import.meta.env.DEV}
            />
          </>
        }
      />

      <main className="arkive-content-page mx-auto w-full max-w-[var(--arkive-content-standard)] flex-1 pb-16">
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
              clearLoadout()
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
            {/* Both gear selectors are searchable: an item level offers several
                sets and weapons, and they are picked by name. The stat-template
                id stays under the control, so a build is still identifiable
                exactly — the name alone is ambiguous across the three armour
                lines the game splits by main stat. */}
            <Field label="防具套装">
              <div className="min-w-0">
                <SearchSelect
                  ariaLabel="防具套装"
                  clearable={false}
                  value={loadout.armourGroup}
                  onChange={(v) => set('armourGroup', v)}
                  options={groups.map((g) => ({
                    value: g,
                    label:
                      armourSetLabel(data.gearItems, g, loadout.classId, data.names) || g,
                    search: g,
                    icon: gradeDot(data.gearItems?.sets[g]?.grade),
                  }))}
                  labels={{
                    empty: '未选择',
                    search: '搜索套装…',
                    notFound: '没有匹配的套装',
                  }}
                />
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {[gradeName(armourGrade), loadout.armourGroup].filter(Boolean).join(' · ')}
                </p>
              </div>
            </Field>
            <Field label="武器">
              <div className="min-w-0">
                <SearchSelect
                  ariaLabel="武器"
                  clearable={false}
                  value={loadout.weaponId}
                  onChange={(v) => set('weaponId', v)}
                  options={weapons.map((w) => ({
                    value: w.id,
                    label: weaponLabel(data.gearItems, w.id, loadout.classId, data.names) || w.id,
                    search: w.id,
                    icon: gradeDot(data.gearItems?.weapons[w.id]?.grade),
                    meta: (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {w.attack.toLocaleString('zh-CN')}
                      </span>
                    ),
                  }))}
                  labels={{
                    empty: '未选择',
                    search: '搜索武器…',
                    notFound: '没有匹配的武器',
                  }}
                />
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {[
                    gradeName(weaponGrade),
                    loadout.weaponId,
                    weaponAttack?.toLocaleString('zh-CN'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </Field>
            <EstherWeaponField
              meta={data.esther}
              names={data.names}
              classId={loadout.classId}
              role={loadout.role}
              value={loadout.chosenWeaponId}
              onChange={(v) => set('chosenWeaponId', v)}
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
              amps={arkPassiveAmps}
              onChange={(patch) => setLoadout((l) => ({ ...l, ...patch }))}
            />
          </Section>

          <Section title="方舟星阵核心">
            <CoreGrid
              slots={data.slots[loadout.role]}
              cores={loadout.cores}
              classId={loadout.classId}
              names={data.names}
              amps={coreAmps}
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
              全部取自游戏客户端数据表（战斗力系数为 BattlePoint Type 10 / 11）。
              仅收录 43 个通用刻印——改版后职业刻印已成为职业本身，客户端亦不再为其提供系数表。
            </p>
            <EngravingGrid
              meta={data.engravings}
              names={data.names}
              slots={loadout.engravings}
              scoring={scoringEngravings}
              role={loadout.role}
              amps={engravingAmps}
              onChange={(i, next) => {
                const list = [...loadout.engravings]
                list[i] = next
                set('engravings', list)
              }}
            />
          </Section>

          {/* sys.characterinfo.avatar_tab_title */}
          <Section title={data.names[data.avatars.uiKeys.title] ?? '时装'}>
            <AvatarSlots
              meta={data.avatars}
              names={data.names}
              selected={loadout.avatars}
              onChange={(next) => set('avatars', next)}
            />
          </Section>

          {/* sys.characterinfo.stat_info_combat */}
          <Section title={data.names[data.combatStats.uiKeys.title] ?? '战斗特性'}>
            <CombatStatFields
              meta={data.combatStats}
              names={data.names}
              rates={coeffs.combat_stat_rates}
              values={loadout.combatStats}
              onChange={(next) => set('combatStats', next)}
            />
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

      <div className="flex justify-center border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <LocalDataDialog strings={localDataStringsFor('zh-CN')} />
      </div>

      <SiteFooter
        homeUrl={import.meta.env.VITE_HOME_URL}
        githubUrl={import.meta.env.VITE_GITHUB_URL}
        icpBeian={import.meta.env.VITE_ICP_BEIAN}
      />
    </div>
  )
}
