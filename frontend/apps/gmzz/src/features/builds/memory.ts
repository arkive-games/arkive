import { gmzzMemory } from '../../lib/memory'
import { emptyBuild, isBuild } from './model'

export const buildDraft = gmzzMemory.draft('builds/editor', {
  default: emptyBuild,
  validate: isBuild,
  maximumBytes: 256_000,
})
