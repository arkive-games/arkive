import { STATION_TYPES, type StationTotals, type StationType } from './stationSolver'

const DIFFICULTY_IDS = ['beginner', 'normal', 'advanced', 'hard', 'challenge'] as const
export type TrainTradeDifficultyId = (typeof DIFFICULTY_IDS)[number]

export type RawDifficulty = {
  ID: number
  AreaStationCounts: number[]
}

export type RawMapGeneration = {
  ID: number
  StationPool: number[]
}

export type RawStationType = {
  ID: number
  StationType: string
}

export type TrainTradeRouteProfile = {
  id: TrainTradeDifficultyId
  dataId: number
  stops: number
  variants: StationTotals[]
}

export function parseTrainTradeRouteProfiles(
  difficulties: RawDifficulty[],
  maps: RawMapGeneration[],
  stations: RawStationType[],
): TrainTradeRouteProfile[] {
  if (!Array.isArray(difficulties) || !Array.isArray(maps) || !Array.isArray(stations)) {
    throw new Error('Invalid Train Trade route data')
  }
  const stationTypes = new Map(stations.map((station) => [station.ID, station.StationType]))

  return DIFFICULTY_IDS.map((id, index) => {
    const dataId = index + 1
    const difficulty = difficulties.find((entry) => entry.ID === dataId)
    const routeMaps = maps.filter((entry) => Math.floor(entry.ID / 100) % 100 === dataId)
    if (!difficulty || routeMaps.length === 0) throw new Error(`Missing Train Trade route ${dataId}`)

    const declaredStops = difficulty.AreaStationCounts.reduce((sum, count) => sum + count, 0)
    const variants = routeMaps.map((route) => {
      if (route.StationPool.length !== declaredStops) {
        throw new Error(`Train Trade route ${route.ID} has an invalid station count`)
      }
      const totals: StationTotals = { winery: 0, food: 0, trade: 0 }
      route.StationPool.forEach((stationId) => {
        const type = stationTypeFromClient(stationTypes.get(stationId))
        if (type) totals[type] += 1
      })
      return totals
    })
    const uniqueVariants = variants.filter((variant, variantIndex) => (
      variants.findIndex((candidate) => stationTotalsEqual(candidate, variant)) === variantIndex
    ))
    const stops = stationTotalsSum(uniqueVariants[0])
    if (!uniqueVariants.every((variant) => stationTotalsSum(variant) === stops)) {
      throw new Error(`Train Trade route ${dataId} mixes different stop counts`)
    }
    return { id, dataId, stops, variants: uniqueVariants }
  })
}

export function stationTotalsEqual(left: StationTotals, right: StationTotals): boolean {
  return left.winery === right.winery && left.food === right.food && left.trade === right.trade
}

function stationTotalsSum(totals: StationTotals | undefined): number {
  if (!totals) return 0
  return STATION_TYPES.reduce((sum, type) => sum + totals[type], 0)
}

function stationTypeFromClient(value: string | undefined): StationType | null {
  if (value === 'Start') return null
  if (value === 'Wine_Station') return 'winery'
  if (value === 'Food_Station') return 'food'
  if (value === 'Artwork_Station') return 'trade'
  throw new Error(`Unknown Train Trade station type: ${value ?? 'missing'}`)
}
