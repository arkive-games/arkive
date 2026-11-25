import { useMemo, useRef, useState } from 'react'
import { ArkiveAccountControl } from '@gamemap/auth'
import type { GameMapMeta } from '@gamemap/data-contract'
import { CommunityMarkerDetail } from '@gamemap/map-community'
import { GameMapView, type EngineMarker, type GlMapRef } from '@gamemap/map-engine-gl'
import {
  ArkiveMapTopBar, FilterPanel, markerDetailLabelsFor,
  SearchPanel, ShellGameHeader, ShellLayout, ShellMapSelect, ShellSidebar, useTheme,
} from '@gamemap/map-shell'
import { browserMemory, defineMemoryRecord, memoryPolicy } from '@gamemap/state-memory'
import { useIsMobile } from '@gamemap/ui'
import scene from './assets/glimmith-scene.json'
import noteIcon from './assets/glimmith-marker-note.svg'
import puzzleIcon from './assets/glimmith-marker-puzzle.svg'
import puzzleDot from './assets/glimmith-puzzle-dot.svg?inline'
import windowIcon from './assets/glimmith-marker-window.svg'
import perfectedIcon from './assets/glimmith-marker-perfected.png'
import selectedWindowIcon from './assets/glimmith-selected-window.svg?no-inline'
import selectedPerfectedIcon from './assets/glimmith-selected-perfected.svg?no-inline'
import puzzleSquareIcon from './assets/glimmith-icon-blue.png'
import circleClue from './assets/glimmith-cell-clue-circle.png'
import squareClue from './assets/glimmith-cell-clue-square.png'
import triangleClue from './assets/glimmith-cell-clue-triangle.png'
import diamondClue from './assets/glimmith-cell-clue-diamond.png'
import hexagonClue from './assets/glimmith-cell-clue-hexagon.png'
import palisadeF0 from './assets/glimmith-cell-palisade-f0.png'
import palisadeF1 from './assets/glimmith-cell-palisade-f1.png'
import palisadeF2 from './assets/glimmith-cell-palisade-f2.png'
import palisadeF3 from './assets/glimmith-cell-palisade-f3.png'
import palisadeF4 from './assets/glimmith-cell-palisade-f4.png'
import palisadeF7 from './assets/glimmith-cell-palisade-f7.png'
import differenceClue from './assets/glimmith-edge-difference.png'
import inequalityClue from './assets/glimmith-edge-inequality.png'
import radarOne from './assets/glimmith-vertex-radar-1.png'
import radarTwo from './assets/glimmith-vertex-radar-2.png'
import radarThree from './assets/glimmith-vertex-radar-3.png'
import radarFour from './assets/glimmith-vertex-radar-4.png'
import headerArt from './assets/glimmith-steam-scenery.jpg'
import gameIcon from './assets/glimmith-launcher.png'
import { GLIMMITH_MAP_PATH } from './sites'
import { glimmithInequalityAngle, glimmithVertexMark, horizontalGlimmithEdgeMark } from './glimmithEdgeClues'
import copy from './glimmithLocale.json'
import { markerRegions, regionOptions } from './glimmithRegions'
import '@gamemap/map-engine-gl/engine-gl.css'

