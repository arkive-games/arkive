import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const terrainFields = ['meshFile', 'hamlet', 'market', 'town', 'countryside', 'sideIsland', 'forestMain', 'forestFragments', 'forestPartTwo']
const generator = fileURLToPath(new URL('./project-glimmith.mjs', import.meta.url))
const prop = (entry, name) => entry?.Data?.find?.((field) => field.Name === name)?.Value

export function readLocalizedName(buffer, namespace, key) {
  const magic = '0e147475674a03fc4a15909dc3377f1b'
  if (buffer.subarray(0, 16).toString('hex') !== magic || buffer[16] !== 3) throw new Error('Expected Unreal LocRes version 3')
  const stringsOffset = Number(buffer.readBigInt64LE(17))
  if (!Number.isSafeInteger(stringsOffset) || stringsOffset < 33 || stringsOffset >= buffer.length) throw new Error('Invalid LocRes string offset')
  let cursor = 25
  const int = () => {
    const value = buffer.readInt32LE(cursor)
    cursor += 4
    return value
  }
  const string = () => {
    const size = int()
    const end = cursor + (size < 0 ? -size * 2 : size)
    if (end > buffer.length) throw new Error('Truncated LocRes string')
    const value = buffer.toString(size < 0 ? 'utf16le' : 'utf8', cursor, end).replace(/\0$/, '')
    cursor = end
    return value
  }
  int() // Total entry count.
  const namespaces = int()
  let index
  for (let i = 0; i < namespaces; i++) {
    int() // Namespace hash.
    const name = string()
    const keys = int()
    for (let j = 0; j < keys; j++) {
      int() // Key hash.
      const entry = string()
      int() // Source string hash.
      const target = int()
      if (name === namespace && entry === key) index = target
    }
  }
  if (cursor !== stringsOffset) throw new Error('Invalid LocRes entry table')
  const count = int()
  if (index == null || index < 0 || index >= count) throw new Error('Missing localized window name')
  for (let i = 0; i <= index; i++) {
    const value = string()
    int() // Reference count.
    if (i === index) return value
  }
}

function readBoard(text) {
  const [header, board, solution] = text.split(/\r?\n(?:PUZZLE|SOLUTION)\r?\n/)
  const dims = /^DIMENSIONS (\d+) (\d+)\r?$/m.exec(header)
  const difficulty = Number(/^DIFFICULTY (\d+)\r?$/m.exec(header)?.[1])
  if (!dims || !board || !solution || difficulty < 1 || difficulty > 7 || !Number.isInteger(difficulty)) {
    throw new Error('Invalid dimensions, difficulty, or frame sections')
  }
  const [, columns, rows] = dims.map(Number)
  const cells = new Set()
  const edges = new Set()
  const frameSize = 2 * rows + 1
  const lines = board.split(/\r?\n/)
  if (!columns || !rows || lines.length < frameSize || solution.split(/\r?\n/).length < frameSize) throw new Error('Incomplete puzzle frames')
  let wideShapeCells = false
  for (let y = 0; y < frameSize; y++) {
    const line = y % 2 ? lines[y].replace(/S\d{2,}/g, () => { wideShapeCells = true; return 'S*' }) : lines[y]
    if (line.slice(3 * columns + 1).trim()) throw new Error('Overwide puzzle board')
    for (let x = y % 2 ? 0 : 1; x <= (y % 2 ? 3 * columns : 3 * columns - 2); x += 3) {
      if (line[x]?.trim()) edges.add(line[x])
    }
    if (y % 2) for (let x = 0; x < columns; x++) {
      const clue = line.slice(3 * x + 1, 3 * x + 3).trim()
      if (clue && clue !== '..') cells.add(clue)
    }
  }
  return {
    headers: new Set([...header.matchAll(/^([A-Z][A-Z_]*)\b/gm)].map((match) => match[1])),
    cells, edges, wideShapeCells,
  }
}

function readAnchor(entry, source, id) {
  const component = source.Exports[prop(entry, 'RootComponent') - 1]
  const location = prop(component, 'RelativeLocation')?.[0]?.Value
  const { X: x, Y: y, Z: z } = location ?? {}
  if (!entry || prop(component, 'AttachParent') || ![x, y, z].every(Number.isFinite)) return null
  return { id, actor: entry.ObjectName, x, y, z }
}

