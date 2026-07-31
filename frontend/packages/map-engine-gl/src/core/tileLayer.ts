import {
  ClampToEdgeWrapping,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";
import type { GameMapMeta } from "@gamemap/data-contract";
import type { MapAssets } from "./assets.ts";
import type { Camera } from "./camera.ts";
import { LayerOrder, type RenderLayer } from "./renderer.ts";
import type { PixelBounds, Point } from "./types.ts";

/**
 * The base map tile layer: one textured quad per visible tile of the map's
 * SINGLE native tile level, exactly like the Leaflet engine's `GameTileLayer`.
 *
 * Level-0 only, by design: the grid is `tilesCountX × tilesCountY` tiles of
 * `tileWidth` px and every zoom level is the GPU scaling those same textures
 * (Leaflet: `minNativeZoom = maxNativeZoom = 0`). Tile (0,0) is the TOP-LEFT
 * tile and y increases downward — the same y-down map-pixel space the renderer's
 * projection sets up.
 *
 * Out-of-grid indices are REJECTED, never clamped and never wrapped: the app's
 * `assets.tileUrl` is only ever asked for tiles that exist (the Leaflet layer
 * returns `""` for the same reason). {@link visibleTileRange} clamps the range to
 * the grid and {@link isInGrid} guards the load path.
 *
 * Everything the layer needs from the outside is injected (assets, texture
 * loader, `invalidate`), so it runs — and is tested — without a GL context.
 */

// -------------------------------------------------------------- index math ---

/**
 * An inclusive range of tile indices. Empty when `maxX < minX || maxY < minY`
 * (see {@link isEmptyTileRange}) — that happens when the view has no overlap
 * with the grid at all.
 */
export interface TileRange {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EMPTY_RANGE: TileRange = { minX: 0, minY: 0, maxX: -1, maxY: -1 };

export function isEmptyTileRange(range: TileRange): boolean {
  return range.maxX < range.minX || range.maxY < range.minY;
}

/** Number of tiles a range covers (0 when empty). */
export function tileRangeCount(range: TileRange): number {
  if (isEmptyTileRange(range)) return 0;
  return (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
}

/** Cache/identity key of a tile at a pyramid level. */
export function tileKey(level: number, x: number, y: number): string {
  return `${level}:${x}:${y}`;
}

/**
 * Pyramid level for a camera zoom: the deepest level whose tiles are still
 * displayed at ≤ native resolution (`floor(-zoom)`), clamped to what the map
 * ships (`tileLevels`). Level 0 from zoom > -1 upward.
 */
export function levelForZoom(zoom: number, tileLevels: number): number {
  if (!Number.isFinite(zoom) || tileLevels <= 0) return 0;
  return Math.min(Math.floor(tileLevels), Math.max(0, Math.floor(-zoom)));
}

/** Whether `(x, y)` addresses a tile that actually exists in the grid. */
export function isInGrid(
  x: number,
  y: number,
  tilesCountX: number,
  tilesCountY: number,
): boolean {
  return x >= 0 && y >= 0 && x < tilesCountX && y < tilesCountY;
}

/**
 * Tile indices covering `bounds` (map pixels, y down), grown by `pad` tiles on
 * every side and CLAMPED to the grid.
 *
 * The `pad` ring is what hides tile pop-in while panning: those tiles load
 * before they scroll into view. It is applied in tile units here — a single
 * place — so callers pass `camera.visibleBounds(0)` and never double-pad.
 *
 * A tile `i` covers `[i*size, (i+1)*size)`, so the last covered index is
 * `ceil(maxX/size) - 1`: a view whose right edge lands exactly on a tile
 * boundary does not pull in the tile starting there. Degenerate inputs
 * (non-finite bounds, `size <= 0`, empty grid) yield an empty range rather than
 * a NaN one, because the extent comes from HTTP-fetched map metadata.
 */
export function visibleTileRange(
  bounds: PixelBounds,
  tileSize: number,
  tilesCountX: number,
  tilesCountY: number,
  pad = 1,
): TileRange {
  if (!Number.isFinite(tileSize) || tileSize <= 0) return EMPTY_RANGE;
  if (!Number.isFinite(tilesCountX) || !Number.isFinite(tilesCountY)) return EMPTY_RANGE;
  const lastX = Math.floor(tilesCountX) - 1;
  const lastY = Math.floor(tilesCountY) - 1;
  if (lastX < 0 || lastY < 0) return EMPTY_RANGE;
  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY)
  ) {
    return EMPTY_RANGE;
  }
  const p = Number.isFinite(pad) ? Math.max(0, Math.floor(pad)) : 0;

  const minX = Math.max(0, Math.floor(bounds.minX / tileSize) - p);
  const minY = Math.max(0, Math.floor(bounds.minY / tileSize) - p);
  const maxX = Math.min(lastX, Math.ceil(bounds.maxX / tileSize) - 1 + p);
  const maxY = Math.min(lastY, Math.ceil(bounds.maxY / tileSize) - 1 + p);
  if (maxX < minX || maxY < minY) return EMPTY_RANGE;
  return { minX, minY, maxX, maxY };
}

// ------------------------------------------------------------ texture side ---

/**
 * Starts loading `url`. `onLoad` receives a ready {@link Texture}; the returned
 * function cancels the interest in it (a tile evicted before its image arrived).
 * Injected so the core can be driven without the DOM.
 */
export interface TileLoader {
  load(
    url: string,
    onLoad: (texture: Texture) => void,
    onError?: (error: unknown) => void,
  ): () => void;
}

/**
 * Browser default: one shared `THREE.TextureLoader`. `crossOrigin` matters
 * because tiles are served from a different host than the app.
 */
export function createTileLoader(crossOrigin = "anonymous"): TileLoader {
  const loader = new TextureLoader();
  loader.setCrossOrigin(crossOrigin);
  return {
    load(url, onLoad, onError) {
      let cancelled = false;
      loader.load(
        url,
        (texture) => {
          // The tile was evicted while its image was in flight: drop the
          // texture instead of handing a stale one to a dead entry.
          if (cancelled) {
            texture.dispose();
            return;
          }
          onLoad(texture);
        },
        undefined,
        (error) => {
          if (!cancelled) onError?.(error);
        },
      );
      return () => {
        cancelled = true;
      };
    },
  };
}

/**
 * Tile texture sampling. Single-level tiles are scaled by the camera over the
 * whole zoom range, so: `LinearFilter` for both min and mag (bilinear both up
 * and down — no mipmaps, which would need power-of-two chains per tile and blur
 * the far-zoom view differently from Leaflet's CSS scaling), `ClampToEdge` to
 * keep neighbouring tiles from bleeding into each other, and `SRGBColorSpace`
 * so tile colours match the `<img>`-based Leaflet engine.
 *
 * `flipY = false` is the renderer's Y-DOWN CONTRACT (see `renderer.ts`): the
 * image's first row must land on the quad's smaller-y edge, which the flipped
 * projection puts at the top of the screen.
 */
export function configureTileTexture(texture: Texture): Texture {
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

// ------------------------------------------------------------------- layer ---

/** Default number of textures a single frame may newly create. */
export const MAX_NEW_TILES_PER_FRAME = 4;
/** Default LRU capacity as a multiple of the visible tile count. */
export const TILE_CACHE_FACTOR = 2;

export interface TileLayerOptions {
  /**
   * INVARIANT: square tiles (`tileHeight === tileWidth`). Both shipping games
   * satisfy it and the Leaflet engine has the same limitation (Leaflet's
   * `tileSize` is one number), so the layer indexes and scales both axes by
   * `tileWidth`. A map that breaks it would be mis-scaled AND mis-indexed
   * vertically, so the constructor warns rather than failing silently.
   */
  map: GameMapMeta;
  assets: MapAssets;
  /** Ask the renderer for another frame (texture arrived, work left over). */
  invalidate: () => void;
  /** Defaults to {@link createTileLoader} (browser). */
  loader?: TileLoader;
  /** Extra ring of tiles loaded around the viewport. Default 1. */
  padTiles?: number;
  /**
   * Textures created per frame. Default {@link MAX_NEW_TILES_PER_FRAME}; clamped
   * to at least 1, because a budget of 0 would defer forever and keep asking for
   * frames — an idle map must cost 0 fps.
   */
  maxNewTilesPerFrame?: number;
  /** LRU capacity multiplier. Default {@link TILE_CACHE_FACTOR}. */
  cacheFactor?: number;
  /** Draw order. Default `LayerOrder.tiles`. */
  order?: number;
}

interface TileEntry {
  level: number;
  x: number;
  y: number;
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial> | null;
  texture: Texture | null;
  /** Cancels an in-flight load; null once the load settled. */
  cancel: (() => void) | null;
}

/** A tile still to be created, in the order it should be created. */
interface MissingTile {
  x: number;
  y: number;
}

/**
 * Order pending tiles by Manhattan distance from `centre` (map pixels) to each
 * tile's centre — Leaflet's `_addTilesFromCenterOut`.
 *
 * It only matters when the throttle bites, and then it matters a lot: the
 * default mount view is the whole map at MIN_ZOOM, which is ~1000 tiles for an
 * 8192² map. Filling row-major would paint a corner wipe from the top-left over
 * several seconds while the middle of the screen — where the user is looking —
 * stays empty. Sorted in place; ties keep their (row-major) order.
 */
export function sortTilesFromCentre<T extends MissingTile>(
  tiles: T[],
  centre: Point,
  tileSize: number,
): T[] {
  const cost = (t: T): number =>
    Math.abs(tileCentre(t.x, tileSize) - centre.x) +
    Math.abs(tileCentre(t.y, tileSize) - centre.y);
  return tiles.sort((a, b) => cost(a) - cost(b));
}

export class TileLayer implements RenderLayer {
  readonly object3D = new Group();
  readonly order: number;

  private map: GameMapMeta;
  private readonly assets: MapAssets;
  private readonly invalidate: () => void;
  private readonly loader: TileLoader;
  private readonly padTiles: number;
  private readonly maxNewPerFrame: number;
  private readonly cacheFactor: number;

  /**
   * One geometry for every tile quad ever: a unit plane scaled per mesh. The
   * quads only differ by position and texture, so a per-tile geometry would be
   * pure waste (and one more thing to dispose).
   */
  private readonly geometry = new PlaneGeometry(1, 1);
  /** Insertion-ordered LRU: re-inserting a key moves it to the young end. */
  private readonly cache = new Map<string, TileEntry>();
  private disposed = false;

  constructor(opts: TileLayerOptions) {
    this.map = opts.map;
    this.assets = opts.assets;
    this.invalidate = opts.invalidate;
    this.loader = opts.loader ?? createTileLoader();
    this.padTiles = opts.padTiles ?? 1;
    // At least 1: a budget of 0 would defer every tile forever, and each
    // deferral asks for another frame — a permanent 60 fps loop that never
    // paints a tile.
    this.maxNewPerFrame = Number.isFinite(opts.maxNewTilesPerFrame)
      ? Math.max(1, Math.floor(opts.maxNewTilesPerFrame as number))
      : MAX_NEW_TILES_PER_FRAME;
    this.cacheFactor = opts.cacheFactor ?? TILE_CACHE_FACTOR;
    this.order = opts.order ?? LayerOrder.tiles;
    this.object3D.name = "tiles";
    warnIfNonSquare(opts.map);
  }

  /** Square tile edge in map pixels — Leaflet's `tileSize = tileWidth`. */
  private get tileSize(): number {
    return this.map.tileWidth;
  }

  /**
   * Switch to another map. Everything is torn down first: the grid, the URLs and
   * the textures all belong to the old map, and keeping any of it would leak a
   * texture per tile on every map change.
   */
  setMap(map: GameMapMeta): void {
    if (this.disposed || map === this.map) return;
    this.clearTiles();
    this.map = map;
    warnIfNonSquare(map);
    this.invalidate();
  }

  /** Tiles currently held (ready, pending or dead-url). For tests/diagnostics. */
  get cachedCount(): number {
    return this.cache.size;
  }

  /**
   * Bring the scene in line with the camera: show the visible tiles, start up to
   * `maxNewPerFrame` new loads, hide the rest, evict the coldest. Called by the
   * renderer immediately before every render.
   */
  update(camera: Camera): void {
    if (this.disposed) return;
    const levels = Math.max(0, this.map.tileLevels ?? 0);
    const level = levelForZoom(camera.zoom, levels);
    const size = this.tileSize * 2 ** level;
    const countX = Math.ceil(this.map.tilesCountX / 2 ** level);
    const countY = Math.ceil(this.map.tilesCountY / 2 ** level);
    const bounds = camera.visibleBounds(0);
    const range = visibleTileRange(bounds, size, countX, countY, this.padTiles);

    const visible = new Set<string>();
    const missing: MissingTile[] = [];

    if (!isEmptyTileRange(range)) {
      for (let y = range.minY; y <= range.maxY; y++) {
        for (let x = range.minX; x <= range.maxX; x++) {
          const key = tileKey(level, x, y);
          visible.add(key);
          const existing = this.cache.get(key);
          if (existing) {
            // Touch: youngest end of the LRU.
            this.cache.delete(key);
            this.cache.set(key, existing);
            if (existing.mesh) existing.mesh.visible = true;
            continue;
          }
          missing.push({ x, y });
        }
      }
    }

    // Throttle: uploading a screenful of textures in one frame is the classic
    // slippy-map hitch, so only `maxNewPerFrame` start here and the rest are
    // picked up on later frames. When that bites, spend the budget from the view
    // centre outwards (Leaflet's `_addTilesFromCenterOut`) — otherwise a
    // whole-map mount view fills as a corner wipe.
    const deferred = missing.length > this.maxNewPerFrame;
    if (deferred) {
      sortTilesFromCentre(
        missing,
        { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
        size,
      );
      missing.length = this.maxNewPerFrame;
    }
    for (const tile of missing) this.beginTile(level, tile.x, tile.y);

    for (const [key, entry] of this.cache) {
      if (!visible.has(key) && entry.mesh) entry.mesh.visible = false;
    }

    this.evict(visible);
    // Nothing else will wake the renderer for the tiles we chose not to start.
    if (deferred) this.invalidate();
  }

  /**
   * Create the entry for a tile and start its load. The in-grid guard is
   * belt-and-braces (the range is already clamped): `assets.tileUrl` must never
   * be called for a tile the grid does not contain.
   */
  private beginTile(level: number, x: number, y: number): void {
    const countX = Math.ceil(this.map.tilesCountX / 2 ** level);
    const countY = Math.ceil(this.map.tilesCountY / 2 ** level);
    if (!isInGrid(x, y, countX, countY)) return;
    const key = tileKey(level, x, y);
    const entry: TileEntry = { level, x, y, mesh: null, texture: null, cancel: null };
    // Cached BEFORE the url is resolved: the entry's mere existence is what stops
    // an empty or failing tile from being requested again on every frame. Such a
    // tile is only retried once it has been evicted and comes back into view.
    this.cache.set(key, entry);

    const url = this.assets.tileUrl(this.map, x, y, level);
    if (!url) return;
    entry.cancel = this.loader.load(
      url,
      (texture) => {
        entry.cancel = null;
        // Evicted (or the map changed) while the image was in flight.
        if (this.disposed || this.cache.get(key) !== entry) {
          texture.dispose();
          return;
        }
        this.attach(entry, texture);
        this.invalidate();
      },
      () => {
        entry.cancel = null;
      },
    );
  }

  /** Build the quad for a loaded tile and place it in map-pixel space. */
  private attach(entry: TileEntry, texture: Texture): void {
    configureTileTexture(texture);
    const size = this.tileSize * 2 ** entry.level;
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      // Draw order is decided by the layers' group order, so tiles neither test
      // nor write depth — every layer sits at z=0 and depth would only make the
      // result depend on submission order.
      depthTest: false,
      depthWrite: false,
      // The y-flipped projection reverses screen-space winding; culling would
      // discard these quads. See renderer.ts.
      side: DoubleSide,
    });
    const mesh = new Mesh(this.geometry, material);
    mesh.scale.set(size, size, 1);
    // Tile (x, y) covers [x*size, (x+1)*size) × [y*size, (y+1)*size); the plane
    // is centred, so add half a tile. No flip: y already points down.
    mesh.position.set(tileCentre(entry.x, size), tileCentre(entry.y, size), 0);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    entry.texture = texture;
    entry.mesh = mesh;
    this.object3D.add(mesh);
  }

  /**
   * Trim the cache to `cacheFactor ×` the visible count, oldest first, never
   * touching a visible tile. Keeping a ring of recently-seen tiles is what makes
   * panning back and forth free; keeping them forever is what makes a long
   * session run out of texture memory.
   */
  private evict(visible: Set<string>): void {
    const capacity = Math.max(visible.size, Math.ceil(visible.size * this.cacheFactor));
    if (this.cache.size <= capacity) return;
    for (const key of [...this.cache.keys()]) {
      if (this.cache.size <= capacity) break;
      if (visible.has(key)) continue;
      this.drop(key);
    }
  }

  /** Remove one tile and release everything it owns. */
  private drop(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) return;
    this.cache.delete(key);
    entry.cancel?.();
    entry.cancel = null;
    if (entry.mesh) {
      this.object3D.remove(entry.mesh);
      entry.mesh.material.dispose();
      entry.mesh = null;
    }
    entry.texture?.dispose();
    entry.texture = null;
  }

  private clearTiles(): void {
    for (const key of [...this.cache.keys()]) this.drop(key);
    this.object3D.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTiles();
    this.geometry.dispose();
  }
}

