import { describe, expect, it } from 'vitest'
import scene from './assets/glimmith-scene.json'

describe('Glimmith tutorial scene', () => {
  it('preserves the game-completion category and the separate puzzle unlock reference', () => {
    const postGame = scene.actors.filter(({ unlockCategory }) => unlockCategory === 'GameCompletion')
    expect(postGame.map(({ id }) => id)).toContain('0054.puz')
    expect(scene.actors.filter(({ unlocks }) => unlocks.some((id) => id === '0054.puz')).map(({ id }) => id)).toEqual(['0527.puz'])
  })

  it('has a map marker and source solution for every listed window prerequisite', () => {
    expect(scene.windows.map(({ id, prerequisites }) => [id, prerequisites.length])).toEqual([
      ['window-bridge', 11], ['window-gate', 11], ['window-gemini-delta', 41], ['window-rose-windows', 41],
      ['window-shape-bank', 32],
      ['window-precision', 44],
      ['window-polyomino', 39],
    ])
    const ids = [...new Set(scene.windows.flatMap(({ prerequisites }) => prerequisites))]
    expect(scene.actors.filter(({ directory }) => directory).map(({ id }) => id)).toEqual(ids)
    expect(Object.keys(scene.puzzles)).toEqual(ids)
    expect(scene.windows.find(({ id }) => id === 'window-shape-bank')?.thresholds).toEqual([8, 14, 23])
    expect(scene.windows.find(({ id }) => id === 'window-precision')?.thresholds).toEqual([12, 20, 35])
    expect(scene.windows.find(({ id }) => id === 'window-polyomino')?.thresholds).toEqual([13, 20, 31])
    for (const { rows, board, solution, difficulty } of Object.values(scene.puzzles)) {
      expect(board).toHaveLength(2 * rows + 1)
      expect(solution).toHaveLength(board.length)
      expect(solution.join('')).toContain('#')
      expect([1, 2, 3, 4, 5, 6, 7]).toContain(difficulty)
    }
  })

  it('keeps every Polyomino cell clue tied to its authored shape', () => {
    const puzzles = new Map(Object.entries(scene.puzzles))
    const window = scene.windows.find(({ id }) => id === 'window-polyomino')!
    expect(scene.puzzles['0379.puz'].shapeClues.S1).toEqual([' #', '###', ' #'])
    for (const id of window.prerequisites) {
      const puzzle = puzzles.get(id)!
      const clues = new Set(puzzle.board.flatMap((line, index) => index % 2 ? line.match(/S\d/g) ?? [] : []))
      expect(clues.size, id).toBeGreaterThan(0)
      const shapes = 'shapeClues' in puzzle ? puzzle.shapeClues : {}
      expect(new Set(Object.keys(shapes)), id).toEqual(clues)
      for (const cells of Object.values(shapes)) {
        expect(Array.isArray(cells) && cells.join(''), id).toMatch(/^[# ]*#[# ]*$/)
      }
    }
  })

  it('keeps authored anchors on the map with source terrain support', () => {
    const { projection, width, height, actors, windows } = scene
    const angle = projection.degrees * Math.PI / 180
    for (const { id, x, y, pixel } of [...actors, ...windows]) {
      const dx = (projection.centerX - x) * projection.scale
      const dy = (projection.centerY - y) * projection.scale
      expect(pixel.x, id).toBeCloseTo(projection.originX + dx * Math.cos(angle) - dy * Math.sin(angle))
      expect(pixel.y, id).toBeCloseTo(projection.originY + dx * Math.sin(angle) + dy * Math.cos(angle))
      expect(pixel.x, id).toBeGreaterThanOrEqual(0)
      expect(pixel.x, id).toBeLessThan(width)
      expect(pixel.y, id).toBeGreaterThanOrEqual(0)
      expect(pixel.y, id).toBeLessThan(height)
    }
    for (const { id, supportMeshes } of actors) expect(supportMeshes.length, id).toBeGreaterThan(0)
    expect(actors.find(({ id }) => id === '0054.puz')?.supportMeshes).toContain('Base_Ship_Full_Static_SM')
  })
})
