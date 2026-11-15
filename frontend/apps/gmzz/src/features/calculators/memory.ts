import type { SetStateAction } from 'react'
import { gmzzMemory, isRecord, isFiniteNumber } from '../../lib/memory'
import { DEFAULT_GUILDS, type LeagueGuild, type WeekNumber } from '../league/league'
import { STATION_TYPES, HINT_IDS, type StationTotals, type ConfirmedStep, type HintId, type StationType } from '../traintrade/stationSolver'
import type { TrainTradeDifficultyId } from '../traintrade/routeProfiles'
import type { ManagedTradeData } from '../managedtrade/data'

/** Keep an existing field setter API while storing one consistent input record. */
export function calculationSetter<T, K extends keyof T>(update: (action: SetStateAction<T>) => void, key: K): (action: SetStateAction<T[K]>) => void {
  return action => update(current => ({ ...current, [key]: typeof action === 'function' ? (action as (value: T[K]) => T[K])(current[key]) : action }))
}

const integer = (value: unknown, max = 1_000_000_000): value is number => isFiniteNumber(value) && Number.isInteger(value) && value >= 0 && value <= max
const weeks = [1, 2, 3, 4] as const
export type LeagueInputs = { guilds: LeagueGuild[]; targetId: string; weekStarted: Record<WeekNumber, boolean> }
export const defaultLeagueInputs = (): LeagueInputs => ({
  guilds: structuredClone(DEFAULT_GUILDS), targetId: DEFAULT_GUILDS[0].id,
  weekStarted: { 1: false, 2: false, 3: false, 4: false },
})
export function isLeagueInputs(value: unknown): value is LeagueInputs {
  if (!isRecord(value) || !Array.isArray(value.guilds) || value.guilds.length !== 8 || !isRecord(value.weekStarted)) return false
  const ids = new Set<string>()
  return value.guilds.every(guild => {
    if (!isRecord(guild) || typeof guild.id !== 'string' || !DEFAULT_GUILDS.some(item => item.id === guild.id) || ids.has(guild.id) || typeof guild.name !== 'string' || guild.name.length > 200 || !isRecord(guild.weeks) || !(guild.targetTotal === null || integer(guild.targetTotal))) return false
    ids.add(guild.id)
    const input = guild.weeks
    return weeks.every(week => {
      const row = input[week]
      return isRecord(row) && (row.rank === null || (integer(row.rank, 4) && row.rank >= 1)) &&
        (row.group === null || row.group === 'winner' || row.group === 'loser') && (row.status === 'unknown' || row.status === 'absent')
    })
  }) && typeof value.targetId === 'string' && ids.has(value.targetId) && weeks.every(week => typeof (value.weekStarted as Record<string, unknown>)[week] === 'boolean')
}
export const leagueInputs = gmzzMemory.draft('calculators/league', { default: defaultLeagueInputs, validate: isLeagueInputs })

export type StationInputs = {
  difficulty: TrainTradeDifficultyId | ''; routeMix: StationTotals | null; areaMixes: (StationTotals | null)[];
  originHint: HintId | ''; steps: ConfirmedStep[]; pendingCurrent: StationType | ''; pendingHint: HintId | '';
}
export const defaultStationInputs = (): StationInputs => ({ difficulty: '', routeMix: null, areaMixes: [], originHint: '', steps: [], pendingCurrent: '', pendingHint: '' })
const hint = (value: unknown) => value === '' || HINT_IDS.some(item => item === value)
const station = (value: unknown) => STATION_TYPES.some(item => item === value)
const mix = (value: unknown) => value === null || (isRecord(value) && STATION_TYPES.every(key => integer(value[key], 100)))
export function isStationInputs(value: unknown): value is StationInputs {
  return isRecord(value) && ['', 'beginner', 'normal', 'advanced', 'hard', 'challenge', 'frenzy'].includes(value.difficulty as string) &&
    mix(value.routeMix) && Array.isArray(value.areaMixes) && value.areaMixes.length <= 100 && value.areaMixes.every(mix) &&
    hint(value.originHint) && hint(value.pendingHint) && (value.pendingCurrent === '' || station(value.pendingCurrent)) &&
    Array.isArray(value.steps) && value.steps.length <= 100 && value.steps.every(step => isRecord(step) && station(step.currentType) && hint(step.hintId))
}
export const stationInputs = gmzzMemory.draft('calculators/stations', { default: defaultStationInputs, validate: isStationInputs })

export type TradeInputs = { goodsId: number; from: number; to: number; buyPrice: number; sellPrice: number; buyTax: number; sellTax: number; level: number; partLevels: number[]; quantity: number | null }
export function defaultTradeInputs(data: ManagedTradeData): TradeInputs {
  const goods = data.goods[0]
  return { goodsId: goods.id, from: goods.producers[0] ?? data.sites[0].id,
    to: data.sites.find(site => !goods.producers.includes(site.id))?.id ?? data.sites[0].id,
    buyPrice: goods.stationSells.mid, sellPrice: goods.stationBuys.mid,
    buyTax: data.sites[0].baseTax, sellTax: data.sites[0].baseTax, level: 1,
    partLevels: (data.parts[0] ?? []).map(() => 1), quantity: null }
}
export function isTradeInputs(value: unknown, data: ManagedTradeData): value is TradeInputs {
  if (!isRecord(value) || !data.goods.some(item => item.id === value.goodsId) ||
    !data.sites.some(item => item.id === value.from) || !data.sites.some(item => item.id === value.to) ||
    !data.caravans.some(item => item.level === value.level) || !integer(value.level)) return false
  const parts = data.parts[value.level - 1] ?? []
  return integer(value.buyPrice) && integer(value.sellPrice) && integer(value.buyTax, 100) && integer(value.sellTax, 100) &&
    (value.quantity === null || integer(value.quantity)) && Array.isArray(value.partLevels) && value.partLevels.length === parts.length &&
    value.partLevels.every((level, index) => parts[index].levels.some(row => row.level === level))
}
export function tradeInputs(data: ManagedTradeData) {
  return gmzzMemory.draft('calculators/trade', { default: () => defaultTradeInputs(data), validate: (value: unknown): value is TradeInputs => isTradeInputs(value, data) })
}