/** Centre coordinate of tile index `i` along one axis. */
function tileCentre(i: number, size: number): number {
  return i * size + size / 2;
}

/**
 * The layer's square-tile invariant (see {@link TileLayerOptions.map}) cannot be
 * enforced — a map that breaks it still renders, just wrongly — so say so once
 * instead of leaving a mis-scaled map to be debugged from a screenshot.
 */
function warnIfNonSquare(map: GameMapMeta): void {
  if (map.tileHeight === map.tileWidth) return;
  if (typeof console === "undefined") return;
  console.warn(
    `[map-engine-gl] map "${map.id}" has non-square tiles ` +
      `(${map.tileWidth}×${map.tileHeight}); the tile layer indexes and scales ` +
      `both axes by tileWidth, so rows will be misplaced.`,
  );
}

// --------------------------------------------------------------- watermark ---

export interface WatermarkLayerOptions {
  map: GameMapMeta;
  /** The single image tiled over the grid (`assets.watermarkUrl`). */
  url: string;
  invalidate: () => void;
  loader?: TileLoader;
  padTiles?: number;
  /** Default 0.2, matching the Leaflet watermark layer. */
  opacity?: number;
  order?: number;
}

/**
 * The optional watermark: the same grid as {@link TileLayer}, but every cell
 * shows the SAME image at low opacity (the Leaflet layer returns
 * `assets.watermarkUrl` for every tile coordinate). Hence one texture and one
 * material for the whole layer — there is nothing to cache or evict, only quads
 * to move.
 */
