import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeGlimmithScene } from './write-glimmith-scene.mjs'

// Input: cooked AGeri assets exported to JSON with UAssetAPI (UE 4.27).
const [root, output, meshFile, terrainFile, marketTerrainDir, townTerrainDir, countrysideTerrainDir, sideIslandTerrainDir, forestTerrainDir, fragmentsTerrainDir, forestPartTwoTerrainDir, sideIsland2TerrainDir, sideIsland3TerrainDir, finaleTerrainDir, bonusTerrainDir, spiralTerrainDir, zone03TerrainDir] = process.argv.slice(2)
const meshes = JSON.parse(readFileSync(meshFile, 'utf8'))
const readMap = (path) => JSON.parse(readFileSync(join(root, 'Maps', path + '.umap.json'), 'utf8'))
const prop = (entry, name) => entry.Data?.find?.((item) => item.Name === name)?.Value
const vector = (entry, name) => prop(entry, name)?.[0]?.Value
const scene = readMap('PuzzleLevelMainSubmaps/Overworld_Campaign')
const overview = readMap('OverworldMap')
const townMain = 'Zone01_Town_Main'
const townLower = 'Zone1_Town_Main_Underneath'
const countryside = 'Zone01_Countryside'
const forestMain = 'Zone02_Forest_Main'
const sideIsland = 'Zone02_SideIsland'
const sideIsland2 = 'Zone02_SideIsland2'
const forestFragments = 'Zone02_ForestFragments'
const forestPartTwo = 'Zone02_Forest_Main_Part2'
const sideIsland3 = 'Zone02_SideIsland3'
const finale = 'Zone02_Finale'
const zone03ThreeWay = 'Zone03_3way'
const zone03FourWay = 'Zone03_4way'
const zone03Radar = 'Zone03_Radar_2'
const zone03CastleRoom = 'Zone03_CastleRoom'
const zone03Diff = 'Zone03_Diff'
const zone03HedgeMaze = 'Zone03_HedgeMazeGarden_2'
const zone03Ineq = 'Zone03_Ineq'
const zone03Bonus = 'Zone03_Bonus'
const zone03Spiral = 'Zone03_Silke1'
const zone03Finale = 'Zone03_Finale'
const supplementalSources = new Set([sideIsland2, sideIsland3, finale, zone03ThreeWay, zone03FourWay, zone03Radar, zone03CastleRoom, zone03Diff, zone03HedgeMaze, zone03Ineq, zone03Bonus, zone03Spiral, zone03Finale])
const sources = ['Welcome', 'Zone01_Intro_Bridge', 'Zone01_Intro_Gate_Revised', 'Zone01_Hamlet', 'Zone01_Cathedral', 'Zone01_Market1', townMain, townLower, countryside, forestMain, sideIsland, sideIsland2, forestFragments, forestPartTwo, sideIsland3, finale, zone03ThreeWay, zone03FourWay, zone03Radar, zone03CastleRoom, zone03Diff, zone03HedgeMaze, zone03Ineq, zone03Bonus, zone03Spiral, zone03Finale]
for (const name of [...sources, 'Overworld_Campaign']) {
  const stream = overview.Exports.find((entry) => prop(entry, 'WorldAsset')?.AssetPath?.AssetName?.endsWith('/' + name + '.' + name))
  if (!stream || prop(stream, 'LevelTransform')) throw new Error('Expected identity streaming transform: ' + name)
}
const windows = [
  ['Bridge', 'bridge'], ['Gate', 'gate'], ['GeminiDelta', 'gemini-delta'], ['SlashPack', 'rose-windows'], ['ShapeBank', 'shape-bank'],
  ['Precision', 'precision'], ['Polyomino', 'polyomino'],
  ['Mingle', 'mingle'], ['ForestTrailhead', 'forest-trailhead'],
  ['Match', 'match'],
  ['AreaNumber', 'area-number'],
  ['Range', 'range'],
  ['SizeSeparation', 'size-separation'],
  ['Boxy', 'boxy'], ['NonBoxy', 'non-boxy'],
  ['Solitude', 'solitude'], ['CastleGates', 'castle-gates'],
  ['Bricky', 'bricky'], ['Compass', 'compass'],
  ['Difference', 'difference'], ['HedgeMaze', 'hedge-maze'],
  ['Inequality', 'inequality'], ['Loopy', 'loopy'],
  ['Mismatch', 'mismatch'], ['Palisade', 'palisade'],
  ['SecludedGarden', 'secluded-garden'], ['Spiral', 'spiral'],
  ['Watchtower', 'watchtower'],
  ['Glimmith', 'perfected-windows'],
].map(([key, id]) => {
  const actor = 'BP_StainedGlassPlinth_' + key
  const entry = scene.Exports.find((entry) => entry.ObjectName === actor)
  const component = scene.Exports[prop(entry, 'RootComponent') - 1]
  const { X: x, Y: y, Z: z } = vector(component, 'RelativeLocation')
  if (prop(component, 'AttachParent') || ![x, y, z].every(Number.isFinite)) throw new Error('Invalid window root: ' + actor)
  const prerequisites = (prop(entry, 'prerequisites') ?? []).map(({ Value }) => prop(scene.Exports[Value - 1], 'PuzzleFile'))
  const thresholds = ['minObjective', 'silverObjective', 'gildObjective'].map((key) => prop(entry, key))
  const name = entry.Data.find(({ Name }) => Name === 'AreaName')?.CultureInvariantString
  if (!name) throw new Error('Missing source window name: ' + actor)
  if (prerequisites.some((id) => !id) || thresholds.some((n) => !Number.isInteger(n) || n < 0)) throw new Error('Invalid window requirements: ' + actor)
  if (key === 'Glimmith') {
    const references = prop(entry, 'windowPrerequisites') ?? []
    const prerequisiteActors = references.map(({ Value }) => scene.Exports[Value - 1]?.ObjectName)
    const unlockPuzzles = (prop(entry, 'puzzleUnlocks') ?? []).map(({ Value }) => prop(scene.Exports[Value - 1], 'PuzzleFile'))
    if (prerequisites.length || !prerequisiteActors.length ||
        new Set(prerequisiteActors).size !== prerequisiteActors.length ||
        thresholds.some((n) => n > prerequisiteActors.length) || !unlockPuzzles.length || unlockPuzzles.some((id) => !id)) {
      throw new Error('Invalid finale window requirements: ' + actor)
    }
    return { id: 'window-' + id, actor, x, y, z, name, thresholds, prerequisites, prerequisiteActors, unlockPuzzles }
  }
  if (!prerequisites.length || thresholds.some((n) => n > prerequisites.length)) throw new Error('Invalid puzzle thresholds: ' + actor)
  return { id: 'window-' + id, actor, x, y, z, name, thresholds, prerequisites }
})
const windowsByActor = new Map(windows.map((window) => [window.actor, window]))
const windowsWithLinks = windows.map(({ prerequisiteActors, ...window }) => {
  if (!prerequisiteActors) return window
  const windowPrerequisites = prerequisiteActors.map((actor) => {
    const target = windowsByActor.get(actor)
    if (!target || target.prerequisiteActors) throw new Error('Invalid prerequisite window: ' + actor)
    return target.id
  })
  const unlockedArea = windows.find(({ prerequisites }) => prerequisites.length === window.unlockPuzzles.length &&
    prerequisites.every((id) => window.unlockPuzzles.includes(id)))
  if (!unlockedArea) throw new Error('Finale unlock list does not match a mapped area')
  return { ...window, windowPrerequisites, unlockedAreaId: unlockedArea.id }
})
const projectedSupportMeshes = new Map([
  ['0479.puz', ['SM_Rock_02']],
])
const ids = new Set(['Tutorial-1', ...windows.flatMap(({ prerequisites }) => prerequisites), 'Tutorial-2', 'Tutorial-3'])
const actors = [...ids].map((id) => {
  const matches = scene.Exports.filter((entry) => prop(entry, 'PuzzleFile') === id)
  if (matches.length !== 1) throw new Error('Expected one actor: ' + id)
  const [entry] = matches
  const component = scene.Exports[prop(entry, 'RootComponent') - 1]
  const { X: x, Y: y, Z: z } = vector(component, 'RelativeLocation')
  if (prop(component, 'AttachParent') || ![x, y, z].every(Number.isFinite)) throw new Error('Invalid root: ' + id)
  const widget = scene.Imports[-prop(entry, 'TutorialWidgetClass') - 1]
  const directory = prop(entry, 'PuzzleDirectory') ?? null
  if (Boolean(widget) === Boolean(directory)) throw new Error('Expected a tutorial widget or puzzle file: ' + id)
  const unlocks = (prop(entry, 'puzzleUnlocks') ?? []).map(({ Value }) => prop(scene.Exports[Value - 1], 'PuzzleFile'))
  const unlockCategory = prop(entry, 'UnlockCategory')?.replace(/^EUnlockCategory::/, '') ?? null
  return { id, actor: entry.ObjectName, x, y, z, widget: widget?.ObjectName ?? null, directory, unlocks: unlocks.filter((id) => ids.has(id)), unlockCategory }
})
const width = 9216
const height = 12288
const tileSize = 1024
const projection = { centerX: 4300, centerY: -3000, originX: 1536, originY: 10240, degrees: -59, scale: 2048 / 30500 }
const angle = projection.degrees * Math.PI / 180
const project = (x, y) => {
  const dx = (projection.centerX - x) * projection.scale
  const dy = (projection.centerY - y) * projection.scale
  return [projection.originX + dx * Math.cos(angle) - dy * Math.sin(angle), projection.originY + dx * Math.sin(angle) + dy * Math.cos(angle)]
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

const platformMeshes = /RuinFloor|WoodenPlatform|Brick_Floor|CircularA|Flatrock|RuinWall.*_Top|RuinTrim|RuinStair_MediumA(?:_CorOutA)?$|Brick_Stairs|Wood_Stairs|Wood_Planks_Prefab|Wood_Plank_0[1-5]_SM/i
const landmarkMeshes = /^(Brick_Pillar_SM|Brick_Arch_01_SM|Building_Prefab_02_Open_SM|sm_RuinWall_FullTallA_Mid|sm_RuinTowerA_Mid|sm_RuinPillar_LargeShortA_Base)$/i
const marketWalkways = new Set(['Awning_Wood_SM', 'Bridge_SM', 'SM_House_Passage'])
const townWalkways = /^(?:Awning_Wood_SM|Bridge_SM|SM_House_Passage|SM_WoodenPlank_0[1-3]|sm_RuinStair_MediumB)$/i
const townBrickWalls = /^Brick_Wall_0[1-3]_SM$/
const passageMeshes = new Set(['SM_Bridge', 'Boarding_Plank_W_Rails_SM', 'Ladder_SM'])
const dockPlanks = /^SM_WoodenPlank_0[1-3]$/
const rockMeshes = new Set(['SM_Rock_01', 'SM_Rock_01_cut', 'SM_Rock_02', 'Rock_01_SM', 'Rock_Pile_SM'])
const bonusRockInstances = /^SM_RoundRock_0[1-3]$/
const dockRockMeshes = new Set(['SM_Rock_05', 'SM_Rock_06_cut'])
const shipMesh = 'Base_Ship_Full_Static_SM'
const shipMaterials = {
  Main_Hull_MI: 'ship',
  Deck_MI: 'deck',
  Rear_Deck_MI: 'deck',
  Rails_Ramp_MI: 'deck',
  Back_Room_MI: 'cabin',
}
const meshName = (pkg, entry) => pkg.Imports[-prop(entry, 'StaticMesh') - 1]?.ObjectName
const componentTransform = (entry) => transform(vector(entry, 'RelativeLocation') ?? { X: 0, Y: 0, Z: 0 }, vector(entry, 'RelativeRotation'), vector(entry, 'RelativeScale3D'))
const floorModules = [
  ['Module_BrokenFloor_Gothic_001', 'Maps/Modules/Gothic'],
  ['Module_BrokenFloor_Gothic_002', 'Maps/Modules/Gothic'],
  ['BP_Ground_Bricks', '../StylizedProvencal/Blueprints'],
]
const moduleParts = new Map(floorModules.map(([name, dir]) => {
  const pkg = JSON.parse(readFileSync(join(root, dir, name + '.uasset.json'), 'utf8'))
  return [name + '_C', pkg.Exports.filter((entry) => meshName(pkg, entry)).map((entry) => ({
    entry, mesh: meshName(pkg, entry), template: entry.ObjectName,
  }))]
}))
const identity = (point) => point
function bonusFoliageTransforms(entry) {
  // The UE 4.27 instance array starts with its stride and count, then row-major matrices.
  const data = Buffer.from(entry.Extras, 'base64')
  const stride = 64
  if (data.length < 16 || data.readInt32LE(8) !== stride) throw new Error('Invalid foliage instance array: ' + entry.ObjectName)
  const count = data.readInt32LE(12)
  if (count < 0 || 16 + count * stride > data.length) throw new Error('Invalid foliage instance count: ' + entry.ObjectName)
  return Array.from({ length: count }, (_, index) => {
    const matrix = Array.from({ length: 16 }, (_, i) => data.readFloatLE(16 + index * stride + i * 4))
    if (!matrix.every(Number.isFinite) || matrix[15] !== 1) throw new Error('Invalid foliage transform: ' + entry.ObjectName)
    return ([x, y, z]) => [0, 1, 2].map((i) => matrix[i] * x + matrix[i + 4] * y + matrix[i + 8] * z + matrix[i + 12])
  })
}
const surfaces = sources.flatMap((name) => {
  const map = readMap('OverworldSubmaps/' + name)
  const components = map.Exports.flatMap((entry) => {
    const className = map.Imports[-entry.ClassIndex - 1]?.ObjectName
    const mesh = meshName(map, entry)
    if (name === zone03Bonus && bonusRockInstances.test(mesh) && className === 'FoliageInstancedStaticMeshComponent') {
      const parent = map.Exports[prop(entry, 'AttachParent') - 1]
      return bonusFoliageTransforms(entry).map((localTransform) => ({
        entry, mesh, parentTransform: componentTransform(parent), localTransform,
      }))
    }
    const parts = moduleParts.get(className)
    if (!parts) return [{ entry, mesh, parentTransform: identity }]
    const parent = map.Exports[prop(entry, 'RootComponent') - 1]
    const instances = new Map(entry.Data.flatMap(({ Value }) => {
      const instance = typeof Value === 'number' ? map.Exports[Value - 1] : undefined
      return instance && map.Imports[-instance.TemplateIndex - 1]?.ObjectName
        ? [[map.Imports[-instance.TemplateIndex - 1].ObjectName, instance]] : []
    }))
    return parts.map(({ entry: template, mesh, template: key }) => {
      const instance = instances.get(key)
      if (!instance) throw new Error('Missing floor module instance: ' + key)
      const loc = vector(instance, 'RelativeLocation') ?? vector(template, 'RelativeLocation') ?? { X: 0, Y: 0, Z: 0 }
      const rot = vector(instance, 'RelativeRotation') ?? vector(template, 'RelativeRotation')
      const scale = vector(instance, 'RelativeScale3D') ?? vector(template, 'RelativeScale3D')
      return { entry: template, mesh, parentTransform: componentTransform(parent), localTransform: transform(loc, rot, scale) }
    })
  })
  return components.flatMap(({ entry, mesh, parentTransform, localTransform }) => {
    const loc = vector(entry, 'RelativeLocation')
    if ((!loc && !localTransform) || !mesh || (!localTransform && prop(entry, 'AttachParent'))) return []
    const isDockPlank = name === 'Welcome' && dockPlanks.test(mesh)
    const isIslandRock = name === sideIsland && /^(?:SM_SquareRock_0[123]|SM_Rock_06)$/.test(mesh)
    const isForest = [forestMain, forestFragments, forestPartTwo, sideIsland3, finale].includes(name)
    const isForestRock = isForest && /^(?:SM_SquareRock_0[123]|SM_Rock_05|SM_Rock_0[26]_cut)$/.test(mesh)
    const isRock = rockMeshes.has(mesh) || (name === 'Welcome' && dockRockMeshes.has(mesh)) || /Flatrock/i.test(mesh) || isIslandRock || isForestRock ||
      (name === forestMain && mesh === 'SM_RockBrick_Small_03') || (name === zone03Bonus && bonusRockInstances.test(mesh))
    const isLadder = mesh === 'Ladder_SM'
    const isMarketWalkway = name === 'Zone01_Market1' && marketWalkways.has(mesh)
    const isTownWalkway = (name === townMain || name === townLower || name === countryside) && townWalkways.test(mesh)
    const isBrickWall = (name === townMain || isForest) && townBrickWalls.test(mesh)
    const isForestPlatform = (isForest || name === sideIsland) && mesh === 'Brick_Circle_01_SM'
    const isBrickStep = (name === sideIsland || isForest) && mesh === 'Brick_09_SM'
    const isForestBridge = isForest && /^(?:Bridge_SM|sm_RuinwoodenPlanks_PathA)$/i.test(mesh)
    const isForestPedestal = name === forestPartTwo && mesh === 'sm_RuinPillar_LargeRoundExtraShortA_Base'
    const isLandmark = (name !== 'Welcome' && landmarkMeshes.test(mesh)) ||
      (name === 'Zone01_Cathedral' && mesh === 'Cube' && ['Cube_8', 'Cube14'].includes(map.Exports[entry.OuterIndex - 1]?.ObjectName))
    const isCastleWillow = name === zone03CastleRoom && mesh === 'SM_Plant_Tree_Willow_04_B' &&
      map.Exports[entry.OuterIndex - 1]?.ObjectName === 'SM_Plant_Tree_Willow_04_B8'
    const isSupplementalRegionMesh = supplementalSources.has(name) && meshes[mesh] &&
      !/^(?:Door_SM|Lattice_SM|Plane|Sphere)$/i.test(mesh) &&
      !/(?:Bush|Flower|Foliage|Grass|Mushroom|Plant|Tree)/i.test(mesh)
    if (!isSupplementalRegionMesh && !platformMeshes.test(mesh) && !isRock && !isLandmark && !isCastleWillow && !passageMeshes.has(mesh) && !isDockPlank && !isMarketWalkway && !isTownWalkway && !isBrickWall && !isForestPlatform && !isBrickStep && !isForestBridge && !isForestPedestal && !localTransform && mesh !== shipMesh) return []
    const model = meshes[mesh]
    if (!model) throw new Error('Missing mesh: ' + mesh)
    const place = localTransform ?? componentTransform(entry)
    const vertices = model.vertices.map((point) => parentTransform(place(point)))
    const points = vertices.map(([x, y]) => project(x, y))
    if (points.every(([x]) => x < 0) || points.every(([x]) => x > width) ||
        points.every(([, y]) => y < 0) || points.every(([, y]) => y > height)) return []
    const surface = (kind, indices, faces = []) => {
      const outline = hull(indices ? indices.map((i) => points[i]) : points)
      if (outline.length < 3) return []
      const heights = indices ? indices.map((i) => vertices[i][2]) : vertices.map((v) => v[2])
      return [{ outline, mesh, kind, faces, zMin: Math.min(...heights), zMax: Math.max(...heights) }]
    }
    const triangles = (indices, include = () => true) => {
      const faces = []
      for (let i = 0; i < indices.length; i += 3) {
        const triangle = indices.slice(i, i + 3)
        if (!include(triangle)) continue
        const face = triangle.map((i) => points[i])
        const area = cross(...face)
        if (Math.abs(area) > 0.01) faces.push(area < 0 ? face.reverse() : face)
      }
      return faces
    }
    if (isCastleWillow) {
      if (!model.sections?.length || !model.indices.length) throw new Error('Missing willow material sections')
      return model.sections.flatMap(({ material, FirstIndex, NumTriangles }) => {
        const indices = model.indices.slice(FirstIndex, FirstIndex + 3 * NumTriangles)
        return surface(material.includes('Leaves') ? 'canopy' : 'trunk', indices, triangles(indices))
          .map((part) => ({ ...part, witnessVertices: [...new Set(indices)].map((i) => [points[i], vertices[i][2]]) }))
      })
    }
    if (mesh === shipMesh) {
      if (!model.sections?.some(({ material }) => material === 'Main_Hull_MI') || !model.indices.length) {
        throw new Error('Missing source ship material sections')
      }
      return model.sections.flatMap(({ material, FirstIndex, NumTriangles }) => {
        const indices = model.indices.slice(FirstIndex, FirstIndex + 3 * NumTriangles)
        if (material === 'Cloth_Sail_M') {
          // Draw the two wings independently so their convex hull cannot cover the open air between them.
          return [-1, 1].flatMap((side) => surface('sail', indices.filter((i) => side * model.vertices[i][1] > 650)))
        }
        if (material === 'Wing_Socket_MI' || material === 'Ship_Parts_Wood_MI' || material === 'Ship_Parts_Metal_MI') {
          // Keep the low wing frame without projecting the overhead balloon rigging onto the deck.
          const faces = triangles(indices, (triangle) => {
            const local = triangle.map((i) => model.vertices[i])
            return local.every(([x, , z]) => x >= -130 && x <= 790 && z <= 430) &&
              local.some(([, y]) => Math.abs(y) >= 410)
          })
          return faces.length ? surface('wing-frame', indices, faces) : []
        }
        const kind = shipMaterials[material]
        return kind ? surface(kind, indices) : []
      })
    }
    const kind = isLadder ? 'ladder'
      : isRock ? 'rock'
      : passageMeshes.has(mesh) || isDockPlank || /^(?:Awning_Wood_SM|Bridge_SM)$|Wooden|Wood_Stairs|Wood_Plank/i.test(mesh) ? 'wood'
      : isLandmark ? 'landmark' : 'stone'
    if (isLadder && !model.indices.length) throw new Error('Missing ladder triangles')
    return surface(kind, undefined, isLadder ? triangles(model.indices) : [])
  })
})
const hamlet = readMap('OverworldSubmaps/Zone01_Hamlet')
const terrain = hamlet.Exports.find((entry) => hamlet.Imports[-entry.ClassIndex - 1]?.ObjectName === 'LandscapeComponent')
const quads = prop(terrain, 'ComponentSizeQuads')
const size = quads + 1
const terrainPixels = readFileSync(terrainFile)
const planeBytes = 4 * size * size
if (terrainPixels.length !== 3 * planeBytes) throw new Error('Invalid BGRA8 Hamlet terrain textures')
const landscapeTransform = componentTransform(hamlet.Exports[prop(terrain, 'AttachParent') - 1])
const channel = (texture, x, y, bgra) => terrainPixels[texture * planeBytes + 4 * (y * size + x) + bgra]
const decodeHeight = (red, green) => (red * 256 + green - 32768) / 128
const terrainColors = [
  [151, 168, 119], [175, 164, 127], [161, 167, 151], [158, 142, 112], [121, 143, 106],
]
function addLandscape({ mesh, quads, place, elevation, hidden, paint }) {
  const stride = 2
  for (let y = 0; y < quads; y += stride) {
    for (let x = 0; x < quads; x += stride) {
      const x1 = Math.min(x + stride, quads)
      const y1 = Math.min(y + stride, quads)
      const quad = [[x, y], [x1, y], [x1, y1], [x, y1]]
      const u = Math.round((x + x1) / 2)
      const v = Math.round((y + y1) / 2)
      if (hidden(u, v)) continue
      const weights = paint(u, v)
      const mass = weights.reduce((total, weight) => total + weight, 0)
      const tint = terrainColors[0].map((fallback, axis) =>
        mass ? Math.round(weights.reduce((sum, weight, index) => sum + weight * terrainColors[index][axis], 0) / (4 * mass)) * 4 : fallback)
      const outline = hull(quad.map(([u, v]) => project(...place([u, v, elevation(u, v)]))))
      const heights = []
      for (let v = y; v <= y1; v++) {
        for (let u = x; u <= x1; u++) heights.push(place([u, v, elevation(u, v)])[2])
      }
      surfaces.push({ outline, mesh, kind: 'ground', faces: [], tint, zMin: Math.min(...heights), zMax: Math.max(...heights) })
    }
  }
}
addLandscape({
  mesh: 'BeautyCorner_Landscape_8', quads, place: landscapeTransform,
  elevation: (x, y) => decodeHeight(channel(0, x, y, 2), channel(0, x, y, 1)),
  hidden: (x, y) => channel(2, x, y, 1) >= 128,
  paint: (x, y) => [channel(1, x, y, 2), channel(1, x, y, 1), channel(1, x, y, 0), channel(1, x, y, 3), channel(2, x, y, 2)],
})

const materialLayers = ['Grass_LayerInfo', 'Sand_LayerInfo', 'Stone_LayerInfo', 'Dirt_LayerInfo', 'Forest_LayerInfo']
const rgbaToBgra = [2, 1, 0, 3]
function addTiledLandscape(mapName, textureDir, indexed = false) {
  const map = readMap('OverworldSubmaps/' + mapName)
  const planes = new Map()
  function plane(ref) {
    const name = map.Exports[ref - 1]?.ObjectName
    if (!name) throw new Error('Missing landscape texture reference: ' + mapName)
    if (!planes.has(ref)) {
      const file = indexed ? `${ref}-${name}` : name
      const data = readFileSync(join(textureDir, file + '.raw'))
      planes.set(ref, data)
    }
    return planes.get(ref)
  }
  function sampler(ref, bias) {
    const data = plane(ref)
    const width = 1 / Number(bias.X)
    const height = 1 / Number(bias.Y)
    const x0 = Math.floor(Number(bias.Z) * width)
    const y0 = Math.floor(Number(bias.W) * height)
    if (!Number.isInteger(width) || !Number.isInteger(height) || data.length !== width * height * 4 ||
        !Number.isInteger(x0) || !Number.isInteger(y0) || x0 < 0 || y0 < 0 || x0 + 64 > width || y0 + 64 > height) {
      throw new Error('Invalid landscape atlas slice: ' + mapName + '/' + ref)
    }
    return (x, y, channel) => data[4 * ((y0 + y) * width + x0 + x) + channel]
  }
  for (const component of map.Exports.filter((entry) => map.Imports[-entry.ClassIndex - 1]?.ObjectName === 'LandscapeComponent')) {
    const root = map.Exports[prop(component, 'AttachParent') - 1]
    const explicitScale = vector(root, 'RelativeScale3D')
    const template = map.Imports[-root.TemplateIndex - 1]
    const inheritsLandscapeScale = template?.ObjectName === 'RootComponent0' &&
      map.Imports[-template.OuterIndex - 1]?.ObjectName === 'Default__Landscape'
    // Older landscapes can omit a scale matching the UE LandscapeProxy constructor default.
    const scale = explicitScale ?? (inheritsLandscapeScale ? { X: 128, Y: 128, Z: 256 } : null)
    if (!scale) throw new Error('Unresolved landscape scale: ' + mapName + '/' + root.ObjectName)
    const placeRoot = transform(vector(root, 'RelativeLocation') ?? { X: 0, Y: 0, Z: 0 }, vector(root, 'RelativeRotation'), scale)
    const placeLocal = componentTransform(component)
    if (prop(component, 'ComponentSizeQuads') !== 63 || prop(component, 'NumSubsections') !== 1) {
      throw new Error('Unsupported landscape component layout: ' + mapName + '/' + component.ObjectName)
    }
    const heightmap = sampler(prop(component, 'HeightmapTexture'), vector(component, 'HeightmapScaleBias'))
    const weightmaps = prop(component, 'WeightmapTextures').map(({ Value }) => sampler(Value, vector(component, 'WeightmapScaleBias')))
    const layers = new Map(prop(component, 'WeightmapLayerAllocations').map(({ Value }) => {
      const read = (name) => Value.find((field) => field.Name === name)?.Value
      const layer = map.Imports[-read('LayerInfo') - 1]?.ObjectName
      return [layer, [weightmaps[read('WeightmapTextureIndex')], rgbaToBgra[read('WeightmapTextureChannel')]]]
    }))
    const weight = (layer, x, y) => {
      const [data, channel] = layers.get(layer) ?? []
      return data?.(x, y, channel) ?? 0
    }
    addLandscape({
      mesh: map.Exports[root.OuterIndex - 1].ObjectName, quads: 63, place: (point) => placeRoot(placeLocal(point)),
      elevation: (x, y) => decodeHeight(heightmap(x, y, 2), heightmap(x, y, 1)),
      hidden: (x, y) => weight('DataLayer', x, y) >= 128,
      paint: (x, y) => materialLayers.map((layer) => weight(layer, x, y)),
    })
  }
}
addTiledLandscape('Zone01_Market1', marketTerrainDir)
addTiledLandscape(townMain, townTerrainDir)
addTiledLandscape(countryside, countrysideTerrainDir)
addTiledLandscape(sideIsland, sideIslandTerrainDir)
addTiledLandscape(sideIsland2, sideIsland2TerrainDir, true)
addTiledLandscape(forestMain, forestTerrainDir)
addTiledLandscape(forestFragments, fragmentsTerrainDir)
addTiledLandscape(forestPartTwo, forestPartTwoTerrainDir, true)
addTiledLandscape(sideIsland3, sideIsland3TerrainDir, true)
addTiledLandscape(finale, finaleTerrainDir, true)
addTiledLandscape(zone03Bonus, bonusTerrainDir, true)
addTiledLandscape(zone03Spiral, spiralTerrainDir, true)
for (const name of [zone03ThreeWay, zone03CastleRoom, zone03Diff, zone03Ineq]) {
  addTiledLandscape(name, join(zone03TerrainDir, name), true)
}
if (!surfaces.length) throw new Error('No source geometry found')
const pointList = (points) => points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
const plinthScale = 0.5
// Check contact within the half-width of the plinth base, not just its origin.
function footprintDistance(outline, point) {
  if (outline.every((a, i) => cross(a, outline[(i + 1) % outline.length], point) >= -0.01)) return 0
  return Math.min(...outline.map(([x, y], i) => {
    const [bx, by] = outline[(i + 1) % outline.length]
    const dx = bx - x
    const dy = by - y
    const position = Math.min(1, Math.max(0, ((point[0] - x) * dx + (point[1] - y) * dy) / (dx ** 2 + dy ** 2)))
    return Math.hypot(point[0] - x - position * dx, point[1] - y - position * dy)
  }))
}
function overlaps(outline, footprint) {
  // Both outlines are convex hulls. An edge separating the hulls rules out contact.
  return [[outline, footprint], [footprint, outline]].every(([edges, vertices]) =>
    edges.every((a, i) => vertices.some((v) => cross(a, edges[(i + 1) % edges.length], v) >= -0.01)))
}
function placedPuzzleFootprint(actor) {
  const placed = scene.Exports.find((entry) => entry.ObjectName === actor.actor)
  if (scene.Imports[-placed.ClassIndex - 1]?.ObjectName !== 'PuzzleCube_C') return null
  const root = scene.Exports[prop(placed, 'RootComponent') - 1]
  const place = componentTransform(root)
  return hull(meshes.SM_Plinth_V004.vertices.filter(([, , z]) => z < 2)
    .map((v) => project(...place(v.map((n) => n * plinthScale)))))
}
function supportMeshesFor(actor, point, candidates) {
  const nearbyHeight = surfaces.filter(({ zMin, zMax, kind }) =>
    kind !== 'sail' && kind !== 'wing-frame' && kind !== 'ladder' &&
    actor.z >= zMin - 70 && actor.z <= zMax + 110)
  const base = placedPuzzleFootprint(actor)
  const reach = base?.length >= 3 ? Math.max(...base.map(([x, y]) => Math.hypot(x - point[0], y - point[1]))) : 0
  const support = nearbyHeight.filter(({ outline, witnessVertices }) => {
    if (witnessVertices) return witnessVertices.some(([vertex, z]) =>
      Math.hypot(vertex[0] - point[0], vertex[1] - point[1]) <= 50 * projection.scale &&
      actor.z >= z - 70 && actor.z <= z + 110)
    const distance = footprintDistance(outline, point)
    return distance <= 50 * projection.scale || (distance <= reach && overlaps(outline, base))
  })
  if (!support.length && projectedSupportMeshes.has(actor.id)) actor.projectedSupportMeshes = projectedSupportMeshes.get(actor.id)
  if (!support.length && candidates) {
    candidates.push(...nearbyHeight
      .map(({ mesh, outline }) => ({ mesh, distance: footprintDistance(outline, point) / projection.scale }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4))
  }
  return [...new Set(support.map(({ mesh }) => mesh))].sort()
}
const outsideProjection = ([x, y]) => x < 0 || x >= width || y < 0 || y >= height
if (output === '--probe-support') {
  // Probe any batch of authored anchors without writing assets.
  const { anchors, includeCandidates } = JSON.parse(readFileSync(0, 'utf8'))
  const failures = anchors.flatMap((actor) => {
    const candidates = includeCandidates ? [] : undefined
    return supportMeshesFor(actor, project(actor.x, actor.y), candidates).length ? []
      : [{ id: actor.id, position: [actor.x, actor.y, actor.z], ...(candidates && { candidates }) }]
  })
  writeFileSync(1, JSON.stringify({ width, height, projection, checked: anchors.length, failures }) + '\n')
  process.exit(0)
}
for (const actor of actors) {
  const point = project(actor.x, actor.y)
  const supportMeshes = supportMeshesFor(actor, point)
  if (!supportMeshes.length) {
    // The authored cliff anchor overlaps this rock in plan view; the height check remains unresolved.
    const overlapsBoxyRock = actor.id === '0479.puz' && surfaces.some(({ mesh, outline }) =>
      mesh === 'SM_Rock_02' && footprintDistance(outline, point) <= 50 * projection.scale)
    if (!overlapsBoxyRock && !actor.projectedSupportMeshes) throw new Error('Marker has no nearby-height mesh footprint: ' + actor.id)
    if (overlapsBoxyRock) actor.projectedSupportMeshes = ['SM_Rock_02']
  }
  if (outsideProjection(point)) throw new Error('Marker outside projection: ' + actor.id)
  actor.pixel = { x: point[0], y: point[1] }
  actor.supportMeshes = supportMeshes
}
for (const window of windowsWithLinks) {
  const [x, y] = project(window.x, window.y)
  if (x < 0 || x >= width || y < 0 || y >= height) throw new Error('Window outside projection: ' + window.id)
  window.pixel = { x, y }
}
const terrainStyle = {
  rock: ['#7d9391', '#536e72', 1.15],
  ground: ['#8b9b79', '#8b9b79', 0.8],
  canopy: ['#879d7d', '#879d7d', 0.15],
  trunk: ['#6c6b54', '#6c6b54', 0.15],
  sail: ['#829295', '#405963', 1.4],
  ship: ['#9e8061', '#5b483b', 1.8],
  deck: ['#bda788', '#826c55', 1.2],
  cabin: ['#89694e', '#5b483b', 1.6],
  stone: ['#c9cbbd', '#879893', 0.95],
  wood: ['#d5b481', '#80694d', 1.1],
  landmark: ['#a3aaa0', '#657a78', 1.2],
}
const terrainLayer = { rock: 0, sail: 0, 'wing-frame': 1, ship: 2, deck: 3, cabin: 4, ground: 4, stone: 5, wood: 5, landmark: 5, ladder: 6, trunk: 7, canopy: 7 }
const silhouettes = surfaces
  .sort((a, b) => terrainLayer[a.kind] - terrainLayer[b.kind] || a.zMax - b.zMax)
  .map(({ outline, kind, faces, tint }) => {
    if (kind === 'ladder') {
      // Keep open rungs rather than implying a solid floor beneath them.
      const path = faces.map((face) => 'M' + pointList(face) + 'Z').join('')
      return `<path d="${path}" fill="#e0bf8a" stroke="#614c36" stroke-width="1" paint-order="stroke"/>`
    }
    if (kind === 'wing-frame') {
      const path = faces.map((face) => 'M' + pointList(face) + 'Z').join('')
      return `<path d="${path}" fill="#78807c"/>`
    }
    const [fill, stroke, thickness] = tint ? [`rgb(${tint.join(',')})`, `rgb(${tint.join(',')})`, 0.25] : terrainStyle[kind]
    if (kind === 'canopy' || kind === 'trunk') {
      const path = faces.map((face) => 'M' + pointList(face) + 'Z').join('')
      return `<path d="${path}" fill="${fill}"/>`
    }
    return `<polygon points="${pointList(outline)}" fill="${fill}" stroke="${stroke}" stroke-width="${thickness}"/>`
  })

const puzzleFile = ({ id, directory }) => readFileSync(join(root, '..', directory, id), 'utf8')
const sample = actors.find(({ id }) => id === '0049.puz')
const sampleShape = puzzleFile(sample).match(/^SHAPE 1 2\r?\n([# ]+)\r?\n([# ]+)\r?$/m)?.slice(1)
if (!sampleShape) throw new Error('Missing the sample puzzle piece')

// Upright orthographic renders of the scene meshes, shaded for map-size legibility.
for (const id of ['note', 'puzzle']) {
  const plinth = meshes.SM_Plinth_V004
  const parts = [{ vertices: plinth.vertices.map((point) => point.map((n) => n * plinthScale)), indices: plinth.indices, scroll: false }]
  if (id === 'note') {
    const scroll = meshes.SM_Scroll_001
    // PuzzleTutorialCube uses a half-size BaseMesh and attaches ScrollMesh to TableTopProxy.
    parts.push({ vertices: scroll.vertices.map(([x, y, z]) => [-y, x, z + 111.94874572753906]), indices: scroll.indices, scroll: true })
  }
  const yaw = Math.PI / 6
  const elevation = Math.PI / 4
  const projectIcon = ([x, y, z]) => {
    const depth = -x * Math.sin(yaw) + y * Math.cos(yaw)
    return [
      x * Math.cos(yaw) + y * Math.sin(yaw),
      depth * Math.cos(elevation) - z * Math.sin(elevation),
      depth * Math.sin(elevation) + z * Math.cos(elevation),
    ]
  }
  const points = parts.flatMap(({ vertices }) => vertices.map(projectIcon))
  const extrema = [0, 2].map((axis) => {
    const values = points.map((p) => p[axis])
    return [Math.min(...values), Math.max(...values)]
  })
  const zoom = 58 / Math.max(...extrema.map(([min, max]) => max - min))
  const centered = ([x, , z]) => [32 + zoom * (x - (extrema[0][0] + extrema[0][1]) / 2), 32 - zoom * (z - (extrema[1][0] + extrema[1][1]) / 2)]
  const renderPart = ({ vertices, indices, scroll }) => {
    const view = vertices.map(projectIcon)
    const faces = []
    for (let i = 0; i < indices.length; i += 3) {
      const face = indices.slice(i, i + 3)
      const [a, b, c] = face.map((index) => view[index])
      const polygon = [a, b, c].map(centered)
      if (Math.abs(cross(...polygon)) < 0.015) continue
      const u = b.map((val, j) => val - a[j])
      const v = c.map((val, j) => val - a[j])
      const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      const shade = 0.58 + 0.42 * Math.abs((normal[0] * 0.32 - normal[1] * 0.54 + normal[2] * 0.73) / Math.hypot(...normal))
      const top = face.every((index) => vertices[index][2] > 99)
      const light = scroll ? [249, 225, 171]
        : !top ? [238, 236, 219] : id === 'note' ? [146, 80, 49] : [255, 222, 152]
      faces.push({ depth: (a[1] + b[1] + c[1]) / 3, fill: light.map((value) => Math.round(value * shade)).join(','), polygon })
    }
    return faces.sort((a, b) => b.depth - a.depth).map(({ fill, polygon }) =>
      `<polygon points="${pointList(polygon)}" fill="rgb(${fill})" stroke="rgb(${fill})" stroke-width=".35"/>`).join('')
  }
  const glass = [['#2e98d1', '#1372aa'], ['#64c8b7', '#1b8c85'], ['#e57857', '#b74744'], ['#ffc95d', '#dd8c32']]
  const inset = id === 'puzzle' ? sampleShape.flatMap((line, row) => [...line].map((mark, column) => {
    if (mark !== '#') return ''
    const size = 29
    const x = (column - 1) * size
    const y = (row - 1) * size
    const panel = [[x, y], [x + size, y], [x + size, y + size], [x, y + size]]
      .map(([x, y]) => centered(projectIcon([x, y, 113])))
    const [light, shadow] = glass[row * 2 + column]
    return `<polygon points="${pointList(panel)}" fill="${shadow}" stroke="#4f4333" stroke-width="1.35" stroke-linejoin="round"/><polygon points="${pointList(panel.slice(0, 3))}" fill="${light}"/>`
  })).join('') : ''
  const title = id === 'note' ? 'SM_Plinth_V004 + SM_Scroll_001' : 'SM_Plinth_V004'
  writeFileSync(join(output, `glimmith-marker-${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><title>${title}</title>${parts.map(renderPart).join('')}${inset}</svg>\n`)
}
function normalizeWideShapeClues(board, columns, id) {
  const wideShapeClues = {}
  for (let y = 1; y < board.length; y += 2) {
    let extra = 0
    // The renderer uses two-character cells. Keep longer source IDs by cell index.
    board[y] = board[y].replace(/S\d{2,}/g, (clue, offset) => {
      const x = (offset - extra - 1) / 3
      if (!Number.isInteger(x) || x < 0 || x >= columns) throw new Error('Misaligned shape clue: ' + id)
      wideShapeClues[((y - 1) / 2) * columns + x] = clue
      extra += clue.length - 2
      return 'S*'
    }).padEnd(3 * columns + 1)
  }
  return Object.keys(wideShapeClues).length ? wideShapeClues : undefined
}
function normalizeWideCellClues(board, columns, id) {
  const wideCellClues = {}
  for (let y = 1; y < board.length; y += 2) {
    let index = 0
    let extra = 0
    // A difference digit can touch a two-character cell without a separator.
    board[y] = board[y].replace(/U\d*D\d*L\d*R\d*/g, (clue, offset) => {
      const column = (offset - extra - 1) / 3
      if (!Number.isInteger(column) || column < 0 || column >= columns) throw new Error('Misaligned compass clue: ' + id)
      wideCellClues[`${(y - 1) / 2}:${index++}`] = clue
      extra += clue.length - 2
      return 'C*'
    }).padEnd(3 * columns + 1)
  }
  return Object.keys(wideCellClues).length ? wideCellClues : undefined
}

function readShapeClues(headerText, board, columns, id, bank, wide) {
  const used = new Set([...bank, ...Object.values(wide ?? {})])
  for (let y = 1; y < board.length; y += 2) {
    for (let x = 0; x < columns; x++) {
      const clue = board[y].slice(3 * x + 1, 3 * x + 3)
      if (/^S\d$/.test(clue)) used.add(clue)
    }
  }
  if (!used.size) return undefined
  const shapes = new Map()
  const lines = headerText.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('SHAPE ')) continue
    const header = /^SHAPE (\d+) (\d+)\s*$/.exec(lines[i])
    if (!header) throw new Error('Invalid shape header: ' + id)
    const [, number, height] = header
    const clue = 'S' + number
    const cells = lines.slice(i + 1, i + 1 + Number(height)).map((line) => line.trimEnd())
    if (shapes.has(clue) || cells.length !== Number(height) || cells.some((line) => /[^# ]/.test(line)) ||
      !cells.some((line) => line.includes('#'))) throw new Error('Invalid shape: ' + id + ' ' + clue)
    shapes.set(clue, cells)
    i += Number(height)
  }
  return Object.fromEntries([...used].map((clue) => {
    if (!shapes.has(clue)) throw new Error('Missing board shape: ' + id + ' ' + clue)
    return [clue, shapes.get(clue)]
  }))
}

const rangePuzzleIds = new Set(windows.find(({ id }) => id === 'window-range').prerequisites)
const sizeSeparationPuzzleIds = new Set(windows.find(({ id }) => id === 'window-size-separation').prerequisites)
const genericRuleHeaders = [
  'ONE_SYMBOL_PER_REGION', 'ALL_SHAPES_DIFFERENT', 'ALL_SHAPES_SAME',
  'ADJACENT_SHAPES_DIFFERENT', 'ADJACENT_SIZES_DIFFERENT', 'ONLY_RECTANGLES', 'NO_RECTANGLES',
]
const rectangleRules = new Map([
  ...windows.find(({ id }) => id === 'window-boxy').prerequisites.map((id) => [id, 'only']),
  ...windows.find(({ id }) => id === 'window-non-boxy').prerequisites.map((id) => [id, 'none']),
])
function readAreaRange(header, id) {
  const min = Number(/^AREA_AT_LEAST (\d+)\s*$/m.exec(header)?.[1]) || undefined
  const max = Number(/^AREA_AT_MOST (\d+)\s*$/m.exec(header)?.[1]) || undefined
  if (min && max && min > max) throw new Error('Invalid area range: ' + id)
  return min || max ? { min, max } : undefined
}
const puzzles = Object.fromEntries(actors.filter(({ directory }) => directory).map((actor) => {
  const { id } = actor
  const puzzle = puzzleFile(actor)
  const [columns, rows] = puzzle.match(/^DIMENSIONS (\d+) (\d+)\r?$/m).slice(1).map(Number)
  const [header, ...body] = puzzle.split(/\r?\n(?:PUZZLE|SOLUTION)\r?\n/)
  const frames = body.map((part) => part.split(/\r?\n/).slice(0, 2 * rows + 1).map((line) => line.padEnd(3 * columns + 1)))
  if (frames.length !== 2 || frames.some((frame) => frame.length !== 2 * rows + 1)) throw new Error('Invalid puzzle dimensions: ' + id)
  const difficulty = Number(puzzle.match(/^DIFFICULTY (\d+)\r?$/m)?.[1])
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 7) throw new Error('Invalid puzzle difficulty: ' + id)
  const [board, solution] = frames
  const wideShapeClues = normalizeWideShapeClues(board, columns, id)
  const wideCellClues = normalizeWideCellClues(board, columns, id)
  if (frames.some((frame) => frame.some((line) => line.slice(3 * columns + 1).trim()))) throw new Error('Overwide puzzle frame: ' + id)
  const bank = /^SHAPE_BANK ([\d \t]+)\r?$/m.exec(header)?.[1].trim()
  const shapeBank = bank ? bank.split(/\s+/).map((number) => 'S' + number) : []
  const shapeClues = readShapeClues(header, board, columns, id, shapeBank, wideShapeClues)
  const adjacentSizesDifferent = sizeSeparationPuzzleIds.has(id) && /^ADJACENT_SIZES_DIFFERENT\r?$/m.test(header)
  if (sizeSeparationPuzzleIds.has(id) && !adjacentSizesDifferent) throw new Error('Missing adjacent size rule: ' + id)
  const areaRange = readAreaRange(header, id)
  const areaEquals = Number(/^AREA_EQUALS (\d+)\r?$/m.exec(header)?.[1]) || undefined
  if (rangePuzzleIds.has(id) && !areaRange) throw new Error('Missing area range: ' + id)
  const rectangleRule = rectangleRules.get(id)
  const ruleHeader = rectangleRule === 'only' ? /^ONLY_RECTANGLES\r?$/m : /^NO_RECTANGLES\r?$/m
  if (rectangleRule && !ruleHeader.test(header)) throw new Error('Missing rectangle rule: ' + id)
  const representedRules = new Set([
    ...(adjacentSizesDifferent ? ['ADJACENT_SIZES_DIFFERENT'] : []),
    ...(rectangleRule ? [rectangleRule === 'only' ? 'ONLY_RECTANGLES' : 'NO_RECTANGLES'] : []),
  ])
  const ruleFlags = genericRuleHeaders.filter((rule) => !representedRules.has(rule) && new RegExp('^' + rule + '\r?$', 'm').test(header))
  return [id, { columns, rows, difficulty, board, solution, ...(shapeClues && { shapeClues }),
    ...(wideShapeClues && { wideShapeClues }), ...(wideCellClues && { wideCellClues }), ...(shapeBank.length && { shapeBank }), ...(areaRange && { areaRange }),
    ...(areaEquals && { areaEquals }), ...(adjacentSizesDifferent && { adjacentSizesDifferent }), ...(rectangleRule && { rectangleRule }), ...(ruleFlags?.length && { ruleFlags }) }]
}))
writeGlimmithScene(output, { projection, width, height, tileSize, sources, surfaceCount: surfaces.length, actors, windows: windowsWithLinks, puzzles })
for (let row = 0; row < height / tileSize; row++) {
  for (let column = 0; column < width / tileSize; column++) {
    const x = column * tileSize
    const y = row * tileSize
    const art = silhouettes.filter((_, index) => {
      const { outline } = surfaces[index]
      return outline.some(([px]) => px >= x - 3) && outline.some(([px]) => px <= x + tileSize + 3) &&
        outline.some(([, py]) => py >= y - 3) && outline.some(([, py]) => py <= y + tileSize + 3)
    })
    writeFileSync(join(output, `glimmith-terrain-${row * (width / tileSize) + column}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="${tileSize}" height="${tileSize}" viewBox="${x} ${y} ${tileSize} ${tileSize}"><rect x="${x}" y="${y}" width="${tileSize}" height="${tileSize}" fill="#243e4c"/>${art.join('')}</svg>\n`)
  }
}
