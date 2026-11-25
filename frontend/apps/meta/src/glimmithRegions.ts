import scene from './assets/glimmith-scene.json'

export const regionIds = ['Zone1', 'Zone2', 'Zone3'] as const
export type RegionId = (typeof regionIds)[number]
const regions = new Map<string, RegionId>()

for (const { id, directory, widget } of scene.actors) {
  // The opening tutorial signs have no puzzle directory.
  const region = widget ? 'Zone1' : regionIds.find(zone => directory?.split('/')[2] === zone)
  if (region) regions.set(id, region)
}
for (const window of scene.windows) {
  // The final plinth unlocks puzzles instead of taking puzzles as prerequisites.
  const puzzle = window.prerequisites[0] ?? window.unlockPuzzles?.[0]
  const region = puzzle && regions.get(puzzle)
  if (region) regions.set(window.id, region)
}

export const markerRegions: ReadonlyMap<string, RegionId> = regions