const map: GameMapMeta = {
  id: 'intro', name: copy.intro, type: 'world', isVisible: true,
  tileWidth: scene.tileSize, tileHeight: scene.tileSize,
  tilesCountX: scene.width / scene.tileSize, tilesCountY: scene.height / scene.tileSize,
}
const windowNames = new Map(Object.entries(copy.windows))
const puzzles = new Map(Object.entries(scene.puzzles))
const cellClueImages = new Map([
  ['P1', circleClue], ['P2', squareClue], ['P3', triangleClue], ['P4', diamondClue], ['P5', hexagonClue],
  ['F0', palisadeF0], ['F1', palisadeF1], ['F2', palisadeF2], ['F3', palisadeF3], ['F4', palisadeF4], ['F7', palisadeF7],
])
const windows = new Map(scene.windows.map((window) => [window.id, window]))
const puzzleWindows = new Map(scene.windows.flatMap((window) => window.prerequisites.map((id) => [id, window] as const)))
const difficultyArt = import.meta.glob<string>('./assets/glimmith-difficulty-*.png', {
  eager: true, import: 'default', query: '?url',
})
const compassArt = import.meta.glob<string>('./assets/glimmith-compass-*.png', {
  eager: true, import: 'default', query: '?url',
})
const puzzleNumber = (id: string) => id.replace(/\.puz$/, '')
const completedRecord = defineMemoryRecord({
  id: 'completed-markers',
  namespace: 'glimmith',
  surface: 'map',
  ...memoryPolicy.durableProgress('clear-map-progress'),
  schemaVersion: '1.0.0',
  defaultValue: () => [] as string[],
  validate: (value: unknown): value is string[] =>
    Array.isArray(value) && value.length <= 10_000 && value.every((id) => typeof id === 'string'),
})
const progressScope = { partition: map.id }
const markers: EngineMarker[] = scene.actors.map(({ id, pixel, z, widget }, index) => {
  const subtype = widget ? 'note' : 'puzzle'
  const icon = widget ? noteIcon : puzzleIcon
  const difficulty = puzzles.get(id)?.difficulty
  const badge = difficultyArt[`./assets/glimmith-difficulty-${difficulty}.png`]
  return {
    id, ...pixel, z, subtype, icon, positionPrecision: 'authored-transform', indexInSubtype: index,
    images: [], contributors: [],
    localizedName: widget ? id.replace(/^Tutorial-/, copy.note + ' ') : puzzleNumber(id),
    hoverBadge: badge ? { src: badge, alt: copy.difficulty + ' ' + difficulty } : null,
    subtypeLabel: copy[subtype], subtypeMeta: { id: subtype, name: copy[subtype], icon, pinVariant: 'image' },
  }
})
markers.push(...scene.windows.map((window, index): EngineMarker => ({
  id: window.id, ...window.pixel, z: window.z, subtype: 'window',
  icon: window.windowPrerequisites ? perfectedIcon : windowIcon,
  selectedIcon: window.windowPrerequisites ? selectedPerfectedIcon : selectedWindowIcon,
  // The framed sprite holds the original window in 62 of its 80 units.
  selectedIconScale: 0.88 * 80 / 62,
  positionPrecision: 'authored-transform', indexInSubtype: index, images: [], contributors: [],
  localizedName: windowNames.get(window.id) ?? copy.window, subtypeLabel: copy.window, hoverBadge: null,
  subtypeMeta: { id: 'window', name: copy.window, icon: windowIcon, pinVariant: 'image' },
})))
const terrainTiles = import.meta.glob<string>('./assets/glimmith-terrain-*.svg', {
  eager: true, import: 'default', query: '?url',
})
const assets = {
  tileUrl: (_map: GameMapMeta, x: number, y: number) => terrainTiles[`./assets/glimmith-terrain-${y * map.tilesCountX + x}.svg`],
  markerIconUrl: (icon?: string) => icon ?? '',
}
const angle = scene.projection.degrees * Math.PI / 180
const displayCoords = (x: number, y: number) => {
  const dx = (x - scene.projection.originX) / scene.projection.scale
  const dy = (y - scene.projection.originY) / scene.projection.scale
  return {
    x: scene.projection.centerX - (dx * Math.cos(angle) + dy * Math.sin(angle)),
    y: scene.projection.centerY - (-dx * Math.sin(angle) + dy * Math.cos(angle)),
  }
}
const subtypes = ['puzzle', 'window'] as const
const regionIds = regionOptions.map(({ id }) => id)
const mapOptions = [{ id: map.id, label: copy.overview }, ...regionOptions]
function framePoints(points: readonly EngineMarker[], width: number, height: number) {
  const xs = points.map(({ x }) => x)
  const ys = points.map(({ y }) => y)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  const zoom = Math.min(0.65, Math.log2(Math.min(
    Math.max(1, width - 96) / Math.max(200, right - left),
    Math.max(1, height - 150) / Math.max(200, bottom - top),
  )))
  return { x: (left + right) / 2, y: (top + bottom) / 2, zoom }
}

