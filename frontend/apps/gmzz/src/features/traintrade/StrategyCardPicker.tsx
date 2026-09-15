import { useEffect, useMemo, useRef, useState } from 'react'
import { IconPlus, IconRefresh, IconX } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import type { TrainTradeStrategyCard } from './data'
import type { StationTotals } from './stationSolver'
import { strategyActivationChance, strategyPrefix } from './strategyCards'

export type StrategySelections = [number | null, number | null, number | null]

type Props = {
  cards: TrainTradeStrategyCard[] | null
  error: boolean
  probabilities: StationTotals
  selections: StrategySelections
  selected: number | null
  onSelectionsChange: (selections: StrategySelections) => void
  onSelectedChange: (id: number | null) => void
}

const SELECTED_TONE = 'border-ring bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]'

export default function StrategyCardPicker({ cards, error, probabilities, selections, selected, onSelectionsChange, onSelectedChange }: Props) {
  const { t, i18n } = useTranslation()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [prefix, setPrefix] = useState('')
  const prefixes = useMemo(() => [...new Set(cards?.map(strategyPrefix) ?? [])].sort((a, b) => a.localeCompare(b, i18n.language)), [cards, i18n.language])
  const filtered = cards?.filter((card) => (!prefix || strategyPrefix(card) === prefix)
    && (!search.trim() || `${card.name} ${card.description} ${card.label}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))) ?? []
  const used = new Set(selections.filter((id) => id !== null))
  const ranked = selections.flatMap((id) => {
    const card = cards?.find((entry) => entry.id === id)
    if (!card) return []
    const activation = strategyActivationChance(card, probabilities)
    return activation === null ? [] : [{ id, activation }]
  }).sort((a, b) => b.activation - a.activation)
  const recommended = ranked.length > 0 && ranked[0].activation > 0 ? ranked[0].id : null

  useEffect(() => {
    const dialog = dialogRef.current
    if (slot !== null && dialog && !dialog.open) dialog.showModal()
    if (slot === null && dialog?.open) dialog.close()
  }, [slot])

  const openSlot = (index: number) => {
    setSearch('')
    setPrefix('')
    setSlot(index)
  }

  return (
    <div className="mt-3 border-t border-border pt-3" data-testid="planner-strategy-cards">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-xs">
        <strong className="text-muted-foreground">{t('trainTrade.stationTool.planner.strategyHeading')}</strong>
        <span className="text-muted-foreground">{t('trainTrade.stationTool.planner.strategyNote')}</span>
      </div>
      {error ? <p className="text-xs text-muted-foreground">{t('trainTrade.stationTool.planner.strategyLoadError')}</p> : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {selections.map((id, index) => {
            const card = cards?.find((entry) => entry.id === id)
            const activation = card ? strategyActivationChance(card, probabilities) : null
            return (
              <div key={index} className="flex min-w-0 items-center gap-1.5">
                <button
                  type="button"
                  disabled={!cards}
                  aria-pressed={Boolean(card && selected === id)}
                  aria-label={card ? t('trainTrade.stationTool.planner.strategyAdopt', { slot: index + 1, name: card.name }) : t('trainTrade.stationTool.planner.strategyChoose', { slot: index + 1 })}
                  title={card?.description}
                  onClick={() => card ? onSelectedChange(selected === id ? null : card.id) : openSlot(index)}
                  className={`flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border px-3 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${card && (selected === id || recommended === id) ? SELECTED_TONE : 'border-border bg-background text-foreground enabled:hover:border-ring disabled:text-muted-foreground'}`}
                >
                  {card ? <><span className="min-w-0 truncate">{card.name}</span><span className="shrink-0 text-xs">{selected === id ? t('trainTrade.stationTool.planner.strategySelected') : recommended === id ? t('trainTrade.stationTool.planner.strategyRecommended') : ''}{activation !== null && ` ${Math.round(activation * 100)}%`}</span></> : <><IconPlus className="size-4" aria-hidden /><span>{t('trainTrade.stationTool.planner.strategyPlaceholder')}</span></>}
                </button>
                {card && <button type="button" onClick={() => openSlot(index)} aria-label={t('trainTrade.stationTool.planner.strategyReplace', { slot: index + 1 })} className="grid size-10 shrink-0 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:border-ring focus-visible:outline-2 focus-visible:outline-ring"><IconRefresh className="size-4" aria-hidden /></button>}
              </div>
            )
          })}
        </div>
      )}
      <dialog
        ref={dialogRef}
        onClose={() => setSlot(null)}
        onCancel={() => setSlot(null)}
        onClick={(event) => { if (event.target === event.currentTarget) setSlot(null) }}
        aria-labelledby="planner-strategy-title"
        className="m-auto max-h-[85dvh] w-[min(54rem,calc(100%-2rem))] overflow-hidden rounded-md border border-border bg-background p-0 text-foreground shadow-lg backdrop:bg-black/45"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 id="planner-strategy-title" className="text-lg font-semibold">{t('trainTrade.stationTool.planner.strategyPool')}</h2>
            <button type="button" onClick={() => setSlot(null)} aria-label={t('trainTrade.stationTool.planner.strategyClose')} className="grid size-10 place-items-center rounded-md border border-border hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><IconX className="size-5" aria-hidden /></button>
          </div>
          <div className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">{t('trainTrade.stationTool.planner.strategySearch')}<input autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 min-w-0 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
            <label className="grid gap-1 text-xs font-semibold text-muted-foreground">{t('trainTrade.stationTool.planner.strategyPrefix')}<select value={prefix} onChange={(event) => setPrefix(event.target.value)} className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">{t('trainTrade.all')}</option>{prefixes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>
          <div className="grid min-h-0 grid-cols-1 gap-2 overflow-y-auto px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((card) => (
              <button key={card.id} type="button" disabled={used.has(card.id) && selections[slot ?? 0] !== card.id} onClick={() => {
                if (slot === null) return
                const next = [...selections] as StrategySelections
                if (next[slot] === selected) onSelectedChange(null)
                next[slot] = card.id
                onSelectionsChange(next)
                setSlot(null)
              }} className="grid content-start gap-2 rounded-md border border-border bg-card p-3 text-left hover:border-ring focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-45">
                <span className="flex items-baseline justify-between gap-2"><strong className="text-sm">{card.name}</strong><small className="shrink-0 text-xs text-muted-foreground">{t('trainTrade.levelValue', { value: card.level })}</small></span>
                <span className="text-xs leading-5 text-muted-foreground">{card.description}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">{t('trainTrade.stationTool.planner.strategyEmpty')}</p>}
          </div>
        </div>
      </dialog>
    </div>
  )
}
