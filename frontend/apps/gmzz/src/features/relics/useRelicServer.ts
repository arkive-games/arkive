import { useSection } from '@/features/characters/CharacterProvider'
import type { RelicServer } from '@/features/relics/data'

/**
 * Where the relics are scored, shared through the relic section so every toggle
 * bound to it — the one at the top of the page and the one in the relic
 * section — reads and writes the same value.
 *
 * Kept apart from `memory.ts`, which the character document imports: this hook
 * reaches back into the provider, and in `memory.ts` that would be a cycle.
 */
export function useRelicServer(): readonly [RelicServer, (next: RelicServer) => void] {
  const [draft, setDraft] = useSection('relics')
  return [draft.server ?? 'local', (next) => setDraft((prev) => ({ ...prev, server: next }))] as const
}
