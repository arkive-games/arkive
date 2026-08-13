import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { GameMapMeta, MarkerTypeSubtype, RegionInstance } from "@gamemap/data-contract";

import type { MapAssets } from "../core/assets.ts";
import { Camera } from "../core/camera.ts";
import { dataToPoint, mapHeightOf, mapWidthOf } from "../core/coords.ts";
import { attachGestures } from "../core/gestures.ts";
import { MarkerLayer, type LayerMarker } from "../core/markerLayer.ts";
import type { PinVariant } from "../core/pinAtlas.ts";
import { PointCloudLayer, type PointCloud } from "../core/pointCloudLayer.ts";
import { MapRenderer } from "../core/renderer.ts";
import { createTileLayers } from "../core/tileLayer.ts";
import { VectorLayer } from "../core/vectorLayer.ts";
import { measureElement, observeDevicePixelRatio, observeElementSize } from "./domEnv.ts";
import { asGestureTarget, MAX_ZOOM } from "./mapEngine.ts";
import { MarkerOverlay } from "./markerOverlay.ts";
import { createRenderBackend } from "./renderBackend.ts";
import { DEFAULT_MAP_THEME, type PinTheme } from "./theme.ts";

/**
 * The lightweight embed: tiles, pins, pan/zoom, a hover tooltip, optional region
 * highlights and optional point clouds. The GL counterpart of the apps' bare
 * `MapContainer` + `GameMapTiles` + `createPinIcon` composition, which is what
 * every in-page mini-map was built from before Leaflet was retired — a pal's
 * spawn map, a region's loot map, a dungeon entrance, a wiki quest's POIs.
 *
 * Still deliberately absent, and what {@link GameMapView} is for: permanent name
 * labels, popups, the status bar, the context menu, zoom controls, the marker
 * filter model and region hover.
 *
 * `minZoom` defaults to −4 because the embeds are small and need to fit a whole
 * region, which is one step further out than the main map allows.
 *
 * ## Rebuild keys
 * The GL stack is built once per `map` / `minZoom` / `theme` VALUE. Everything
 * else is pushed into the live layers by its own effect, and every such effect
 * repeats those keys in its dependency list — a rebuild starts empty layers, and
 * content that kept its identity across the switch would otherwise never be
 * pushed again, leaving an embed with tiles and nothing on them.
 */

/** Embed default: one step further out than the main map's −3. */
export const EMBED_MIN_ZOOM = -4;
/** Slack left around the pin bounds when fitting, in map pixels. */
const FIT_PADDING_PX = 64;

/**
 * A pin to draw. `x`/`y` are DATA space; everything else is the visual spec that
 * `createPinIcon` took in the Leaflet embeds.
 */
export interface EmbedPin {
  id: string;
  x: number;
  y: number;
  /** Raw icon name, resolved through `assets.markerIconUrl`. */
  icon?: string;
  /** Defaults to `image` when an icon is given, `pin` otherwise. */
  variant?: PinVariant;
  /**
   * Multiplier on the 40 px base box, honoured for EVERY variant — including
   * `circular`, whose size is otherwise fixed at 0.9 (see
   * `PinMarkerInput.pinScale`). palworld's spawn map needs that: its boss pins
   * are circular and deliberately larger than its wild ones.
   */
  iconScale?: number;
  /** Tints the circular ring / the pin dot (ignored when `#000000`). */
  color?: string;
  /** Dim + green check (the `image`/`circular` completion treatment). */
  completed?: boolean;
  /** Cluster count badge; drawn when > 1. */
  count?: number;
  /** Hover tooltip. Absent or empty ⇒ this pin has none. */
  tooltip?: string;
}

