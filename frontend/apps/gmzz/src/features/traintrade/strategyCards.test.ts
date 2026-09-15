import { describe, expect, it } from 'vitest'
import type { TrainTradeStrategyCard } from './data'
import { strategyActivationChance, strategyPrefix } from './strategyCards'

const baseCard: TrainTradeStrategyCard = {
  id: 1, name: 'DividendIII', description: '', level: 3, icon: '', label: '',
  effects: [{ EffectType: 'GAIN_COIN_PERCENT', Value: 10 }],
  hasAlternateEffect: false, triggerConditions: [],
}
const probabilities = { winery: 0.6, food: 0.3, trade: 0.1 }

describe('strategy-card activation', () => {
  it('uses authored station conditions without matching translated names', () => {
    const card = { ...baseCard, triggerConditions: [{ ConditionType: 'NEXT_STATION_TYPE', CompareOperator: 'EQUAL', Value: 'Wine_Station' }] }
    expect(strategyActivationChance(card, probabilities)).toBe(0.6)
    expect(strategyActivationChance({ ...card, effects: [{ EffectType: 'GAIN_COIN_PERCENT', Value: 0 }], hasAlternateEffect: true }, probabilities)).toBe(0.4)
  })

  it('does not claim certainty for unsupported conditions', () => {
    expect(strategyActivationChance(baseCard, probabilities)).toBe(1)
    expect(strategyActivationChance({ ...baseCard, triggerConditions: [{ ConditionType: 'UNKNOWN' }] }, probabilities)).toBeNull()
    expect(strategyPrefix(baseCard)).toBe('Dividend')
  })
})
