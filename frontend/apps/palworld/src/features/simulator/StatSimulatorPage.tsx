import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { defineMemoryRecord, isBoolean, useMemoryState } from '@gamemap/state-memory'
import { ArrowDown01, ArrowUp10, Check, RotateCcw, Sparkles, Star } from 'lucide-react'
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Hint,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TooltipProvider,
  cn,
} from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { loadPals, type PalEntry, type PalsBundle } from '../../lib/pals'
import { palIconUrl } from '../../lib/assets'
import { compareZukan, formatPalId, palIdText, type ZukanSortDirection } from '../../lib/palId'
import {
  applyPassive,
  applyPassiveHp,
  calcAttack,
  calcCraft,
  calcDefense,
  calcHp,
  passiveMul,
  solveIV,
  MAX_BOND,
  MAX_IV,
  MAX_LEVEL,
  MIN_PASSIVE_PCT,
  MAX_SOUL,
  MAX_STARS,
  STAT_CONSTANTS,
  type EnhanceInputs,
} from '../../lib/statCalc'
import { CatalogPageLoading, PalLink } from '../catalog/components'

type TFn = (k: string, o?: Record<string, unknown>) => string

type CombatKey = 'hp' | 'attack' | 'defense'
type RowKey = CombatKey | 'craft'

const numberRecord = (id: string, defaultValue: number, min: number, max: number) => defineMemoryRecord({
  id,
  namespace: 'palworld',
  surface: 'stat-simulator',
  stateClass: 'task_draft' as const,
  schemaVersion: '1.0.0',
  defaultValue: () => defaultValue,
  validate: (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max,
  retentionMs: 30 * 24 * 60 * 60 * 1_000,
})

const levelRecord = numberRecord('level', 60, 1, MAX_LEVEL)
const starsRecord = numberRecord('stars', 0, 0, MAX_STARS)
const bondRecord = numberRecord('bond', 0, 0, MAX_BOND)
const awakeRecord = defineMemoryRecord({
  id: 'awake', namespace: 'palworld', surface: 'stat-simulator', stateClass: 'task_draft',
  schemaVersion: '1.0.0', defaultValue: () => false, validate: isBoolean,
  retentionMs: 30 * 24 * 60 * 60 * 1_000,
})

type FourStats = Record<RowKey, number>
const isFourStats = (value: unknown): value is FourStats => {
  if (!value || typeof value !== 'object') return false
  const stats = value as Partial<FourStats>
  return ['hp', 'attack', 'defense', 'craft'].every((key) =>
    typeof stats[key as RowKey] === 'number' && Number.isFinite(stats[key as RowKey]))
}
const soulsRecord = defineMemoryRecord({
  id: 'souls', namespace: 'palworld', surface: 'stat-simulator', stateClass: 'task_draft',
  schemaVersion: '1.0.0', defaultValue: () => ({ hp: 0, attack: 0, defense: 0, craft: 0 }),
  validate: isFourStats, retentionMs: 30 * 24 * 60 * 60 * 1_000,
})
const passivesRecord = defineMemoryRecord({
  id: 'passives', namespace: 'palworld', surface: 'stat-simulator', stateClass: 'task_draft',
  schemaVersion: '1.0.0', defaultValue: () => ({ hp: 0, attack: 0, defense: 0, craft: 0 }),
  validate: isFourStats, retentionMs: 30 * 24 * 60 * 60 * 1_000,
})
const ivRecord = defineMemoryRecord({
  id: 'iv', namespace: 'palworld', surface: 'stat-simulator', stateClass: 'task_draft',
  schemaVersion: '1.0.0', defaultValue: () => ({ hp: 100, attack: 100, defense: 100 }),
  validate: (value: unknown): value is Record<CombatKey, number> => {
    if (!value || typeof value !== 'object') return false
    const stats = value as Partial<Record<CombatKey, number>>
    return ['hp', 'attack', 'defense'].every((key) => {
      const current = stats[key as CombatKey]
      return typeof current === 'number' && Number.isFinite(current) && current >= 0 && current <= MAX_IV
    })
  },
  retentionMs: 30 * 24 * 60 * 60 * 1_000,
})
const enteredRecord = defineMemoryRecord({
  id: 'entered-values', namespace: 'palworld', surface: 'stat-simulator', stateClass: 'task_draft',
  schemaVersion: '1.0.0', defaultValue: () => ({} as Partial<Record<RowKey, string>>),
  validate: (value: unknown): value is Partial<Record<RowKey, string>> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    return Object.entries(value).every(([key, entry]) =>
      ['hp', 'attack', 'defense', 'craft'].includes(key) && typeof entry === 'string' && entry.length <= 32)
  },
  retentionMs: 30 * 24 * 60 * 60 * 1_000,
})

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
  /** Five enhancement deltas (awaken → trust → IV → stars → souls). */
  deltas: (DeltaCell | null)[]
  /** Permanent stat after all five enhancement stages (pre-passive). */
  permanent: number
  /** Passive delta as the sixth delta cell. */
  passiveDelta: DeltaCell
  /** Final in-game value: permanent + passive layer. */
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
  | 'passive'

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
  passive: 'text-indigo-300 dark:text-indigo-600',
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
      <span className="text-sm font-medium text-muted-foreground sm:text-xs">{label}</span>
      <div className="flex items-center gap-2">
        {slider ? (
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
            className="h-2 flex-1 accent-primary sm:h-1.5"
          />
        ) : null}
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(clamp(Math.floor(Number(e.target.value) || 0), min, max))}
          className={cn(
            'h-11 rounded-md border border-primary/35 bg-background px-2 text-sm tabular-nums md:h-8 md:border-border',
            slider ? 'w-16 shrink-0' : 'w-full',
          )}
        />
      </div>
    </label>
  )
}

