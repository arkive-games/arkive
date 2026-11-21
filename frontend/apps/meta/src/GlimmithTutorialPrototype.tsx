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
import copy from './glimmithLocale.json'
import '@gamemap/map-engine-gl/engine-gl.css'

const map: GameMapMeta = {
  id: 'intro', name: copy.intro, type: 'world', isVisible: true,
  tileWidth: scene.tileSize, tileHeight: scene.tileSize,
  tilesCountX: scene.width / scene.tileSize, tilesCountY: scene.height / scene.tileSize,
}
const entries = new Map(Object.entries(copy.entries))
const markers: EngineMarker[] = scene.actors.map(({ id, pixel, z, widget }, index) => {
  const subtype = widget ? 'note' : 'puzzle'
  const icon = widget ? noteIcon : puzzleIcon
  return {
    id, ...pixel, z, subtype, icon, positionPrecision: 'authored-transform', indexInSubtype: index,
    images: [], contributors: [], localizedName: entries.get(id)?.title ?? id,
    localizedDescription: entries.get(id)?.description,
    subtypeLabel: copy[subtype], subtypeMeta: { id: subtype, name: copy[subtype], icon, pinVariant: 'image' },
  }
})
const terrainTiles = [terrainWest, terrainEast, terrainSouthwest, terrainSoutheast]
const assets = { tileUrl: (_map: GameMapMeta, x: number, y: number) => terrainTiles[y * map.tilesCountX + x], markerIconUrl: (icon?: string) => icon ?? '' }
const puzzles = new Map(Object.entries(scene.puzzles))
const angle = scene.projection.degrees * Math.PI / 180
const displayCoords = (x: number, y: number) => {
  const dx = (x - scene.width / 2) / scene.projection.scale
  const dy = (y - scene.height / 2) / scene.projection.scale
  return {
    x: scene.projection.centerX - (dx * Math.cos(angle) + dy * Math.sin(angle)),
    y: scene.projection.centerY - (-dx * Math.sin(angle) + dy * Math.cos(angle)),
  }
}
const subtypes = ['note', 'puzzle'] as const
const mapOptions = [{ id: map.id, label: map.name }]
const searchItems = markers.map((marker) => ({ ...marker, name: marker.localizedName, idLabel: marker.id }))

function PuzzleBoard({ puzzle, solved }: { puzzle: (typeof scene.puzzles)['0049.puz']; solved: boolean }) {
  const { columns, rows, board, solution } = puzzle
  const frame = solved ? solution : board
  return (
    <svg role="img" aria-label={solved ? copy.solution : copy.board}
      viewBox={`-2 -2 ${columns * 24 + 4} ${rows * 24 + 4}`} className="mx-auto w-full max-w-48">
      {Array.from({ length: rows * columns }, (_, index) => {
        const x = index % columns
        const y = Math.floor(index / columns)
        return board[2 * y + 1].slice(3 * x + 1, 3 * x + 3).trim()
          ? <rect key={index} x={24 * x} y={24 * y} width={24} height={24} className="fill-muted stroke-border" strokeWidth=".6" />
          : null
      })}
      {Array.from({ length: rows + 1 }, (_, y) => Array.from({ length: columns }, (_, x) => {
        const horizontal = frame[2 * y].slice(3 * x + 1, 3 * x + 3)
        return (solved ? horizontal === '##' : horizontal === '--') &&
          <path key={`h${x}`} d={`M${x * 24},${y * 24}h24`} className="stroke-foreground" strokeWidth="1.8" />
      }))}
      {Array.from({ length: rows }, (_, y) => Array.from({ length: columns + 1 }, (_, x) => (
        frame[2 * y + 1][3 * x] === (solved ? '#' : '|') &&
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
  const marker = markers.find(({ id }) => id === selected)
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
        headerSlot={<ShellGameHeader backgroundUrl={terrainSouthwest} logo={null} gameName="The Artisan of Glimmith" subtitle={copy.map} />}
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
        <div className="grid gap-1 px-3 pb-3">
          {markers.map((marker) => <button key={marker.id} type="button" aria-pressed={selected === marker.id}
            className="flex min-h-10 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted aria-pressed:bg-muted"
            onClick={() => select(marker.id)}><img className="size-6 shrink-0 object-contain" src={marker.icon} alt="" />{marker.localizedName}</button>)}
        </div>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">{copy.coverage}</p>
      </ShellSidebar>
    }>
      <main className="relative flex min-h-0 flex-1 flex-col bg-[#243e4c]" aria-label={copy.map}>
        <GameMapView map={map} markers={markers} regions={[]} visibleSubtypes={visible}
          initialView={mobile ? undefined : { x: 1024, y: 1050, zoom: -0.94 }}
          showLabels showBorders={false} lodEnabled={false} selectedMarkerId={selected} selectedPosition={null}
          onToggleMarker={setSelected} subzoneAt={() => copy.intro} flyToDuration={0.35} mapRef={ref} assets={assets}
          exposeTestHandle={import.meta.env.DEV} labels={copy.engine} displayCoords={displayCoords}
          renderPopupContent={() => null}
        />
        {marker && (() => {
            const actor = scene.actors.find(({ id }) => id === marker.id)
            const puzzle = puzzles.get(marker.id)
            const linked = actor?.unlocks[0]
            const coordinate = actor ? [actor.x, actor.y, actor.z].map((value) => value.toFixed(1)).join(', ') : undefined
            return <MarkerDetailDrawer key={marker.id} name={marker.localizedName}
              className="md:top-20"
              icon={<img className="size-8 object-contain" src={marker.icon} alt="" />} eyebrow={marker.subtypeLabel}
              positionValue={coordinate} positionCopyValue={coordinate}
              labels={markerDetailLabelsFor('zh-CN')} onClose={() => setSelected(null)}
              description={marker.localizedDescription}
              sections={puzzle ? [{
                id: 'solution', title: copy.solution, accessibleTitle: copy.solution, defaultExpanded: true,
                content: <div className="grid grid-cols-2 gap-3 text-center text-xs">
                  <figure><figcaption className="mb-2">{copy.board}</figcaption><PuzzleBoard puzzle={puzzle} solved={false} /></figure>
                  <figure><figcaption className="mb-2">{copy.solution}</figcaption><PuzzleBoard puzzle={puzzle} solved /></figure>
                </div>,
              }] : [{
                id: 'note', title: copy.note, accessibleTitle: copy.note, defaultExpanded: true,
                content: <div className="grid gap-2 text-sm"><p>{copy.noBoard}</p>{linked &&
                  <button type="button" className="justify-self-start text-primary underline" onClick={() => select(linked)}>
                    {copy.openFirst}
                  </button>}</div>,
              }]} />
        })()}
        <SearchPanel items={searchItems} searchFields={['name', 'idLabel']} onSelect={select} displayCoords={displayCoords}
          classNames={mobileSidebarOpen ? { root: 'max-md:hidden' } : undefined}
          onFlyTo={({ x, y }) => ref.current?.flyTo(x, y)}
          labels={{ search: copy.search, resultsCount: (count) => String(count), unnamed: copy.unnamed, noDescription: copy.noDescription }} />
      </main>
    </ShellLayout>
  )
}
