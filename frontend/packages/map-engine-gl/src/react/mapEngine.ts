import type { GameMapMeta, RegionInstance } from "@gamemap/data-contract";
import type { MapAssets } from "../core/assets.ts";
import { Camera } from "../core/camera.ts";
import { dataToPoint, mapHeightOf, mapWidthOf, pointToData } from "../core/coords.ts";
import {
  attachGestures,
  type GestureController,
  type GestureTarget,
} from "../core/gestures.ts";
import {
  MarkerLayer,
  visibleTierForZoom,
  type MarkerVisibility,
} from "../core/markerLayer.ts";
import { MapRenderer } from "../core/renderer.ts";
import {
  createTileLayers,
  type TileLayer,
  type WatermarkLayer,
} from "../core/tileLayer.ts";
import type { Point } from "../core/types.ts";
import {
  DEFAULT_VECTOR_COLORS,
  VectorLayer,
  type OverlayLine,
} from "../core/vectorLayer.ts";
import { cursorStore } from "./cursorStore.ts";
import {
  measureElement,
  observeDevicePixelRatio,
  observeElementSize,
  observeThemeClass,
  resolveCssColor,
} from "./domEnv.ts";
import {
  collectLabelSources,
  markerLabelText,
  MarkerOverlay,
  type LabelMarker,
} from "./markerOverlay.ts";
import type { ContextMenuState } from "./MapContextMenu.tsx";
import { createRenderBackend } from "./renderBackend.ts";
import type { MapTheme } from "./theme.ts";

/**
 * The imperative engine behind `GameMapView`: one camera, one renderer, the four
 * layers, the gesture binding and the DOM overlay, wired together and driven by
 * setters.
 *
 * ## Why this is a class and not hooks
 * Everything here is per-frame or per-pointer work on mutable GPU/DOM state.
 * Expressed as React state it would re-render the component (and therefore
 * re-run the effects that own the GL context) up to 60 times a second — which is
 * both the stutter this engine exists to remove and the source of the Leaflet
 * engine's known "Maximum update depth exceeded" flood when a fly animation runs
 * with a popup open. So: React owns the props and the chrome, this class owns
 * everything that changes per frame, and the only React state left in the view is
 * the context menu (one `setState` per right-click).
 *
 * ## Ownership
 * The engine creates and disposes the renderer, the layers, the gesture
 * controller and the overlay nodes. It does NOT create the DOM elements it is
 * handed (root, canvas, overlay container, popup) — React does, and React removes
 * them.
 *
 * ## It lives under `src/react/`, but it contains no React
 * There is not one import from `react` below, and there is no reason a WeChat
 * mini-program host could not lift this file wholesale. Exactly four things tie it
 * to a browser, all of them small and all of them replaceable:
 *  - `./domEnv.ts` — element measurement, DPR detection, CSS-token resolution;
 *  - the popup, which is an `HTMLElement` handed in and positioned by writing
 *    `style.transform`;
 *  - `MarkerOverlay`, which creates DOM nodes for the tooltip and the labels;
 *  - `./cursorStore.ts`, a plain observable that happens to feed a React
 *    component.
 * It sits here (and is not exported from the barrel) because `GameMapView` is its
 * only consumer today; a second host is the moment to move it to `src/core/`
 * behind a small host adapter, not before.
 */

/** Zoom range, identical to the Leaflet engine's map container. */
export const MIN_ZOOM = -3;
export const MAX_ZOOM = 2;

/** Zoom step of the +/− buttons (Leaflet `zoomDelta`), and its animation. */
export const ZOOM_STEP = 0.25;
export const ZOOM_STEP_SECONDS = 0.25;

/**
 * Distance from the marker anchor to the popup card's BOTTOM edge, CSS px.
 *
 * Leaflet reaches the same place in two hops: the icon's `popupAnchor` ([0, -10],
 * i.e. 10 px above the pin's centre) and the popup's own `offset` ([0, -4]).
 * Their sum is this constant.
 */
export const POPUP_OFFSET_Y = 14;

/** Free space auto-pan keeps around the popup, CSS px (Leaflet `autoPanPadding`). */
export const POPUP_AUTOPAN_PAD = 5;