function StarPicker({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-muted-foreground sm:text-xs">{label}</span>
      <div className="flex h-11 items-center gap-0 md:h-8 md:gap-1">
        {Array.from({ length: MAX_STARS }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n}`}
            onClick={() => onChange(n === value ? n - 1 : n)}
            className="inline-flex size-11 items-center justify-center p-0.5 md:size-auto"
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
  locale,
}: {
  pals: PalsBundle
  value: string | null
  onChange: (id: string | null) => void
  t: TFn
  locale: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sortDirection, setSortDirection] = useState<ZukanSortDirection>('ascending')
  const pickerControlRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const roster = useMemo(
    () => [...pals.pals].sort((a, b) => compareZukan(a, b, sortDirection)),
    [pals, sortDirection],
  )
  const selected = value ? pals.byId.get(value) ?? null : null

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open, sortDirection])

  const searchText = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of roster) {
      const id = formatPalId(p.zukanIndex, p.zukanIndexSuffix)
      m.set(p.id, `${pals.text[p.id]?.name ?? p.id} ${p.id} ${palIdText(id) ?? ''}`)
    }
    return m
  }, [roster, pals])

  const row = (p: PalEntry) => {
    const id = palIdText(formatPalId(p.zukanIndex, p.zukanIndexSuffix))
    return (
      <>
        <img src={palIconUrl(p.icon)} alt="" loading="lazy" className="size-6 shrink-0 rounded-full bg-black/5 object-contain dark:bg-white/10" />
        <span className="truncate">{pals.text[p.id]?.name ?? p.id}</span>
        {id ? (
          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
            {locale.startsWith('zh') ? `编号 ${id.replace(/^No\./, '')}` : id}
          </span>
        ) : null}
      </>
    )
  }

  return (
    <Command
      key={sortDirection}
      className="w-full max-w-md overflow-visible rounded-md bg-transparent"
      filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase().trim()) ? 1 : 0)}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <div ref={pickerControlRef} className="relative flex h-11 w-full overflow-hidden rounded-md border border-border bg-background shadow-xs transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 [&_[data-slot=command-input-wrapper]]:absolute [&_[data-slot=command-input-wrapper]]:inset-y-0 [&_[data-slot=command-input-wrapper]]:right-11 [&_[data-slot=command-input-wrapper]]:left-0 [&_[data-slot=command-input-wrapper]]:h-full [&_[data-slot=command-input-wrapper]]:border-0 [&_[data-slot=command-input-wrapper]]:px-2.5">
            <PopoverTrigger asChild>
              <button
                type="button"
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                tabIndex={open ? -1 : 0}
                className={cn(
                  'flex min-w-0 flex-1 items-center gap-2 px-2.5 text-left text-sm outline-none',
                  open && 'pointer-events-none invisible',
                )}
                data-testid={open ? undefined : 'sim-pal-picker'}
                onClick={() => {
                  setQuery('')
                  setOpen(true)
                }}
              >
                {selected ? row(selected) : <span className="text-muted-foreground">{t('sim.pickPal')}</span>}
              </button>
            </PopoverTrigger>
            {open ? (
              <CommandInput
                ref={searchInputRef}
                value={query}
                onValueChange={setQuery}
                placeholder={t('breeding.searchPal')}
                className="h-full"
                data-testid="sim-pal-picker"
              />
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t(`sim.${sortDirection === 'ascending' ? 'sortAscending' : 'sortDescending'}`)}
              aria-pressed={sortDirection === 'descending'}
              title={t(`sim.${sortDirection === 'ascending' ? 'sortAscending' : 'sortDescending'}`)}
              className="h-full w-11 rounded-none border-l border-border text-muted-foreground hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setSortDirection((current) => current === 'ascending' ? 'descending' : 'ascending')
                if (!open) setOpen(true)
              }}
              data-testid="sim-pal-sort"
            >
              {sortDirection === 'ascending' ? <ArrowDown01 /> : <ArrowUp10 />}
            </Button>
        </div>
        <PopoverContent
          className="w-[calc(var(--radix-popover-trigger-width)+2.75rem)] p-0"
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (pickerControlRef.current?.contains(event.target as Node)) event.preventDefault()
          }}
        >
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
                    setQuery('')
                  }}
                  className="gap-2"
                >
                  {row(p)}
                  <Check className={cn('ml-1 size-4 shrink-0', p.id === value ? 'opacity-100' : 'opacity-0')} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </PopoverContent>
      </Popover>
    </Command>
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

  const [level, setLevel, clearLevel] = useMemoryState(levelRecord, { debounceMs: 150 })
  const [stars, setStars, clearStars] = useMemoryState(starsRecord)
  const [bond, setBond, clearBond] = useMemoryState(bondRecord, { debounceMs: 150 })
  const [awake, setAwake, clearAwake] = useMemoryState(awakeRecord)
  const [souls, setSouls, clearSouls] = useMemoryState(soulsRecord, { debounceMs: 150 })
  const [passives, setPassives, clearPassives] = useMemoryState(passivesRecord, { debounceMs: 150 })
  const [iv, setIv, clearIv] = useMemoryState(ivRecord, { debounceMs: 150 })
  /** In-game column entries (per stat). They persist after blur: an entry
   *  that no IV can produce stays visible in red until the user changes it,
   *  clears it, moves that stat's IV slider, or a settings change makes it
   *  solvable again. */
  const [entered, setEntered, clearEntered] = useMemoryState(enteredRecord, { debounceMs: 300 })

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
  const setPalId = (id: string | null) =>
    void navigate({ search: (s) => ({ ...s, pal: id ?? undefined }), replace: true })
  const newCalculation = () => {
    clearLevel()
    clearStars()
    clearBond()
    clearAwake()
    clearSouls()
    clearPassives()
    clearIv()
    clearEntered()
    setPalId(null)
  }

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
      permanent: full.final,
      passiveDelta: (() => {
        const pp = passives[k]
        const m = passiveMul(pp)
        const withP = k === 'hp' ? applyPassiveHp(full.final, pp) : applyPassive(full.final, pp)
        return {
          d: withP - full.final,
          tip: (
            <>
              <div>
                <P kind="prev" v={full.final} /> × max(0.10, 1 + <P kind="passive" v={pp} /> / 100)
                {' '}= {withP}
              </div>
              <Legend kind="prev" v={full.final} label={t('sim.fPrev')} />
              <Legend kind="passive" v={pp} label={t('sim.fPassiveP')} />
              {k === 'hp' ? <div className="text-muted-foreground/70">HP: trunc × 0.001 then floor</div> : null}
              <div>{fmt(m)} — effective multiplier</div>
            </>
          ),
        }
      })(),
      final: k === 'hp' ? applyPassiveHp(full.final, passives.hp) : applyPassive(full.final, passives[k]),
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
      permanent: cf.final,
      passiveDelta: (() => {
        const pp = passives.craft
        const m = passiveMul(pp)
        const withP = applyPassive(cf.final, pp)
        return {
          d: withP - cf.final,
          tip: (
            <>
              <div>
                <P kind="prev" v={cf.final} /> × max(0.10, 1 + <P kind="passive" v={pp} /> / 100)
                {' '}= {withP}
              </div>
              <Legend kind="prev" v={cf.final} label={t('sim.fPrev')} />
              <Legend kind="passive" v={pp} label={t('sim.fPassiveP')} />
              <div>{fmt(m)} — effective multiplier</div>
            </>
          ),
        }
      })(),
      final: applyPassive(cf.final, passives.craft),
    }
  }

  const rows: ResultRow[] | null = pal ? [combatRow('hp'), combatRow('attack'), combatRow('defense'), craftRow()] : null

  /** Apply the passive layer on top of a permanent stat (IV-varying solve path). */
  const withPassive = (k: CombatKey, perm: number) =>
    k === 'hp' ? applyPassiveHp(perm, passives.hp) : applyPassive(perm, passives[k])

  /** Typing an in-game stat solves the hidden IV: keep the current IV when it
   *  already matches (several IVs can share one displayed value), otherwise
   *  snap to the nearest matching bound. No match → leave the IVs alone; the
   *  entry stays set and renders red with a warning tooltip.
   *  The solver runs through the passive layer so the observed value matches
   *  what the game displays when the same passives are active. */
  const onInGameChange = (k: RowKey, v: string) => {
    setEntered((e) => ({ ...e, [k]: v }))
    if (!pal || k === 'craft') return
    const n = Number(v)
    if (v.trim() === '' || !Number.isFinite(n)) return
    const sol = solveIV(n, (cand) => withPassive(k, CALC[k](pal.stats, pal.friendship, cand, inputs).final))
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
      const sol = solveIV(n, (cand) => withPassive(k, CALC[k](pal.stats, pal.friendship, cand, inputs).final))
      if (sol)
        setIv((prev) => {
          const next = clamp(prev[k], sol.min, sol.max)
          return next === prev[k] ? prev : { ...prev, [k]: next }
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pal, level, stars, bond, awake, souls, passives, entered])

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
      // Icon mode: the field is editable, so a tap has to land in the input and
      // open the keyboard — the IV-match hint gets its own ⓘ button beside it.
      <Hint
        title={t('sim.colInGame')}
        content={tip}
        contentClassName={cn('whitespace-pre-line', invalid && 'bg-destructive text-white')}
        bodyClassName={invalid ? 'text-destructive' : undefined}
        mobileTrigger="icon"
        iconTestId={`sim-ingame-hint-${row.key}`}
      >
        <input
          type="number"
          min={0}
          value={text}
          onChange={(e) => onInGameChange(row.key, e.target.value)}
          onBlur={() => onInGameBlur(row.key, row.final)}
          data-testid={`sim-ingame-${row.key}`}
          className={cn(
            'h-11 w-24 rounded-md border bg-background px-2 text-right text-sm font-semibold tabular-nums md:h-7',
            invalid ? 'border-destructive text-destructive' : 'border-border',
          )}
        />
      </Hint>
    )
  }

  const baseContent = (row: ResultRow) => (
    <Hint
      title={statLabel[row.key]}
      content={row.base.tip}
      contentClassName="text-left tabular-nums"
    >
      <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
        {row.base.v}
      </span>
    </Hint>
  )

  const deltaContent = (cell: DeltaCell | null, label: string) => (
    cell ? (
        <Hint title={label} content={cell.tip} contentClassName="text-left tabular-nums">
          <span
            className={cn(
              'cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2',
              cell.d ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
            )}
          >
            +{cell.d}
          </span>
        </Hint>
      ) : (
        <span className="text-muted-foreground">—</span>
      )
  )

  /** `label` is the row's stat name — it titles the mobile hint sheet, which
   *  (unlike a tooltip pinned to the cell) has no column context of its own. */
  const deltaCell = (cell: DeltaCell | null, i: number, label: string) => (
    <td key={i} className="py-1.5 pr-3 text-right tabular-nums">
      {deltaContent(cell, label)}
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
          <p className="mb-4 text-sm leading-6 text-muted-foreground">{t('sim.caption')}</p>

          <div className="overflow-hidden rounded-lg border border-border bg-card md:contents">
          <div className="space-y-2 p-3 md:mb-4 md:flex md:flex-wrap md:items-center md:gap-3 md:space-y-0 md:p-0">
            <SimPalPicker pals={pals} value={palId} onChange={setPalId} t={t} locale={lng} />
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={newCalculation}>
              <RotateCcw className="size-4" />
              {t('sim.reset')}
            </Button>
            {pal ? (
              <>
                <div className="grid grid-cols-4 overflow-hidden rounded-md border border-primary/25 bg-primary/5 md:hidden">
                  {[
                    [statLabel.hp, pal.stats.hp],
                    [statLabel.attack, pal.stats.shotAttack],
                    [statLabel.defense, pal.stats.defense],
                    [statLabel.craft, pal.stats.craftSpeed],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="min-w-0 border-r border-primary/15 px-1.5 py-2 text-center last:border-r-0">
                      <div className="truncate text-xs text-muted-foreground">{label}</div>
                      <div className="mt-0.5 font-semibold tabular-nums text-foreground">{value}</div>
                    </div>
                  ))}
                </div>
                <span className="hidden text-sm text-muted-foreground md:inline-flex md:items-center">
                  <PalLink id={pal.id} name={pals.text[pal.id]?.name ?? pal.id} icon={pal.icon} />
                  <span className="ml-2 tabular-nums">
                    {t('sim.base')}: {statLabel.hp} {pal.stats.hp} ·{' '}
                    {statLabel.attack} {pal.stats.shotAttack} · {statLabel.defense} {pal.stats.defense} ·{' '}
                    {statLabel.craft} {pal.stats.craftSpeed}
                  </span>
                </span>
              </>
            ) : null}
          </div>

          {!pal ? (
            <div className="border-t border-border p-6 text-center text-sm text-muted-foreground md:rounded-lg md:border md:bg-card">
              {t('sim.pickPal')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-0 md:gap-3 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-4">
              {/* enhancement inputs */}
              <div className="space-y-3 border-t border-border bg-card p-3 md:rounded-lg md:border md:p-4">
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
                    'flex min-h-11 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition',
                    awake
                      ? 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400'
                      : 'border-border bg-secondary text-secondary-foreground hover:bg-accent',
                  )}
                >
                  <Sparkles className="size-4" />
                  {t('sim.awakening')}
                  <span className="ml-auto text-xs text-muted-foreground">×1.1</span>
                </button>

                <div className="border-t border-border/60 pt-3">
                  <div className="mb-2 text-sm font-semibold text-foreground sm:mb-1.5 sm:text-xs sm:uppercase sm:tracking-wide sm:text-muted-foreground">
                    {t('sim.souls')}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField label={statLabel.hp} value={souls.hp} onChange={(v) => setSouls({ ...souls, hp: v })} min={0} max={MAX_SOUL} />
                    <NumberField label={statLabel.attack} value={souls.attack} onChange={(v) => setSouls({ ...souls, attack: v })} min={0} max={MAX_SOUL} />
                    <NumberField label={statLabel.defense} value={souls.defense} onChange={(v) => setSouls({ ...souls, defense: v })} min={0} max={MAX_SOUL} />
                    <NumberField label={statLabel.craft} value={souls.craft} onChange={(v) => setSouls({ ...souls, craft: v })} min={0} max={MAX_SOUL} />
                  </div>
                </div>

                <div className="border-t border-border/60 pt-3">
                  <div className="mb-2 text-sm font-semibold text-foreground sm:mb-1.5 sm:text-xs sm:uppercase sm:tracking-wide sm:text-muted-foreground">
                    {t('sim.passives')}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField label={statLabel.hp} value={passives.hp} onChange={(v) => setPassives({ ...passives, hp: v })} min={MIN_PASSIVE_PCT} max={300} />
                    <NumberField label={statLabel.attack} value={passives.attack} onChange={(v) => setPassives({ ...passives, attack: v })} min={MIN_PASSIVE_PCT} max={300} />
                    <NumberField label={statLabel.defense} value={passives.defense} onChange={(v) => setPassives({ ...passives, defense: v })} min={MIN_PASSIVE_PCT} max={300} />
                    <NumberField label={statLabel.craft} value={passives.craft} onChange={(v) => setPassives({ ...passives, craft: v })} min={MIN_PASSIVE_PCT} max={300} />
                  </div>
                </div>

                <div className="border-t border-border/60 pt-3">
                  <div className="mb-2 text-sm font-semibold text-foreground sm:mb-1.5 sm:text-xs sm:uppercase sm:tracking-wide sm:text-muted-foreground">
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
              <div className="overflow-hidden border-t border-border bg-card md:rounded-lg md:border md:p-4">
                <div className="divide-y divide-border/60 md:hidden" data-testid="sim-results-mobile">
                  {rows!.map((row) => {
                    const stages = [
                      { label: t('sim.colBase'), value: baseContent(row) },
                      { label: t('sim.awakening'), value: deltaContent(row.deltas[0], statLabel[row.key]) },
                      { label: t('sim.colTrust'), value: deltaContent(row.deltas[1], statLabel[row.key]) },
                      { label: t('sim.colIv'), value: deltaContent(row.deltas[2], statLabel[row.key]) },
                      { label: t('sim.colStars'), value: deltaContent(row.deltas[3], statLabel[row.key]) },
                      { label: t('sim.colSouls'), value: deltaContent(row.deltas[4], statLabel[row.key]) },
                      { label: t('sim.colPassive'), value: deltaContent(row.passiveDelta, statLabel[row.key]) },
                    ]
                    return (
                      <section key={row.key} className="p-3">
                        <div className="flex items-end justify-between gap-3">
                          <h2 className="text-base font-semibold">{statLabel[row.key]}</h2>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">{t('sim.stageFinal')}</div>
                            <div className="text-xl font-bold tabular-nums text-primary">{row.final}</div>
                          </div>
                        </div>
                        <dl className="mt-2 grid grid-cols-4 gap-1.5">
                          {stages.map((stage) => (
                            <div key={stage.label} className="min-w-0 rounded bg-secondary/55 px-1.5 py-2 text-center">
                              <dt className="truncate text-xs text-muted-foreground">{stage.label}</dt>
                              <dd className="mt-0.5 text-xs font-semibold tabular-nums">{stage.value}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                          <span className="text-sm font-medium text-muted-foreground">{t('sim.colInGame')}</span>
                          {inGameCell(row)}
                        </div>
                      </section>
                    )
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm" data-testid="sim-results">
                    <thead>
                      {/* Stat + In-game columns stay pinned while the delta
                          stages scroll horizontally on narrow screens. */}
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="sticky left-0 bg-card py-2 pr-3 font-medium">{t('sim.stat')}</th>
                        <th className="py-2 pr-3 text-right font-medium">{t('sim.colBase')}</th>
                        <th className="py-2 pr-3 text-right font-medium">+{t('sim.awakening')}</th>
                        <th className="py-2 pr-3 text-right font-medium">+{t('sim.colTrust')}</th>
                        <th className="py-2 pr-3 text-right font-medium">+{t('sim.colIv')}</th>
                        <th className="py-2 pr-3 text-right font-medium">+{t('sim.colStars')}</th>
                        <th className="py-2 pr-3 text-right font-medium">+{t('sim.colSouls')}</th>
                        <th className="py-2 pr-3 text-right font-medium">+{t('sim.colPassive')}</th>
                        <th className="py-2 pr-3 text-right font-medium">{t('sim.stageFinal')}</th>
                        <th className="sticky right-0 border-l border-border/60 bg-card py-2 pl-2 text-right font-medium">
                          {t('sim.colInGame')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows!.map((row) => (
                        <tr key={row.key} className="border-t border-border/60">
                          <td className="sticky left-0 bg-card py-1.5 pr-3">{statLabel[row.key]}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                            {baseContent(row)}
                          </td>
                          {row.deltas.map((cell, i) => deltaCell(cell, i, statLabel[row.key]))}
                          {deltaCell(row.passiveDelta, 99, statLabel[row.key])}
                          <td className="py-1.5 pr-3 text-right text-base font-semibold tabular-nums">{row.final}</td>
                          <td className="sticky right-0 border-l border-border/60 bg-card py-1.5 pl-2 text-right">
                            {inGameCell(row)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground md:hidden">
                  <summary className="cursor-pointer py-1 font-medium text-foreground">
                    {t('pal.section.details')}
                  </summary>
                  <p className="pt-2 leading-relaxed">
                    {t('sim.stageNote')} {t('sim.editNote')}
                  </p>
                </details>
                <p className="mt-3 hidden text-xs text-muted-foreground md:block">
                  {t('sim.stageNote')} {t('sim.editNote')}
                </p>
              </div>
            </div>
          )}
          </div>
        </TooltipProvider>
      )}
    </ContentPage>
  )
}
