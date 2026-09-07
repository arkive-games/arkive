export const STATION_TYPES = ['winery', 'food', 'trade'] as const
export type StationType = (typeof STATION_TYPES)[number]

export const HINT_IDS = ['winery-most', 'food-most', 'trade-most', 'equal'] as const
export type HintId = (typeof HINT_IDS)[number]

export type StationTotals = Record<StationType, number>
export type ConfirmedStep = { currentType: StationType; hintId: HintId }

export type RouteModel = {
  totals: StationTotals
  totalStops: number
  fixed: ReadonlyMap<number, StationType>
  hints: ReadonlyMap<number, HintId>
  count: number
}

type Refinement = {
  fixed?: ReadonlyMap<number, StationType>
  hints?: ReadonlyMap<number, HintId>
}

const EMPTY_TOTALS = (): StationTotals => ({ winery: 0, food: 0, trade: 0 })

export function createRouteModel(
  totals: StationTotals,
  totalStops: number,
  originHint: HintId | '',
  steps: ConfirmedStep[],
): RouteModel {
  const fixed = new Map<number, StationType>()
  const hints = new Map<number, HintId>()
  if (originHint) hints.set(0, originHint)
  steps.forEach((step, index) => {
    fixed.set(index, step.currentType)
    hints.set(index + 1, step.hintId)
  })
  const model = { totals: { ...totals }, totalStops, fixed, hints, count: 0 }
  return { ...model, count: countRoutes(model) }
}

export function prospectiveRouteCount(
  model: RouteModel,
  index: number,
  currentType: StationType | '',
  hintStart: number,
  hintId: HintId | '',
): number {
  const fixed = new Map<number, StationType>()
  const hints = new Map<number, HintId>()
  if (currentType) fixed.set(index, currentType)
  if (hintId) hints.set(hintStart, hintId)
  return countRoutes(model, { fixed, hints })
}

export function getAvailableHints(
  model: RouteModel,
  start: number,
  fixedIndex?: number,
  fixedType?: StationType | '',
): Set<HintId> {
  return new Set(HINT_IDS.filter((hint) => (
    prospectiveRouteCount(model, fixedIndex ?? -1, fixedType ?? '', start, hint) > 0
  )))
}

export function probabilityFor(model: RouteModel, position: number): StationTotals {
  const counts = EMPTY_TOTALS()
  if (model.count === 0 || position < 0 || position >= model.totalStops) return counts
  STATION_TYPES.forEach((type) => {
    counts[type] = countRoutes(model, { fixed: new Map([[position, type]]) }) / model.count
  })
  return counts
}

export function windowDistribution(model: RouteModel, start: number): [string, number][] {
  if (model.count === 0 || start < 0 || start + 2 >= model.totalStops) return []
  const result: [string, number][] = []
  STATION_TYPES.forEach((first) => {
    STATION_TYPES.forEach((second) => {
      STATION_TYPES.forEach((third) => {
        const fixed = new Map<number, StationType>([
          [start, first],
          [start + 1, second],
          [start + 2, third],
        ])
        const count = countRoutes(model, { fixed })
        if (count > 0) result.push([[first, second, third].join(','), count])
      })
    })
  })
  return result.sort((left, right) => right[1] - left[1])
}

export function getConfirmedStations(
  model: RouteModel,
  originHint: HintId | '',
  steps: ConfirmedStep[],
): Map<number, StationType> {
  const confirmed = new Map<number, StationType>(
    steps.map((step, index) => [index, step.currentType]),
  )
  if (model.count === 0 || !originHint) return confirmed
  const starts = [0, ...steps.map((_, index) => index + 1)]
  starts.flatMap((start) => [start, start + 1, start + 2]).forEach((position) => {
    if (confirmed.has(position) || position >= model.totalStops) return
    const type = STATION_TYPES.find((candidate) => (
      countRoutes(model, { fixed: new Map([[position, candidate]]) }) === model.count
    ))
    if (type) confirmed.set(position, type)
  })
  return confirmed
}

export function roundedProbabilities(probability: StationTotals): StationTotals {
  const raw = STATION_TYPES.map((type) => probability[type] * 100)
  const values = raw.map(Math.floor)
  let remainder = probability.winery + probability.food + probability.trade > 0
    ? 100 - values.reduce((sum, value) => sum + value, 0)
    : 0
  raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction)
    .forEach(({ index }) => {
      if (remainder <= 0) return
      values[index] += 1
      remainder -= 1
    })
  return { winery: values[0], food: values[1], trade: values[2] }
}

function countRoutes(model: Omit<RouteModel, 'count'> | RouteModel, refinement: Refinement = {}): number {
  const fixed = mergeConstraints(model.fixed, refinement.fixed)
  const hints = mergeConstraints(model.hints, refinement.hints)
  if (!fixed || !hints) return 0
  if (STATION_TYPES.reduce((sum, type) => sum + model.totals[type], 0) !== model.totalStops) return 0

  const remaining = STATION_TYPES.map((type) => model.totals[type])
  const memo = new Map<string, number>()

  const visit = (position: number, previousTwo: StationType | '', previous: StationType | ''): number => {
    if (position === model.totalStops) return 1
    const key = `${remaining.join(',')}|${previousTwo}|${previous}`
    const cached = memo.get(key)
    if (cached !== undefined) return cached

    const required = fixed.get(position)
    let total = 0
    STATION_TYPES.forEach((type, typeIndex) => {
      if (required && required !== type) return
      if (remaining[typeIndex] === 0) return
      const completedHint = hints.get(position - 2)
      if (completedHint && (!previousTwo || !previous || !matchesHint([previousTwo, previous, type], completedHint))) return
      remaining[typeIndex] -= 1
      total += visit(position + 1, previous, type)
      remaining[typeIndex] += 1
    })
    memo.set(key, total)
    return total
  }

  return visit(0, '', '')
}

function mergeConstraints<T>(
  base: ReadonlyMap<number, T>,
  extra: ReadonlyMap<number, T> | undefined,
): Map<number, T> | null {
  const merged = new Map(base)
  extra?.forEach((value, key) => {
    if (merged.has(key) && merged.get(key) !== value) {
      merged.set(Number.NaN, value)
      return
    }
    merged.set(key, value)
  })
  return merged.has(Number.NaN) ? null : merged
}

function matchesHint(window: [StationType, StationType, StationType], hintId: HintId): boolean {
  const counts = EMPTY_TOTALS()
  window.forEach((type) => { counts[type] += 1 })
  if (hintId === 'equal') return STATION_TYPES.every((type) => counts[type] === 1)
  const winner = hintId.replace('-most', '') as StationType
  return counts[winner] >= 2
}