/**
 * A real DOM element does NOT structurally satisfy `core/gestures.ts`'
 * {@link GestureTarget}: that interface declares its listener as
 * `(ev: never) => void`, and under `strictFunctionTypes` no `EventTarget`'s
 * `addEventListener` is assignable to it (`Event` is not assignable to `never`).
 * The core interface means "any listener", so the cast is sound — but it is a
 * core-side signature bug worth fixing there (`(ev: never)` → a generic or
 * `(ev: Event)`), which is why this is one named helper instead of an inline cast
 * repeated per call site.
 */
export function asGestureTarget(el: HTMLElement): GestureTarget {
  return el as unknown as GestureTarget;
}

export interface MapEngineOptions {
  map: GameMapMeta;
  assets: MapAssets;
  /** Positioning parent of the chrome; also the element the theme is read from. */
  root: HTMLElement;
  /** The GL surface. The gesture binding attaches HERE, not to the root. */
  canvas: HTMLCanvasElement;
  /** Container for the tooltip + label nodes. React must render it empty. */
  overlay: HTMLElement;
  theme: MapTheme;
  /** Mount view in DATA space; invalid/absent → whole map at {@link MIN_ZOOM}. */
  initialView?: { x: number; y: number; zoom: number } | null;
  minZoom?: number;
  maxZoom?: number;
  /** Read live, so a prop change applies to the next fly without a rebuild. */
  flyToDuration: () => number;
  /** A tap on a marker (id) or on the background (null). */
  onSelect: (markerId: string | null) => void;
  /** Hovered marker id, or `null` when the pointer leaves every marker. */
  onHover: (markerId: string | null) => void;
  /** End of gesture / end of fly / mount, coalesced, in DATA space. */
  onViewChange: (view: { x: number; y: number; zoom: number }) => void;
  /** Open the context menu, or close it (`null`). */
  onContextMenu: (state: ContextMenuState | null) => void;
}

export class MapEngine {
  private readonly opts: MapEngineOptions;
  private readonly camera: Camera;
  private readonly renderer: MapRenderer;
  private readonly tiles: TileLayer;
  private readonly watermark: WatermarkLayer | null;
  private readonly vectors: VectorLayer;
  private readonly markerLayer: MarkerLayer;
  private readonly gestures: GestureController;
  private readonly overlay: MarkerOverlay;
  private readonly unobserveDpr: () => void;
  private readonly unobserveTheme: () => void;

  private map: GameMapMeta;
  private markers: readonly LabelMarker[] = [];
  /** `id → marker`, for the tooltip lookup (which must not scan ~4k markers). */
  private markerById = new Map<string, LabelMarker>();
  private visibility: MarkerVisibility = {};
  private selectedId: string | null = null;
  private showLabels = false;

  /** Element rendered by React for the selected marker's popup, if any. */
  private popupEl: HTMLElement | null = null;
  private popupAnchorId: string | null = null;
  /** Set when a popup opened and its auto-pan has not been applied yet. */
  private popupNeedsAutoPan = false;

  private lastPointer: Point | null = null;
  private reportedHoverMarkerId: string | null = null;
  private hoveredMarkerId: string | null = null;
  /** Re-entrancy guard for the overlay pass (auto-pan moves the camera). */
  private overlayRunning = false;
  private lastLabelTier: number;
  private lastReported: { x: number; y: number; zoom: number } | null = null;
  private menuOpen = false;
  private disposed = false;