export interface GameMapEmbedProps {
  map: GameMapMeta;
  /**
   * Asset-URL resolver. Read ONCE, when the GL stack is built (a `map` /
   * `minZoom` / `theme` change rebuilds it). Swapping in a resolver that returns
   * DIFFERENT urls for the same inputs therefore has no effect until the next
   * rebuild — pass a reference-stable resolver, as the apps do.
   */
  assets: MapAssets;
  pins: EmbedPin[];
  onPinClick?: (id: string) => void;
  /**
   * Regions available to {@link GameMapEmbedProps.highlightRegionIds}. Nothing is
   * drawn for a region that is not highlighted: the embed has no region hover, so
   * the rest would be invisible geometry.
   */
  regions?: readonly RegionInstance[];
  /** Ids outlined permanently. Ids with no matching region are ignored. */
  highlightRegionIds?: readonly string[];
  /** Decorative discs under the pins (palworld's habitat clouds). */
  dots?: readonly PointCloud[];
  /**
   * Reports the camera's zoom once the initial fit is applied, and on every
   * change after that. palworld's embeds pick a clustering tier from it; the
   * clustering itself stays in the app, where the product decisions live.
   */
  onZoom?: (zoom: number) => void;
  /** Zoom floor. Defaults to {@link EMBED_MIN_ZOOM}. Changing it rebuilds. */
  minZoom?: number;
  /**
   * `pins` (default) fits the content — every pin plus every highlighted region;
   * `map` opens on the whole map. Applied when the stack is built, so a later
   * change only takes effect on a rebuild.
   */
  initialFit?: "pins" | "map";
  /**
   * Pin colours; defaults to the engine's own palette. The colours are baked into
   * the pin bitmaps, so a new theme VALUE rebuilds the stack (the marker layer
   * takes its theme at construction). Cheap and rare — but pass a stable object
   * anyway, or every render pays for a rebuild.
   */
  theme?: PinTheme;
  className?: string;
}

/**
 * `EmbedPin` → the marker shape `MarkerLayer` consumes. The layer resolves a
 * pin's appearance through `resolvePinSpec`, which reads the marker-type
 * taxonomy — so the embed's flat visual spec is expressed as a synthetic
 * `subtypeMeta`, and the same code path (and the same atlas) draws embed pins and
 * main-map pins. The size travels as `pinScale` rather than the synthetic
 * subtype's `iconScale`, because `circular` ignores the latter by design.
 */
function toLayerMarkers(pins: readonly EmbedPin[]): LayerMarker[] {
  return pins.map((pin, index) => {
    const subtypeMeta: MarkerTypeSubtype = {
      id: `embed-${pin.id}`,
      name: `embed-${pin.id}`,
      icon: pin.icon,
      pinVariant: pin.variant ?? (pin.icon ? "image" : "pin"),
      color: pin.color,
    };
    return {
      id: pin.id,
      subtype: "embed",
      x: pin.x,
      y: pin.y,
      images: [],
      contributors: [],
      indexInSubtype: index,
      icon: pin.icon,
      count: pin.count,
      completed: pin.completed,
      pinScale: pin.iconScale,
      subtypeMeta,
    };
  });
}

/**
 * Zoom + centre that fit the embed's CONTENT — every pin plus every highlighted
 * region — or the whole map when there is none.
 *
 * The highlighted regions count, not just the pins: aion2's wiki embed marks the
 * region a quest belongs to and often has no POI inside it at all, so fitting the
 * pins alone would open on the whole world and leave the outline as a speck.
 * Un-highlighted regions do NOT count — they are not drawn (see the `regions`
 * prop), so framing them would frame nothing.
 */
function fitToContent(
  camera: Camera,
  map: GameMapMeta,
  pins: readonly EmbedPin[],
  regions: readonly RegionInstance[] | undefined,
  highlightRegionIds: readonly string[] | undefined,
): { center: { x: number; y: number }; zoom: number } {
  const width = mapWidthOf(map);
  const height = mapHeightOf(map);
  const whole = {
    center: { x: width / 2, y: height / 2 },
    zoom: camera.zoomToFit(width, height),
  };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const pin of pins) {
    const point = dataToPoint(map, pin.x, pin.y);
    include(point.x, point.y);
  }
  if (regions && highlightRegionIds?.length) {
    const wanted = new Set(highlightRegionIds);
    for (const region of regions) {
      if (!wanted.has(region.id)) continue;
      // Region borders are map-pixel space already (the tools pipeline emits them
      // that way), so they need no projection.
      for (const ring of region.borders) for (const [x, y] of ring) include(x, y);
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return whole;
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    zoom: camera.zoomToFit(
      maxX - minX + FIT_PADDING_PX * 2,
      maxY - minY + FIT_PADDING_PX * 2,
    ),
  };
}

