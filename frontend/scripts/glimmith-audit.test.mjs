import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { auditWindow, readLocalizedName } from '../apps/meta/scripts/glimmith-audit.mjs'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }))

const int = (value) => {
  const bytes = Buffer.alloc(4)
  bytes.writeInt32LE(value)
  return bytes
}
const ansi = (value) => Buffer.concat([int(value.length + 1), Buffer.from(value + '\0')])
const wide = (value) => Buffer.concat([int(-value.length - 1), Buffer.from(value + '\0', 'utf16le')])
const fixtureLocres = () => {
  const entries = Buffer.concat([int(1), int(1), int(0), ansi('Window'), int(1), int(0), ansi('Name'), int(0), int(0)])
  const offset = Buffer.alloc(8)
  offset.writeBigInt64LE(BigInt(25 + entries.length))
  return Buffer.concat([
    Buffer.from('0e147475674a03fc4a15909dc3377f1b03', 'hex'), offset, entries,
    int(1), wide('\u65b9\u5757'), int(1),
  ])
}

describe('Glimmith window audit', () => {
  let folder
  afterEach(() => {
    if (folder) rmSync(folder, { recursive: true, force: true })
    vi.resetAllMocks()
  })

  function fixture() {
    folder = mkdtempSync(join(tmpdir(), 'glimmith-audit-'))
    const root = join(folder, 'AGeri')
    mkdirSync(join(root, 'Puzzles'), { recursive: true })
    const localeDir = join(folder, 'Localization', 'Game', 'zh-Hans')
    mkdirSync(localeDir, { recursive: true })
    writeFileSync(join(localeDir, 'Game.locres'), fixtureLocres())
    writeFileSync(join(root, 'Puzzles', '0001.puz'),
      'VERSION 1\nDIFFICULTY 3\nDIMENSIONS 3 1\nPUZZLE\n+-02--+--+\n|S10=053P2|\n+--+--+--+\nSOLUTION\n+##+##+##+\n#        #\n+##+##+##+\n')
    writeFileSync(join(root, 'Puzzles', '0003.puz'), 'VERSION 1\n')
    const prop = (Name, Value) => ({ Name, Value })
    const puzzle = (id, ref) => ({ ObjectName: id, Data: [prop('PuzzleFile', id), prop('RootComponent', ref)] })
    const anchor = (X) => ({ Data: [prop('RelativeLocation', [{ Value: { X, Y: 0, Z: 0 } }])] })
    const entry = { ObjectName: 'Window', Data: [
      { Name: 'AreaName', Value: 'Name', Namespace: 'Window' },
      prop('minObjective', 1), prop('silverObjective', 2), prop('gildObjective', 3),
      prop('RootComponent', 2), prop('prerequisites', [{ Value: 3 }, { Value: 5 }, { Value: 7 }]),
    ] }
    const source = { Exports: [entry, anchor(0), puzzle('0001.puz', 4), anchor(0), puzzle('0002.puz', 6), anchor(-100), puzzle('0003.puz', 0)] }
    const window = { key: 'Boxy', mapped: false, paths: ['0001.puz', '0002.puz', '0003.puz'].map((id) => 'AGeri/Puzzles/' + id) }
    const preview = { width: 100, height: 100, projection: { centerX: 0, centerY: 0, originX: 50, originY: 50, scale: 1, degrees: 0 } }
    return { root, source, entry, window, preview }
  }

  it('reads a UTF-16 name by namespace and key', () => {
    expect(readLocalizedName(fixtureLocres(), 'Window', 'Name')).toBe('\u65b9\u5757')
    expect(() => readLocalizedName(fixtureLocres(), 'Wrong', 'Name')).toThrow('Missing localized window name')
  })

  it('reports missing, invalid and out-of-bounds inputs without hiding edge clues', () => {
    const report = auditWindow(fixture())
    expect(report).toMatchObject({
      localizedName: { status: 'verified' }, requestedPuzzles: 3, inspectedPuzzles: 1, thresholds: [1, 2, 3],
      missingPuzzleFiles: ['Geri/Content/AGeri/Puzzles/0002.puz'],
      invalidPuzzles: [{ path: 'Geri/Content/AGeri/Puzzles/0003.puz' }],
      clues: { cells: ['05', 'P2', 'S*'], edges: ['-', '0', '3', '=', '|'], vertices: ['2'], wideShapePuzzles: ['0001.puz'] },
      projection: { unknownAnchors: [{ id: '0003.puz', kind: 'puzzle' }], outsideCanvas: [{ id: '0002.puz', kind: 'puzzle', x: 150, y: 50 }] },
      terrain: { status: 'not-requested' },
    })
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('keeps geometry issues together and rejects a mismatched projection', () => {
    const input = fixture()
    const terrainManifest = join(folder, 'terrain.json')
    writeFileSync(terrainManifest, JSON.stringify(Object.fromEntries(
      ['meshFile', 'hamlet', 'market', 'town', 'countryside', 'sideIsland', 'forestMain', 'forestFragments', 'forestPartTwo', 'sideIsland2', 'sideIsland3', 'finale', 'bonus', 'spiral', 'zone03']
        .map((key) => [key, key + '.raw']),
    )))
    const failures = [{ id: '0001.puz' }, { id: '0002.puz' }]
    spawnSync.mockReturnValueOnce({ status: 0, stdout: JSON.stringify({ ...input.preview, checked: 2, failures }) })
    expect(auditWindow({ ...input, terrainManifest }).terrain).toEqual({ status: 'checked', checked: 2, unsupported: failures })
    expect(spawnSync.mock.calls[0][1]).toContain('--probe-support')
    expect(JSON.parse(spawnSync.mock.calls[0][2].input).anchors).toHaveLength(2)
    spawnSync.mockReturnValueOnce({ status: 0, stdout: JSON.stringify({ ...input.preview, width: 200, checked: 2, failures }) })
    expect(auditWindow({ ...input, terrainManifest }).terrain).toMatchObject({ status: 'blocked', reason: expect.stringContaining('projection differs') })
  })
})
