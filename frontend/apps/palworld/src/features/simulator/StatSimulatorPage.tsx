import { useEffect, useMemo, useState } from 'react'
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
  cn,
} from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { loadPals, type PalEntry, type PalsBundle } from '../../lib/pals'
import { palIconUrl } from '../../lib/assets'
import { formatPalId, palIdText } from '../../lib/palId'
import {
  calcStats,
  solveIVs,
  MAX_BOND,
  MAX_IV,
  MAX_LEVEL,
  MAX_SOUL,
  MAX_STARS,
  type EnhanceInputs,
} from '../../lib/statCalc'
import { CatalogPageLoading, PalLink } from '../catalog/components'

type TFn = (k: string, o?: Record<string, unknown>) => string

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

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
      <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        <span className="tabular-nums text-foreground">{value}</span>
      </span>
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
      <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {label}
        <span className="tabular-nums text-foreground">{value}</span>
      </span>
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

/** Pal stat simulator: forward mode computes HP/Attack/Defense/work speed for
 *  any enhancement combination (level, IVs, condense stars, souls, trust rank,
 *  awakening) with the native-validated staged-truncation formula; inverse
 *  mode takes the in-game displayed stats and solves the hidden IVs. */
export default function StatSimulatorPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const search = useSearch({ from: '/stat-simulator' })
  const navigate = useNavigate({ from: '/stat-simulator' })

  const [pals, setPals] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [mode, setMode] = useState<'calc' | 'solve'>('calc')
  const [level, setLevel] = useState(60)
  const [stars, setStars] = useState(0)
  const [bond, setBond] = useState(0)
  const [awake, setAwake] = useState(false)
  const [souls, setSouls] = useState({ hp: 0, attack: 0, defense: 0, craft: 0 })
  const [iv, setIv] = useState({ hp: 100, attack: 100, defense: 100 })
  const [observed, setObserved] = useState({ hp: '', attack: '', defense: '' })

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

  const result = pal ? calcStats(pal.stats, pal.friendship, iv, inputs) : null
  const solved = useMemo(() => {
    if (!pal || mode !== 'solve') return null
    const num = (s: string) => (s.trim() === '' ? undefined : Number(s))
    return solveIVs(
      pal.stats,
      pal.friendship,
      { hp: num(observed.hp), attack: num(observed.attack), defense: num(observed.defense) },
      inputs,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pal, mode, observed, level, stars, bond, awake, souls])

  const statLabel: Record<'hp' | 'attack' | 'defense', string> = {
    hp: t('pal.stat.hp'),
    attack: t('pal.stat.shotAttack'),
    defense: t('pal.stat.defense'),
  }

  const ivText = (sol: { min: number; max: number } | null, entered: boolean) => {
    if (!entered) return <span className="text-muted-foreground">—</span>
    if (!sol) return <span className="text-destructive">{t('sim.noMatch')}</span>
    return (
      <span className="font-semibold tabular-nums">
        {sol.min === sol.max ? sol.min : `${sol.min}–${sol.max}`}
        <span className="ml-1 font-normal text-muted-foreground">/ {MAX_IV}</span>
      </span>
    )
  }

  return (
    <ContentPage active="/stat-simulator" title={t('sim.title')} heading>
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !pals ? (
        <CatalogPageLoading />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">{t('sim.caption')}</p>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SimPalPicker pals={pals} value={palId} onChange={setPalId} t={t} />
            {pal ? (
              <span className="text-sm text-muted-foreground">
                <PalLink id={pal.id} name={pals.text[pal.id]?.name ?? pal.id} icon={pal.icon} />
                <span className="ml-2 tabular-nums">
                  {t('sim.base')}: HP {pal.stats.hp} ·{' '}
                  {statLabel.attack} {pal.stats.shotAttack} · {statLabel.defense} {pal.stats.defense} ·{' '}
                  {t('pal.stat.craftSpeed')} {pal.stats.craftSpeed}
                </span>
              </span>
            ) : null}
          </div>

          <div className="mb-4 flex gap-1.5">
            {(['calc', 'solve'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition',
                  mode === m
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-accent',
                )}
              >
                {m === 'calc' ? t('sim.modeCalc') : t('sim.modeSolve')}
              </button>
            ))}
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
                    <NumberField label={t('pal.stat.craftSpeed')} value={souls.craft} onChange={(v) => setSouls({ ...souls, craft: v })} min={0} max={MAX_SOUL} />
                  </div>
                </div>

                {mode === 'calc' ? (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('sim.ivs')}
                    </div>
                    <div className="space-y-2">
                      <NumberField label={statLabel.hp} value={iv.hp} onChange={(v) => setIv({ ...iv, hp: v })} min={0} max={MAX_IV} slider />
                      <NumberField label={statLabel.attack} value={iv.attack} onChange={(v) => setIv({ ...iv, attack: v })} min={0} max={MAX_IV} slider />
                      <NumberField label={statLabel.defense} value={iv.defense} onChange={(v) => setIv({ ...iv, defense: v })} min={0} max={MAX_IV} slider />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('sim.observed')}
                    </div>
                    <div className="space-y-2">
                      {(['hp', 'attack', 'defense'] as const).map((k) => (
                        <label key={k} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">{statLabel[k]}</span>
                          <input
                            type="number"
                            min={0}
                            value={observed[k]}
                            onChange={(e) => setObserved({ ...observed, [k]: e.target.value })}
                            placeholder="—"
                            className="h-8 w-28 rounded-md border border-border bg-background px-2 text-right text-sm tabular-nums"
                            data-testid={`sim-observed-${k}`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* results */}
              <div className="rounded-lg border border-border bg-card p-4">
                {mode === 'calc' && result ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="sim-results">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">{t('sim.stat')}</th>
                          <th className="py-2 pr-3 text-right font-medium">{t('sim.stageLevel')}</th>
                          <th className="py-2 pr-3 text-right font-medium">{t('sim.stageCondense')}</th>
                          <th className="py-2 text-right font-medium">{t('sim.stageFinal')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(['hp', 'attack', 'defense'] as const).map((k) => (
                          <tr key={k} className="border-t border-border/60">
                            <td className="py-1.5 pr-3">{statLabel[k]}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{result[k].s0}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{result[k].s1}</td>
                            <td className="py-1.5 text-right text-base font-semibold tabular-nums">{result[k].final}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-border/60">
                          <td className="py-1.5 pr-3">{t('pal.stat.craftSpeed')}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{result.craft.s0}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{result.craft.s1}</td>
                          <td className="py-1.5 text-right text-base font-semibold tabular-nums">{result.craft.final}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t('sim.stageNote')}
                    </p>
                  </div>
                ) : mode === 'solve' && solved ? (
                  <div data-testid="sim-solved">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('sim.solvedIvs')}
                    </div>
                    <div className="divide-y divide-border/60">
                      {(['hp', 'attack', 'defense'] as const).map((k) => (
                        <div key={k} className="flex items-center justify-between py-2 text-sm">
                          <span>{statLabel[k]}</span>
                          {ivText(solved[k], observed[k].trim() !== '')}
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t('sim.solveNote', { craft: solved.craftExpected })}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </>
      )}
    </ContentPage>
  )
}
