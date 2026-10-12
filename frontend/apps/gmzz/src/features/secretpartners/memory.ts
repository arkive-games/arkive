import { gmzzMemory } from '../../lib/memory'

export function isPartnerLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 50
}

// Each puppet owns its level, so edits in another card or tab cannot overwrite it.
export const partnerLevel = gmzzMemory.progress('secretpartners/level', {
  keyedBy: { partner: true },
  default: 1,
  validate: isPartnerLevel,
  maximumBytes: 256,
})