  constructor(opts: MapEngineOptions) {
    this.opts = opts;
    this.map = opts.map;
    const { width, height } = measureElement(opts.root);
    const minZoom = opts.minZoom ?? MIN_ZOOM;
    const maxZoom = opts.maxZoom ?? MAX_ZOOM;

    // The mount view is read ONCE, here. `Camera` clamps the zoom into range and
    // the centre into the map rectangle, and falls back to the map centre /
    // `minZoom` for non-finite input — so a stale or foreign persisted view can
    // never open onto empty void.
    const view = opts.initialView;
    const usable =
      !!view &&
      Number.isFinite(view.x) &&
      Number.isFinite(view.y) &&
      Number.isFinite(view.zoom);
    this.camera = new Camera({
      mapWidthPx: mapWidthOf(opts.map),
      mapHeightPx: mapHeightOf(opts.map),
      minZoom,
      maxZoom,
      viewportWidth: width,
      viewportHeight: height,
      center: usable ? dataToPoint(opts.map, view.x, view.y) : undefined,
      zoom: usable ? view.zoom : minZoom,
    });

    this.renderer = new MapRenderer({
      camera: this.camera,
      canvas: opts.canvas,
      createBackend: (canvas) => createRenderBackend(canvas as HTMLCanvasElement),
      width,
      height,
      observeSize: (onResize) =>
        observeElementSize(opts.root, (w, h) => {
          onResize(w, h);
          // Leaflet fires `moveend` after a resize, so its consumers get a report
          // there; this keeps that path alive. `report` is coalesced against the
          // last reported view, so it stays SILENT unless the resize actually
          // moved the view — which today it never does (the centre clamp is
          // viewport-independent by design, see `camera.ts`). Wired anyway: a
          // resize is exactly the event a future viewport-dependent clamp would
          // change the view on, and a missing report is worse than none.
          this.report();
        }),
    });
    const invalidate = (): void => this.renderer.invalidate();

    const tileStack = createTileLayers({ map: opts.map, assets: opts.assets, invalidate });
    this.tiles = tileStack.tiles;
    this.watermark = tileStack.watermark;
    this.vectors = new VectorLayer({
      map: opts.map,
      invalidate,
      // PARITY, not a bug: the Leaflet engine's `HoverHighlight` passes
      // `fillOpacity: 0`, so today's hover changes the BORDERS only (dashed →
      // solid) and paints no fill at all. `VectorLayer`'s own default is 0.18 —
      // pass nothing here if a visible highlight is ever wanted.
      hoverFillOpacity: 0,
      colors: this.themeColors(),
    });
    this.markerLayer = new MarkerLayer({
      camera: this.camera,
      map: opts.map,
      assets: opts.assets,
      invalidate,
      theme: opts.theme,
    });

    this.renderer.addLayer(this.tiles);
    if (this.watermark) this.renderer.addLayer(this.watermark);
    this.renderer.addLayer(this.vectors);
    this.renderer.addLayer(this.markerLayer);

    this.overlay = new MarkerOverlay(opts.overlay);
    this.lastLabelTier = visibleTierForZoom(this.camera.zoom);

    this.gestures = attachGestures(asGestureTarget(opts.canvas), this.camera, {
      invalidate,
      onTap: (e) => this.handleTap(e.screenX, e.screenY),
      onContextMenu: (e) => this.handleContextMenu(e.screenX, e.screenY, e.pixel),
    });

    this.camera.on("change", this.onCameraChange);
    this.camera.on("gestureend", this.report);
    this.camera.on("flyend", this.onFlyEnd);

    opts.canvas.addEventListener("pointermove", this.onPointerMove);
    opts.canvas.addEventListener("pointerleave", this.onPointerLeave);
    opts.canvas.addEventListener("pointercancel", this.onPointerLeave);

    const win = opts.root.ownerDocument?.defaultView ?? null;
    this.unobserveDpr = win
      ? observeDevicePixelRatio(win, (dpr) => {
          const size = measureElement(opts.root);
          this.renderer.setSize(size.width, size.height, dpr);
        })
      : () => {};
    this.unobserveTheme = observeThemeClass(opts.root, () => this.refreshThemeColors());

    // The mount report: apps persist the view from `onViewChange`, and without
    // this one they would have nothing until the user first moves the map.
    this.report();
  }

  // ------------------------------------------------------------------ props ---

  /**
   * The map object changed identity (same id — a different id rebuilds the whole
   * engine, as the Leaflet engine's keyed container does). Only re-projection is
   * needed, and every layer no-ops on an identical reference.
   */
  setMap(map: GameMapMeta): void {
    if (this.disposed || map === this.map) return;
    this.map = map;
    this.tiles.setMap(map);
    this.watermark?.setMap(map);
    this.vectors.setMap(map);
    this.markerLayer.setMap(map);
    this.rebuildLabels();
    this.scheduleOverlay();
  }