const desktopView = framePoints(markers, 1050, 780)
const overviewPuzzleScale = 0.21
const vertexArt = { '1': radarOne, '2': radarTwo, '3': radarThree, '4': radarFour }

function RelationClue({ x, y, mark }: { x: number; y: number; mark?: string }) {
  if (mark === undefined) return null
  const angle = glimmithInequalityAngle(mark)
  if (angle !== undefined) {
    return (
      <g data-edge-clue={mark} transform={`translate(${x} ${y}) rotate(${angle})`}>
        <image href={inequalityClue} x={-6.5} y={-6.5} width={13} height={13} />
      </g>
    )
  }
  if (/^[0-9]$/.test(mark)) {
    return (
      <g data-edge-clue={mark} transform={`translate(${x} ${y})`}>
        <image href={differenceClue} x={-6.5} y={-6.5} width={13} height={13} />
        <text textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="700" fill="#263239">{mark}</text>
      </g>
    )
  }
  if (mark !== '=' && mark !== '!') return null
  return (
    <g data-edge-clue={mark}>
      <circle cx={x} cy={y} r="6.5" className="fill-card stroke-border" strokeWidth=".5" />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize="10" fontWeight="700"
        className={mark === '!' ? 'fill-destructive' : 'fill-primary'}>{mark === '!' ? '\u2260' : '='}</text>
    </g>
  )
}

function ShapeClue({ x, y, clue, cells }: { x: number; y: number; clue: string; cells: string[] }) {
  const width = Math.max(...cells.map((line) => line.length))
  const unit = 18 / Math.max(width, cells.length)
  const left = x + (24 - width * unit) / 2
  const top = y + (24 - cells.length * unit) / 2
  return (
    <g data-shape-clue={clue} className="fill-primary stroke-card" strokeWidth=".55">
      {cells.flatMap((line, row) => [...line].map((part, column) => part === '#' && (
        <rect key={row * width + column} x={left + column * unit} y={top + row * unit} width={unit} height={unit} />
      )))}
    </g>
  )
}

const compassDirections = [
  ['U', 12, 4.8], ['R', 19.2, 12], ['D', 12, 19.2], ['L', 4.8, 12],
] as const

function CompassClue({ x, y, clue }: { x: number; y: number; clue: string }) {
  const numbers = new Map([...clue.matchAll(/([URDL])(\d*)/g)].map(([, direction, number]) => [direction, number]))
  // The original texture mask is ordered top, right, bottom, left.
  const suffix = compassDirections.map(([direction]) => numbers.get(direction) ? 'b' : 'a').join('')
  return <g data-compass-clue={clue} transform={`translate(${x} ${y})`}>
    <image href={compassArt[`./assets/glimmith-compass-${suffix}.png`]} width={24} height={24} />
    {compassDirections.map(([direction, cx, cy]) => {
      const number = numbers.get(direction)
      return number && <text key={direction} x={cx} y={cy} textAnchor="middle"
        dominantBaseline="central" fontSize="6.5" fontWeight="700" fill="#263239">{number}</text>
    })}
  </g>
}

type GlimmithPuzzle = (typeof scene.puzzles)['0049.puz'] & {
  shapeClues?: Record<string, string[]>
  wideShapeClues?: Partial<Record<number, string>>
  wideCellClues?: Partial<Record<string, string>>
  shapeBank?: string[]
  areaRange?: { min?: number; max?: number }
  areaEquals?: number
  adjacentSizesDifferent?: boolean
  rectangleRule?: 'only' | 'none'
  ruleFlags?: string[]
}

const ruleLabels: Partial<Record<string, string>> = copy.ruleLabels

