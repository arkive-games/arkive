import type { StationType } from './stationSolver'

const DIFFICULTY_IDS = ['beginner', 'normal', 'advanced', 'hard', 'challenge', 'frenzy'] as const
export type TrainTradeDifficultyId = (typeof DIFFICULTY_IDS)[number]

export type RawDifficulty = {
  ID: number
  AreaStationCounts: number[]
  AreaNameTextIDs?: string[]
  StationTipsType?: number
}

/**
 * How the game tells the player what is ahead. `area`: on reaching each area
 * it shows that area's station mix, and two stops in a row are never the same
 * type. `hint`: it shows the whole route's mix once, then a "most of the next
 * three" hint at every stop.
 */
export type TrainTradeTipsMode = 'area' | 'hint'

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
  mode: TrainTradeTipsMode
  /** Typed stops per area, the origin already taken off the first one. */
  areas: number[]
  /** Game-sourced area names, one per area when the dataset carries them. */
  areaNames: string[]
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
    const areas = difficulty.AreaStationCounts.map((count, index) => (index === 0 ? count - 1 : count))
    // Only Challenge and Frenzy use hints; an older dataset without the field is read that way too.
    const mode: TrainTradeTipsMode = (difficulty.StationTipsType ?? (dataId >= 5 ? 3 : 1)) === 3 ? 'hint' : 'area'
    const areaNames = (difficulty.AreaNameTextIDs ?? []).slice(0, areas.length)
    return { id, dataId, stops: declaredStops - 1, mode, areas, areaNames }
  })
}
function stationTypeFromClient(value: string | undefined): StationType | null {
  if (value === 'Start') return null
  if (value === 'Wine_Station') return 'winery'
  if (value === 'Food_Station') return 'food'
  if (value === 'Artwork_Station') return 'trade'
  throw new Error(`Unknown Train Trade station type: ${value ?? 'missing'}`)
}
