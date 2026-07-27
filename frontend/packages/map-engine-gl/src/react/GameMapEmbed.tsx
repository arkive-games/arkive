import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { GameMapMeta, MarkerTypeSubtype } from "@gamemap/data-contract";

import type { MapAssets } from "../core/assets.ts";
import { Camera } from "../core/camera.ts";
import { dataToPoint, mapHeightOf, mapWidthOf } from "../core/coords.ts";
import { attachGestures } from "../core/gestures.ts";
import { MarkerLayer, type LayerMarker } from "../core/markerLayer.ts";
import type { PinVariant } from "../core/pinAtlas.ts";
import { MapRenderer } from "../core/renderer.ts";
import { createTileLayers } from "../core/tileLayer.ts";
import { measureElement, observeDevicePixelRatio, observeElementSize } from "./domEnv.ts";
import { asGestureTarget, MAX_ZOOM } from "./mapEngine.ts";
import { createRenderBackend } from "./renderBackend.ts";
import { DEFAULT_MAP_THEME, type PinTheme } from "./theme.ts";

/**
 * The lightweight embed: tiles, pins, pan/zoom and a click callback — nothing
 * else. The GL counterpart of the apps' bare
 * `MapContainer` + `GameMapTiles` + `createPinIcon` composition, which is what
 * every in-page mini-map (a pal's spawn map, a region's loot map, a dungeon
 * entrance) is built from today.
 *
 * No chrome, no popup, no tooltip, no status bar, no context menu, no region
 * layer: an embed that needs any of those wants {@link GameMapView} instead.
 *
 * Not wired into an app yet — it exists so the embeds can be ported without
 * inventing this layer under time pressure. `minZoom` defaults to −4 because the
 * embeds are small and need to fit a whole region, which is one step further out
 * than the main map allows.
 */

/** Embed default: one step further out than the main map's −3. */
export const EMBED_MIN_ZOOM = -4;
/** Slack left around the pin bounds when fitting, in map pixels. */
const FIT_PADDING_PX = 64;

/**
 * A pin to draw. `x`/`y` are DATA space; everything else is the visual spec that
 * `createPinIcon` takes in the Leaflet embeds.
 */
export interface EmbedPin {
  id: string;
  x: number;
  y: number;
  /** Raw icon name, resolved through `assets.markerIconUrl`. */
  icon?: string;
  /** Defaults to `image` when an icon is given, `pin` otherwise. */
  variant?: PinVariant;
  /** Multiplier on the 40 px base box. */
  iconScale?: number;
  /** Tints the circular ring / the pin dot (ignored when `#000000`). */
  color?: string;
  /** Dim + green check (the `image`/`circular` completion treatment). */
  completed?: boolean;
  /** Cluster count badge; drawn when > 1. */
  count?: number;
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
  /** Zoom floor. Defaults to {@link EMBED_MIN_ZOOM}. Changing it rebuilds. */
  minZoom?: number;
  /**
   * `pins` fits the pin bounds (default), `map` opens on the whole map. Applied
   * when the stack is built, so a later change only takes effect on a rebuild.
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
 * main-map pins.
 */
function toLayerMarkers(pins: readonly EmbedPin[]): LayerMarker[] {
  return pins.map((pin, index) => {
    const subtypeMeta: MarkerTypeSubtype = {
      id: `embed-${pin.id}`,
      name: `embed-${pin.id}`,
      icon: pin.icon,
      iconScale: pin.iconScale,
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
      subtypeMeta,
    };
  });
}

/** Zoom + centre that fit every pin, or the whole map when there are none. */
function fitToPins(
  camera: Camera,
  map: GameMapMeta,
  pins: readonly EmbedPin[],
): { center: { x: number; y: number }; zoom: number } {
  const width = mapWidthOf(map);
  const height = mapHeightOf(map);
  const whole = {
    center: { x: width / 2, y: height / 2 },
    zoom: camera.zoomToFit(width, height),
  };
  if (pins.length === 0) return whole;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pin of pins) {
    const point = dataToPoint(map, pin.x, pin.y);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
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
  minZoom = EMBED_MIN_ZOOM,
  initialFit = "pins",
  theme = DEFAULT_MAP_THEME,
  className,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerRef = useRef<MarkerLayer | null>(null);

  const liveRef = useRef({ assets, theme, pins, onPinClick, initialFit });
  liveRef.current = { assets, theme, pins, onPinClick, initialFit };

  const layerMarkers = useMemo(() => toLayerMarkers(pins), [pins]);
  // The pin bitmaps bake the theme's colours in and `MarkerLayer` takes its theme
  // at construction, so a new palette has to rebuild the stack. Keyed on the
  // VALUE, not the object, so a caller who rebuilds the object every render (but
  // not its contents) does not thrash the GL context.
  const themeKey = useMemo(() => JSON.stringify(theme), [theme]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
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
        : fitToPins(camera, map, liveRef.current.pins);
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
    renderer.addLayer(markerLayer);
    layerRef.current = markerLayer;

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

    return () => {
      layerRef.current = null;
      unobserveDpr();
      gestures.detach();
      camera.removeAllListeners();
      renderer.dispose();
    };
  }, [map, minZoom, themeKey]);

  // The rebuild keys belong in HERE too, not just above: a rebuild starts a fresh
  // (empty) `MarkerLayer`, and `pins` that kept its identity across the switch —
  // a module constant, or a memo keyed on something else — would never be pushed
  // again, leaving an embed with tiles and no pins at all.
  useEffect(() => {
    layerRef.current?.setMarkers(layerMarkers);
  }, [layerMarkers, map, minZoom, themeKey]);

  return (
    <div ref={rootRef} className={className ? `gmgl-embed ${className}` : "gmgl-embed"}>
      <canvas ref={canvasRef} className="gmgl-map-canvas" data-testid="gl-embed-canvas" />
    </div>
  );
};

export default GameMapEmbed;
