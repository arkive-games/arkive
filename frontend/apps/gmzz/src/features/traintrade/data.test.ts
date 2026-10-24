import { describe, expect, it } from 'vitest'
import { parseTrainTradeRouteProfiles } from './routeProfiles'

const stations = [
  { ID: 100100, StationType: 'Start' },
  { ID: 100101, StationType: 'Artwork_Station' },
  { ID: 100102, StationType: 'Wine_Station' },
  { ID: 100103, StationType: 'Food_Station' },
]

describe('train-trade route data', () => {
  it('derives station mixes from map pools and preserves distinct variants', () => {
    const profiles = parseTrainTradeRouteProfiles(
      [
        { ID: 1, AreaStationCounts: [4, 4] },
        { ID: 2, AreaStationCounts: [4, 4] },
        { ID: 3, AreaStationCounts: [4, 4, 4] },
        { ID: 4, AreaStationCounts: [5, 5, 5] },
        { ID: 5, AreaStationCounts: [4, 4, 4, 4] },
        { ID: 6, AreaStationCounts: [4, 4, 4, 4] },
      ],
      [
        { ID: 200101, StationPool: [100100, 100101, 100101, 100102, 100102, 100102, 100103, 100103] },
        { ID: 200201, StationPool: [100101, 100101, 100101, 100102, 100102, 100102, 100103, 100103] },
        { ID: 200202, StationPool: [100101, 100101, 100102, 100102, 100102, 100103, 100103, 100103] },
        { ID: 200301, StationPool: Array(4).fill(100101).concat(Array(4).fill(100102), Array(4).fill(100103)) },
        { ID: 200401, StationPool: Array(5).fill(100101).concat(Array(5).fill(100102), Array(5).fill(100103)) },
        { ID: 200501, StationPool: Array(6).fill(100101).concat(Array(5).fill(100102), Array(5).fill(100103)) },
        { ID: 200601, StationPool: Array(6).fill(100101).concat(Array(5).fill(100102), Array(5).fill(100103)) },
      ],
      stations,
    )

    expect(profiles.map(({ id, stops, variants }) => [id, stops, variants.length])).toEqual([
      ['beginner', 7, 1], ['normal', 8, 2], ['advanced', 12, 1], ['hard', 15, 1], ['challenge', 16, 1], ['frenzy', 16, 1],
    ])
    expect(profiles[1]?.variants).toEqual([
      { winery: 3, food: 2, trade: 3 },
      { winery: 3, food: 3, trade: 2 },
    ])
  })

  it('leaves out a route the dataset does not define yet, but not one it defines without maps', () => {
    const one = [{ ID: 1, AreaStationCounts: [1] }]
    const maps = [{ ID: 200101, StationPool: [100101] }]
    expect(parseTrainTradeRouteProfiles(one, maps, stations).map((profile) => profile.id)).toEqual(['beginner'])
    expect(() => parseTrainTradeRouteProfiles([...one, { ID: 2, AreaStationCounts: [1] }], maps, stations))
      .toThrow('Missing Train Trade route 2')
  })
})