  setMarkers(markers: readonly LabelMarker[]): void {
    if (this.disposed) return;
    this.markers = markers;
    this.markerById = new Map(markers.map((m) => [m.id, m]));
    this.markerLayer.setMarkers(markers);
    this.rebuildLabels();
    this.scheduleOverlay();
  }

  setVisibility(visibility: MarkerVisibility): void {
    if (this.disposed) return;
    this.visibility = visibility;
    this.markerLayer.setVisibility(visibility);
    this.rebuildLabels();
    this.scheduleOverlay();
  }

  setSelected(markerId: string | null): void {
    if (this.disposed || markerId === this.selectedId) return;
    this.selectedId = markerId;
    this.markerLayer.setSelected(markerId);
    // The selected marker shows a popup instead of a label, and its own tooltip
    // must go away the moment it is selected.
    if (markerId !== null && this.hoveredMarkerId === markerId) {
      this.hoveredMarkerId = null;
      this.overlay.setTooltip(null, null);
    }
    this.rebuildLabels();
    this.scheduleOverlay();
  }

  setShowLabels(showLabels: boolean): void {
    if (this.disposed || showLabels === this.showLabels) return;
    this.showLabels = showLabels;
    this.overlay.setLabelsEnabled(showLabels);
    this.scheduleOverlay();
  }

  setRegions(regions: readonly RegionInstance[]): void {
    if (this.disposed) return;
    this.vectors.setRegions(regions);
  }

  setVisibleRegions(regions: Set<string> | undefined): void {
    if (this.disposed) return;
    this.vectors.setVisibleRegions(regions);
  }

  setShowBorders(show: boolean): void {
    if (this.disposed) return;
    this.vectors.setShowBorders(show);
  }

  setOverlayLines(lines: readonly OverlayLine[] | undefined): void {
    if (this.disposed) return;
    this.vectors.setOverlayLines(lines);
  }

  /**
   * Re-resolve the host's colour tokens into the GL layers. Called on mount and
   * whenever the theme class flips — a GL shader cannot read a CSS variable, so
   * this is the only path by which dark mode reaches the region borders.
   */
  refreshThemeColors(): void {
    if (this.disposed) return;
    this.vectors.setColors(this.themeColors());
  }

  private themeColors(): { region: string; overlayLine: string } {
    return {
      region:
        resolveCssColor(this.opts.root, "--primary") ?? DEFAULT_VECTOR_COLORS.region,
      // Leaflet: `line.color ?? theme.pinDot`, with the per-line colour applied
      // by the layer itself.
      overlayLine: this.opts.theme.pinDot,
    };
  }

  // ------------------------------------------------------------------ popup ---

  /** The DOM node React rendered for the popup (or `null` when closed). */
  setPopupElement(el: HTMLElement | null): void {
    if (this.disposed) return;
    this.popupEl = el;
    if (el) this.positionPopup();
  }

  /**
   * Anchor the popup to a marker. Passing a NEW anchor arms the auto-pan; the
   * same anchor again (a re-render of the popup's content, e.g. after a
   * completion toggle) does not, so marking a marker complete cannot make the
   * map jump.
   */
  setPopupAnchor(markerId: string | null): void {
    if (this.disposed) return;
    const changed = markerId !== this.popupAnchorId;
    this.popupAnchorId = markerId;
    if (markerId === null) {
      this.popupNeedsAutoPan = false;
      return;
    }
    if (changed) this.popupNeedsAutoPan = true;
    this.positionPopup();
  }

  /**
   * Project the anchor and write the popup's transform.
   *
   * The anchor is the marker's FANNED position ({@link MarkerLayer.positionOf}),
   * not its raw coordinate — DELIBERATE deviation from the Leaflet engine, whose
   * popup uses the raw coordinate and therefore floats off-centre for markers
   * that share a spot with others.
   */
  private positionPopup(): void {
    const el = this.popupEl;
    const id = this.popupAnchorId;
    if (!el || !id) return;
    const anchor = this.markerLayer.positionOf(id);
    if (!anchor) return;
    const screen = this.camera.pixelToScreen(anchor.x, anchor.y);
    el.style.transform = popupTransform(screen);
    if (this.popupNeedsAutoPan) this.autoPanPopup(screen, el);
  }