const GameMapEmbed: React.FC<GameMapEmbedProps> = ({
  map,
  assets,
  pins,
  onPinClick,
  regions,
  highlightRegionIds,
  dots,
  onZoom,
  minZoom = EMBED_MIN_ZOOM,
  initialFit = "pins",
  theme = DEFAULT_MAP_THEME,
  className,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayHostRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<MarkerLayer | null>(null);
  const vectorsRef = useRef<VectorLayer | null>(null);
  const cloudsRef = useRef<PointCloudLayer | null>(null);

  const liveRef = useRef({
    assets,
    theme,
    pins,
    onPinClick,
    initialFit,
    onZoom,
    regions,
    highlightRegionIds,
  });
  liveRef.current = {
    assets,
    theme,
    pins,
    onPinClick,
    initialFit,
    onZoom,
    regions,
    highlightRegionIds,
  };

  const layerMarkers = useMemo(() => toLayerMarkers(pins), [pins]);
  /**
   * Tooltip text by pin id — only the pins that have one. Read through a ref by
   * the overlay pass so a changed tooltip needs no listener rebind, and so the
   * pass allocates nothing.
   */
  const tooltips = useMemo(() => {
    const out = new Map<string, string>();
    for (const pin of pins) if (pin.tooltip) out.set(pin.id, pin.tooltip);
    return out;
  }, [pins]);
  const tooltipsRef = useRef(tooltips);
  tooltipsRef.current = tooltips;
  // The pin bitmaps bake the theme's colours in and `MarkerLayer` takes its theme
  // at construction, so a new palette has to rebuild the stack. Keyed on the
  // VALUE, not the object, so a caller who rebuilds the object every render (but
  // not its contents) does not thrash the GL context.
  const themeKey = useMemo(() => JSON.stringify(theme), [theme]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const overlayHost = overlayHostRef.current;
    if (!root || !canvas || !overlayHost) return;
    const { width, height } = measureElement(root);

    const camera = new Camera({
      mapWidthPx: mapWidthOf(map),
      mapHeightPx: mapHeightOf(map),
      minZoom,
      maxZoom: MAX_ZOOM,
      viewportWidth: width,
      viewportHeight: height,
    });
    // `zoomToFit` needs the viewport, so the fit is computed AFTER construction
    // and applied as a first `setView` rather than passed in.
    const fit =
      liveRef.current.initialFit === "map"
        ? {
            center: { x: mapWidthOf(map) / 2, y: mapHeightOf(map) / 2 },
            zoom: camera.zoomToFit(mapWidthOf(map), mapHeightOf(map)),
          }
        : fitToContent(
            camera,
            map,
            liveRef.current.pins,
            liveRef.current.regions,
            liveRef.current.highlightRegionIds,
          );
    camera.setView(fit.center, fit.zoom);

    const renderer = new MapRenderer({
      camera,
      canvas,
      createBackend: (c) => createRenderBackend(c as HTMLCanvasElement),
      width,
      height,
      observeSize: (onResize) => observeElementSize(root, onResize),
    });
    const invalidate = (): void => renderer.invalidate();

    const { tiles, watermark } = createTileLayers({ map, assets: liveRef.current.assets, invalidate });
    const vectors = new VectorLayer({ map, invalidate });
    const clouds = new PointCloudLayer({ map, invalidate });
    const markerLayer = new MarkerLayer({
      camera,
      map,
      assets: liveRef.current.assets,
      invalidate,
      theme: liveRef.current.theme,
      // Every pin shares the synthetic `embed` subtype, so one entry in the
      // filter shows them all (the filter's `undefined` default hides
      // everything — see `MarkerVisibility`).
      visibility: { visibleSubtypes: new Set(["embed"]) },
    });
    renderer.addLayer(tiles);
    if (watermark) renderer.addLayer(watermark);
    renderer.addLayer(vectors);
    renderer.addLayer(clouds);
    renderer.addLayer(markerLayer);
    layerRef.current = markerLayer;
    vectorsRef.current = vectors;
    cloudsRef.current = clouds;

    // Labels stay off (the default): an embed reveals a name on hover, never
    // permanently.
    const overlay = new MarkerOverlay(overlayHost);

    let pointer: { x: number; y: number } | null = null;
    let hoveredId: string | null = null;

    /**
     * Hit-test and reposition in ONE pass, run SYNCHRONOUSLY from the camera's
     * `change` and from pointermove rather than deferred to a frame: the GL scene
     * is painted from the frame that emitted `change`, so a tooltip updated on the
     * NEXT frame trails its pin by a frame's worth of movement. Same reasoning as
     * `mapEngine.ts`'s overlay pass, which this is the small sibling of.
     *
     * Hit-testing is skipped mid-gesture — testing every pin on every frame of a
     * drag is wasted work, and a tooltip flickering under a moving finger is not
     * something anyone wants to read.
     */
    const runOverlayPass = (): void => {
      if (pointer && !gestures.isGesturing()) {
        const hit = markerLayer.hitTest(pointer);
        if (hit !== hoveredId) {
          hoveredId = hit;
          const text = hit ? tooltipsRef.current.get(hit) : undefined;
          overlay.setTooltip(text ?? null, hit ? markerLayer.positionOf(hit) : null);
        }
      }
      overlay.reposition(camera);
    };

    const onCameraChange = (): void => {
      runOverlayPass();
      liveRef.current.onZoom?.(camera.zoom);
    };
    camera.on("change", onCameraChange);

    const localPoint = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const onPointerMove = (e: PointerEvent): void => {
      pointer = localPoint(e);
      runOverlayPass();
    };
    const onPointerLeave = (): void => {
      pointer = null;
      hoveredId = null;
      overlay.setTooltip(null, null);
    };
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointercancel", onPointerLeave);

    const gestures = attachGestures(asGestureTarget(canvas), camera, {
      invalidate,
      onTap: (e) => {
        const id = markerLayer.hitTest({ x: e.screenX, y: e.screenY });
        if (id) liveRef.current.onPinClick?.(id);
      },
    });

    const win = root.ownerDocument?.defaultView ?? null;
    const unobserveDpr = win
      ? observeDevicePixelRatio(win, (dpr) => {
          const size = measureElement(root);
          renderer.setSize(size.width, size.height, dpr);
        })
      : () => {};

    // Report the zoom the fit landed on. The host needs it before any
    // interaction: a clustering tier has to be right on the very first paint.
    liveRef.current.onZoom?.(camera.zoom);

    return () => {
      layerRef.current = null;
      vectorsRef.current = null;
      cloudsRef.current = null;
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointercancel", onPointerLeave);
      unobserveDpr();
      gestures.detach();
      overlay.dispose();
      camera.removeAllListeners();
      renderer.dispose();
    };
  }, [map, minZoom, themeKey]);

  // The rebuild keys belong in HERE too, not just above: a rebuild starts a fresh
  // (empty) `MarkerLayer`, and `pins` that kept its identity across the switch —
  // a module constant, or a memo keyed on something else — would never be pushed
  // again, leaving an embed with tiles and no pins at all. Same for the three
  // effects below it.
  useEffect(() => {
    layerRef.current?.setMarkers(layerMarkers);
  }, [layerMarkers, map, minZoom, themeKey]);

  useEffect(() => {
    vectorsRef.current?.setRegions(regions ?? []);
  }, [regions, map, minZoom, themeKey]);

  useEffect(() => {
    vectorsRef.current?.setHighlighted(highlightRegionIds);
  }, [highlightRegionIds, map, minZoom, themeKey]);

  useEffect(() => {
    cloudsRef.current?.setClouds(dots ?? []);
  }, [dots, map, minZoom, themeKey]);

  return (
    <div ref={rootRef} className={className ? `gmgl-embed ${className}` : "gmgl-embed"}>
      <canvas ref={canvasRef} className="gmgl-map-canvas" data-testid="gl-embed-canvas" />
      {/* Hover tooltip. React renders this EMPTY — `MarkerOverlay` owns the nodes
          inside it imperatively, so a pan never goes through React state. */}
      <div ref={overlayHostRef} className="gmgl-overlay" aria-hidden="true" />
    </div>
  );
};

export default GameMapEmbed;
