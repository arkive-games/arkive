import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Check, ChevronsUpDown, Sparkles, Star } from 'lucide-react'
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { loadPals, type PalEntry, type PalsBundle } from '../../lib/pals'
import { palIconUrl } from '../../lib/assets'
import { formatPalId, palIdText } from '../../lib/palId'
import {
  calcAttack,
  calcCraft,
  calcDefense,
  calcHp,
  solveIV,
  MAX_BOND,
  MAX_IV,
  MAX_LEVEL,
  MAX_SOUL,
  MAX_STARS,
  STAT_CONSTANTS,
  type EnhanceInputs,
} from '../../lib/statCalc'
import { CatalogPageLoading, PalLink } from '../catalog/components'

type TFn = (k: string, o?: Record<string, unknown>) => string

type CombatKey = 'hp' | 'attack' | 'defense'
type RowKey = CombatKey | 'craft'

const CALC: Record<CombatKey, typeof calcHp> = { hp: calcHp, attack: calcAttack, defense: calcDefense }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
/** Trim f64 noise (e.g. 120 × 1.1 = 132.00000000000003) for tooltip display. */
const fmt = (x: number) => String(Number(x.toFixed(4)))

/** One delta column of a results row; null = the step doesn't apply (work
 *  speed has no awakening and no IV). */
interface DeltaCell {
  d: number
  tip: ReactNode
}
interface ResultRow {
  key: RowKey
  base: { v: number; tip: ReactNode }
  deltas: (DeltaCell | null)[]
  final: number
}

type ParamKind =
  | 'prev'
  | 'base'
  | 'bonus'
  | 'coeff'
  | 'level'
  | 'const'
  | 'awaken'
  | 'growth'
  | 'rank'
  | 'iv'
  | 'ivCoeff'
  | 'stars'
  | 'starRate'
  | 'souls'
  | 'soulRate'
  | 'tribe'

/** One color per formula parameter, stable across every tooltip so the same
 *  quantity (level, per-level coefficient, …) is always recognizable. The
 *  tooltip surface is bg-foreground, i.e. dark in light mode and light in
 *  dark mode — hence the inverted dark: shades. */
const PARAM_COLORS: Record<ParamKind, string> = {
  prev: 'text-zinc-300 dark:text-zinc-600',
  base: 'text-sky-300 dark:text-sky-600',
  bonus: 'text-teal-300 dark:text-teal-600',
  coeff: 'text-orange-300 dark:text-orange-600',
  level: 'text-yellow-300 dark:text-yellow-600',
  const: 'text-rose-300 dark:text-rose-600',
  awaken: 'text-fuchsia-300 dark:text-fuchsia-600',
  growth: 'text-emerald-300 dark:text-emerald-600',
  rank: 'text-lime-300 dark:text-lime-600',
  iv: 'text-violet-300 dark:text-violet-600',
  ivCoeff: 'text-pink-300 dark:text-pink-600',
  stars: 'text-amber-300 dark:text-amber-600',
  starRate: 'text-red-300 dark:text-red-600',
  souls: 'text-cyan-300 dark:text-cyan-600',
  soulRate: 'text-blue-300 dark:text-blue-600',
  tribe: 'text-purple-300 dark:text-purple-600',
}

/** A colored formula parameter. */
function P({ kind, v }: { kind: ParamKind; v: number | string }) {
  return <span className={PARAM_COLORS[kind]}>{v}</span>
}
/** A `value — meaning` legend line under the formula. */
function Legend({ kind, v, label }: { kind: ParamKind; v: number | string; label: string }) {
  return (
    <div>
      <P kind={kind} v={v} /> — {label}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  slider = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  slider?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {slider ? (
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
            className="h-1.5 flex-1 accent-primary"
          />
        ) : null}
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(clamp(Math.floor(Number(e.target.value) || 0), min, max))}
          className={cn(
            'h-8 rounded-md border border-border bg-background px-2 text-sm tabular-nums',
            slider ? 'w-16' : 'w-full',
          )}
        />
      </div>
    </label>
  )
}