  /**
   * Pan the camera the minimum amount that brings the whole popup on screen —
   * Leaflet's `autoPan`, which is what stops a popup opened near an edge from
   * hanging half outside the viewport.
   *
   * Deferred while a fly is running: selection normally flies the marker to the
   * centre, where the popup fits anyway, and panning mid-flight would fight the
   * animation. The `flyend` handler retries.
   */
  private autoPanPopup(screen: Point, el: HTMLElement): void {
    if (this.camera.isAnimating()) return;
    this.popupNeedsAutoPan = false;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (!(width > 0) || !(height > 0)) return;
    const viewW = this.camera.viewportWidth;
    const viewH = this.camera.viewportHeight;
    if (!(viewW > 0) || !(viewH > 0)) return;

    const left = screen.x - width / 2;
    const right = left + width;
    const bottom = screen.y - POPUP_OFFSET_Y;
    const top = bottom - height;

    // How far the CONTENT must move on screen; the centre then moves the other
    // way (see `Camera.panBy`). The min-edge case wins when the popup is larger
    // than the viewport, which keeps its top-left corner visible.
    let shiftX = 0;
    if (right > viewW - POPUP_AUTOPAN_PAD) shiftX = viewW - POPUP_AUTOPAN_PAD - right;
    if (left + shiftX < POPUP_AUTOPAN_PAD) shiftX = POPUP_AUTOPAN_PAD - left;
    let shiftY = 0;
    if (bottom > viewH - POPUP_AUTOPAN_PAD) shiftY = viewH - POPUP_AUTOPAN_PAD - bottom;
    if (top + shiftY < POPUP_AUTOPAN_PAD) shiftY = POPUP_AUTOPAN_PAD - top;
    if (shiftX === 0 && shiftY === 0) return;

    this.camera.panBy(-shiftX, -shiftY);
    this.renderer.invalidate();
  }

  // -------------------------------------------------------------- animation ---

  /**
   * Fly to a DATA-space position. `flyTo` emits nothing on its own, so the
   * renderer has to be woken for its loop to pump `camera.tick` — that is the
   * `invalidate()` below, and forgetting it is the classic "the fly never
   * happens" bug in a render-on-demand engine.
   */
  flyToData(x: number, y: number, zoom?: number, seconds?: number): void {
    if (this.disposed) return;
    const target = dataToPoint(this.map, x, y);
    this.camera.flyTo(
      target,
      zoom ?? this.camera.zoom,
      seconds ?? this.opts.flyToDuration(),
    );
    this.renderer.invalidate();
  }

  /** One +/− button step, animated. */
  zoomBy(dz: number): void {
    if (this.disposed) return;
    this.camera.flyTo(this.camera.center, this.camera.zoom + dz, ZOOM_STEP_SECONDS);
    this.renderer.invalidate();
  }

  // ---------------------------------------------------------------- gestures ---

  private handleTap(screenX: number, screenY: number): void {
    if (this.disposed) return;
    this.closeMenu();
    const id = this.markerLayer.hitTest({ x: screenX, y: screenY });
    // A tap that hit no marker deselects; a tap on a marker toggles it. The
    // gesture layer never reports the second tap of a double tap, so a
    // double-tap zoom cannot toggle the selection twice on its way there.
    this.opts.onSelect(id);
  }

  private handleContextMenu(screenX: number, screenY: number, pixel: Point): void {
    if (this.disposed) return;
    const data = pointToData(this.map, pixel.x, pixel.y);
    this.menuOpen = true;
    this.opts.onContextMenu({ x: screenX, y: screenY, mapX: data.x, mapY: data.y });
  }

  /** React tells us the menu is gone, so no camera change has to say it again. */
  notifyMenuClosed(): void {
    this.menuOpen = false;
  }

