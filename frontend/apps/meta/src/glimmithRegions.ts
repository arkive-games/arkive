import scene from './assets/glimmith-scene.json'
import copy from './glimmithLocale.json'

const names: Readonly<Record<string, string>> = copy.windows
const owners = new Map<string, string>()

// Each window owns its plinth and its own puzzles, not puzzles it unlocks elsewhere.
for (const window of scene.windows) {
  owners.set(window.id, window.id)
  for (const id of window.prerequisites) owners.set(id, window.id)
}
// Tutorial signs do not occur in prerequisite lists. Group them with the
// nearest plinth in world space, not the distant puzzles they unlock.
for (const sign of scene.actors.filter(actor => actor.widget)) {
  const distance = (w: typeof scene.windows[number]) => Math.hypot(w.x - sign.x, w.y - sign.y)
  const nearest = scene.windows.reduce((a, b) => distance(a) <= distance(b) ? a : b)
  owners.set(sign.id, nearest.id)
}

export const markerRegions: ReadonlyMap<string, string> = owners
const counts = new Map<string, number>()
for (const id of owners.values()) counts.set(id, (counts.get(id) ?? 0) + 1)
export const regionOptions = scene.windows.map(({ id, name }) => ({
  id, label: names[id] ?? name, count: counts.get(id) ?? 0,
}))
