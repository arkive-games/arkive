import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Input: cooked AGeri assets exported to JSON with UAssetAPI (UE 4.27).
const [root, output, meshFile] = process.argv.slice(2)
const meshes = JSON.parse(readFileSync(meshFile, 'utf8'))
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
const ids = ['Tutorial-1', '0049.puz', '0643.puz', '0050.puz', '0067B.puz', '0066.puz', '0008.puz', '0527.puz', 'Tutorial-2', 'Tutorial-3']
const actors = ids.map((id) => {
  const matches = scene.Exports.filter((entry) => prop(entry, 'PuzzleFile') === id)
  if (matches.length !== 1) throw new Error('Expected one actor: ' + id)
  const [entry] = matches
  const component = scene.Exports[prop(entry, 'RootComponent') - 1]
  const { X: x, Y: y, Z: z } = vector(component, 'RelativeLocation')
  if (prop(component, 'AttachParent') || ![x, y, z].every(Number.isFinite)) throw new Error('Invalid root: ' + id)
  const widget = scene.Imports[-prop(entry, 'TutorialWidgetClass') - 1]
  const unlocks = (prop(entry, 'puzzleUnlocks') ?? []).map(({ Value }) => prop(scene.Exports[Value - 1], 'PuzzleFile'))
  return { id, actor: entry.ObjectName, x, y, z, widget: widget?.ObjectName ?? null, directory: prop(entry, 'PuzzleDirectory') ?? null, unlocks: unlocks.filter((id) => ids.includes(id)) }
})
const windows = ['Bridge', 'Gate'].map((key) => {
  const actor = 'BP_StainedGlassPlinth_' + key
  const entry = scene.Exports.find((entry) => entry.ObjectName === actor)
  const component = scene.Exports[prop(entry, 'RootComponent') - 1]
  const { X: x, Y: y, Z: z } = vector(component, 'RelativeLocation')
  if (prop(component, 'AttachParent') || ![x, y, z].every(Number.isFinite)) throw new Error('Invalid window root: ' + actor)
  const prerequisites = prop(entry, 'prerequisites').map(({ Value }) => prop(scene.Exports[Value - 1], 'PuzzleFile'))
  const thresholds = ['minObjective', 'silverObjective', 'gildObjective'].map((key) => prop(entry, key))
  if (prerequisites.some((id) => !id) || thresholds.some((n) => !Number.isInteger(n) || n > prerequisites.length)) throw new Error('Invalid window requirements: ' + actor)
  const name = entry.Data.find(({ Name }) => Name === 'AreaName')?.CultureInvariantString
  if (!name) throw new Error('Missing source window name: ' + actor)
  return { id: 'window-' + key.toLowerCase(), actor, x, y, z, name, thresholds, prerequisites }
})
const width = 2048
const height = 2048
const tileSize = 1024
const projection = { centerX: 6500, centerY: -500, degrees: -59, scale: width / 24800 }
const angle = projection.degrees * Math.PI / 180
const project = (x, y) => {
  const dx = (projection.centerX - x) * projection.scale
  const dy = (projection.centerY - y) * projection.scale
  return [width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle), height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle)]
}
const cross = ([ax, ay], [bx, by], [cx, cy]) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
function hull(points) {
  const sorted = points.toSorted(([ax, ay], [bx, by]) => ax - bx || ay - by)
  const chain = (points) => points.reduce((out, point) => {
    while (out.length > 1 && cross(out.at(-2), out.at(-1), point) <= 0) out.pop()
    out.push(point)
    return out
  }, []).slice(0, -1)
  return [...chain(sorted), ...chain(sorted.toReversed())]
}

