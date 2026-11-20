import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Input: cooked AGeri assets exported to JSON with UAssetAPI (UE 4.27).
const [root, output] = process.argv.slice(2)
const readMap = (path) => JSON.parse(readFileSync(join(root, 'Maps', path + '.umap.json'), 'utf8'))
const prop = (entry, name) => entry.Data?.find?.((item) => item.Name === name)?.Value
const vector = (entry, name) => prop(entry, name)?.[0]?.Value
const scene = readMap('PuzzleLevelMainSubmaps/Overworld_Campaign')
const overview = readMap('OverworldMap')
const sources = ['Welcome', 'Zone01_Intro_Bridge', 'Zone01_Intro_Gate_Revised']
for (const name of [...sources, 'Overworld_Campaign']) {
  const stream = overview.Exports.find((entry) => prop(entry, 'WorldAsset')?.AssetPath?.AssetName?.endsWith('/' + name + '.' + name))
  if (!stream || prop(stream, 'LevelTransform')) throw new Error('Expected identity streaming transform: ' + name)
}
const ids = ['Tutorial-1', '0049.puz', 'Tutorial-2', 'Tutorial-3']
const actors = ids.map((id) => {
  const matches = scene.Exports.filter((entry) => prop(entry, 'PuzzleFile') === id)
  if (matches.length !== 1) throw new Error('Expected one actor: ' + id)
  const [entry] = matches
  const component = scene.Exports[prop(entry, 'RootComponent') - 1]
  const { X: x, Y: y, Z: z } = vector(component, 'RelativeLocation')
  if (prop(component, 'AttachParent') || ![x, y, z].every(Number.isFinite)) throw new Error('Invalid root: ' + id)
  const widget = scene.Imports[-prop(entry, 'TutorialWidgetClass') - 1]
  const unlocks = (prop(entry, 'puzzleUnlocks') ?? []).map(({ Value }) => prop(scene.Exports[Value - 1], 'PuzzleFile'))
  return { id, actor: entry.ObjectName, x, y, z, widget: widget?.ObjectName ?? null, unlocks: unlocks.filter((id) => ids.includes(id)) }
})
const bounds = { min: { x: -5500, y: -6500 }, max: { x: 18500, y: 5500 } }
const width = 2048
const height = 1024
const scale = width / (bounds.max.x - bounds.min.x)
const project = (x, y) => [(bounds.max.x - x) * scale, (bounds.max.y - y) * scale]
const surfaces = sources.flatMap((name) => {
  const map = readMap('OverworldSubmaps/' + name)
  return map.Exports.flatMap((entry) => {
    const mesh = map.Imports[-prop(entry, 'StaticMesh') - 1]?.ObjectName
    const loc = vector(entry, 'RelativeLocation')
    if (!loc || !/RuinFloor|WoodenPlatform/i.test(mesh ?? '') || prop(entry, 'AttachParent')) return []
    const [x, y] = project(loc.X, loc.Y)
    if (x < 0 || x > width || y < 0 || y > height) return []
    const s = vector(entry, 'RelativeScale3D')
    const rot = vector(entry, 'RelativeRotation')
    return [{ x, y, z: loc.Z, yaw: Number(rot?.Yaw ?? 0), sx: Math.abs(s?.X ?? 1), sy: Math.abs(s?.Y ?? 1), small: /Small|BrokenA$/.test(mesh), wood: /Wooden/i.test(mesh) }]
  })
})
if (!surfaces.length) throw new Error('No source geometry found')
const rects = surfaces.sort((a, b) => a.z - b.z).map((part) => {
  // Symbols, not mesh outlines. Centers, rotation and scale come from the scene.
  const edge = part.small ? 21 : 35
  const w = edge * part.sx
  const h = edge * part.sy
  return `<rect x="${(-w / 2).toFixed(2)}" y="${(-h / 2).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${part.wood ? '#ad9878' : '#c0c6b8'}" stroke="#788c8b" stroke-width="1.5" transform="translate(${part.x.toFixed(2)} ${part.y.toFixed(2)}) rotate(${part.yaw})"/>`
})
const puzzle = readFileSync(join(root, 'Puzzles/Zone1/1-single-shape/0049.puz'), 'utf8')
const [columns, rows] = puzzle.match(/^DIMENSIONS (\d+) (\d+)\r?$/m).slice(1).map(Number)
const board = puzzle.split(/\r?\nPUZZLE\r?\n/)[1].split(/\r?\nSOLUTION\r?\n/)
const frames = board.map((part) => part.split(/\r?\n/).slice(0, 2 * rows + 1).map((line) => line.padEnd(3 * columns + 1)))
if (frames.some((frame) => frame.length !== 2 * rows + 1)) throw new Error('Invalid puzzle dimensions')
writeFileSync(join(output, 'glimmith-scene.json'), JSON.stringify({ bounds, width, height, sources, surfaceCount: surfaces.length, actors, puzzle: { columns, rows, board: frames[0], solution: frames[1] } }, null, 2) + '\n')
for (let tile = 0; tile < width / height; tile++) {
  const x = tile * height
  writeFileSync(join(output, `glimmith-terrain-${tile}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="${height}" height="${height}" viewBox="${x} 0 ${height} ${height}"><rect x="${x}" width="${height}" height="${height}" fill="#243e4c"/>${rects.join('')}</svg>\n`)
}
