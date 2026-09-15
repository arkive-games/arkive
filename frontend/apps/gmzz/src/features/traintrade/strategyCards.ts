import type { TrainTradeStrategyCard } from './data'
import type { StationTotals, StationType } from './stationSolver'

const CLIENT_STATION_TYPES: Record<string, StationType> = {
  Wine_Station: 'winery',
  Food_Station: 'food',
  Artwork_Station: 'trade',
}

export function strategyPrefix(card: TrainTradeStrategyCard): string {
  return card.name.split('·')[0].replace(/[IV]+$/, '')
}

/** Probability of the authored effect branch, not an estimate of profit. */
export function strategyActivationChance(card: TrainTradeStrategyCard, probabilities: StationTotals): number | null {
  if (card.triggerConditions.length === 0) return 1
  if (card.triggerConditions.length !== 1) return null
  const condition = card.triggerConditions[0]
  if (condition.ConditionType !== 'NEXT_STATION_TYPE' || condition.CompareOperator !== 'EQUAL') return null
  const type = CLIENT_STATION_TYPES[String(condition.Value)]
  if (!type) return null
  const hasPrimaryEffect = card.effects.some((effect) => {
    const values = Array.isArray(effect.Value) ? effect.Value : [effect.Value]
    return values.some((value) => typeof value === 'number' && value !== 0)
  })
  const chance = probabilities[type]
  return !hasPrimaryEffect && card.hasAlternateEffect ? 1 - chance : chance
}