function transform(loc, rot, scale) {
  const rad = (degrees) => Number(degrees ?? 0) * Math.PI / 180
  const roll = -rad(rot?.Roll)
  const pitch = -rad(rot?.Pitch)
  const yaw = rad(rot?.Yaw)
  return ([x, y, z]) => {
    x *= Number(scale?.X ?? 1)
    y *= Number(scale?.Y ?? 1)
    z *= Number(scale?.Z ?? 1)
    ;[y, z] = [y * Math.cos(roll) - z * Math.sin(roll), y * Math.sin(roll) + z * Math.cos(roll)]
    ;[x, z] = [x * Math.cos(pitch) + z * Math.sin(pitch), -x * Math.sin(pitch) + z * Math.cos(pitch)]
    return [
      Number(loc.X) + x * Math.cos(yaw) - y * Math.sin(yaw),
      Number(loc.Y) + x * Math.sin(yaw) + y * Math.cos(yaw),
      Number(loc.Z) + z,
    ]
  }
}

const surfaces = sources.flatMap((name) => {
  const map = readMap('OverworldSubmaps/' + name)
  return map.Exports.flatMap((entry) => {
    const mesh = map.Imports[-prop(entry, 'StaticMesh') - 1]?.ObjectName
    const loc = vector(entry, 'RelativeLocation')
    if (!loc || !/RuinFloor|WoodenPlatform|Brick_Floor|CircularA|Flatrock|RuinWall.*_Top|RuinTrim/i.test(mesh ?? '') || prop(entry, 'AttachParent')) return []
    const [x, y] = project(loc.X, loc.Y)
    if (x < 0 || x > width || y < 0 || y > height) return []
    const model = meshes[mesh]
    if (!model) throw new Error('Missing mesh: ' + mesh)
    const vertices = model.vertices.map(transform(loc, vector(entry, 'RelativeRotation'), vector(entry, 'RelativeScale3D')))
    const outline = hull(vertices.map(([x, y]) => project(x, y)))
    if (outline.length < 3) return []
    return [{ outline, mesh, zMin: Math.min(...vertices.map((v) => v[2])), zMax: Math.max(...vertices.map((v) => v[2])) }]
  })
})
if (!surfaces.length) throw new Error('No source geometry found')
const pointList = (points) => points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
for (const actor of actors) {
  const point = project(actor.x, actor.y)
  const support = surfaces.filter(({ outline, zMin, zMax }) =>
    actor.z >= zMin - 70 && actor.z <= zMax + 110 &&
    outline.every((a, i) => cross(a, outline[(i + 1) % outline.length], point) >= -0.01))
  if (!support.length) throw new Error('Marker has no nearby-height mesh footprint: ' + actor.id)
  if (point[0] < 0 || point[0] >= width || point[1] < 0 || point[1] >= height) throw new Error('Marker outside projection: ' + actor.id)
  actor.pixel = { x: point[0], y: point[1] }
  actor.supportMeshes = [...new Set(support.map(({ mesh }) => mesh))].sort()
}
for (const window of windows) {
  const [x, y] = project(window.x, window.y)
  if (x < 0 || x >= width || y < 0 || y >= height) throw new Error('Window outside projection: ' + window.id)
  window.pixel = { x, y }
}
const silhouettes = surfaces.sort((a, b) => a.zMax - b.zMax).map(({ outline, mesh }) =>
  `<polygon points="${pointList(outline)}" fill="${/Wooden/i.test(mesh) ? '#ad9878' : '#c0c6b8'}" stroke="#788c8b" stroke-width="1.2"/>`)

