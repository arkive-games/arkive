import { useRef, useState } from 'react'
import type { GameMapMeta } from '@gamemap/data-contract'
import { GameMapView, type EngineMarker, type GlMapRef } from '@gamemap/map-engine-gl'
import {
  ArkiveMapTopBar, FilterPanel, MarkerDetailDrawer, markerDetailLabelsFor,
  SearchPanel, ShellGameHeader, ShellLayout, ShellMapSelect, ShellSidebar, useTheme,
} from '@gamemap/map-shell'
import { useIsMobile } from '@gamemap/ui'
import scene from './assets/glimmith-scene.json'
import terrainWest from './assets/glimmith-terrain-0.svg'
import terrainEast from './assets/glimmith-terrain-1.svg'
import terrainSouthwest from './assets/glimmith-terrain-2.svg'
import terrainSoutheast from './assets/glimmith-terrain-3.svg'
import puzzleIcon from './assets/glimmith-marker-puzzle.svg'
import noteIcon from './assets/glimmith-marker-note.svg'
import windowIcon from './assets/glimmith-marker-window.svg'
import difficultyOne from './assets/glimmith-difficulty-1.png'
import difficultyTwo from './assets/glimmith-difficulty-2.png'
import difficultyThree from './assets/glimmith-difficulty-3.png'
import headerArt from './assets/glimmith-steam-scenery.jpg'
import copy from './glimmithLocale.json'
import '@gamemap/map-engine-gl/engine-gl.css'

const map: GameMapMeta = {
  id: 'intro', name: copy.intro, type: 'world', isVisible: true,
  tileWidth: scene.tileSize, tileHeight: scene.tileSize,
  tilesCountX: scene.width / scene.tileSize, tilesCountY: scene.height / scene.tileSize,
}
const windowNames = new Map(Object.entries(copy.windows))
const puzzles = new Map(Object.entries(scene.puzzles))
const windows = new Map(scene.windows.map((window) => [window.id, window]))
const difficultyArt = new Map([[1, difficultyOne], [2, difficultyTwo], [3, difficultyThree]])
const puzzleNumber = (id: string) => id.replace(/\.puz$/, '')
const markers: EngineMarker[] = scene.actors.map(({ id, pixel, z, widget }, index) => {
  const subtype = widget ? 'note' : 'puzzle'
  const icon = widget ? noteIcon : puzzleIcon
  const difficulty = puzzles.get(id)?.difficulty
  const badge = difficulty == null ? undefined : difficultyArt.get(difficulty)
  return {
    id, ...pixel, z, subtype, icon, positionPrecision: 'authored-transform', indexInSubtype: index,
    images: [], contributors: [],
    localizedName: widget ? id.replace(/^Tutorial-/, copy.note + ' ') : puzzleNumber(id),
    hoverBadge: badge ? { src: badge, alt: copy.difficulty + ' ' + difficulty } : null,
    subtypeLabel: copy[subtype], subtypeMeta: { id: subtype, name: copy[subtype], icon, pinVariant: 'image' },
  }
})
markers.push(...scene.windows.map((window, index): EngineMarker => ({
  id: window.id, ...window.pixel, z: window.z, subtype: 'window', icon: windowIcon,
  positionPrecision: 'authored-transform', indexInSubtype: index, images: [], contributors: [],
  localizedName: windowNames.get(window.id) ?? copy.window, subtypeLabel: copy.window, hoverBadge: null,
  subtypeMeta: { id: 'window', name: copy.window, icon: windowIcon, pinVariant: 'image' },
})))
const terrainTiles = [terrainWest, terrainEast, terrainSouthwest, terrainSoutheast]
const assets = { tileUrl: (_map: GameMapMeta, x: number, y: number) => terrainTiles[y * map.tilesCountX + x], markerIconUrl: (icon?: string) => icon ?? '' }
const angle = scene.projection.degrees * Math.PI / 180
const displayCoords = (x: number, y: number) => {
  const dx = (x - scene.width / 2) / scene.projection.scale
  const dy = (y - scene.height / 2) / scene.projection.scale
  return {
    x: scene.projection.centerX - (dx * Math.cos(angle) + dy * Math.sin(angle)),
    y: scene.projection.centerY - (-dx * Math.sin(angle) + dy * Math.cos(angle)),
  }
}
const subtypes = ['note', 'puzzle', 'window'] as const
const mapOptions = [{ id: map.id, label: map.name }]
const searchItems = markers.map((marker) => ({
  ...marker,
  name: marker.localizedName,
  idLabel: marker.subtype === 'puzzle' ? marker.localizedName : undefined,
}))

function PuzzleSolution({ puzzle }: { puzzle: (typeof scene.puzzles)['0049.puz'] }) {
  const { columns, rows, board, solution } = puzzle
  return (
    <svg role="img" aria-label={copy.solution}
      viewBox={`-2 -2 ${columns * 24 + 4} ${rows * 24 + 4}`} className="mx-auto w-full max-w-48">
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
    </svg>
  )
}