function StarPicker({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex h-8 items-center gap-1">
        {Array.from({ length: MAX_STARS }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n}`}
            onClick={() => onChange(n === value ? n - 1 : n)}
            className="p-0.5"
          >
            <Star
              className={cn(
                'size-5 transition',
                n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
              )}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

function SimPalPicker({
  pals,
  value,
  onChange,
  t,
}: {
  pals: PalsBundle
  value: string | null
  onChange: (id: string | null) => void
  t: TFn
}) {
  const [open, setOpen] = useState(false)
  const roster = useMemo(
    () => [...pals.pals].sort((a, b) => a.zukanIndex - b.zukanIndex || a.id.localeCompare(b.id)),
    [pals],
  )
  const selected = value ? pals.byId.get(value) ?? null : null

  const searchText = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of roster) {
      const id = formatPalId(p.zukanIndex, p.zukanIndexSuffix)
      m.set(p.id, `${pals.text[p.id]?.name ?? p.id} ${p.id} ${palIdText(id) ?? ''}`)
    }
    return m
  }, [roster, pals])

  const row = (p: PalEntry) => (
    <>
      <img src={palIconUrl(p.icon)} alt="" loading="lazy" className="size-6 shrink-0 rounded-full bg-black/5 object-contain dark:bg-white/10" />
      <span className="truncate">{pals.text[p.id]?.name ?? p.id}</span>
      <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
        {palIdText(formatPalId(p.zukanIndex, p.zukanIndexSuffix))}
      </span>
    </>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-11 w-full max-w-md justify-start gap-2 px-2.5 font-normal"
          data-testid="sim-pal-picker"
        >
          {selected ? row(selected) : <span className="text-muted-foreground">{t('sim.pickPal')}</span>}
          <ChevronsUpDown className="ml-1 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase().trim()) ? 1 : 0)}>
          <CommandInput placeholder={t('breeding.searchPal')} />
          <CommandList>
            <CommandEmpty>{t('breeding.noPalFound')}</CommandEmpty>
            <CommandGroup>
              {roster.map((p) => (
                <CommandItem
                  key={p.id}
                  value={searchText.get(p.id)}
                  onSelect={() => {
                    onChange(p.id)
                    setOpen(false)
                  }}
                  className="gap-2"
                >
                  {row(p)}
                  <Check className={cn('ml-1 size-4 shrink-0', p.id === value ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Pal stat simulator. One table covers both directions: the base@level
 *  column plus one delta column per enhancement step (awakening → trust →
 *  IV → condense → souls, the formula's fold order, each cell carrying the
 *  staged-truncation formula as a tooltip), then the final value, then an
 *  editable "in-game" column — typing the stat displayed in game solves the
 *  hidden IV automatically, turning red when no IV 0–100 can produce it. */
export default function StatSimulatorPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const search = useSearch({ from: '/stat-simulator' })
  const navigate = useNavigate({ from: '/stat-simulator' })

  const [pals, setPals] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [level, setLevel] = useState(60)
  const [stars, setStars] = useState(0)
  const [bond, setBond] = useState(0)
  const [awake, setAwake] = useState(false)
  const [souls, setSouls] = useState({ hp: 0, attack: 0, defense: 0, craft: 0 })
  const [iv, setIv] = useState<Record<CombatKey, number>>({ hp: 100, attack: 100, defense: 100 })
  /** In-game column entries (per stat). They persist after blur: an entry
   *  that no IV can produce stays visible in red until the user changes it,
   *  clears it, moves that stat's IV slider, or a settings change makes it
   *  solvable again. */
  const [entered, setEntered] = useState<Partial<Record<RowKey, string>>>({})

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadPals(lng)
      .then((p) => {
        if (!cancelled) setPals(p)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  const palId = search.pal ?? null
  const pal = palId && pals ? pals.byId.get(palId) ?? null : null
  useEffect(() => setEntered({}), [palId])
  const setPalId = (id: string | null) =>
    void navigate({ search: (s) => ({ ...s, pal: id ?? undefined }), replace: true })

  const inputs: EnhanceInputs = {
    level,
    stars,
    soulHp: souls.hp,
    soulAttack: souls.attack,
    soulDefense: souls.defense,
    soulCraft: souls.craft,
    bond,
    awake,
  }

  const statLabel: Record<RowKey, string> = {
    hp: t('pal.stat.hp'),
    attack: t('pal.stat.shotAttack'),
    defense: t('pal.stat.defense'),
    craft: t('pal.stat.craftSpeed'),
  }

  const C = STAT_CONSTANTS
  const F = Math.max(bond, 0)

  /** Cumulative chain per combat stat: base@level → +awakening → +trust →
   *  +IV (all inside the single s0 truncation) → +condense → +souls. Each
   *  tooltip states `previous subtotal + its own increment` with real,
   *  color-coded numbers followed by a legend; deltas telescope exactly to
   *  the final value. */
  const combatRow = (k: CombatKey): ResultRow => {
    if (!pal) throw new Error('unreachable')
    const p = {
      hp: { base: pal.stats.hp, growth: pal.friendship?.hp ?? 0, plus: C.tribePlusHP, lm: C.levelMulHP, cst: C.constHP, soul: souls.hp },
      attack: { base: pal.stats.shotAttack, growth: pal.friendship?.shotAttack ?? 0, plus: 0, lm: C.levelMulAttack, cst: C.constAttack, soul: souls.attack },
      defense: { base: pal.stats.defense, growth: pal.friendship?.defense ?? 0, plus: 0, lm: C.levelMulDefense, cst: C.constDefense, soul: souls.defense },
    }[k]
    const calc = CALC[k]
    const a0 = calc(pal.stats, pal.friendship, 0, { ...inputs, bond: 0, awake: false }).s0
    const a1 = calc(pal.stats, pal.friendship, 0, { ...inputs, bond: 0 }).s0
    const a2 = calc(pal.stats, pal.friendship, 0, inputs).s0
    const full = calc(pal.stats, pal.friendship, iv[k], inputs)
    const awakeMul = awake ? C.awakeningMul : 1
    const b1 = p.base * awakeMul
    const b2 = b1 + p.growth * F
    // Pre-truncation subtotals of the level stage after each fold step. The
    // stage is linear in the working base, so each step's tooltip can state
    // exactly: previous subtotal + its own increment — no full re-derivation
    // (truncation happens once, after the whole stage; see stageNote).
    const X0 = (p.base + p.plus) * p.lm * level + p.cst
    const X1 = (b1 + p.plus) * p.lm * level + p.cst
    const X2 = (b2 + p.plus) * p.lm * level + p.cst
    // Legend lines shared across the row's tooltips.
    const Lbase = <Legend kind="base" v={p.base} label={t('sim.fBase')} />
    const Lcoeff = <Legend kind="coeff" v={p.lm} label={t('sim.fCoeff')} />
    const Llevel = <Legend kind="level" v={level} label={t('sim.level')} />
    return {
      key: k,
      base: {
        v: a0,
        tip: (
          <>
            <div>
              {p.plus ? (
                <>
                  (<P kind="base" v={p.base} /> + <P kind="bonus" v={p.plus} />)
                </>
              ) : (
                <P kind="base" v={p.base} />
              )}{' '}
              × <P kind="coeff" v={p.lm} /> × <P kind="level" v={level} /> + <P kind="const" v={p.cst} /> = {a0}
            </div>
            {Lbase}
            {p.plus ? <Legend kind="bonus" v={p.plus} label={t('sim.fBonus')} /> : null}
            {Lcoeff}
            {Llevel}
            <Legend kind="const" v={p.cst} label={t('sim.fConst')} />
          </>
        ),
      },
      deltas: [
        {
          d: a1 - a0,
          tip: (
            <>
              <div>
                <P kind="prev" v={fmt(X0)} /> + <P kind="base" v={p.base} /> × (
                <P kind="awaken" v={awakeMul} /> − 1) × <P kind="coeff" v={p.lm} /> ×{' '}
                <P kind="level" v={level} /> = {a1}
              </div>
              <Legend kind="prev" v={fmt(X0)} label={t('sim.fPrev')} />
              {Lbase}
              <Legend kind="awaken" v={awakeMul} label={t('sim.fAwakenMul')} />
              {Lcoeff}
              {Llevel}
            </>
          ),
        },
        {
          d: a2 - a1,
          tip: (
            <>
              <div>
                <P kind="prev" v={fmt(X1)} /> + <P kind="growth" v={p.growth} /> ×{' '}
                <P kind="rank" v={F} /> × <P kind="coeff" v={p.lm} /> × <P kind="level" v={level} /> = {a2}
              </div>
              <Legend kind="prev" v={fmt(X1)} label={t('sim.fPrev')} />
              <Legend kind="growth" v={p.growth} label={t('sim.fGrowth')} />
              <Legend kind="rank" v={F} label={t('sim.bond')} />
              {Lcoeff}
              {Llevel}
            </>
          ),
        },
        {
          d: full.s0 - a2,
          tip: (
            <>
              <div>
                <P kind="prev" v={fmt(X2)} /> + <P kind="base" v={fmt(b2)} /> ×{' '}
                <P kind="iv" v={iv[k]} /> × <P kind="ivCoeff" v={C.talentRate} /> ×{' '}
                <P kind="coeff" v={p.lm} /> × <P kind="level" v={level} /> = {full.s0}
              </div>
              <Legend kind="prev" v={fmt(X2)} label={t('sim.fPrev')} />
              <Legend kind="base" v={fmt(b2)} label={t(b2 !== p.base ? 'sim.fBaseEnh' : 'sim.fBase')} />
              <Legend kind="iv" v={iv[k]} label={t('sim.colIv')} />
              <Legend kind="ivCoeff" v={C.talentRate} label={t('sim.fIvCoeff')} />
              {Lcoeff}
              {Llevel}
            </>
          ),
        },
        {
          d: full.s1 - full.s0,
          tip: (
            <>
              <div>
                <P kind="prev" v={full.s0} /> × (1 + <P kind="stars" v={stars} /> ×{' '}
                <P kind="starRate" v={C.condenseRate} />) = {full.s1}
              </div>
              <Legend kind="prev" v={full.s0} label={t('sim.fPrev')} />
              <Legend kind="stars" v={stars} label={t('sim.colStars')} />
              <Legend kind="starRate" v={C.condenseRate} label={t('sim.fStarRate')} />
            </>
          ),
        },
        {
          d: full.final - full.s1,
          tip: (
            <>
              <div>
                <P kind="prev" v={full.s1} /> × (1 + <P kind="souls" v={p.soul} /> ×{' '}
                <P kind="soulRate" v={C.soulRate} />) = {full.final}
              </div>
              <Legend kind="prev" v={full.s1} label={t('sim.fPrev')} />
              <Legend kind="souls" v={p.soul} label={t('sim.colSouls')} />
              <Legend kind="soulRate" v={C.soulRate} label={t('sim.fSoulRate')} />
            </>
          ),
        },
      ],
      final: full.final,
    }
  }

  const craftRow = (): ResultRow => {
    if (!pal) throw new Error('unreachable')
    const base = pal.stats.craftSpeed
    const growth = pal.friendship?.craftSpeed ?? 0
    const c0 = calcCraft(pal.stats, pal.friendship, { ...inputs, bond: 0 })
    const cf = calcCraft(pal.stats, pal.friendship, inputs)
    const Lbase = <Legend kind="base" v={base} label={t('sim.fBase')} />
    const Ltribe = <Legend kind="tribe" v={C.craftTribeMul} label={t('sim.fTribe')} />
    return {
      key: 'craft',
      base: {
        v: c0.s0,
        tip: (
          <>
            <div>
              <P kind="base" v={base} /> × <P kind="tribe" v={C.craftTribeMul} /> = {c0.s0}
            </div>
            {Lbase}
            {Ltribe}
          </>
        ),
      },
      deltas: [
        null,
        {
          d: cf.s0 - c0.s0,
          tip: (
            <>
              <div>
                <P kind="base" v={base} /> + <P kind="growth" v={growth} /> × <P kind="rank" v={F} /> = {cf.base}
              </div>
              <div>
                {cf.base} × <P kind="tribe" v={C.craftTribeMul} /> = {cf.s0}
              </div>
              {Lbase}
              <Legend kind="growth" v={growth} label={t('sim.fGrowth')} />
              <Legend kind="rank" v={F} label={t('sim.bond')} />
              {Ltribe}
            </>
          ),
        },
        null,
        {
          d: cf.s1 - cf.s0,
          tip: (
            <>
              <div>
                <P kind="prev" v={cf.s0} /> × (1 + <P kind="stars" v={stars} /> ×{' '}
                <P kind="starRate" v={C.craftCondenseRate} />) = {cf.s1}
              </div>
              <Legend kind="prev" v={cf.s0} label={t('sim.fPrev')} />
              <Legend kind="stars" v={stars} label={t('sim.colStars')} />
              <Legend kind="starRate" v={C.craftCondenseRate} label={t('sim.fStarRate')} />
            </>
          ),
        },
        {
          d: cf.final - cf.s1,
          tip: (
            <>
              <div>
                <P kind="prev" v={cf.s1} /> × (1 + <P kind="souls" v={souls.craft} /> ×{' '}
                <P kind="soulRate" v={C.soulRate} />) = {cf.final}
              </div>
              <Legend kind="prev" v={cf.s1} label={t('sim.fPrev')} />
              <Legend kind="souls" v={souls.craft} label={t('sim.colSouls')} />
              <Legend kind="soulRate" v={C.soulRate} label={t('sim.fSoulRate')} />
            </>
          ),
        },
      ],
      final: cf.final,
    }
  }

  const rows: ResultRow[] | null = pal ? [combatRow('hp'), combatRow('attack'), combatRow('defense'), craftRow()] : null

  /** Typing an in-game stat solves the hidden IV: keep the current IV when it
   *  already matches (several IVs can share one displayed value), otherwise
   *  snap to the nearest matching bound. No match → leave the IVs alone; the
   *  entry stays set and renders red with a warning tooltip. */
  const onInGameChange = (k: RowKey, v: string) => {
    setEntered((e) => ({ ...e, [k]: v }))
    if (!pal || k === 'craft') return
    const n = Number(v)
    if (v.trim() === '' || !Number.isFinite(n)) return
    const sol = solveIV(n, (cand) => CALC[k](pal.stats, pal.friendship, cand, inputs).final)
    if (sol) setIv((prev) => ({ ...prev, [k]: clamp(prev[k], sol.min, sol.max) }))
  }
  /** Blur only drops empty or already-matching entries; a mismatched entry
   *  stays (red) so the user can see what they typed. */
  const onInGameBlur = (k: RowKey, final: number) =>
    setEntered((e) => {
      const v = e[k]
      if (v == null || (v.trim() !== '' && Number(v) !== final)) return e
      const next = { ...e }
      delete next[k]
      return next
    })
  /** Moving an IV slider by hand supersedes that stat's in-game entry. */
  const setIvManual = (k: CombatKey, v: number) => {
    setIv((prev) => ({ ...prev, [k]: v }))
    setEntered((e) => {
      if (e[k] == null) return e
      const next = { ...e }
      delete next[k]
      return next
    })
  }

  /** When settings change (level, stars, souls, trust, awakening), retry the
   *  persisted entries: an entry that becomes solvable snaps the IV back into
   *  range and stops being red. */
  useEffect(() => {
    if (!pal) return
    for (const k of ['hp', 'attack', 'defense'] as const) {
      const v = entered[k]
      if (v == null || v.trim() === '') continue
      const n = Number(v)
      if (!Number.isFinite(n)) continue
      const sol = solveIV(n, (cand) => CALC[k](pal.stats, pal.friendship, cand, inputs).final)
      if (sol)
        setIv((prev) => {
          const next = clamp(prev[k], sol.min, sol.max)
          return next === prev[k] ? prev : { ...prev, [k]: next }
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pal, level, stars, bond, awake, souls, entered])

  const inGameCell = (row: ResultRow) => {
    if (!pal) return null
    const text = entered[row.key] ?? String(row.final)
    const n = Number(entered[row.key])
    const invalid =
      entered[row.key] != null && entered[row.key]!.trim() !== '' && (!Number.isFinite(n) || n !== row.final)
    let tip: string
    if (row.key === 'craft') {
      tip = t('sim.craftNoIv')
    } else if (invalid) {
      tip = t('sim.noMatch')
    } else {
      const sol = solveIV(row.final, (cand) => CALC[row.key as CombatKey](pal.stats, pal.friendship, cand, inputs).final)
      tip = t('sim.ivMatch', { range: sol ? (sol.min === sol.max ? String(sol.min) : `${sol.min}–${sol.max}`) : '—' })
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <input
            type="number"
            min={0}
            value={text}
            onChange={(e) => onInGameChange(row.key, e.target.value)}
            onBlur={() => onInGameBlur(row.key, row.final)}
            data-testid={`sim-ingame-${row.key}`}
            className={cn(
              'h-7 w-24 rounded-md border bg-background px-2 text-right text-sm font-semibold tabular-nums',
              invalid ? 'border-destructive text-destructive' : 'border-border',
            )}
          />
        </TooltipTrigger>
        <TooltipContent className={cn('whitespace-pre-line', invalid && 'bg-destructive text-white')}>
          {tip}
        </TooltipContent>
      </Tooltip>
    )
  }

  const deltaCell = (cell: DeltaCell | null, i: number) => (
    <td key={i} className="py-1.5 pr-3 text-right tabular-nums">
      {cell ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2',
                cell.d ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
              )}
            >
              +{cell.d}
            </span>
          </TooltipTrigger>
          <TooltipContent className="text-left tabular-nums">{cell.tip}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </td>
  )

  return (
    <ContentPage active="/stat-simulator" title={t('sim.title')} heading>
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !pals ? (
        <CatalogPageLoading />
      ) : (
        <TooltipProvider delayDuration={200}>
          <p className="mb-3 text-sm text-muted-foreground">{t('sim.caption')}</p>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SimPalPicker pals={pals} value={palId} onChange={setPalId} t={t} />
            {pal ? (
              <span className="text-sm text-muted-foreground">
                <PalLink id={pal.id} name={pals.text[pal.id]?.name ?? pal.id} icon={pal.icon} />
                <span className="ml-2 tabular-nums">
                  {t('sim.base')}: HP {pal.stats.hp} ·{' '}
                  {statLabel.attack} {pal.stats.shotAttack} · {statLabel.defense} {pal.stats.defense} ·{' '}
                  {statLabel.craft} {pal.stats.craftSpeed}
                </span>
              </span>
            ) : null}
          </div>

          {!pal ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {t('sim.pickPal')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
              {/* enhancement inputs */}
              <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                <NumberField
                  label={t('sim.level')}
                  value={level}
                  onChange={setLevel}
                  min={1}
                  max={MAX_LEVEL}
                  slider
                />
                <div className="grid grid-cols-2 gap-3">
                  <StarPicker
                    label={t('sim.stars')}
                    value={stars}
                    onChange={setStars}
                  />
                  <NumberField
                    label={t('sim.bond')}
                    value={bond}
                    onChange={setBond}
                    min={0}
                    max={MAX_BOND}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAwake(!awake)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition',
                    awake
                      ? 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400'
                      : 'border-border bg-secondary text-secondary-foreground hover:bg-accent',
                  )}
                >
                  <Sparkles className="size-4" />
                  {t('sim.awakening')}
                  <span className="ml-auto text-xs text-muted-foreground">×1.1</span>
                </button>

                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('sim.souls')}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField label={statLabel.hp} value={souls.hp} onChange={(v) => setSouls({ ...souls, hp: v })} min={0} max={MAX_SOUL} />
                    <NumberField label={statLabel.attack} value={souls.attack} onChange={(v) => setSouls({ ...souls, attack: v })} min={0} max={MAX_SOUL} />
                    <NumberField label={statLabel.defense} value={souls.defense} onChange={(v) => setSouls({ ...souls, defense: v })} min={0} max={MAX_SOUL} />
                    <NumberField label={statLabel.craft} value={souls.craft} onChange={(v) => setSouls({ ...souls, craft: v })} min={0} max={MAX_SOUL} />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('sim.ivs')}
                  </div>
                  <div className="space-y-2">
                    <NumberField label={statLabel.hp} value={iv.hp} onChange={(v) => setIvManual('hp', v)} min={0} max={MAX_IV} slider />
                    <NumberField label={statLabel.attack} value={iv.attack} onChange={(v) => setIvManual('attack', v)} min={0} max={MAX_IV} slider />
                    <NumberField label={statLabel.defense} value={iv.defense} onChange={(v) => setIvManual('defense', v)} min={0} max={MAX_IV} slider />
                  </div>
                </div>
              </div>

              {/* results */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="sim-results">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">{t('sim.stat')}</th>
                        <th className="py-2 pr-3 text-right font-medium">{t('sim.colBase')}</th>
                        <th className="py-2 pr-3 text-right font-medium">+{t('sim.awakening')}</th>
                        <th className="py-2 pr-3 text-right font-medium">+{t('sim.colTrust')}</th>
                        <th className="py-2 pr-3 text-right font-medium">+{t('sim.colIv')}</th>
                        <th className="py-2 pr-3 text-right font-medium">+{t('sim.colStars')}</th>
                        <th className="py-2 pr-3 text-right font-medium">+{t('sim.colSouls')}</th>
                        <th className="py-2 pr-3 text-right font-medium">{t('sim.stageFinal')}</th>
                        <th className="py-2 text-right font-medium">{t('sim.colInGame')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows!.map((row) => (
                        <tr key={row.key} className="border-t border-border/60">
                          <td className="py-1.5 pr-3">{statLabel[row.key]}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
                                  {row.base.v}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-left tabular-nums">
                                {row.base.tip}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                          {row.deltas.map(deltaCell)}
                          <td className="py-1.5 pr-3 text-right text-base font-semibold tabular-nums">{row.final}</td>
                          <td className="py-1.5 text-right">{inGameCell(row)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {t('sim.stageNote')} {t('sim.editNote')}
                </p>
              </div>
            </div>
          )}
        </TooltipProvider>
      )}
    </ContentPage>
  )
}
