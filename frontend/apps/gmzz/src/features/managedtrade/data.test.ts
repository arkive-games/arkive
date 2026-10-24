import { describe, expect, it } from 'vitest'
import {
  breakEvenSellPrice,
  caravanStats,
  priceLevel,
  shortestPath,
  taxedBuyPrice,
  taxedSellPrice,
  type CaravanLevel,
  type CaravanPart,
} from './data'

describe('trade-war taxed prices', () => {
  // FormulaData TradeWar_BuyPrice / TradeWar_SellPrice, evaluated by hand.
  it('adds tax to a purchase and takes it from a sale, flooring both', () => {
    expect(taxedBuyPrice(901, 10, 0)).toBe(991) // floor(901 * 110 / 100) = floor(991.1)
    expect(taxedSellPrice(1327, 10, 0)).toBe(1194) // floor(1327 * 90 / 100) = floor(1194.3)
  })

  it('lets tax reduction bring the rate to zero but never below', () => {
    expect(taxedBuyPrice(900, 10, 12)).toBe(900)
    expect(taxedSellPrice(900, 10, 12)).toBe(900)
    expect(taxedBuyPrice(900, 10, 3)).toBe(963)
  })

  it('finds the lowest untaxed price that covers a cost', () => {
    const price = breakEvenSellPrice(991, 10, 0)!
    expect(taxedSellPrice(price, 10, 0)).toBeGreaterThanOrEqual(991)
    expect(taxedSellPrice(price - 1, 10, 0)).toBeLessThan(991)
    expect(breakEvenSellPrice(10, 100, 0)).toBeNull()
  })
})

describe('trade-war price levels', () => {
  const range = { min: 450, mid: 900, max: 1350 }
  it('cuts at 0.2 / 0.4 / 0.6 / 0.8 with each cut inclusive of the band below', () => {
    expect(priceLevel(450, range)).toBe('low')
    expect(priceLevel(630, range)).toBe('low') // r = 0.2 exactly
    expect(priceLevel(631, range)).toBe('belowAvg')
    expect(priceLevel(900, range)).toBe('medium')
    expect(priceLevel(1170, range)).toBe('aboveAvg') // r = 0.8 exactly
    expect(priceLevel(1350, range)).toBe('high')
  })

  it('calls a degenerate range medium, as the client does', () => {
    expect(priceLevel(5, { min: 10, mid: 10, max: 10 })).toBe('medium')
  })
})

describe('caravan stats', () => {
  const caravan = (level: number, maxLoad: number, taxReduction: number): CaravanLevel => ({
    level, name: `L${level}`, unlockCost: 0, speed: 150, maxLoad, maxEnergy: 100, energyRecover: 10,
    taxReduction, rumorCount: level, teleportCount: 2,
  })
  const part = (type: number, loads: number[], taxes: number[]): CaravanPart => ({
    type, name: `P${type}`,
    levels: loads.map((loadBonus, index) => ({
      level: index + 1, cost: index * 100, speedBonus: 0, loadBonus, maxEnergyBonus: 0, energyRecBonus: 0,
      taxReduceBonus: taxes[index],
    })),
  })
  const data = {
    caravans: [caravan(1, 200, 0), caravan(2, 500, 3)],
    parts: [
      [part(1, [0, 30], [0, 0]), part(4, [0, 30], [0, 1])],
      [part(1, [0, 60], [0, 0]), part(4, [0, 60], [0, 2])],
    ],
  }

  it('adds the bonus of each part at its level, from the ladder of the current caravan level', () => {
    expect(caravanStats(data, 1, [1, 1])).toMatchObject({ maxLoad: 200, taxReduction: 0 })
    expect(caravanStats(data, 1, [2, 2])).toMatchObject({ maxLoad: 260, taxReduction: 1 })
    expect(caravanStats(data, 2, [2, 2])).toMatchObject({ maxLoad: 620, taxReduction: 5 })
  })
})

describe('route planning', () => {
  const routes = [
    { id: 1, a: 1, b: 2, distance: 10, energy: 20 },
    { id: 2, a: 2, b: 3, distance: 10, energy: 20 },
    { id: 3, a: 1, b: 3, distance: 50, energy: 60 },
    { id: 4, a: 8, b: 9, distance: 10, energy: 20 },
  ]

  it('takes the cheapest path by stamina, using routes in either direction', () => {
    expect(shortestPath(routes, 3, 1)).toEqual({ stations: [3, 2, 1], energy: 40, distance: 20 })
  })

  it('reports an unreachable station as null and a trip to itself as free', () => {
    expect(shortestPath(routes, 1, 9)).toBeNull()
    expect(shortestPath(routes, 2, 2)).toEqual({ stations: [2], energy: 0, distance: 0 })
  })
})
