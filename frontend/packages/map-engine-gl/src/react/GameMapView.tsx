import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  GameMapViewLabels,
  GameMapViewProps,
  GlMapRef,
} from "./engineTypes.ts";
import { DEFAULT_MAP_THEME } from "./theme.ts";
import { MapEngine, ZOOM_STEP } from "./mapEngine.ts";
import MapContextMenu, { type ContextMenuState } from "./MapContextMenu.tsx";
import MapStatusBar from "./MapStatusBar.tsx";
import MapZoomControl from "./MapZoomControl.tsx";

/**
 * The WebGL `GameMapView`: same props, same behaviour and same UI strings as
 * `@gamemap/map-engine`'s Leaflet view, with the tiles, regions and ~4k marker
 * sprites drawn in one GL scene instead of thousands of DOM nodes.
 *
 * ## What React does here, and what it does not
 * React renders the shell (root, canvas, overlay container, chrome, popup
 * content) and pushes prop changes into {@link MapEngine} through setters. It
 * does NOT participate in a frame: pan, zoom, hover, tooltip and popup
 * positioning are all imperative writes to refs and `style.transform`, and the
 * cursor readout goes through an external store. The only `setState` in the whole
 * view is the context menu's, once per right-click.
 *
 * That is a hard requirement, not an optimisation: the Leaflet engine floods the
 * console with "Maximum update depth exceeded" when a programmatic fly runs with
 * a popup open, and re-rendering this component would re-run the effect that owns
 * the GL context.
 *
 * ## Empty state
 * With no `map` the engine is never created and only `labels.noMapSelected`
 * renders — the same behaviour (and the same flex-fill container) as the Leaflet
 * engine's `.gm-map-empty`.
 */

/** Default UI strings; override via the `labels` prop (i18n stays app-side). */
const DEFAULT_LABELS: GameMapViewLabels = {
  copyPosition: "Copy position",
  noMapSelected: "No map selected.",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
};

const IDENTITY_COORDS = (x: number, y: number): { x: number; y: number } => ({ x, y });

/** `window.__glMap` — the e2e handle (see {@link GlMapRef}). */
interface TestHandleWindow {
  __glMap?: GlMapRef;
}