  private closeMenu(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.opts.onContextMenu(null);
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.disposed) return;
    const local = this.localPoint(e);
    this.lastPointer = local;
    const pixel = this.camera.screenToPixel(local.x, local.y);
    const data = pointToData(this.map, pixel.x, pixel.y);
    // Straight into the external store: only the status bar subscribes, so this
    // never re-renders the map tree.
    cursorStore.set(data.x, data.y);
    this.scheduleOverlay();
  };

  private readonly onPointerLeave = (): void => {
    if (this.disposed) return;
    this.lastPointer = null;
    cursorStore.clear();
    this.reportHover(null);
    this.hoveredMarkerId = null;
    this.overlay.setTooltip(null, null);
    this.vectors.setHovered(null);
  };

  private localPoint(e: { clientX: number; clientY: number }): Point {
    const rect = this.opts.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // ----------------------------------------------------------------- frames ---

  private readonly onCameraChange = (): void => {
    // Any camera movement closes the context menu (Leaflet: movestart/zoomstart).
    this.closeMenu();
    this.scheduleOverlay();
  };

  private readonly onFlyEnd = (): void => {
    this.report();
    // A popup that opened while the fly was in flight gets its auto-pan now.
    if (this.popupNeedsAutoPan) this.positionPopup();
  };

  /**
   * Project the whole DOM overlay in ONE batched pass: hover hit-test, labels,
   * tooltip, popup.
   *
   * Run SYNCHRONOUSLY from the camera's `change` (and from pointermove), NOT
   * deferred to a `requestAnimationFrame`. Deferring is the obvious design and it
   * is wrong here: the GL scene is painted from the frame that emitted `change`,
   * so an overlay updated on the NEXT frame trails the sprites by one frame —
   * during a 0.5 s fly that is a visible ~16 px of popup and labels sliding
   * against their pins.
   *
   * `change` is already at most once per frame in practice (the camera is driven
   * from rAF for flies, inertia and wheel glides, and the browser coalesces
   * pointermove), so there is nothing left for a scheduler to coalesce. A pinch
   * (pan + zoom in one move) emits twice and therefore projects twice — a few
   * hundred cheap style writes, and no layout is read.
   *
   * The re-entrancy guard is load-bearing: the popup's auto-pan moves the camera,
   * which emits `change`, which lands back here.
   */
  private scheduleOverlay(): void {
    if (this.disposed || this.overlayRunning) return;
    this.overlayRunning = true;
    try {
      this.runOverlayPass();
    } finally {
      this.overlayRunning = false;
    }
  }

  private runOverlayPass(): void {
    if (this.disposed) return;
    this.updateHover();
    if (this.visibility.lodEnabled) {
      const tier = visibleTierForZoom(this.camera.zoom);
      if (tier !== this.lastLabelTier) {
        this.lastLabelTier = tier;
        this.rebuildLabels();
      }
    }
    this.overlay.reposition(this.camera);
    this.positionPopup();
  }

  /**
   * Hit-test the last pointer position for the tooltip and the region highlight.
   *
   * Skipped while a gesture is running: hit-testing every marker on every frame
   * of a drag is wasted work, and a tooltip flickering under a moving finger is
   * not something anyone wants to read.
   */
  private updateHover(): void {
    const pointer = this.lastPointer;
    if (!pointer) return;
    if (this.gestures.isGesturing()) return;

    const hitId = this.markerLayer.hitTest(pointer);
    this.reportHover(hitId);
    // The selected marker has a popup; Leaflet gives it no tooltip either.
    const tooltipId = hitId && hitId !== this.selectedId ? hitId : null;
    if (tooltipId !== this.hoveredMarkerId) {
      this.hoveredMarkerId = tooltipId;
      if (!tooltipId) {
        this.overlay.setTooltip(null, null);
      } else {
        const marker = this.markerById.get(tooltipId);
        // `hideTooltip` is deliberately NOT consulted here: it opts a subtype out
        // of ALWAYS-ON labels only, and hovering such a marker still reveals its
        // name (Leaflet: `permanent={showLabels && !hideTooltip}` — the tooltip
        // itself is always bound).
        const text = marker ? markerLabelText(marker) : "";
        const anchor = this.markerLayer.positionOf(tooltipId);
        this.overlay.setTooltip(text || null, anchor);
      }
    }

    const pixel = this.camera.screenToPixel(pointer.x, pointer.y);
    this.vectors.setHovered(this.vectors.regionAt(pixel));
  }

  private reportHover(markerId: string | null): void {
    if (markerId === this.reportedHoverMarkerId) return;
    this.reportedHoverMarkerId = markerId;
    this.opts.onHover(markerId);
  }

  private rebuildLabels(): void {
    this.overlay.setLabelSources(
      collectLabelSources(this.markers, {
        positionOf: (id) => this.markerLayer.positionOf(id),
        selectedId: this.selectedId,
        visibleSubtypes: this.visibility.visibleSubtypes,
        forceShowIds: this.visibility.forceShowIds,
        lodEnabled: !!this.visibility.lodEnabled,
        visibleTier: this.lastLabelTier,
      }),
    );
  }

  /**
   * Report the current view in DATA space, skipping a repeat of the last one.
   * `gestureend` fires once per burst of interaction and `flyend` once per
   * animation, so this is the coalescing point that turns one user interaction
   * into exactly one `onViewChange`.
   */
  private readonly report = (): void => {
    if (this.disposed) return;
    const centre = this.camera.center;
    const data = pointToData(this.map, centre.x, centre.y);
    const view = { x: data.x, y: data.y, zoom: this.camera.zoom };
    const last = this.lastReported;
    if (last && last.x === view.x && last.y === view.y && last.zoom === view.zoom) {
      return;
    }
    this.lastReported = view;
    this.opts.onViewChange(view);
  };

  /** The current view in DATA space, without reporting it. */
  currentView(): { x: number; y: number; zoom: number } {
    const centre = this.camera.center;
    const data = pointToData(this.map, centre.x, centre.y);
    return { x: data.x, y: data.y, zoom: this.camera.zoom };
  }

  /** DATA space → CSS pixels from the canvas' top-left corner. */
  project(x: number, y: number): { sx: number; sy: number } {
    const pixel = dataToPoint(this.map, x, y);
    const screen = this.camera.pixelToScreen(pixel.x, pixel.y);
    return { sx: screen.x, sy: screen.y };
  }

  // ------------------------------------------------------- tests / handles ---

  /** The camera, for the view's own controllers and for tests. */
  get view(): Camera {
    return this.camera;
  }

  /** Whether a gesture (drag/fling/wheel burst) is in progress. */
  isGesturing(): boolean {
    return this.gestures.isGesturing();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  // ---------------------------------------------------------------- teardown ---

  /**
   * Release everything: pending frames, listeners, GL resources, overlay nodes.
   * Idempotent, and every setter above is a no-op afterwards — a listener that
   * outlives the engine (or a `mapRef` a consumer kept) cannot resurrect it.
   */
  dispose(): void {
    if (this.disposed) return;
    this.reportHover(null);
    this.disposed = true;
    this.opts.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.opts.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.opts.canvas.removeEventListener("pointercancel", this.onPointerLeave);
    this.unobserveDpr();
    this.unobserveTheme();
    this.gestures.detach();
    this.camera.off("change", this.onCameraChange);
    this.camera.off("gestureend", this.report);
    this.camera.off("flyend", this.onFlyEnd);
    this.camera.removeAllListeners();
    this.overlay.dispose();
    // Disposes every attached layer as well (renderer contract).
    this.renderer.dispose();
    cursorStore.clear();
    this.markers = [];
    this.markerById.clear();
    this.popupEl = null;
    this.popupAnchorId = null;
    this.lastPointer = null;
  }
}

/**
 * Transform that puts the popup card's bottom-centre {@link POPUP_OFFSET_Y}
 * above a screen point. Composes additively with the percentage translate
 * because neither rotation nor scale is involved, so the card needs no
 * measurement to be positioned (measurement happens only for auto-pan).
 */
export function popupTransform(screen: Point): string {
  const x = Math.round(screen.x);
  const y = Math.round(screen.y - POPUP_OFFSET_Y);
  return `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
}