function projectedPixel(anchor, projection) {
  const angle = projection.degrees * Math.PI / 180
  const dx = (projection.centerX - anchor.x) * projection.scale
  const dy = (projection.centerY - anchor.y) * projection.scale
  return [projection.originX + dx * Math.cos(angle) - dy * Math.sin(angle), projection.originY + dx * Math.sin(angle) + dy * Math.cos(angle)]
}

function probeTerrain(root, terrainManifest, anchors, preview) {
  if (!terrainManifest) return { status: 'not-requested', reason: 'Pass a terrain manifest to check support' }
  try {
    const manifest = JSON.parse(readFileSync(terrainManifest, 'utf8'))
    const missing = terrainFields.filter((name) => typeof manifest[name] !== 'string' || !manifest[name].trim())
    if (missing.length) throw new Error('Terrain manifest is missing: ' + missing.join(', '))
    const paths = terrainFields.map((field) => resolve(dirname(terrainManifest), manifest[field]))
    const result = spawnSync(process.execPath, [generator, root, '--probe-support', ...paths], {
      input: JSON.stringify({ anchors }), encoding: 'utf8', windowsHide: true, timeout: 120000,
    })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(result.stderr.split(/\r?\n/).find((line) => /^Error:/.test(line)) ?? 'Geometry probe failed')
    const { width, height, projection, checked, failures } = JSON.parse(result.stdout)
    if (!isDeepStrictEqual({ width, height, projection }, { width: preview.width, height: preview.height, projection: preview.projection })) {
      throw new Error('Generator projection differs from preview. Match the checkout and preview before probing terrain.')
    }
    return { status: 'checked', checked, unsupported: failures }
  } catch (error) {
    return { status: 'blocked', reason: error.message }
  }
}

export function auditWindow({ root, window, entry, source, preview, terrainManifest }) {
  const name = entry.Data.find((field) => field.Name === 'AreaName')
  let localizedName
  try {
    const locres = readFileSync(join(root, '..', 'Localization', 'Game', 'zh-Hans', 'Game.locres'))
    localizedName = { status: 'verified', value: readLocalizedName(locres, name.Namespace, name.Value) }
  } catch (error) {
    localizedName = { status: 'unavailable', reason: error.message }
  }
  const thresholds = ['minObjective', 'silverObjective', 'gildObjective'].map((field) => prop(entry, field) ?? null)
  const missingPuzzleFiles = []
  const invalidPuzzles = []
  const unknownAnchors = []
  const outsideCanvas = []
  const wideShapePuzzles = []
  const anchors = []
  const headers = new Map()
  const cellClues = new Set()
  const edgeMarks = new Set()
  let inspectedPuzzles = 0
  function checkAnchor(actor, id, kind) {
    const anchor = readAnchor(actor, source, id)
    if (!anchor) {
      unknownAnchors.push({ id, kind })
      return null
    }
    const [x, y] = projectedPixel(anchor, preview.projection)
    if (x < 0 || x >= preview.width || y < 0 || y >= preview.height) outsideCanvas.push({ id, kind, x, y })
    return anchor
  }
  checkAnchor(entry, window.key, 'window')
  const refs = prop(entry, 'prerequisites') ?? []
  for (const [index, path] of window.paths.entries()) {
    const puzzleEntry = source.Exports[refs[index].Value - 1]
    const id = prop(puzzleEntry, 'PuzzleFile')
    const anchor = checkAnchor(puzzleEntry, id, 'puzzle')
    if (anchor) anchors.push(anchor)
    const packagePath = 'Geri/Content/' + path
    try {
      const board = readBoard(readFileSync(join(root, '..', path), 'utf8'))
      inspectedPuzzles++
      for (const header of board.headers) headers.set(header, (headers.get(header) ?? 0) + 1)
      for (const clue of board.cells) cellClues.add(clue)
      for (const edge of board.edges) edgeMarks.add(edge)
      if (board.wideShapeCells) wideShapePuzzles.push(id)
    } catch (error) {
      if (error.code === 'ENOENT') missingPuzzleFiles.push(packagePath)
      else invalidPuzzles.push({ path: packagePath, reason: error.message })
    }
  }
  return {
    window: window.key, alreadyMapped: window.mapped, localizedName, thresholds,
    requestedPuzzles: window.paths.length, inspectedPuzzles, missingPuzzleFiles, invalidPuzzles,
    clues: { headers: Object.fromEntries([...headers].sort()), cells: [...cellClues].sort(), edges: [...edgeMarks].sort(), wideShapePuzzles },
    projection: { unknownAnchors, outsideCanvas },
    terrain: probeTerrain(root, terrainManifest, anchors, preview),
  }
}