export class WatermarkLayer implements RenderLayer {
  readonly object3D = new Group();
  readonly order: number;

  private map: GameMapMeta;
  private readonly url: string;
  private readonly invalidate: () => void;
  private readonly padTiles: number;
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly material: MeshBasicMaterial;
  private texture: Texture | null = null;
  private cancelLoad: (() => void) | null;
  /** Quad pool, reused as the visible range moves. */
  private readonly meshes: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  private disposed = false;

  constructor(opts: WatermarkLayerOptions) {
    this.map = opts.map;
    this.url = opts.url;
    this.invalidate = opts.invalidate;
    this.padTiles = opts.padTiles ?? 1;
    this.order = opts.order ?? LayerOrder.watermark;
    this.object3D.name = "watermark";
    this.material = new MeshBasicMaterial({
      transparent: true,
      opacity: opts.opacity ?? 0.2,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
    });
    // Nothing to show until the image arrives; an untextured material would
    // flash a white sheet over the map.
    this.material.visible = false;
    const loader = opts.loader ?? createTileLoader();
    this.cancelLoad = loader.load(
      this.url,
      (texture) => {
        this.cancelLoad = null;
        if (this.disposed) {
          texture.dispose();
          return;
        }
        this.texture = configureTileTexture(texture);
        this.material.map = texture;
        this.material.visible = true;
        this.material.needsUpdate = true;
        this.invalidate();
      },
      () => {
        this.cancelLoad = null;
      },
    );
  }

