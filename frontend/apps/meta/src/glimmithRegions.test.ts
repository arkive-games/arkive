import { expect, it } from 'vitest'
import scene from './assets/glimmith-scene.json'
import { markerRegions } from './glimmithRegions'

it('assigns every campaign marker to a region including tutorial signs and the final plinth', () => {
  expect(markerRegions.size).toBe(scene.actors.length + scene.windows.length)
  for (const window of scene.windows) {
    const puzzles = window.prerequisites.length ? window.prerequisites : window.unlockPuzzles!
    expect(new Set(puzzles.map(id => markerRegions.get(id)))).toEqual(new Set([markerRegions.get(window.id)]))
  }
  expect(markerRegions.get('Tutorial-2')).toBe('Zone1')
  expect(markerRegions.get('window-perfected-windows')).toBe('Zone3')
})