// Orthographic web marker renders of the exact scene mesh assets.
for (const [id, mesh] of [['note', 'SM_Scroll_001'], ['puzzle', 'SM_Plinth_V004'], ['window', 'sm_RuinMomument_LargeA']]) {
  const { vertices, indices } = meshes[mesh]
  const topZ = Math.max(...vertices.map((point) => point[2]))
  // Yaw around world up first, then tilt the camera without rolling the icon.
  const yaw = id === 'note' ? 0 : Math.PI / 4
  const elevation = Math.PI / 6
  const points = vertices.map(([x, y, z]) => {
    const depth = -x * Math.sin(yaw) + y * Math.cos(yaw)
    return [
      x * Math.cos(yaw) + y * Math.sin(yaw),
      depth * Math.cos(elevation) - z * Math.sin(elevation),
      depth * Math.sin(elevation) + z * Math.cos(elevation),
    ]
  })
  const extrema = [0, 2].map((axis) => {
    const values = points.map((p) => p[axis])
    return [Math.min(...values), Math.max(...values)]
  })
  const zoom = 54 / Math.max(...extrema.map(([min, max]) => max - min))
  const centered = ([x, , z]) => [32 + zoom * (x - (extrema[0][0] + extrema[0][1]) / 2), 32 - zoom * (z - (extrema[1][0] + extrema[1][1]) / 2)]
  const faces = []
  for (let i = 0; i < indices.length; i += 3) {
    const points3d = indices.slice(i, i + 3).map((index) => points[index])
    const polygon = points3d.map(centered)
    const area = cross(...polygon)
    if (Math.abs(area) < 0.015) continue
    const [a, b, c] = points3d
    const u = b.map((val, j) => val - a[j])
    const v = c.map((val, j) => val - a[j])
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const shade = 0.70 + 0.29 * Math.abs((normal[0] * 0.35 + normal[1] * 0.72 + normal[2] * 0.6) / Math.hypot(...normal))
    const original = indices.slice(i, i + 3).map((index) => vertices[index])
    const top = original.every((p) => p[2] > 0.78 * topZ)
    const light = id === 'window' ? [224, 181, 104] : id === 'note' ? [237, 203, 141] : top ? [252, 217, 157] : [226, 235, 239]
    faces.push({ depth: (a[1] + b[1] + c[1]) / 3, fill: light.map((value) => Math.round(value * shade)).join(','), polygon })
  }
  const art = faces.sort((a, b) => b.depth - a.depth).map(({ fill, polygon }) =>
    `<polygon points="${pointList(polygon)}" fill="rgb(${fill})" stroke="rgb(${fill})" stroke-width=".35"/>`).join('')
  writeFileSync(join(output, `glimmith-marker-${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><title>${mesh}</title>${art}</svg>\n`)
}
const puzzles = Object.fromEntries(actors.filter(({ directory }) => directory).map(({ id, directory }) => {
  const puzzle = readFileSync(join(root, '..', directory, id), 'utf8')
  const [columns, rows] = puzzle.match(/^DIMENSIONS (\d+) (\d+)\r?$/m).slice(1).map(Number)
  const board = puzzle.split(/\r?\nPUZZLE\r?\n/)[1].split(/\r?\nSOLUTION\r?\n/)
  const frames = board.map((part) => part.split(/\r?\n/).slice(0, 2 * rows + 1).map((line) => line.padEnd(3 * columns + 1)))
  if (frames.length !== 2 || frames.some((frame) => frame.length !== 2 * rows + 1)) throw new Error('Invalid puzzle dimensions: ' + id)
  const difficulty = Number(puzzle.match(/^DIFFICULTY (\d+)\r?$/m)?.[1])
  if (!Number.isInteger(difficulty) || difficulty < 1) throw new Error('Missing puzzle difficulty: ' + id)
  return [id, { columns, rows, difficulty, board: frames[0], solution: frames[1] }]
}))
writeFileSync(join(output, 'glimmith-scene.json'), JSON.stringify({ projection, width, height, tileSize, sources, surfaceCount: surfaces.length, actors, windows, puzzles }, null, 2) + '\n')
for (let row = 0; row < height / tileSize; row++) {
  for (let column = 0; column < width / tileSize; column++) {
    const x = column * tileSize
    const y = row * tileSize
    writeFileSync(join(output, `glimmith-terrain-${row * (width / tileSize) + column}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="${tileSize}" viewBox="${x} ${y} ${tileSize} ${tileSize}"><rect x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" fill="#243e4c"/>${silhouettes.join('')}</svg>\n`)
  }
}