function PuzzleRules({ puzzle }: { puzzle: GlimmithPuzzle }) {
  const { areaEquals, areaRange, adjacentSizesDifferent, rectangleRule, ruleFlags } = puzzle
  const lines: string[] = []
  if (areaEquals != null) {
    lines.push(copy.areaEquals.replace('{count}', String(areaEquals)))
  } else if (areaRange) {
    const { min, max } = areaRange
    const label = min != null && max != null ? copy.areaRangeBetween : min != null ? copy.areaRangeMin : copy.areaRangeMax
    lines.push(label.replace('{min}', String(min)).replace('{max}', String(max)))
  }
  const flags = new Set(ruleFlags)
  if (adjacentSizesDifferent) flags.add('ADJACENT_SIZES_DIFFERENT')
  if (rectangleRule) flags.add(rectangleRule === 'only' ? 'ONLY_RECTANGLES' : 'NO_RECTANGLES')
  for (const flag of flags) {
    const label = ruleLabels[flag]
    if (typeof label === 'string') lines.push(label)
  }
  return lines.length
    ? <p className="text-center text-sm text-muted-foreground tabular-nums">{lines.join(copy.ruleSeparator)}</p>
    : null
}

function PuzzleSolution({ puzzle }: { puzzle: GlimmithPuzzle }) {
  const { columns, rows, board, solution, shapeClues, wideShapeClues, wideCellClues, shapeBank } = puzzle
  const bankHeight = shapeBank?.length ? 28 : 0
  return (
    <svg role="img" aria-label={copy.solution}
      viewBox={`-7 -7 ${columns * 24 + 14} ${rows * 24 + 14 + bankHeight}`}
      className={`mx-auto w-full ${Math.max(columns, rows) > 7 ? 'max-w-64' : 'max-w-48'}`}>
      {Array.from({ length: rows * columns }, (_, index) => {
        const x = index % columns
        const y = Math.floor(index / columns)
        return board[2 * y + 1].slice(3 * x + 1, 3 * x + 3).trim()
          ? <rect key={index} x={24 * x} y={24 * y} width={24} height={24} className="fill-muted stroke-border" strokeWidth=".6" />
          : null
      })}
      {Array.from({ length: rows + 1 }, (_, y) => Array.from({ length: columns }, (_, x) => {
        return solution[2 * y].slice(3 * x + 1, 3 * x + 3) === '##' &&
          <path key={`h${x}`} d={`M${x * 24},${y * 24}h24`} className="stroke-foreground" strokeWidth="1.8" />
      }))}
      {Array.from({ length: rows }, (_, y) => Array.from({ length: columns + 1 }, (_, x) => (
        solution[2 * y + 1][3 * x] === '#' &&
        <path key={`v${x}`} d={`M${x * 24},${y * 24}v24`} className="stroke-foreground" strokeWidth="1.8" />
      )))}
      {Array.from({ length: rows * columns }, (_, index) => {
        const x = index % columns
        const y = Math.floor(index / columns)
        const clue = wideShapeClues?.[index] ?? board[2 * y + 1].slice(3 * x + 1, 3 * x + 3)
        const image = cellClueImages.get(clue)
        const cells = shapeClues?.[clue]
        if (clue === 'C*') {
          const ordinal = [...board[2 * y + 1].slice(0, 3 * x).matchAll(/C\*/g)].length
          const compass = wideCellClues?.[`${y}:${ordinal}`]
          return compass ? <CompassClue key={index} x={24 * x} y={24 * y} clue={compass} /> : null
        }
        if (cells) return <ShapeClue key={index} x={24 * x} y={24 * y} clue={clue} cells={cells} />
        if (/^\d{2}$/.test(clue)) {
          return <text key={index} data-area-clue={clue} x={24 * x + 12} y={24 * y + 12}
            textAnchor="middle" dominantBaseline="central" fontSize="12" className="fill-foreground font-semibold tabular-nums">
            {Number(clue)}
          </text>
        }
        return image ? <image key={index} data-cell-clue={clue} href={image}
          x={24 * x} y={24 * y} width={24} height={24} /> : null
      })}
      {Array.from({ length: rows + 1 }, (_, y) => Array.from({ length: columns }, (_, x) => (
        <RelationClue key={x} x={24 * x + 12} y={24 * y} mark={horizontalGlimmithEdgeMark(board[2 * y], x)} />
      )))}
      {Array.from({ length: rows }, (_, y) => Array.from({ length: columns + 1 }, (_, x) => (
        <RelationClue key={x} x={24 * x} y={24 * y + 12} mark={board[2 * y + 1][3 * x]} />
      )))}
      {Array.from({ length: rows + 1 }, (_, y) => Array.from({ length: columns + 1 }, (_, x) => {
        const mark = glimmithVertexMark(board[2 * y], x)
        return mark && (
          <image key={x} data-vertex-clue={mark} href={vertexArt[mark]}
            x={24 * x - 5} y={24 * y - 5} width={10} height={10}>
            <title>{copy.vertexClue.replace('{count}', mark)}</title>
          </image>
        )
      }))}
      {shapeBank && <g data-shape-bank="" aria-label={copy.shapeBank}>
        {shapeBank.map((clue, index) => {
          const cells = shapeClues?.[clue]
          return cells && <ShapeClue key={index} clue={clue} cells={cells}
            x={(columns - shapeBank.length) * 12 + index * 24} y={rows * 24 + 4} />
        })}
      </g>}
    </svg>
  )
}

