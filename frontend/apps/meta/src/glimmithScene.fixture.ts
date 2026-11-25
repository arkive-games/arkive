import scene from './assets/glimmith-scene.json'
import type { GlimmithPuzzle } from './GlimmithTutorialPrototype'

// Eager loading is for the full-scene regression suite only.
const groups = import.meta.glob<Record<string, GlimmithPuzzle>>('./assets/glimmith-boards/*.json', { eager: true, import: 'default' })
const puzzles: Record<string, GlimmithPuzzle> = {}
for (const { id, prerequisites } of scene.windows) {
  if (prerequisites.length) Object.assign(puzzles, groups[`./assets/glimmith-boards/${id}.json`])
}
export default { ...scene, puzzles }
