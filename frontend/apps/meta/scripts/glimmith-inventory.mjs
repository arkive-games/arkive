import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { auditWindow } from './glimmith-audit.mjs'

const [root, sceneFile, windowKey, mode, terrainManifest, ...extra] = process.argv.slice(2)
if (!root || !sceneFile || (mode && mode !== '--audit') || extra.length) {
  throw new Error('Usage: node glimmith-inventory.mjs <AGeri directory> <scene JSON> [window key [--audit [terrain manifest]]]')
}

const read = (file) => JSON.parse(readFileSync(file, 'utf8'))
const source = read(join(root, 'Maps', 'PuzzleLevelMainSubmaps', 'Overworld_Campaign.umap.json'))
const preview = read(sceneFile)
const prop = (entry, key) => entry.Data?.find?.((item) => item.Name === key)?.Value
const puzzlePath = (entry) => {
  const file = prop(entry, 'PuzzleFile')
  const directory = prop(entry, 'PuzzleDirectory')
  return directory && file?.endsWith('.puz') ? directory + '/' + file : null
}
const placed = new Set(source.Exports.map(puzzlePath).filter(Boolean))
const mapped = new Set(preview.actors.filter(({ directory }) => directory).map(({ id, directory }) => directory + '/' + id))
if ([...mapped].some((path) => !placed.has(path))) throw new Error('The preview has puzzle paths absent from this campaign')
const mappedWindows = new Set(preview.windows.map(({ actor }) => actor))
const prefix = 'BP_StainedGlassPlinth_'
const windows = source.Exports
  .filter((entry) => entry.ObjectName.startsWith(prefix) && prop(entry, 'AreaName'))
  .map((entry) => {
    const paths = (prop(entry, 'prerequisites') ?? []).map(({ Value }) => puzzlePath(source.Exports[Value - 1]))
    if (paths.includes(null)) throw new Error('Unresolved puzzle reference: ' + entry.ObjectName)
    return { key: entry.ObjectName.slice(prefix.length), paths, mapped: mappedWindows.has(entry.ObjectName) }
  })

if (windowKey) {
  const window = windows.find(({ key }) => key === windowKey)
  if (!window) throw new Error('Unknown campaign window: ' + windowKey)
  if (mode === '--audit') {
    const entry = source.Exports.find((entry) => entry.ObjectName === prefix + windowKey)
    console.log(JSON.stringify(auditWindow({ root, window, entry, source, preview, terrainManifest }), null, 2))
  } else {
    console.log(window.paths.map((path) => 'Geri/Content/' + path).join('\n'))
  }
} else {
  const referenced = new Set(windows.flatMap(({ paths }) => paths))
  console.log(JSON.stringify({
    placedPuzzles: placed.size,
    previewPuzzles: mapped.size,
    remainingPuzzles: placed.size - mapped.size,
    outsideNamedWindowReferences: [...placed].filter((path) => !referenced.has(path)).length,
    windows: windows.map(({ key, paths, mapped: included }) => ({
      key, included, puzzles: paths.length, remaining: paths.filter((path) => !mapped.has(path)).length,
    })),
  }, null, 2))
}
