import { describe, expect, it } from 'vitest'
import scene from './glimmithScene.fixture'
import { glimmithInequalityAngle, glimmithVertexMark, horizontalGlimmithEdgeMark } from './glimmithEdgeClues'

function solutionRegions(board: string[], solution: string[], columns: number, rows: number) {
  const regions = Array<number[] | undefined>(columns * rows).fill(undefined)
  const present = regions.map((_, cell) => Boolean(board[2 * Math.floor(cell / columns) + 1]
    .slice(3 * (cell % columns) + 1, 3 * (cell % columns) + 3).trim()))
  const seen = new Set<number>()
  for (let start = 0; start < regions.length; start++) {
    if (!present[start] || seen.has(start)) continue
    const region = [start]
    seen.add(start)
    for (let i = 0; i < region.length; i++) {
      const cell = region[i]
      const x = cell % columns
      const y = Math.floor(cell / columns)
      const neighbors = [
        [cell - 1, x > 0 && solution[2 * y + 1][3 * x] !== '#'],
        [cell + 1, x < columns - 1 && solution[2 * y + 1][3 * x + 3] !== '#'],
        [cell - columns, y > 0 && solution[2 * y][3 * x + 1] !== '#'],
        [cell + columns, y < rows - 1 && solution[2 * y + 2][3 * x + 1] !== '#'],
      ] as const
      for (const [neighbor, connected] of neighbors) {
        if (connected && present[neighbor] && !seen.has(neighbor)) {
          seen.add(neighbor)
          region.push(neighbor)
        }
      }
    }
    for (const cell of region) regions[cell] = region
  }
  return regions
}

describe('Glimmith solution edge clues', () => {
  it('decodes horizontal edge fields without reading grid vertices', () => {
    const line = '+-02^^+vv+==+!!+'
    expect(Array.from({ length: 5 }, (_, column) => horizontalGlimmithEdgeMark(line, column)))
      .toEqual(['0', '^', 'v', '=', '!'])
    expect(Array.from({ length: 6 }, (_, column) => glimmithVertexMark(line, column)))
      .toEqual([undefined, '2', undefined, undefined, undefined, undefined])
    expect(horizontalGlimmithEdgeMark('+--4--+', 1)).toBe('-')
    expect(['>', '<', '^', 'v', '0'].map(glimmithInequalityAngle)).toEqual([0, 180, -90, 90, undefined])
  })

  it('matches the area relations on both axes of the authored solutions', () => {
    const counts = { difference: 0, inequality: 0 }
    for (const [id, { board, solution, columns, rows }] of Object.entries(scene.puzzles)) {
      const regions = solutionRegions(board, solution, columns, rows)
      const check = (mark: string | undefined, a: number, b: number, border: string, axis: string) => {
        if (mark === undefined || !/^[0-9<>^v]$/.test(mark)) return
        const label = `${id} ${axis} edge ${a}:${b} ${mark}`
        const first = regions[a]?.length ?? 0
        const second = regions[b]?.length ?? 0
        expect(first > 0 && second > 0 && border === '#', label).toBe(true)
        if (/^[0-9]$/.test(mark)) {
          expect(Math.abs(first - second), label).toBe(Number(mark))
          counts.difference++
        } else {
          expect(mark === '>' || mark === 'v' ? first > second : first < second, label).toBe(true)
          counts.inequality++
        }
      }
      for (let y = 0; y <= rows; y++) {
        for (let x = 0; x < columns; x++) {
          check(horizontalGlimmithEdgeMark(board[2 * y], x), (y - 1) * columns + x, y * columns + x, solution[2 * y][3 * x + 1], 'horizontal')
        }
      }
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x <= columns; x++) {
          check(board[2 * y + 1][3 * x], y * columns + x - 1, y * columns + x, solution[2 * y + 1][3 * x], 'vertical')
        }
      }
    }
    expect(counts).toEqual({ difference: 670, inequality: 618 })
  })

  it('preserves cells adjacent to a vertical numeric edge', () => {
    expect(scene.puzzles['0587.puz'].board[1]).toBe('|..|032..104|')
    expect(scene.puzzles['1211.puz'].board[5]).toBe('|..|..0P2|..|')
    expect(scene.puzzles['1268fix.puz'].board[5]).toBe('|..|F1|..2F3|F1|..1..|..|F3|')
    for (const id of ['0587.puz', '0589.puz', '0920.puz', '1211.puz', '1268fix.puz', '1384.puz'] as const) {
      expect(scene.puzzles[id]).not.toHaveProperty('wideCellClues')
    }
  })

  it('matches numbered vertices to distinct touching regions, excluding empty cells', () => {
    const counts = { '1': 0, '2': 0, '3': 0, '4': 0 }
    const boards = new Set<string>()
    let withEmptyNeighbor = 0
    for (const [id, { board, solution, columns, rows }] of Object.entries(scene.puzzles)) {
      const regions = solutionRegions(board, solution, columns, rows)
      const regionAt = (x: number, y: number) =>
        x >= 0 && x < columns && y >= 0 && y < rows ? regions[y * columns + x] : undefined
      for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
        const mark = glimmithVertexMark(board[2 * y], x)
        if (!mark) continue
        const adjacent = new Set([regionAt(x - 1, y - 1), regionAt(x, y - 1), regionAt(x - 1, y), regionAt(x, y)])
        if (adjacent.delete(undefined)) withEmptyNeighbor++
        expect(adjacent.size, `${id} vertex ${x}:${y}`).toBe(Number(mark))
        counts[mark]++
        boards.add(id)
      }
    }
    expect(counts).toEqual({ '1': 263, '2': 1142, '3': 233, '4': 58 })
    expect(withEmptyNeighbor).toBe(128)
    expect(boards.size).toBe(85)
  })
})