  setMap(map: GameMapMeta): void {
    if (this.disposed || map === this.map) return;
    this.map = map;
    this.invalidate();
  }

  update(camera: Camera): void {
    if (this.disposed) return;
    const size = this.map.tileWidth;
    const range = visibleTileRange(
      camera.visibleBounds(0),
      size,
      this.map.tilesCountX,
      this.map.tilesCountY,
      this.padTiles,
    );
    const needed = tileRangeCount(range);
    while (this.meshes.length < needed) {
      const mesh = new Mesh(this.geometry, this.material);
      mesh.matrixAutoUpdate = false;
      this.meshes.push(mesh);
      this.object3D.add(mesh);
    }
    let i = 0;
    if (needed > 0) {
      for (let y = range.minY; y <= range.maxY; y++) {
        for (let x = range.minX; x <= range.maxX; x++) {
          const mesh = this.meshes[i++];
          mesh.visible = true;
          mesh.scale.set(size, size, 1);
          mesh.position.set(tileCentre(x, size), tileCentre(y, size), 0);
          mesh.updateMatrix();
        }
      }
    }
    for (; i < this.meshes.length; i++) this.meshes[i].visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelLoad?.();
    this.cancelLoad = null;
    this.object3D.clear();
    this.meshes.length = 0;
    this.material.dispose();
    this.texture?.dispose();
    this.texture = null;
    this.geometry.dispose();
  }
}

/**
 * The tile stack for a map: the base layer plus the watermark when the app
 * provides one (`assets.watermarkUrl`), ready to be attached to the renderer in
 * that order.
 */
export function createTileLayers(opts: {
  map: GameMapMeta;
  assets: MapAssets;
  invalidate: () => void;
  loader?: TileLoader;
  padTiles?: number;
  maxNewTilesPerFrame?: number;
  cacheFactor?: number;
}): { tiles: TileLayer; watermark: WatermarkLayer | null } {
  const tiles = new TileLayer(opts);
  const watermark = opts.assets.watermarkUrl
    ? new WatermarkLayer({
        map: opts.map,
        url: opts.assets.watermarkUrl,
        invalidate: opts.invalidate,
        loader: opts.loader,
        padTiles: opts.padTiles,
      })
    : null;
  return { tiles, watermark };
}