const GameMapView: React.FC<GameMapViewProps> = ({
  map: selectedMap,
  markers,
  regions,
  visibleSubtypes,
  visibleRegions,
  showLabels,
  showBorders,
  lodEnabled,
  selectedMarkerId,
  forceShowIds,
  selectedPosition,
  initialView,
  onViewChange,
  suppressInitialFlyForId,
  overlayLines,
  onToggleMarker,
  onHoverMarker,
  subzoneAt,
  flyToDuration,
  mapRef,
  assets,
  theme = DEFAULT_MAP_THEME,
  renderPopupContent,
  exposeTestHandle = false,
  labels = DEFAULT_LABELS,
  displayCoords = IDENTITY_COORDS,
}) => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MapEngine | null>(null);

  // Live prop mirror for the imperative callbacks: the engine is built once per
  // map and must always call the CURRENT callback, without being rebuilt (and
  // without capturing a stale closure) when one of them changes identity.
  // NOTE `assets` and `theme` are read at construction only; both are expected to
  // be reference-stable per game (the apps pass module-level constants). A new
  // `theme` object rebuilds the engine via `themeKey` below; a new `assets`
  // object does not, since the URLs it produces are what matter and those do not
  // change.
  const liveRef = useRef({
    map: selectedMap,
    onToggleMarker,
    onHoverMarker,
    onViewChange,
    flyToDuration,
    initialView,
    theme,
    assets,
  });
  liveRef.current = {
    map: selectedMap,
    onToggleMarker,
    onHoverMarker,
    onViewChange,
    flyToDuration,
    initialView,
    theme,
    assets,
  };

  /**
   * Preserved view, so a rebuild of the engine that is NOT a map switch (a theme
   * object change, a StrictMode remount) resumes where the user left off instead
   * of snapping back to `initialView`. Keyed by map id: switching maps and coming
   * back re-reads `initialView`, exactly as the Leaflet engine's keyed container
   * does.
   */
  const keptViewRef = useRef<{
    mapId: string;
    view: { x: number; y: number; zoom: number };
  } | null>(null);

  const mapId = selectedMap?.id;
  // The pin bitmaps bake the theme's colours in and `MarkerLayer` takes the theme
  // at construction, so a genuinely new palette rebuilds the engine. In practice
  // this never fires: apps pass a module-level constant, and dark mode arrives as
  // a CSS class (handled by `refreshThemeColors`, no rebuild).
  const themeKey = useMemo(() => JSON.stringify(theme), [theme]);

  // ---------------------------------------------------------------- engine ---

  // A LAYOUT effect: the engine must exist before the popup's own layout effect
  // (declared below) hands it the popup element, and measuring the container is
  // exactly what layout effects are for.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const map = liveRef.current.map;
    if (!map || !root || !canvas || !overlay) return;

    const kept =
      keptViewRef.current && keptViewRef.current.mapId === map.id
        ? keptViewRef.current.view
        : null;

    const engine = new MapEngine({
      map,
      assets: liveRef.current.assets,
      root,
      canvas,
      overlay,
      theme: liveRef.current.theme,
      initialView: kept ?? liveRef.current.initialView,
      flyToDuration: () => liveRef.current.flyToDuration,
      onSelect: (id) => liveRef.current.onToggleMarker(id),
      onHover: (id) => liveRef.current.onHoverMarker?.(id),
      onViewChange: (view) => liveRef.current.onViewChange?.(view),
      onContextMenu: (state) => setContextMenu(state),
    });
    engineRef.current = engine;

    return () => {
      // Remember where the user was before tearing down; on a map switch the id
      // will not match on the next mount, so `initialView` wins there.
      keptViewRef.current = { mapId: map.id, view: engine.currentView() };
      engineRef.current = null;
      engine.dispose();
    };
  }, [mapId, themeKey]);

  // The map object changed identity but not its id: re-project, do not rebuild.
  useEffect(() => {
    if (selectedMap) engineRef.current?.setMap(selectedMap);
  }, [selectedMap]);

  // ------------------------------------------------------------ prop → engine ---
  //
  // Every one of these depends on `mapId`/`themeKey` as well as on its own prop.
  // That is NOT redundant: a rebuild starts a fresh engine whose state is empty,
  // and a prop that did not change identity across the switch (the same
  // `visibleSubtypes` Set is the common case) would otherwise never be pushed —
  // leaving the new marker layer with no subtype filter, i.e. an empty map.

  useEffect(() => {
    engineRef.current?.setMarkers(markers);
  }, [markers, mapId, themeKey]);

  useEffect(() => {
    engineRef.current?.setVisibility({ visibleSubtypes, forceShowIds, lodEnabled });
  }, [visibleSubtypes, forceShowIds, lodEnabled, mapId, themeKey]);

  useEffect(() => {
    engineRef.current?.setSelected(selectedMarkerId);
  }, [selectedMarkerId, mapId, themeKey]);

  useEffect(() => {
    engineRef.current?.setShowLabels(showLabels);
  }, [showLabels, mapId, themeKey]);

  useEffect(() => {
    engineRef.current?.setRegions(regions);
  }, [regions, mapId, themeKey]);

  useEffect(() => {
    engineRef.current?.setVisibleRegions(visibleRegions);
  }, [visibleRegions, mapId, themeKey]);

  useEffect(() => {
    engineRef.current?.setShowBorders(showBorders);
  }, [showBorders, mapId, themeKey]);

  useEffect(() => {
    engineRef.current?.setOverlayLines(overlayLines);
  }, [overlayLines, mapId, themeKey]);

  // ------------------------------------------------------------- controllers ---

  const markerById = useMemo(() => {
    const byId = new Map<string, (typeof markers)[number]>();
    for (const m of markers) byId.set(m.id, m);
    return byId;
  }, [markers]);

  const selectedMarker = selectedMarkerId
    ? (markerById.get(selectedMarkerId) ?? null)
    : null;

  /**
   * Whether the one-shot fly suppression has been consumed. A restored selection
   * (set programmatically right after the map mounts at a restored view) must NOT
   * fly — flying would recenter on the marker and stomp the restored position.
   * Any later selection of the same id flies normally.
   */
  const suppressConsumedRef = useRef(false);
  // Declared BEFORE the fly effect on purpose: when the app swaps in a new
  // suppression id in the same commit that changes the selection, the re-arm must
  // run first so the new id gets its own suppressed first fly.
  //
  // `mapId`/`themeKey` re-arm it too, because the fly effect below re-runs on a
  // rebuild: without them a rebuild would fly to the already-selected marker and
  // stomp the view `keptViewRef` just restored — the exact thing the suppression
  // exists to prevent.
  useEffect(() => {
    suppressConsumedRef.current = false;
  }, [suppressInitialFlyForId, mapId, themeKey]);

  // Keyed on the selected marker's COORDS, never on the marker object: an
  // `EngineMarker` is rebuilt whenever app-side state folded into it changes (a
  // completion toggle), and re-running on that would yank the map back to the
  // marker mid-interaction.
  const markerX = selectedMarker?.x;
  const markerY = selectedMarker?.y;

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !selectedMarkerId) return;
    if (markerX == null || markerY == null) return;
    if (
      !suppressConsumedRef.current &&
      suppressInitialFlyForId != null &&
      selectedMarkerId === suppressInitialFlyForId
    ) {
      suppressConsumedRef.current = true;
      return;
    }
    engine.flyToData(markerX, markerY);
    // `suppressInitialFlyForId` is read, not reacted to: its arrival alone must
    // not trigger a fly for the already-selected marker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMarkerId, markerX, markerY, mapId, themeKey]);

  useEffect(() => {
    if (!selectedPosition) return;
    engineRef.current?.flyToData(selectedPosition.x, selectedPosition.y);
  }, [selectedPosition, mapId, themeKey]);

  // -------------------------------------------------------------------- popup ---

  /**
   * A LAYOUT effect, and that is the whole positioning story: refs are attached
   * and layout effects run inside the commit, BEFORE the browser paints, so the
   * popup's transform is already written the first time it is painted. There is
   * deliberately no render-time projection to "pre-place" it — that would mean
   * reading the mutable engine during render, which a discarded concurrent render
   * makes meaningless.
   */
  useLayoutEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setPopupElement(popupRef.current);
    engine.setPopupAnchor(selectedMarker ? selectedMarker.id : null);
  }, [selectedMarker, mapId, themeKey]);

  // --------------------------------------------------------------- handles ---

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const handle: GlMapRef = {
      getCenter: () => {
        const view = engine.currentView();
        return { x: view.x, y: view.y };
      },
      getZoom: () => engine.view.zoom,
      flyTo: (x, y, zoom, seconds) => engine.flyToData(x, y, zoom, seconds),
      project: (x, y) => engine.project(x, y),
      dispose: () => engine.dispose(),
    };
    mapRef.current = handle;
    const win = typeof window !== "undefined" ? (window as TestHandleWindow) : null;
    if (exposeTestHandle && win) win.__glMap = handle;
    return () => {
      if (mapRef.current === handle) mapRef.current = null;
      if (win && win.__glMap === handle) delete win.__glMap;
    };
  }, [mapRef, exposeTestHandle, mapId, themeKey]);

  // ----------------------------------------------------------------- chrome ---

  const closeMenu = useCallback(() => {
    engineRef.current?.notifyMenuClosed();
    setContextMenu(null);
  }, []);

  const handleCopyPosition = useCallback((x: number, y: number) => {
    const text = `${Math.round(x)}, ${Math.round(y)}`;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .catch((err) => console.error("Clipboard error", err));
    } else {
      // No Clipboard API (insecure origin, or an old browser): say what would
      // have been copied rather than fail silently.
      console.log("Copied position:", text);
    }
  }, []);

  if (!selectedMap) {
    return <div className="gmgl-map-empty">{labels.noMapSelected}</div>;
  }

  const popupContent = selectedMarker ? renderPopupContent(selectedMarker) : null;

  return (
    <div
      // `isolation: isolate` (engine-gl.css) gives the map its own stacking
      // context so its internal high z-indexes stay contained and never paint
      // over body-level portals (dialogs, tooltips).
      className="gmgl-map-root"
      ref={rootRef}
      onClick={closeMenu}
    >
      <canvas
        ref={canvasRef}
        className="gmgl-map-canvas"
        data-testid="gl-map-canvas"
        // The gesture binding attaches to THIS element, not the root: the chrome
        // (zoom pill, context menu, popup) are siblings above it, so their
        // pointer events never reach it and a click on a button can never be
        // mistaken for a background tap that deselects.
      />
      {/* Tooltip + permanent labels. React renders it EMPTY — `MarkerOverlay`
          owns its children imperatively, which is what keeps a pan from
          re-rendering up to 300 React nodes. */}
      <div ref={overlayRef} className="gmgl-overlay" aria-hidden="true" />

      {selectedMarker && popupContent != null && (
        <div
          ref={popupRef}
          className="gmgl-popup"
        >
          {/* Selection is the ONLY source of truth for whether this is open:
              there is no close button and no close-on-click, so the popup and
              `selectedMarkerId` can never disagree (the Leaflet engine needs
              `closeOnClick`/`autoClose` disabled for the same reason). */}
          {popupContent}
        </div>
      )}

      <MapZoomControl
        glyphColor={theme.zoomGlyph}
        zoomInLabel={labels.zoomIn}
        zoomOutLabel={labels.zoomOut}
        onZoomIn={() => engineRef.current?.zoomBy(ZOOM_STEP)}
        onZoomOut={() => engineRef.current?.zoomBy(-ZOOM_STEP)}
      />

      {/* Subscribes to the cursor store itself, so pointer movement re-renders
          ONLY the bar — never this component (and never the GL effects). */}
      <MapStatusBar
        displayCoords={displayCoords}
        subzoneAt={subzoneAt}
        footerText={labels.footerText}
        pillBg={theme.statusPillBg}
      />

      {contextMenu && (
        <MapContextMenu
          state={contextMenu}
          copyPositionLabel={labels.copyPosition}
          displayCoords={displayCoords}
          onCopy={handleCopyPosition}
          onClose={closeMenu}
        />
      )}
    </div>
  );
};

export default GameMapView;
