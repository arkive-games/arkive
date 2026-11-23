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
      ['window-size-separation', 45],
      ['window-boxy', 40], ['window-non-boxy', 43],
      ['window-solitude', 37], ['window-castle-gates', 48],
      ['window-bricky', 70], ['window-compass', 66],
      ['window-difference', 53], ['window-hedge-maze', 34],
      ['window-inequality', 56], ['window-loopy', 58],
      ['window-mismatch', 48], ['window-palisade', 60],
      ['window-secluded-garden', 34], ['window-spiral', 48],
      ['window-watchtower', 59],
      ['window-perfected-windows', 0],
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
    expect(scene.windows.find(({ id }) => id === 'window-size-separation')?.thresholds).toEqual([14, 22, 35])
    expect(scene.windows.find(({ id }) => id === 'window-boxy')?.thresholds).toEqual([13, 20, 32])
    expect(scene.windows.find(({ id }) => id === 'window-non-boxy')?.thresholds).toEqual([14, 21, 33])
    expect(scene.windows.find(({ id }) => id === 'window-solitude')?.thresholds).toEqual([13, 19, 30])
    expect(scene.windows.find(({ id }) => id === 'window-castle-gates')?.thresholds).toEqual([8, 19, 36])
    expect(scene.windows.find(({ id }) => id === 'window-bricky')?.thresholds).toEqual([15, 29, 52])
    expect(scene.windows.find(({ id }) => id === 'window-compass')?.thresholds).toEqual([10, 23, 49])
    expect(scene.windows.find(({ id }) => id === 'window-difference')?.thresholds).toEqual([15, 24, 43])
    expect(scene.windows.find(({ id }) => id === 'window-hedge-maze')?.thresholds).toEqual([17, 25, 30])
    expect(scene.windows.find(({ id }) => id === 'window-inequality')?.thresholds).toEqual([15, 26, 41])
    expect(scene.windows.find(({ id }) => id === 'window-loopy')?.thresholds).toEqual([15, 27, 46])
    expect(scene.windows.find(({ id }) => id === 'window-mismatch')?.thresholds).toEqual([13, 21, 37])
    expect(scene.windows.find(({ id }) => id === 'window-palisade')?.thresholds).toEqual([17, 29, 48])
    expect(scene.windows.find(({ id }) => id === 'window-secluded-garden')?.thresholds).toEqual([8, 16, 25])
    expect(scene.windows.find(({ id }) => id === 'window-spiral')?.thresholds).toEqual([9, 18, 32])
    expect(scene.windows.find(({ id }) => id === 'window-watchtower')?.thresholds).toEqual([16, 26, 43])
    for (const { rows, board, solution, difficulty } of Object.values(scene.puzzles)) {
      expect(board).toHaveLength(2 * rows + 1)
      expect(solution).toHaveLength(board.length)
      expect(solution.join('')).toContain('#')
      expect([1, 2, 3, 4, 5, 6, 7]).toContain(difficulty)
    }
  })

  it('counts perfected windows separately from placed puzzle prerequisites', () => {
    const finale = scene.windows.find(({ id }) => id === 'window-perfected-windows')!
    const garden = scene.windows.find(({ id }) => id === 'window-secluded-garden')!
    expect(finale).toMatchObject({
      actor: 'BP_StainedGlassPlinth_Glimmith',
      x: -148310.78125, y: -1124.8958740234375, z: 4523.82421875,
      thresholds: [10, 15, 20], prerequisites: [], unlockedAreaId: garden.id,
    })
    expect(finale.windowPrerequisites).toHaveLength(28)
    expect(new Set(finale.windowPrerequisites)).toEqual(new Set(scene.windows.filter(w => w !== finale).map(({ id }) => id)))
    expect(finale.unlockPuzzles).toEqual(garden.prerequisites)
    expect(Object.keys(scene.puzzles)).toHaveLength(1225)
  })

  it('keeps Garden and Spiral anchors and mixed clues from the original puzzles', () => {
    const anchors = new Map(scene.actors.map((actor) => [actor.id, actor]))
    const ids = scene.windows.filter(({ id }) => id === 'window-secluded-garden' || id === 'window-spiral')
      .flatMap(({ prerequisites }) => prerequisites)
    expect(ids).toHaveLength(82)
    for (const id of ids) expect(anchors.get(id)?.supportMeshes.length, id).toBeGreaterThan(0)
    for (const id of ['1249.puz', '1149a.puz']) {
      expect(anchors.get(id)?.supportMeshes, id).toContain('BeautyCorner_Landscape_7')
    }
    expect(anchors.get('1151.puz')?.supportMeshes).toContain('SM_RoundRock_02')
    expect(scene.puzzles['0268.puz']).toMatchObject({ areaEquals: 5, wideShapeClues: { 160: 'S10' } })
    expect(scene.puzzles['1148.puz']).toMatchObject({ areaEquals: 5, wideCellClues: { '0:0': 'UD1LR', '4:0': 'U0DLR' } })
    expect(scene.puzzles['1152.puz']).toMatchObject({ shapeBank: ['S1', 'S2', 'S3', 'S4'] })
  })

  it('includes all Watchtower boards with source support and mixed rules', () => {
    const window = scene.windows.find(({ id }) => id === 'window-watchtower')!
    const anchors = new Map(scene.actors.map((actor) => [actor.id, actor]))
    expect(window).toMatchObject({
      actor: 'BP_StainedGlassPlinth_Watchtower',
      x: -94391.3125, y: -1140.1292724609375, z: 5393.7890625,
    })
    expect(Object.keys(scene.puzzles)).toHaveLength(1225)
    for (const id of window.prerequisites) {
      expect(anchors.get(id)?.supportMeshes.length, id).toBeGreaterThan(0)
    }
    expect(scene.puzzles['0994.puz']).toMatchObject({ wideShapeClues: { 67: 'S10' } })
    expect(scene.puzzles['1227.puz']).toMatchObject({ areaEquals: 4, ruleFlags: ['NO_RECTANGLES'] })
    expect(scene.puzzles['0192.puz']).toMatchObject({
      shapeBank: ['S1', 'S2', 'S3', 'S4'], ruleFlags: ['ADJACENT_SHAPES_DIFFERENT'],
    })
    expect(anchors.get('0883.puz')?.unlocks).toContain('0540.puz')
  })

  it('keeps both new windows on source geometry and preserves four-border clues', () => {
    const actors = new Map(scene.actors.map((actor) => [actor.id, actor]))
    const puzzles = new Map(Object.entries(scene.puzzles))
    expect(scene.puzzles['1263.puz']).toMatchObject({ areaEquals: 5, ruleFlags: ['ALL_SHAPES_DIFFERENT'] })
    expect(scene.puzzles['1020.puz']).toMatchObject({ areaEquals: 3 })
    let fourBorderClues = 0
    for (const { id, prerequisites } of scene.windows) {
      if (id !== 'window-mismatch' && id !== 'window-palisade') continue
      for (const puzzleId of prerequisites) {
        expect(actors.get(puzzleId)?.supportMeshes.length, puzzleId).toBeGreaterThan(0)
        const { board, solution, rows, columns } = puzzles.get(puzzleId)!
        for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
          if (board[2 * y + 1].slice(3 * x + 1, 3 * x + 3) !== 'F4') continue
          fourBorderClues++
          expect([
            solution[2 * y][3 * x + 1], solution[2 * y + 1][3 * x + 3],
            solution[2 * y + 2][3 * x + 1], solution[2 * y + 1][3 * x],
          ], puzzleId).toEqual(['#', '#', '#', '#'])
        }
      }
    }
    expect(fourBorderClues).toBe(5)
    expect(actors.get('0430.puz')?.supportMeshes).toContain('SM_RockBrick_Small_03')
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
      expect(new Set(Object.keys(shapes)), id).toEqual(new Set([
        ...clues, ...('shapeBank' in puzzle ? puzzle.shapeBank : []),
      ]))
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
    for (const actor of actors) {
      if (actor.id === '0479.puz') {
        expect(actor.supportMeshes).toEqual([])
        expect('projectedSupportMeshes' in actor && actor.projectedSupportMeshes).toEqual(['SM_Rock_02'])
      } else if ('projectedSupportMeshes' in actor) {
        expect(actor.supportMeshes).toEqual([])
        expect(actor.projectedSupportMeshes?.length, actor.id).toBeGreaterThan(0)
      } else {
        expect(actor.supportMeshes.length, actor.id).toBeGreaterThan(0)
      }
    }
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

  it('includes authored text rules outside the previously supported windows', () => {
    expect(scene.puzzles['0070.puz']).toMatchObject({ areaEquals: 4 })
    expect(scene.puzzles['1250.puz']).toMatchObject({
      areaEquals: 4, ruleFlags: ['ADJACENT_SHAPES_DIFFERENT'],
    })
    expect(scene.puzzles['0372.puz']).toMatchObject({ ruleFlags: ['ALL_SHAPES_SAME'] })
    expect(scene.puzzles['1265.puz']).toMatchObject({
      ruleFlags: ['ONE_SYMBOL_PER_REGION', 'ADJACENT_SHAPES_DIFFERENT'],
    })
    expect(scene.puzzles['0810.puz']).toMatchObject({ ruleFlags: ['ALL_SHAPES_DIFFERENT'] })
    expect(scene.puzzles['1436.puz']).toMatchObject({ adjacentSizesDifferent: true })
    expect(scene.puzzles['1436.puz']).not.toHaveProperty('ruleFlags')
  })

  it('includes early and late source shape pools with their original definitions', () => {
    expect(scene.puzzles['0049.puz']).toMatchObject({ shapeBank: ['S1'], shapeClues: { S1: ['##', '##'] } })
    const pools = Object.values(scene.puzzles).filter((puzzle) => 'shapeBank' in puzzle)
    expect(pools).toHaveLength(235)
    for (const puzzle of pools) {
      expect(puzzle.shapeBank.every(id => Object.hasOwn(puzzle.shapeClues, id))).toBe(true)
    }
  })

  it('preserves the lower-only, upper-only and paired Range constraints', () => {
    const range = scene.windows.find(({ id }) => id === 'window-range')!
    const puzzles = new Map(Object.entries(scene.puzzles))
    expect(range.prerequisites.every((id) => 'areaRange' in puzzles.get(id)!)).toBe(true)
    expect(scene.puzzles['0286.puz'].areaRange).toEqual({ min: 4 })
    expect(scene.puzzles['0768.puz'].areaRange).toEqual({ max: 2 })
    expect(scene.puzzles['0779.puz'].areaRange).toEqual({ min: 3, max: 5 })
  })

  it('preserves the Size Separation rule and mixed authored clues', () => {
    const window = scene.windows.find(({ id }) => id === 'window-size-separation')!
    const puzzles = new Map(Object.entries(scene.puzzles))
    expect(window.prerequisites.every((id) => {
      const puzzle = puzzles.get(id)!
      return 'adjacentSizesDifferent' in puzzle && puzzle.adjacentSizesDifferent
    })).toBe(true)
    expect(scene.puzzles['1436.puz'].areaRange).toEqual({ min: 3, max: 5 })
    expect(new Set(Object.values(scene.puzzles['1436.puz'].wideShapeClues))).toEqual(new Set(['S10', 'S11', 'S12']))
    expect(scene.puzzles['1188.puz'].shapeBank).toEqual(['S1', 'S2', 'S3'])
    expect(scene.actors.find(({ id }) => id === '0824.puz')?.supportMeshes).toContain('sm_RuinPillar_LargeRoundExtraShortA_Base')
  })

  it('preserves the rectangle rules and Palisade clues in both windows', () => {
    const puzzles = new Map(Object.entries(scene.puzzles))
    for (const [key, rule] of [['window-boxy', 'only'], ['window-non-boxy', 'none']]) {
      const window = scene.windows.find(({ id }) => id === key)!
      expect(window.prerequisites.every((id) => {
        const puzzle = puzzles.get(id)!
        return 'rectangleRule' in puzzle && puzzle.rectangleRule === rule
      })).toBe(true)
    }
    expect(scene.puzzles['0479.puz'].board).toContain('|..|F7|..|F3|      ')
    expect(scene.puzzles['0303.puz'].board).toContain('|F3|F2|F2|F2|F2|F2|F3|')
  })

  it('preserves Solitude and Castle Gates region rules and projected supports', () => {
    const puzzles = new Map(Object.entries(scene.puzzles))
    const rulePuzzle = (id: string) => puzzles.get(id) as { areaRange?: { min?: number; max?: number }; ruleFlags?: string[] } | undefined
    const solitude = scene.windows.find(({ id }) => id === 'window-solitude')!
    const castle = scene.windows.find(({ id }) => id === 'window-castle-gates')!
    expect(solitude.prerequisites.every((id) => rulePuzzle(id)?.ruleFlags?.includes('ONE_SYMBOL_PER_REGION'))).toBe(true)
    expect(rulePuzzle(solitude.prerequisites[0])?.ruleFlags).toContain('ALL_SHAPES_DIFFERENT')
    expect(rulePuzzle(castle.prerequisites.find((id) => rulePuzzle(id)?.areaRange) ?? '')?.areaRange).toBeDefined()
    expect(rulePuzzle(castle.prerequisites.find((id) => rulePuzzle(id)?.ruleFlags?.includes('ADJACENT_SIZES_DIFFERENT')) ?? '')?.ruleFlags)
      .toContain('ADJACENT_SIZES_DIFFERENT')
    expect(scene.actors.find(({ id }) => id === '0793.puz')?.supportMeshes).toContain('SM_BridgePylon001')
    expect(scene.actors.find(({ id }) => id === '1114.puz')?.supportMeshes).toContain('sm_RuinHandrailPillarA')
    expect(scene.actors.find(({ id }) => id === '0883.puz')?.supportMeshes).toContain('SM_Rock_05_cut')
  })

  it('preserves Bricky and Compass source boards and authored projected references', () => {
    expect(Object.hasOwn(scene.puzzles['1233.puz'], 'wideCellClues')).toBe(true)
    expect(Object.hasOwn(scene.puzzles['0469.puz'], 'wideCellClues')).toBe(true)
    expect(scene.actors.find(({ id }) => id === '0617.puz')?.supportMeshes).toContain('BeautyCorner_Landscape_02')
    expect(scene.actors.find(({ id }) => id === '1388.puz')?.supportMeshes).toContain('BeautyCorner_Landscape_02')
    expect(scene.actors.find(({ id }) => id === '0914.puz')?.supportMeshes).toContain('Landscape_0')
    expect(scene.actors.find(({ id }) => id === '0190.puz')?.supportMeshes).toContain('BeautyCorner_Landscape_12')
    for (const id of ['0094.puz', '1076.puz', '1104.puz']) {
      expect(scene.actors.find(actor => actor.id === id)?.supportMeshes).toContain('SM_Plant_Tree_Willow_04_B')
    }
    expect(scene.actors.filter(actor => 'projectedSupportMeshes' in actor).map(({ id }) => id)).toEqual(['0479.puz'])
  })
})
