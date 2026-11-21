import { describe, expect, it } from 'vitest'
import scene from './assets/glimmith-scene.json'

describe('Glimmith tutorial scene', () => {
  it('preserves the game-completion category and the separate puzzle unlock reference', () => {
    const postGame = scene.actors.filter(({ unlockCategory }) => unlockCategory === 'GameCompletion')
    expect(postGame.map(({ id }) => id)).toEqual(['0054.puz'])
    expect(scene.actors.filter(({ unlocks }) => unlocks.some((id) => id === '0054.puz')).map(({ id }) => id)).toEqual(['0527.puz'])
  })

  it('has a map marker and source solution for every bridge prerequisite', () => {
    const bridge = scene.windows.find(({ id }) => id === 'window-bridge')
    expect(bridge?.prerequisites).toHaveLength(11)
    expect(scene.actors.filter(({ directory }) => directory).map(({ id }) => id)).toEqual(bridge?.prerequisites)
    expect(Object.keys(scene.puzzles)).toEqual(bridge?.prerequisites)
    for (const { rows, board, solution, difficulty } of Object.values(scene.puzzles)) {
      expect(board).toHaveLength(2 * rows + 1)
      expect(solution).toHaveLength(board.length)
      expect(solution.join('')).toContain('#')
      expect([1, 2, 3]).toContain(difficulty)
    }
  })

  it('keeps authored anchors on the map with source terrain support', () => {
    const { projection, width, height, actors, windows } = scene
    const angle = projection.degrees * Math.PI / 180
    for (const { id, x, y, pixel } of [...actors, ...windows]) {
      const dx = (projection.centerX - x) * projection.scale
      const dy = (projection.centerY - y) * projection.scale
      expect(pixel.x, id).toBeCloseTo(width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle))
      expect(pixel.y, id).toBeCloseTo(height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle))
      expect(pixel.x, id).toBeGreaterThanOrEqual(0)
      expect(pixel.x, id).toBeLessThan(width)
      expect(pixel.y, id).toBeGreaterThanOrEqual(0)
      expect(pixel.y, id).toBeLessThan(height)
    }
    for (const { id, supportMeshes } of actors) expect(supportMeshes.length, id).toBeGreaterThan(0)
    expect(actors.find(({ id }) => id === '0054.puz')?.supportMeshes).toContain('Base_Ship_Full_Static_SM')
  })
})