export function GlimmithTutorialPrototype() {
  const [selected, setSelected] = useState<string | null>(null)
  const [activeArea, setActiveArea] = useState(map.id)
  const [pinSize, setPinSize] = useState(overviewPuzzleScale)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [visible, setVisible] = useState<Set<string>>(() => new Set([...subtypes, 'note']))
  const [visibleRegions, setVisibleRegions] = useState(() => new Set(regionIds))
  const [completed, setCompleted] = useState(() => new Set(browserMemory.read(completedRecord, progressScope)))
  const mapMarkers = useMemo(() => markers
    .filter((marker) => {
      const region = markerRegions.get(marker.id)
      return region === undefined || visibleRegions.has(region)
    })
    .map((marker) => ({
      ...marker, completed: completed.has(marker.id),
      icon: marker.subtype === 'puzzle' && pinSize === overviewPuzzleScale ? puzzleDot : marker.icon,
      pinScale: marker.subtype === 'puzzle' ? pinSize : 0.88,
    })), [completed, pinSize, visibleRegions])
  const searchItems = useMemo(() => mapMarkers.map((marker) => ({
    ...marker,
    name: marker.localizedName,
    idLabel: marker.subtype === 'puzzle' ? marker.localizedName : undefined,
  })), [mapMarkers])
  const completedCount = [...completed].filter((id) => puzzles.has(id)).length
  const toggleCompleted = (id: string) => {
    const next = new Set(completed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    browserMemory.write(completedRecord, [...next], progressScope)
    setCompleted(next)
  }
  const ref = useRef<GlMapRef>(null)
  const mapViewport = useRef<HTMLElement>(null)
  const mobile = useIsMobile()
  const { theme, setTheme } = useTheme()
  const select = (id: string) => setSelected(id)
  const focusArea = (id: string) => {
    const area = windows.get(id)
    const viewport = mapViewport.current
    if (!viewport) return
    const ids = area ? new Set([id, ...area.prerequisites]) : null
    const points = ids ? markers.filter((marker) => ids.has(marker.id)) : markers
    // On phones the selector closes the sidebar; fit the reclaimed map width.
    const width = mobile ? document.documentElement.clientWidth : viewport.clientWidth
    const view = framePoints(points, width, viewport.clientHeight)
    setActiveArea(id)
    setSelected(null)
    setMobileSidebarOpen(false)
    ref.current?.flyTo(view.x, view.y, view.zoom)
  }
  const openLinkedMarker = (id: string) => {
    const target = markers.find((marker) => marker.id === id)
    if (!target) return
    const subtype = windows.has(id) ? 'window' : 'puzzle'
    setVisible((prev) => prev.has(subtype) ? prev : new Set([...prev, subtype]))
    const region = markerRegions.get(id)
    if (region) setVisibleRegions((prev) => new Set(prev).add(region))
    select(id)
    ref.current?.flyTo(target.x, target.y)
  }
  const marker = markers.find(({ id }) => id === selected)
  const renderMarkerDetail = (marker: EngineMarker) => {
    const window = windows.get(marker.id)
    const windowPrerequisites = window?.windowPrerequisites
    const unlockedArea = window?.unlockedAreaId
    const requirementsTitle = windowPrerequisites ? copy.perfectedRequirements : copy.requirements
    const actor = window ?? scene.actors.find(({ id }) => id === marker.id)
    const puzzle = puzzles.get(marker.id) as GlimmithPuzzle | undefined
    const linked = actor && 'unlocks' in actor ? actor.unlocks[0] : undefined
    const unlockCategory = actor && 'unlockCategory' in actor ? actor.unlockCategory : undefined
    const owningWindow = puzzleWindows.get(marker.id)
    const owningWindowName = owningWindow && windowNames.get(owningWindow.id)
    const unlockMessage = unlockCategory === 'GameCompletion' ? copy.gameCompletionUnlock
      : unlockCategory === 'AreaCompletion'
        ? owningWindowName && owningWindow
          ? copy.windowSilverUnlock.replace('{window}', owningWindowName).replace('{count}', String(owningWindow.thresholds[1]))
          : copy.areaCompletionUnlock
        : undefined
    const hasBridgeSecretSteps = marker.id === '0054.puz' && unlockCategory === 'GameCompletion'
    const unlocker = hasBridgeSecretSteps ? scene.actors.find(({ directory, unlocks }) => directory && unlocks.some((id) => id === marker.id)) : undefined
    const coordinate = actor ? [actor.x, actor.y, actor.z].map((value) => value.toFixed(1)).join(', ') : undefined
    return (
      <CommunityMarkerDetail key={marker.id} game="glimmith" mapId={map.id} markerId={puzzleNumber(marker.id)} hideGallery
        language="zh-CN" anchored={!mobile} allowHorizontalAvoidance denseHeader={Boolean(puzzle)}
        name={puzzle ? copy.puzzle + ' ' + marker.localizedName : marker.localizedName}
        icon={<img className={puzzle ? 'size-6 object-contain' : 'size-8 object-contain'} src={puzzle ? puzzleSquareIcon : marker.icon} alt="" />}
        eyebrow={puzzle ? undefined : marker.subtypeLabel}
        titleAccessory={marker.hoverBadge && <img className="size-5 object-contain" src={marker.hoverBadge.src} alt={marker.hoverBadge.alt} />}
        positionValue={coordinate} positionCopyValue={coordinate}
        completeAction={puzzle ? {
          completed: completed.has(marker.id), label: copy.markCompleted,
          completedLabel: copy.completed, onToggle: () => toggleCompleted(marker.id),
        } : undefined}
        labels={markerDetailLabelsFor('zh-CN')} onClose={() => setSelected(null)}
        sections={window ? [{
          id: 'window-requirements', title: requirementsTitle, accessibleTitle: requirementsTitle,
          content: <div className="grid gap-2 text-sm">
            <dl className="grid grid-cols-3 gap-x-2">
              {copy.milestones.map((label, i) => <div key={label} className="flex items-baseline gap-1.5 whitespace-nowrap">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">{window.thresholds[i]}</dd>
              </div>)}
            </dl>
            {windowPrerequisites && <>
              <p>{copy.perfectedRule}</p>
              <p>{copy.perfectedTotal.replace('{count}', String(windowPrerequisites.length))}</p>
              {unlockedArea && <p>
                {copy.perfectedUnlock.replace('{count}', String(window.unlockPuzzles?.length ?? 0))}
                <button type="button" className="text-primary underline" onClick={() => openLinkedMarker(unlockedArea)}>
                  {windowNames.get(unlockedArea)}
                </button>
              </p>}
            </>}
          </div>,
        }, windowPrerequisites ? {
          id: 'related-windows', title: copy.relatedWindows, accessibleTitle: copy.relatedWindows,
          content: <ul className="flex flex-wrap gap-2 text-sm">
            {windowPrerequisites.map((id) => <li key={id}>
              <button type="button" className="text-primary underline" onClick={() => openLinkedMarker(id)}>
                {windowNames.get(id)}
              </button>
            </li>)}
          </ul>,
        } : {
          id: 'window-puzzles', title: copy.related, accessibleTitle: copy.related,
          content: <ul className="flex flex-wrap gap-2 text-sm tabular-nums">
            {window.prerequisites.map((id) => <li key={id}>{puzzles.has(id)
              ? <button type="button" className="text-primary underline" onClick={() => openLinkedMarker(id)}>{puzzleNumber(id)}</button>
              : <span className="text-muted-foreground">{puzzleNumber(id)}</span>}</li>)}
          </ul>,
        }] : puzzle ? [...(unlockMessage ? [{
          id: 'unlock', title: copy.unlock, accessibleTitle: copy.unlock, defaultExpanded: true,
          content: <div className="grid gap-1 text-sm">
            {hasBridgeSecretSteps ? (
              <p><span className="whitespace-nowrap font-medium">{copy.postGameUnlock}</span>{copy.postGameStep}</p>
            ) : <p>{unlockMessage}</p>}
            {unlocker && <p className="text-muted-foreground">
              <button type="button" className="text-primary underline" onClick={() => openLinkedMarker(unlocker.id)}>
                {puzzleNumber(unlocker.id)}
              </button>{copy.linkedUnlockInsufficient}
            </p>}
          </div>,
        }] : []), {
          id: 'solution', title: copy.solution, accessibleTitle: copy.solution, defaultExpanded: true,
          content: <>
            <PuzzleRules puzzle={puzzle} />
            <PuzzleSolution puzzle={puzzle} />
          </>,
        }] : [{
          id: 'note', title: copy.note, accessibleTitle: copy.note, defaultExpanded: true,
          content: <div className="grid gap-2 text-sm"><p>{copy.noBoard}</p>{linked &&
            <button type="button" className="justify-self-start text-primary underline" onClick={() => openLinkedMarker(linked)}>
              {copy.openFirst}
            </button>}</div>,
        }]} />
    )
  }
  return (
    <ShellLayout topBar={<ArkiveMapTopBar className="max-md:flex max-md:gap-1 max-md:px-2 max-md:[&_nav]:hidden max-md:[&_[data-testid=game-chip]]:shrink max-md:[&_[data-testid=game-chip]]:pr-2" homeUrl="#top" homeLabel={copy.home}
      brandName="Arkive" variant="docked" game={{ name: copy.game, icon: gameIcon }} loginLabel={copy.account}
      accountSlot={<ArkiveAccountControl language="zh-CN" homeUrl="" />}
      nav={{ items: [{ key: GLIMMITH_MAP_PATH, label: copy.navMap, active: true }],
        renderItem: (item, className, labelClassName) => (
          <a href={item.key} className={className} aria-current="page">
            <span data-slot="nav-item-label" className={labelClassName}>{item.label}</span>
          </a>
        ),
      }}
      languageSwitcher={{ languages: [{ code: 'zh-CN', label: copy.language }], current: 'zh-CN', onChange: () => {}, menuLabel: copy.languageMenu }}
      themeSwitcher={{ current: theme, onChange: setTheme, menuLabel: copy.theme, labels: copy.themes }}
    />} sidebar={
      <ShellSidebar key={mobile ? 'mobile' : 'desktop'} defaultCollapsed={mobile} width="20rem"
        collapsed={mobile ? !mobileSidebarOpen : undefined}
        onCollapsedChange={mobile ? (collapsed) => setMobileSidebarOpen(!collapsed) : undefined}
        label={copy.map} collapseLabel={copy.collapse} expandLabel={copy.expand}
        classNames={{
          root: 'border-r border-border bg-[color:var(--arkive-sidebar)] font-sans text-sm text-foreground',
          collapseButton: 'top-4 border border-l-0 border-border bg-card text-foreground shadow-sm dark:text-white',
          content: 'pb-2',
        }}
        headerSlot={<ShellGameHeader backgroundUrl={headerArt} logo={null} gameName={copy.game} />}
        mapSelectorSlot={<div className="px-3 py-3 max-md:pr-8"><ShellMapSelect
          classNames={{
            trigger: 'min-h-11 rounded-xl border-border bg-card px-3 text-base font-semibold shadow-none hover:border-primary/40 hover:bg-card data-[state=open]:bg-card',
            content: 'border-border bg-popover',
          }}
          maps={mapOptions} activeMapId={activeArea} onSelectMap={focusArea} /></div>}>
        <FilterPanel categories={[
          { id: 'intro', label: copy.filters, subtypes: subtypes.map((id) => ({
            id, label: copy[id], active: visible.has(id),
            ...(id === 'puzzle' ? { badge: `${completedCount}/${puzzles.size}` }
              : { count: markers.filter((marker) => marker.subtype === id).length }),
          })) },
          { id: 'regions', label: copy.regions, subtypes: regionOptions.map(({ id, label, count }) => ({
            id: `region:${id}`, label, count, active: visibleRegions.has(id),
          })) },
        ]} onToggleSubtype={(id) => {
          if (id.startsWith('region:')) {
            const region = id.slice('region:'.length)
            if (selected && markerRegions.get(selected) === region) setSelected(null)
            setVisibleRegions((prev) => {
              const next = new Set(prev)
              if (next.has(region)) next.delete(region)
              else next.add(region)
              return next
            })
            return
          }
          setVisible((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }} onSetCategory={(category, enabled) => {
          if (!enabled) setSelected(null)
          if (category === 'regions') setVisibleRegions(new Set(enabled ? regionIds : []))
          else setVisible(new Set(enabled ? [...subtypes, 'note'] : []))
        }}
        categoryToggleLabels={{ show: copy.show, hide: copy.hide }}
        classNames={{
          root: 'px-3 pb-4',
          category: 'border-b border-[color:var(--arkive-divider)] py-1.5 last:border-b-0',
          categoryHeader: 'min-h-10 pt-0 pb-0 text-foreground [&>svg]:size-5 [&>svg]:text-foreground/55',
          categoryEyeToggle: 'text-foreground/55 hover:bg-[color:var(--arkive-filter-hover)] hover:text-primary',
          subtypeGrid: 'gap-x-2 gap-y-1.5 pb-2',
          subtypeButton: 'h-auto min-h-9 rounded-md border border-transparent bg-transparent px-2 text-xs font-medium text-muted-foreground opacity-65 hover:border-[color:var(--arkive-divider)] hover:bg-card hover:text-foreground hover:opacity-100',
          subtypeButtonActive: 'border-primary/20 bg-[color:var(--arkive-filter-active)] font-semibold text-foreground opacity-100 shadow-[inset_0.18rem_0_0_var(--arkive-orange)]',
        }} />
      </ShellSidebar>
    }>
      <main ref={mapViewport} className="relative flex min-h-0 flex-1 flex-col bg-[#243e4c]" aria-label={copy.map}>
        <GameMapView map={map} markers={mapMarkers} regions={[]} visibleSubtypes={visible}
          initialView={mobile ? undefined : desktopView}
          onViewChange={({ zoom }) => setPinSize(zoom < -1.2 ? overviewPuzzleScale : zoom < 0.25 ? 0.66 : 0.9)}
          showLabels={false} showBorders={false} lodEnabled={false} selectedMarkerId={selected} selectedPosition={null}
          onToggleMarker={setSelected} subzoneAt={() => ''} flyToDuration={0.35} mapRef={ref} assets={assets}
          exposeTestHandle={import.meta.env.DEV} labels={copy.engine} displayCoords={displayCoords}
          renderPopupContent={mobile ? () => null : renderMarkerDetail}
        />
        {mobile && marker && renderMarkerDetail(marker)}
        <SearchPanel items={searchItems} searchFields={['name', 'idLabel']} onSelect={select} displayCoords={displayCoords}
          classNames={{ root: [
            mobileSidebarOpen && 'max-md:hidden',
            selected && 'md:max-lg:invisible',
          ].filter(Boolean).join(' ') }}
          onFlyTo={({ x, y }) => ref.current?.flyTo(x, y)}
          labels={{ search: copy.search, resultsCount: (count) => String(count), unnamed: copy.unnamed, noDescription: copy.noDescription }} />
      </main>
    </ShellLayout>
  )
}
