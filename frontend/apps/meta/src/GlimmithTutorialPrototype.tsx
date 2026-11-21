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
import puzzleIcon from './assets/glimmith-marker-puzzle.svg'
import noteIcon from './assets/glimmith-marker-note.svg'
import copy from './glimmithLocale.json'
import '@gamemap/map-engine-gl/engine-gl.css'

const map: GameMapMeta = {
  id: 'intro', name: copy.intro, type: 'world', isVisible: true,
  tileWidth: scene.height, tileHeight: scene.height, tilesCountX: scene.width / scene.height, tilesCountY: 1,
  worldBounds: scene.bounds, orientation: { pxAxis: 'X', flipX: true, flipY: true },
}
const entries = new Map(Object.entries(copy.entries))
const markers: EngineMarker[] = scene.actors.map(({ id, x, y, z, widget }, index) => {
  const subtype = widget ? 'note' : 'puzzle'
  const icon = widget ? noteIcon : puzzleIcon
  return {
    id, x, y, z, subtype, icon, positionPrecision: 'authored-transform', indexInSubtype: index,
    images: [], contributors: [], localizedName: entries.get(id)?.title ?? id,
    localizedDescription: entries.get(id)?.description,
    subtypeLabel: copy[subtype], subtypeMeta: { id: subtype, name: copy[subtype], icon, pinVariant: 'image' },
  }
})
const assets = { tileUrl: (_map: GameMapMeta, x: number) => x === 0 ? terrainWest : terrainEast, markerIconUrl: (icon?: string) => icon ?? '' }
const subtypes = ['note', 'puzzle'] as const
const mapOptions = [{ id: map.id, label: map.name }]
const searchItems = markers.map((marker) => ({ ...marker, name: marker.localizedName, idLabel: marker.id }))

function PuzzleBoard({ solved }: { solved: boolean }) {
  const { columns, rows, board, solution } = scene.puzzle
  const frame = solved ? solution : board
  return (
    <svg role="img" aria-label={solved ? copy.solution : copy.board}
      viewBox={`-2 -2 ${columns * 24 + 4} ${rows * 24 + 4}`} className="mx-auto w-full max-w-48">
      {Array.from({ length: rows * columns }, (_, index) => {
        const x = index % columns
        const y = Math.floor(index / columns)
        return board[2 * y + 1][3 * x + 1] === '.'
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
        headerSlot={<ShellGameHeader backgroundUrl={terrainWest} logo={null} gameName="The Artisan of Glimmith" subtitle={copy.map} />}
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
          showLabels showBorders={false} lodEnabled={false} selectedMarkerId={selected} selectedPosition={null}
          onToggleMarker={setSelected} subzoneAt={() => copy.intro} flyToDuration={0.35} mapRef={ref} assets={assets}
          exposeTestHandle={import.meta.env.DEV} labels={copy.engine}
          renderPopupContent={() => null}
        />
        {marker && (() => {
            const actor = scene.actors.find(({ id }) => id === marker.id)
            const isPuzzle = marker.id === '0049.puz'
            const linked = actor?.unlocks[0]
            const coordinate = [marker.x, marker.y, marker.z ?? 0].map((value) => value.toFixed(1)).join(', ')
            return <MarkerDetailDrawer key={marker.id} name={marker.localizedName}
              className="md:top-20"
              icon={<img className="size-8 object-contain" src={marker.icon} alt="" />} eyebrow={marker.subtypeLabel}
              positionValue={coordinate} positionCopyValue={coordinate}
              labels={markerDetailLabelsFor('zh-CN')} onClose={() => setSelected(null)}
              description={marker.localizedDescription}
              sections={isPuzzle ? [{
                id: 'solution', title: copy.solution, accessibleTitle: copy.solution, defaultExpanded: true,
                content: <div className="grid grid-cols-2 gap-3 text-center text-xs">
                  <figure><figcaption className="mb-2">{copy.board}</figcaption><PuzzleBoard solved={false} /></figure>
                  <figure><figcaption className="mb-2">{copy.solution}</figcaption><PuzzleBoard solved /></figure>
                </div>,
              }] : [{
                id: 'note', title: copy.note, accessibleTitle: copy.note, defaultExpanded: true,
                content: <div className="grid gap-2 text-sm"><p>{copy.noBoard}</p>{linked &&
                  <button type="button" className="justify-self-start text-primary underline" onClick={() => select(linked)}>
                    {copy.openFirst}
                  </button>}</div>,
              }]} />
        })()}
        <SearchPanel items={searchItems} searchFields={['name', 'idLabel']} onSelect={select}
          classNames={mobileSidebarOpen ? { root: 'max-md:hidden' } : undefined}
          onFlyTo={({ x, y }) => ref.current?.flyTo(x, y)}
          labels={{ search: copy.search, resultsCount: (count) => String(count), unnamed: copy.unnamed, noDescription: copy.noDescription }} />
      </main>
    </ShellLayout>
  )
}
