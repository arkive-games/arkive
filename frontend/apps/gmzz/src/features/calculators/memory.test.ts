import { describe, expect, it } from 'vitest'
import { MemoryClient, type StorageLike } from '@gamemap/state-memory'
import { calculationSetter, defaultLeagueInputs, defaultStationInputs, defaultTradeInputs, isLeagueInputs, isStationInputs, isTradeInputs, leagueInputs, stationInputs, tradeInputs } from './memory'
import type { ManagedTradeData } from '../managedtrade/data'

const data = {
  goods: [{ id: 1, producers: [10], stationSells: { mid: 50 }, stationBuys: { mid: 80 } }],
  sites: [{ id: 10, baseTax: 10 }, { id: 20, baseTax: 5 }], caravans: [{ level: 1 }],
  parts: [[{ levels: [{ level: 1 }, { level: 2 }] }]],
} as ManagedTradeData
function storage(): StorageLike {
  const values = new Map<string, string>()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } }
}

describe('automatic local calculator memory', () => {
  it('restores independent calculator inputs in a fresh browser client', () => {
    const deviceStorage = storage()
    const first = new MemoryClient({ deviceStorage })
    const league = defaultLeagueInputs()
    league.guilds[0].name = 'Example guild'
    league.weekStarted[1] = true
    expect(first.write(leagueInputs.record, league)).toBe(true)
    const station = { ...defaultStationInputs(), difficulty: 'normal' as const, areaMixes: [null, { winery: 1, food: 2, trade: 3 }] }
    expect(first.write(stationInputs.record, station)).toBe(true)
    const trade = tradeInputs(data)
    expect(first.write(trade.record, { ...defaultTradeInputs(data), buyPrice: 123, quantity: 0 })).toBe(true)
    const reopened = new MemoryClient({ deviceStorage })
    expect(reopened.read(leagueInputs.record)).toEqual(league)
    expect(reopened.read(stationInputs.record)).toEqual(station)
    expect(reopened.read(trade.record).buyPrice).toBe(123)
    expect(reopened.read(trade.record).quantity).toBe(0)
    reopened.write(trade.record, defaultTradeInputs(data))
    expect(first.read(trade.record)).toEqual(defaultTradeInputs(data))
    expect(first.read(leagueInputs.record)).toEqual(league)
  })

  it('rejects duplicate guilds, invalid ranks, malformed station data and retired trade ids', () => {
    const league = defaultLeagueInputs()
    league.guilds[1].id = league.guilds[0].id
    expect(isLeagueInputs(league)).toBe(false)
    expect(isLeagueInputs({ ...defaultLeagueInputs(), targetId: 'missing' })).toBe(false)
    expect(isStationInputs({ ...defaultStationInputs(), routeMix: { winery: -1, food: 0, trade: 0 } })).toBe(false)
    expect(isStationInputs({ ...defaultStationInputs(), steps: [{ currentType: 'unknown', hintId: '' }] })).toBe(false)
    expect(isTradeInputs({ ...defaultTradeInputs(data), goodsId: 999 }, data)).toBe(false)
    expect(isTradeInputs({ ...defaultTradeInputs(data), partLevels: [999] }, data)).toBe(false)
    expect(isTradeInputs({ ...defaultTradeInputs(data), buyTax: 101 }, data)).toBe(false)
  })

  it('merges consecutive field edits without losing unrelated input', () => {
    let state = defaultTradeInputs(data)
    const update = (action: typeof state | ((current: typeof state) => typeof state)) => { state = typeof action === 'function' ? action(state) : action }
    calculationSetter(update, 'buyPrice')(123)
    calculationSetter(update, 'sellPrice')(current => current + 20)
    expect(state.buyPrice).toBe(123)
    expect(state.sellPrice).toBe(100)
  })

  it('uses the shared local retention and tolerates blocked storage', () => {
    let now = 1_000
    const deviceStorage = storage()
    const client = new MemoryClient({ deviceStorage, now: () => now })
    client.write(stationInputs.record, { ...defaultStationInputs(), difficulty: 'normal' })
    now += 31 * 24 * 60 * 60 * 1000
    expect(client.read(stationInputs.record)).toEqual(defaultStationInputs())
    expect(new MemoryClient({}).write(leagueInputs.record, defaultLeagueInputs())).toBe(false)
  })
})
