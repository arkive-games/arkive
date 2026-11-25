import { expect, it } from 'vitest'
import scene from './assets/glimmith-scene.json'
import { markerRegions, regionOptions } from './glimmithRegions'

it('assigns every campaign marker to a region including tutorial signs and the final plinth', () => {
  expect(markerRegions.size).toBe(scene.actors.length + scene.windows.length)
  for (const window of scene.windows) {
    expect(markerRegions.get(window.id)).toBe(window.id)
    for (const id of window.prerequisites) expect(markerRegions.get(id)).toBe(window.id)
  }
  expect(markerRegions.get('Tutorial-2')).toBe('window-bridge')
  expect(markerRegions.get('Tutorial-3')).toBe('window-gate')
  expect(regionOptions.map(option => option.id)).toEqual(scene.windows.map(w => w.id))
  expect(regionOptions.reduce((sum, option) => sum + option.count, 0)).toBe(markerRegions.size)
  expect(regionOptions.find(option => option.id === 'window-perfected-windows')?.count).toBe(1)
})
