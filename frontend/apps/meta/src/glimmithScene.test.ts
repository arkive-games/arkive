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
      ['window-mingle', 41],
      ['window-forest-trailhead', 49],
      ['window-match', 28],
      ['window-area-number', 43],
      ['window-range', 46],
    ])
    const ids = [...new Set(scene.windows.flatMap(({ prerequisites }) => prerequisites))]
    expect(scene.actors.filter(({ directory }) => directory).map(({ id }) => id)).toEqual(ids)
    expect(Object.keys(scene.puzzles)).toEqual(ids)
    expect(scene.windows.find(({ id }) => id === 'window-shape-bank')?.thresholds).toEqual([8, 14, 23])
    expect(scene.windows.find(({ id }) => id === 'window-precision')?.thresholds).toEqual([12, 20, 35])
    expect(scene.windows.find(({ id }) => id === 'window-polyomino')?.thresholds).toEqual([13, 20, 31])
    expect(scene.windows.find(({ id }) => id === 'window-mingle')?.thresholds).toEqual([12, 20, 31])
    expect(scene.windows.find(({ id }) => id === 'window-forest-trailhead')?.thresholds).toEqual([8, 18, 34])
    expect(scene.windows.find(({ id }) => id === 'window-match')?.thresholds).toEqual([9, 13, 22])
    expect(scene.windows.find(({ id }) => id === 'window-area-number')?.thresholds).toEqual([14, 21, 34])
    expect(scene.windows.find(({ id }) => id === 'window-range')?.thresholds).toEqual([14, 22, 37])
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

  it('preserves Mingle shape banks and multi-digit clues without shifting cells', () => {
    const puzzle = scene.puzzles['1435.puz']
    expect(puzzle.board[9]).toBe('|..|..|S*|..|..|..|..|S6|S*|S2|S4|..|')
    expect(puzzle.wideShapeClues).toMatchObject({ 50: 'S10', 56: 'S11', 103: 'S12', 135: 'S13' })
    expect(puzzle.shapeClues.S10).toEqual(['  #', ' ##', '##', '#'])
    expect(scene.puzzles['0331.puz'].wideShapeClues).toEqual({ 97: 'S10', 101: 'S11', 107: 'S10' })
    const bank = scene.puzzles['0080.puz']
    expect(bank.shapeBank).toEqual(['S1', 'S2'])
    expect(Object.keys(bank.shapeClues)).toEqual(bank.shapeBank)
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
    expect(actors.find(({ id }) => id === '0230.puz')?.supportMeshes).toContain('Brick_Circle_01_SM')
    expect(actors.find(({ id }) => id === '0319.puz')?.supportMeshes).toContain('SM_Rock_01_cut')
  })

  it('keeps the Forest Trailhead shape pools and wide shape cells', () => {
    const window = scene.windows.find(({ id }) => id === 'window-forest-trailhead')!
    const puzzles = new Map(Object.entries(scene.puzzles))
    const banks = window.prerequisites.map((id) => puzzles.get(id)!).filter((puzzle) => 'shapeBank' in puzzle)
    expect(banks).toHaveLength(8)
    for (const puzzle of banks) {
      expect(puzzle.shapeBank.every((clue) => Object.hasOwn(puzzle.shapeClues, clue))).toBe(true)
    }
    expect(scene.puzzles['0253.puz'].wideShapeClues).toEqual({ 58: 'S10', 60: 'S11', 71: 'S12' })
  })

  it('preserves the Match shape pools and fixed-color clues', () => {
    const window = scene.windows.find(({ id }) => id === 'window-match')!
    const puzzles = new Map(Object.entries(scene.puzzles))
    const boards = window.prerequisites.map((id) => puzzles.get(id)!)
    const banks = boards.filter((puzzle) => 'shapeBank' in puzzle)
    expect(banks).toHaveLength(6)
    expect(scene.puzzles['0353.puz'].shapeBank).toEqual(['S1', 'S2', 'S3'])
    for (const puzzle of banks) {
      expect(puzzle.shapeBank.every((clue) => Object.hasOwn(puzzle.shapeClues, clue))).toBe(true)
    }
    expect(boards.some((puzzle) => puzzle.board.some((row) => /P[1-4]/.test(row)))).toBe(true)
  })

  it('preserves numeric, shape and relation clues on Area Number boards', () => {
    const area = scene.windows.find(({ id }) => id === 'window-area-number')!
    const puzzles = new Map(Object.entries(scene.puzzles))
    expect(area.prerequisites.every((id) => puzzles.get(id)?.board.some((row) => /\d{2}/.test(row)))).toBe(true)
    expect(scene.puzzles['0335.puz'].board[1]).toBe('|06|..|..|02|..|06|')
    expect(scene.puzzles['1101.puz'].board).toContain('|10|..=..|10|')
    expect(scene.puzzles['0649.puz'].shapeBank).toEqual(['S1', 'S2', 'S3', 'S4'])
  })

  it('preserves the lower-only, upper-only and paired Range constraints', () => {
    const range = scene.windows.find(({ id }) => id === 'window-range')!
    const puzzles = new Map(Object.entries(scene.puzzles))
    expect(range.prerequisites.every((id) => 'areaRange' in puzzles.get(id)!)).toBe(true)
    expect(scene.puzzles['0286.puz'].areaRange).toEqual({ min: 4 })
    expect(scene.puzzles['0768.puz'].areaRange).toEqual({ max: 2 })
    expect(scene.puzzles['0779.puz'].areaRange).toEqual({ min: 3, max: 5 })
  })
})
