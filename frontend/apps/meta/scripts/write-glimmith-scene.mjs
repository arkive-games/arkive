import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function writeGlimmithScene(output, { puzzles, ...scene }) {
  const folder = join(output, 'glimmith-boards')
  mkdirSync(folder, { recursive: true })
  const difficulties = {}
  const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
  for (const { id, prerequisites } of scene.windows) {
    if (!prerequisites.length) continue
    const boards = {}
    for (const key of prerequisites) {
      if (!puzzles[key] || key in difficulties) throw new Error('Invalid puzzle ownership: ' + key)
      boards[key] = puzzles[key]
      difficulties[key] = puzzles[key].difficulty
    }
    write(join(folder, id + '.json'), boards)
  }
  if (Object.keys(difficulties).length !== Object.keys(puzzles).length) throw new Error('Unassigned puzzle')
  write(join(output, 'glimmith-scene.json'), { ...scene, difficulties })
}
