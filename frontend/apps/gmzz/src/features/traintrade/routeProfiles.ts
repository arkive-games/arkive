import type { StationType } from './stationSolver'

const DIFFICULTY_IDS = ['beginner', 'normal', 'advanced', 'hard', 'challenge', 'frenzy'] as const
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
  /**
   * Typed stops after the origin. The origin takes one slot of the map pool
   * (a Start stop on the beginner route, a typed one elsewhere), but the game
   * never asks the player about it and the station mix it shows counts only
   * the stops that follow, so the planner leaves it out.
   */
  stops: number
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

  // A route the dataset does not define yet is left out rather than fatal, so
  // the page keeps working while the data deploy trails the frontend one. A
  // route that IS defined but has no maps is still an error: it names a broken
  // export, and the caller is meant to fail loudly on it.
  const defined = DIFFICULTY_IDS
    .map((id, index) => ({ id, dataId: index + 1 }))
    .filter(({ dataId }) => difficulties.some((entry) => entry.ID === dataId))
  return defined.map(({ id, dataId }) => {
    const difficulty = difficulties.find((entry) => entry.ID === dataId)
    const routeMaps = maps.filter((entry) => Math.floor(entry.ID / 100) % 100 === dataId)
    if (!difficulty || routeMaps.length === 0) throw new Error(`Missing Train Trade route ${dataId}`)

    const declaredStops = difficulty.AreaStationCounts.reduce((sum, count) => sum + count, 0)
    routeMaps.forEach((route) => {
      if (route.StationPool.length !== declaredStops) {
        throw new Error(`Train Trade route ${route.ID} has an invalid station count`)
      }
      route.StationPool.forEach((stationId) => stationTypeFromClient(stationTypes.get(stationId)))
    })
    return { id, dataId, stops: declaredStops - 1 }
  })
}
function stationTypeFromClient(value: string | undefined): StationType | null {
  if (value === 'Start') return null
  if (value === 'Wine_Station') return 'winery'
  if (value === 'Food_Station') return 'food'
  if (value === 'Artwork_Station') return 'trade'
  throw new Error(`Unknown Train Trade station type: ${value ?? 'missing'}`)
}