export function GlimmithTutorialPrototype() {
  const [selected, setSelected] = useState<string | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [visible, setVisible] = useState<Set<string>>(() => new Set(subtypes))
  const ref = useRef<GlMapRef>(null)
  const mobile = useIsMobile()
  const { theme, setTheme } = useTheme()
  const select = (id: string) => setSelected(id)
  const openLinkedPuzzle = (id: string) => {
    const target = markers.find((marker) => marker.id === id)
    if (!target) return
    setVisible((prev) => prev.has('puzzle') ? prev : new Set([...prev, 'puzzle']))
    select(id)
    ref.current?.flyTo(target.x, target.y)
  }
  const marker = markers.find(({ id }) => id === selected)
  const renderMarkerDetail = (marker: EngineMarker) => {
    const window = windows.get(marker.id)
    const actor = window ?? scene.actors.find(({ id }) => id === marker.id)
    const puzzle = puzzles.get(marker.id)
    const linked = actor && 'unlocks' in actor ? actor.unlocks[0] : undefined
    const coordinate = actor ? [actor.x, actor.y, actor.z].map((value) => value.toFixed(1)).join(', ') : undefined
    return (
      <MarkerDetailDrawer key={marker.id} anchored={!mobile} compact={Boolean(puzzle)}
        name={puzzle ? copy.puzzle + ' ' + marker.localizedName : marker.localizedName}
        icon={<img className={puzzle ? 'size-6 object-contain' : 'size-8 object-contain'} src={marker.icon} alt="" />}
        eyebrow={puzzle ? undefined : marker.subtypeLabel}
        titleAccessory={marker.hoverBadge && <img className="size-5 object-contain" src={marker.hoverBadge.src} alt={marker.hoverBadge.alt} />}
        positionValue={puzzle ? undefined : coordinate} positionCopyValue={puzzle ? undefined : coordinate}
        labels={markerDetailLabelsFor('zh-CN')} onClose={() => setSelected(null)}
        sections={window ? [{
          id: 'window-requirements', title: copy.requirements, accessibleTitle: copy.requirements,
          content: <dl className="grid grid-cols-3 gap-x-2 text-sm">
            {copy.milestones.map((label, i) => <div key={label} className="flex items-baseline gap-1.5 whitespace-nowrap">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-semibold tabular-nums">{window.thresholds[i]}</dd>
            </div>)}
          </dl>,
        }, {
          id: 'window-puzzles', title: copy.related, accessibleTitle: copy.related,
          content: <ul className="flex flex-wrap gap-2 text-sm tabular-nums">
            {window.prerequisites.map((id) => <li key={id}>{puzzles.has(id)
              ? <button type="button" className="text-primary underline" onClick={() => openLinkedPuzzle(id)}>{puzzleNumber(id)}</button>
              : <span className="text-muted-foreground">{puzzleNumber(id)}</span>}</li>)}
          </ul>,
        }] : puzzle ? [{
          id: 'solution', title: copy.solution, accessibleTitle: copy.solution, defaultExpanded: true,
          content: <PuzzleSolution puzzle={puzzle} />,
        }] : [{
          id: 'note', title: copy.note, accessibleTitle: copy.note, defaultExpanded: true,
          content: <div className="grid gap-2 text-sm"><p>{copy.noBoard}</p>{linked &&
            <button type="button" className="justify-self-start text-primary underline" onClick={() => openLinkedPuzzle(linked)}>
              {copy.openFirst}
            </button>}</div>,
        }]} />
    )
  }
  return (
    <ShellLayout topBar={<ArkiveMapTopBar className="max-md:flex" homeUrl="#top" homeLabel={copy.home}
      brandName="Arkive" variant="docked" loginLabel={copy.account}
      nav={{ items: [], renderItem: () => null }}
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
        headerSlot={<ShellGameHeader backgroundUrl={headerArt} logo={null} gameName={copy.game} subtitle={copy.map} />}
        mapSelectorSlot={<div className="px-3 py-3 max-md:pr-8"><ShellMapSelect
          classNames={{
            trigger: 'min-h-11 rounded-xl border-border bg-card px-3 text-base font-semibold shadow-none hover:border-primary/40 hover:bg-card data-[state=open]:bg-card',
            content: 'border-border bg-popover',
          }}
          maps={mapOptions} activeMapId={map.id} onSelectMap={() => setSelected(null)} /></div>}>
        <FilterPanel categories={[{ id: 'intro', label: copy.intro, subtypes: subtypes.map((id) => ({
          id, label: copy[id], active: visible.has(id), count: markers.filter((marker) => marker.subtype === id).length,
        })) }]} onToggleSubtype={(id) => setVisible((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })} onSetCategory={(_, enabled) => setVisible(new Set(enabled ? subtypes : []))}
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
      <main className="relative flex min-h-0 flex-1 flex-col bg-[#243e4c]" aria-label={copy.map}>
        <GameMapView map={map} markers={markers} regions={[]} visibleSubtypes={visible}
          initialView={mobile ? undefined : { x: 1024, y: 1050, zoom: -0.94 }}
          showLabels={false} showBorders={false} lodEnabled={false} selectedMarkerId={selected} selectedPosition={null}
          onToggleMarker={setSelected} subzoneAt={() => copy.intro} flyToDuration={0.35} mapRef={ref} assets={assets}
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
