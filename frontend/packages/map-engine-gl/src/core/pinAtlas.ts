import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  SRGBColorSpace,
  type Texture,
} from "three";
import type { MarkerTypeSubtype } from "@gamemap/data-contract";
import { DEFAULT_PIN_THEME, type PinTheme } from "./pinTheme.ts";

/**
 * Marker pin bitmaps: the GL replacement for `@gamemap/map-engine`'s
 * `createPinIcon` DivIcons.
 *
 * The Leaflet engine builds one `L.DivIcon` per distinct pin appearance (HTML +
 * CSS: an image/circle/dot plus corner badges, a `filter: drop-shadow` for the
 * selected marker). WebGL has no DOM and no CSS filters, so the same visuals are
 * COMPOSED ONTO A 2D CANVAS here and packed into atlas pages that the marker
 * layer samples. The parity rules — box size, variants, scales, badges,
 * selection emphasis — are ported one for one from `markerIcons.tsx` /
 * `GameMarker.tsx`; each deliberate approximation is called out in a comment
 * starting with `APPROXIMATION:` so the visual pass has a checklist.
 *
 * Cache key: the Leaflet engine's visual signature
 * `variant|innerIcon|iconScale|completed|dot|ring|selected|fragmentType|count`,
 * plus a theme fingerprint ({@link pinSignature}). The fingerprint is the one
 * deliberate DIVERGENCE from the Leaflet key: that cache is module-global and
 * omits the theme on the assumption it is fixed per game at startup, which
 * silently collides as soon as two themes coexist (palworld's
 * `completedAccent: #4fa8ff` vs the default green) or the host flips dark mode at
 * runtime. Here one atlas can safely serve several themes.
 *
 * Portability: no DOM globals except in the explicitly-named browser defaults
 * ({@link createDomCanvasFactory}, {@link createDomImageLoader}), both
 * feature-detected. In particular the device pixel ratio is NEVER read from
 * `window` — it arrives from the renderer's per-frame
 * `RenderFrameContext.pixelRatio` via {@link PinAtlas.setDevicePixelRatio}, so
 * the atlas and the drawing buffer can never disagree (browser zoom, or a window
 * dragged between a 2x panel and a 1x monitor).
 */

// ------------------------------------------------------------------- theme ---

/**
 * The pin colours live in the import-free `core/pinTheme.ts` and are re-exported
 * here, so this module stays their single public home while an app can read them
 * without pulling three.js in. `src/react/theme.ts` re-exports the same two names
 * (and adds `MapTheme` for the chrome on top) rather than redeclaring them, so
 * `src/index.ts` exports exactly one `PinTheme` — keep it that way.
 */
export { DEFAULT_PIN_THEME };
export type { PinTheme };

// --------------------------------------------------- injected 2D surfaces ---

/** Anything that can be drawn with `drawImage`: a loaded image or a canvas. */
export interface PinDrawable {
  width: number;
  height: number;
}

/**
 * The slice of `CanvasRenderingContext2D` the pin composer uses.
 * `CanvasRenderingContext2D` satisfies it in the browser (the default factory
 * casts); tests inject a recorder.
 */
export interface PinContext2D {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: PinDrawable, dx: number, dy: number, dw?: number, dh?: number): void;
  fillText(text: string, x: number, y: number): void;
  fillStyle: string;
  // NOTE: `measureText` is deliberately absent — the count pill's width comes
  // from a fixed digit advance (see `COUNT_DIGIT_WIDTH`) so the reserved bitmap
  // area and the drawn pill can never disagree, and so the surface a host has to
  // provide stays as small as possible.
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

/** The slice of a 2D canvas the atlas needs. `HTMLCanvasElement` satisfies it. */
export interface PinCanvas extends PinDrawable {
  getContext(type: "2d"): PinContext2D | null;
}

export type PinCanvasFactory = (width: number, height: number) => PinCanvas;

/** Resolves to the decoded image, rejects when it cannot be loaded. */
export type PinImageLoader = (url: string) => Promise<PinDrawable>;

/**
 * Browser canvas factory. Throws when there is no `document` — a non-DOM host
 * must inject its own factory rather than silently render nothing.
 */
export function createDomCanvasFactory(): PinCanvasFactory {
  return (width, height) => {
    if (typeof document === "undefined") {
      throw new Error("PinAtlas: no `document`; inject `createCanvas`.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as PinCanvas;
  };
}

/**
 * Browser image loader. `crossOrigin` matters because marker icons are served
 * from a different host than the app, and a tainted canvas cannot be uploaded
 * as a texture.
 */
export function createDomImageLoader(crossOrigin = "anonymous"): PinImageLoader {
  return (url) =>
    new Promise<PinDrawable>((resolve, reject) => {
      if (typeof Image === "undefined") {
        reject(new Error("PinAtlas: no `Image`; inject `loadImage`."));
        return;
      }
      const img = new Image();
      img.crossOrigin = crossOrigin;
      img.onload = () => resolve(img as unknown as PinDrawable);
      img.onerror = () => reject(new Error(`PinAtlas: failed to load ${url}`));
      img.src = url;
    });
}

// -------------------------------------------------------------- pin specs ---

/** How a pin renders. Same three values as the Leaflet engine's `PinVariant`. */
export type PinVariant = "image" | "circular" | "pin";

/** Base box of a pin, in CSS pixels — the Leaflet DivIcon's `iconSize`. */
export const PIN_BASE_SIZE = 40;
/** Default icon scale when the subtype declares none (`iconScale || 1.25`). */
export const DEFAULT_ICON_SCALE = 1.25;
/** The "circular" variant is always composed at this scale (createPinIcon 0.9). */
export const CIRCULAR_ICON_SCALE = 0.9;
/** Dense subtypes that read better a touch smaller. */
export const COMPACT_SUBTYPES: ReadonlySet<string> = new Set(["fragments", "hiddenCube"]);
/** Scale for gathering nodes + {@link COMPACT_SUBTYPES}. */
export const COMPACT_SCALE = 0.9;
/** God fragments carry a directional badge, so they read a touch larger. */
export const FRAGMENT_SCALE = 1.1;
/** Selected-marker growth, applied from the centre so the anchor cannot shift. */
export const SELECTED_SCALE = 1.2;
/** Whole-pin alpha for the generic completion treatment. */
export const COMPLETED_ALPHA = 0.4;

const BADGE_INSET = 3;
const BADGE_SIZE = 15;
const CHECK_STROKE = 3.5;
const CHEVRON_STROKE = 4;
const PIN_DISC_SIZE = 30;
const PIN_DOT_SIZE = 22;
const CIRCULAR_RING_WIDTH = 1.5;
const COUNT_PILL_HEIGHT = 14;
const COUNT_PILL_MIN_WIDTH = 14;
const COUNT_PILL_PADDING = 3;
const COUNT_PILL_BORDER = 1;
const COUNT_FONT_SIZE = 10;
/** Advance width of one bold 10px digit. Fixed (not measured) so the reserved
 *  bitmap area and the drawn pill can never disagree. */
const COUNT_DIGIT_WIDTH = 6.2;
/** `transform: translate(35%, -35%)` on the count pill. */
const COUNT_PILL_NUDGE = 0.35;
/** Blur (5) + downward offset (3) of the selected drop-shadow, in CSS px. */
const SELECTED_SHADOW_PAD = 8;
const TAU = Math.PI * 2;

/**
 * The full visual description of one pin — the GL counterpart of
 * `createPinIcon(innerIcon, iconScale, completed, options)`. `dot` and `ring`
 * are always resolved (never undefined) because the Leaflet cache key folds
 * both in for every variant; keeping that makes the two caches agree key for
 * key.
 */
export interface PinSpec {
  variant: PinVariant;
  /** Resolved icon URL; "" for a pin with no image. */
  iconUrl: string;
  iconScale: number;
  /** Generic completion treatment (dim + green check). False when icon-swapped. */
  completed: boolean;
  /** "pin" variant inner-dot colour. */
  dot: string;
  /** "circular" variant ring colour. */
  ring: string;
  selected: boolean;
  fragmentType?: "ground" | "air" | "water";
  count?: number;
  theme: PinTheme;
}

/** Whether a spec draws the cluster count badge (`count > 1`). */
export function showsCount(spec: Pick<PinSpec, "count">): boolean {
  return typeof spec.count === "number" && spec.count > 1;
}

/**
 * The theme colours that reach the pixels but are NOT already covered by `dot`
 * (which is `subtypeColor ?? theme.pinDot`) or `ring` (`… ?? circularBorder`):
 * the pin disc's fill and hairline, and the badge accent. Two themes with the
 * same three produce byte-identical bitmaps, so the fingerprint is exactly as
 * coarse as it can be without colliding.
 */
export function pinThemeFingerprint(theme: PinTheme): string {
  return `${theme.pinDiscBg}|${theme.pinBorder}|${theme.completedAccent}`;
}

/**
 * The Leaflet engine's icon-cache key —
 * `variant|innerIcon|iconScale|completed|dot|ring|selected|fragmentType|count` —
 * followed by {@link pinThemeFingerprint}. See the file header for why the theme
 * is folded in here but not in Leaflet.
 */
export function pinSignature(spec: PinSpec): string {
  const count = showsCount(spec) ? spec.count : "";
  return `${spec.variant}|${spec.iconUrl}|${spec.iconScale}|${spec.completed ? 1 : 0}|${spec.dot}|${spec.ring}|${spec.selected ? 1 : 0}|${spec.fragmentType ?? ""}|${count}|${pinThemeFingerprint(spec.theme)}`;
}

/** The marker fields pin resolution reads. `EngineMarker` satisfies it. */
export interface PinMarkerInput {
  icon?: string;
  completed?: boolean;
  fragmentType?: "ground" | "air" | "water";
  count?: number;
  subtypeMeta?: MarkerTypeSubtype;
  /**
   * Per-marker scale override, winning over every taxonomy-derived scale below.
   *
   * Main-map markers never set it: their size is a property of the SUBTYPE, and
   * the Leaflet engine's own call sites hard-code the per-variant scales this
   * function reproduces (`GameMarker.tsx` passes a literal `0.9` for
   * `circular`). The embed has no taxonomy — {@link GameMapEmbed} synthesises one
   * subtype per pin — so it needs to size a single pin directly, which is what
   * `createPinIcon`'s positional `iconScale` argument gave it. Keeping that as a
   * separate field rather than folding it into `subtypeMeta.iconScale` is
   * deliberate: `iconScale` is IGNORED for `circular` by design, and overloading
   * it would silently resize main-map creature pins the day a taxonomy declared
   * one.
   */
  pinScale?: number;
}

export interface ResolvePinOptions {
  /** `assets.markerIconUrl(rawIcon, map)`, pre-bound to the current map. */
  resolveIconUrl: (rawIcon: string) => string;
  selected?: boolean;
  theme?: PinTheme;
}

/**
 * Port of `GameMarker.tsx`'s icon-resolution block — the single place that
 * decides which icon wins and how big it is:
 *
 * - **icon swap** beats everything: `completed && subtypeMeta.iconComplete`
 *   swaps the image AND suppresses the dim + green check (the icon conveys
 *   completion itself).
 * - `rawIcon = (swap ? iconComplete : marker.icon || subtypeMeta.icon) || ""`.
 * - variant comes from the taxonomy (`subtypeMeta.pinVariant`), except that a
 *   marker with NO icon always falls back to `pin`.
 * - a non-black subtype `color` tints the circular ring / the pin dot.
 * - scales: circular is always 0.9; `pin` uses `iconScale || 1.25`; `image`
 *   uses 1.1 for `fragments`, 0.9 for the `gathering` category and the compact
 *   subtypes, else `iconScale || 1.25`. An explicit {@link
 *   PinMarkerInput.pinScale} overrides all three.
 * - only the `image` variant carries the air/water chevron (as in Leaflet,
 *   where the other two branches don't pass `fragmentType`).
 */
export function resolvePinSpec(
  marker: PinMarkerInput,
  opts: ResolvePinOptions,
): PinSpec {
  const sub = marker.subtypeMeta;
  const theme = opts.theme ?? DEFAULT_PIN_THEME;
  const selected = !!opts.selected;
  const iconScale = sub?.iconScale || DEFAULT_ICON_SCALE;

  const isCompleted = !!marker.completed;
  const useIconSwap = isCompleted && !!sub?.iconComplete;
  const rawIcon = (useIconSwap ? sub?.iconComplete : marker.icon || sub?.icon) || "";
  const iconUrl = opts.resolveIconUrl(rawIcon);
  const completed = isCompleted && !useIconSwap;
  // A subtype colour of pure black means "unset" in the taxonomy data.
  const subColor = sub?.color && sub.color !== "#000000" ? sub.color : undefined;

  if (sub?.pinVariant === "circular") {
    return {
      variant: "circular",
      iconUrl,
      iconScale: marker.pinScale ?? CIRCULAR_ICON_SCALE,
      completed,
      dot: theme.pinDot,
      ring: subColor ?? theme.circularBorder,
      selected,
      count: marker.count,
      theme,
    };
  }
  if (sub?.pinVariant === "pin" || !rawIcon) {
    return {
      variant: "pin",
      iconUrl,
      iconScale: marker.pinScale ?? iconScale,
      completed,
      dot: subColor ?? theme.pinDot,
      ring: theme.circularBorder,
      selected,
      count: marker.count,
      theme,
    };
  }
  const compact =
    sub?.category === "gathering" || (!!sub?.name && COMPACT_SUBTYPES.has(sub.name));
  const imageScale =
    sub?.name === "fragments" ? FRAGMENT_SCALE : compact ? COMPACT_SCALE : iconScale;
  return {
    variant: "image",
    iconUrl,
    iconScale: marker.pinScale ?? imageScale,
    completed,
    dot: theme.pinDot,
    ring: theme.circularBorder,
    selected,
    fragmentType: marker.fragmentType,
    count: marker.count,
    theme,
  };
}

// -------------------------------------------------------------- geometry ---

export interface PinGeometry {
  /**
   * Edge of the square bitmap in CSS pixels. The composition is SYMMETRIC about
   * the bitmap centre, so the sprite's centre is the marker anchor (Leaflet:
   * `iconAnchor = [20, 20]`) whatever the padding turns out to be.
   */
  size: number;
  /**
   * Edge of the clickable box in CSS pixels.
   *
   * This is the Leaflet DivIcon's WRAPPER box — a flat `40`, or `48` when
   * selected — and deliberately NOT the content box. In the DOM the wrapper is
   * the only hittable element: both `<img>` variants set `pointerEvents: none`,
   * so an `iconScale > 1` icon overflowing the 40px wrapper is visible but not
   * clickable. Deriving the rect from the content instead would make a
   * 1.25-scaled pin 25% easier to hit than Leaflet's, changing which marker wins
   * in a dense cluster — and would also have made the box depend on whether an
   * icon loaded (a 404'd image pin paints a 30px disc).
   *
   * The selection scale is included because Leaflet scales the wrapper itself;
   * the selection shadow's transparent padding is not, since it must not be
   * clickable.
   */
  hitSize: number;
  /** `30` for the pin variant, `40 × iconScale` otherwise (Leaflet's rule). */
  contentSize: number;
  /**
   * Distance of the corner badges from the 40px box's edge, so a badge stays
   * `BADGE_INSET` inside the CONTENT's corner at any scale. Negative when the
   * content overflows the box — exactly as the CSS `right`/`bottom` do.
   */
  badgeOffset: number;
}

/** Width of the count pill, from the digit count (see {@link COUNT_DIGIT_WIDTH}). */
export function countPillWidth(count: number): number {
  const digits = String(Math.max(0, Math.floor(count))).length;
  return Math.max(
    COUNT_PILL_MIN_WIDTH,
    digits * COUNT_DIGIT_WIDTH + COUNT_PILL_PADDING * 2 + COUNT_PILL_BORDER * 2,
  );
}

/**
 * Bitmap size + badge placement for a spec.
 *
 * The bitmap must cover everything CSS would paint outside the 40px box: an
 * `iconScale > 1` image, the count pill's `translate(35%, -35%)`, and — for the
 * selected pin — the 1.2 growth plus the drop-shadow's blur/offset. Over-padding
 * only wastes a little atlas space; under-padding clips.
 */
export function pinGeometry(spec: PinSpec): PinGeometry {
  const iconSize = PIN_BASE_SIZE * spec.iconScale;
  const contentSize = spec.variant === "pin" ? PIN_DISC_SIZE : iconSize;
  const badgeOffset = PIN_BASE_SIZE / 2 - contentSize / 2 + BADGE_INSET;
  const contentBox = Math.max(PIN_BASE_SIZE, contentSize);

  let extent = contentBox / 2;
  if (showsCount(spec)) {
    // The pill hangs off the content's top-right corner by 35% of its own size.
    const corner = PIN_BASE_SIZE / 2 - badgeOffset;
    const pill = countPillWidth(spec.count as number);
    extent = Math.max(
      extent,
      corner + COUNT_PILL_NUDGE * pill,
      corner + COUNT_PILL_NUDGE * COUNT_PILL_HEIGHT,
    );
  }
  if (spec.selected) {
    // CSS applies `filter` in the element's own space and `transform` after it,
    // so the shadow grows with the 1.2 scale too.
    extent = extent * SELECTED_SCALE + SELECTED_SHADOW_PAD * SELECTED_SCALE;
  }
  return {
    size: Math.ceil(extent) * 2,
    hitSize: PIN_BASE_SIZE * (spec.selected ? SELECTED_SCALE : 1),
    contentSize,
    badgeOffset,
  };
}

// -------------------------------------------------------------- composing ---

export interface ComposePinOptions {
  spec: PinSpec;
  createCanvas: PinCanvasFactory;
  /** Precomputed geometry (the atlas already has it); derived when omitted. */
  geometry?: PinGeometry;
  /** Bitmap resolution multiplier. Default 1. */
  devicePixelRatio?: number;
  /** The decoded icon, or null while it is still loading / not needed. */
  image?: PinDrawable | null;
  /** The icon could not be loaded: fall back to the `pin` dot. */
  imageFailed?: boolean;
}

/**
 * Compose one pin onto a fresh square canvas of `geometry.size × dpr` device
 * pixels, centred on the anchor.
 *
 * Three stages, mirroring how the browser renders the DivIcon:
 * 1. the un-dimmed, un-shadowed content (icon + badges) into a scratch canvas —
 *    CSS `opacity`/`filter` on the wrapper apply to the whole group, so the
 *    group has to exist as one image first;
 * 2. for a selected pin, the 1.2 scale-up plus the two baked drop-shadows;
 * 3. the result blitted once at `globalAlpha = 0.4` when completed, which
 *    reproduces the wrapper's group opacity (the green check is dimmed with it,
 *    exactly as in the DOM).
 */
export function composePinBitmap(opts: ComposePinOptions): PinCanvas {
  const spec = opts.spec;
  const geom = opts.geometry ?? pinGeometry(spec);
  const dpr = opts.devicePixelRatio && opts.devicePixelRatio > 0 ? opts.devicePixelRatio : 1;
  const px = Math.max(1, Math.round(geom.size * dpr));
  const size = geom.size;

  const out = opts.createCanvas(px, px);
  const ctx = out.getContext("2d");
  if (!ctx) return out;

  const content = opts.createCanvas(px, px);
  const cctx = content.getContext("2d");
  if (cctx) {
    cctx.save();
    cctx.scale(dpr, dpr);
    cctx.translate(size / 2, size / 2);
    drawPinContent(cctx, spec, geom, dpr, opts.image ?? null, !!opts.imageFailed);
    cctx.restore();
  }

  let composed: PinDrawable = content;
  if (spec.selected) {
    const lifted = opts.createCanvas(px, px);
    const lctx = lifted.getContext("2d");
    if (lctx) {
      lctx.save();
      lctx.scale(dpr, dpr);
      lctx.translate(size / 2, size / 2);
      lctx.scale(SELECTED_SCALE, SELECTED_SCALE);
      // APPROXIMATION: CSS chains two drop-shadows, i.e. the second one shadows
      // the RESULT of the first (shadow included). Canvas can only shadow the
      // source, so the two passes below both shadow the icon's own alpha and
      // are then drawn under it. The visual difference is a hair less density
      // where the two shadows would have compounded.
      // Shadow blur/offset are NOT affected by the CTM, hence the explicit
      // `dpr * SELECTED_SCALE` factor.
      const k = dpr * SELECTED_SCALE;
      drawShadowed(lctx, composed, size, "rgba(0,0,0,0.85)", 5 * k, 0, 3 * k);
      drawShadowed(lctx, composed, size, "rgba(0,0,0,0.9)", 3 * k, 0, 0);
      lctx.drawImage(composed, -size / 2, -size / 2, size, size);
      lctx.restore();
      composed = lifted;
    }
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.globalAlpha = spec.completed ? COMPLETED_ALPHA : 1;
  ctx.drawImage(composed, 0, 0, size, size);
  ctx.restore();
  return out;
}

function drawShadowed(
  ctx: PinContext2D,
  image: PinDrawable,
  size: number,
  color: string,
  blur: number,
  offsetX: number,
  offsetY: number,
): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = offsetX;
  ctx.shadowOffsetY = offsetY;
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  ctx.restore();
}

/** Origin is the anchor (the content's centre); units are CSS pixels. */
function drawPinContent(
  ctx: PinContext2D,
  spec: PinSpec,
  geom: PinGeometry,
  dpr: number,
  image: PinDrawable | null,
  imageFailed: boolean,
): void {
  const wantsImage = spec.variant !== "pin" && spec.iconUrl !== "";
  if (!wantsImage) {
    drawPinDisc(ctx, spec, dpr);
  } else if (spec.variant === "circular") {
    // A 404'd portrait keeps its ring and backing: a boss whose image is missing
    // must stay a red-ringed circle, not degrade into a generic blue dot.
    drawCircularIcon(ctx, spec, geom, dpr, imageFailed ? null : image);
  } else if (imageFailed) {
    drawPinDisc(ctx, spec, dpr);
  } else if (image) {
    drawImageIcon(ctx, geom, image);
  }
  // Badges last and in DOM order — later siblings paint on top.
  drawBadges(ctx, spec, geom, dpr);
}

/**
 * The fallback location pin: a 30px dark translucent disc with a 1px hairline
 * border around a 22px coloured dot. Borders are content-box in the DOM, so the
 * hairline sits OUTSIDE the 30px disc (outer diameter 32) — stroked at
 * `r + lineWidth/2` here for the same result.
 */
function drawPinDisc(ctx: PinContext2D, spec: PinSpec, dpr: number): void {
  const r = PIN_DISC_SIZE / 2;
  ctx.save();
  setShadow(ctx, "rgba(0,0,0,0.45)", 3 * dpr, 0, 1 * dpr);
  ctx.fillStyle = spec.theme.pinDiscBg;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = spec.theme.pinBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r + 0.5, 0, TAU);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = spec.dot;
  ctx.beginPath();
  ctx.arc(0, 0, PIN_DOT_SIZE / 2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * The creature portrait: the icon cropped into a circle (CSS
 * `object-fit: cover` + `overflow: hidden`) over a dark backing, with a 1.5px
 * ring around it. The ring, like the DOM border, sits outside the clip circle.
 *
 * The backing + ring render even while the image is still loading, matching the
 * DOM (the wrapper div paints before its `<img>` decodes).
 */
function drawCircularIcon(
  ctx: PinContext2D,
  spec: PinSpec,
  geom: PinGeometry,
  dpr: number,
  image: PinDrawable | null,
): void {
  const r = geom.contentSize / 2;
  ctx.save();
  setShadow(ctx, "rgba(0,0,0,0.6)", 6 * dpr, 0, 0);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (image && image.width > 0 && image.height > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.clip();
    // `object-fit: cover`: fill the box, crop the overflow.
    const scale = Math.max(geom.contentSize / image.width, geom.contentSize / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = spec.ring;
  ctx.lineWidth = CIRCULAR_RING_WIDTH;
  ctx.beginPath();
  ctx.arc(0, 0, r + CIRCULAR_RING_WIDTH / 2, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** The plain image pin: `object-fit: contain` inside a `40 × iconScale` box. */
function drawImageIcon(ctx: PinContext2D, geom: PinGeometry, image: PinDrawable): void {
  if (!(image.width > 0) || !(image.height > 0)) return;
  const scale = Math.min(geom.contentSize / image.width, geom.contentSize / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
}

function drawBadges(
  ctx: PinContext2D,
  spec: PinSpec,
  geom: PinGeometry,
  dpr: number,
): void {
  // Bottom-right corner of the 40px box, pulled in by `badgeOffset`.
  const corner = PIN_BASE_SIZE / 2 - geom.badgeOffset;
  const badgeCentre = corner - BADGE_SIZE / 2;

  if (spec.completed) {
    drawGlyph(ctx, CHECK_CIRCLE, badgeCentre, badgeCentre, CHECK_STROKE, spec.theme.completedAccent, dpr);
  }
  if (spec.fragmentType === "air" || spec.fragmentType === "water") {
    const glyph = spec.fragmentType === "air" ? CHEVRON_UP : CHEVRON_DOWN;
    drawGlyph(ctx, glyph, badgeCentre, badgeCentre, CHEVRON_STROKE, spec.theme.completedAccent, dpr);
  }
  if (showsCount(spec)) {
    drawCountPill(ctx, spec.count as number, corner, dpr);
  }
}

/**
 * The cluster count badge: a dark pill at the top-right corner, nudged out by
 * `translate(35%, -35%)` of its own size.
 */
function drawCountPill(ctx: PinContext2D, count: number, corner: number, dpr: number): void {
  const text = String(count);
  const w = countPillWidth(count);
  const h = COUNT_PILL_HEIGHT;
  const right = corner + COUNT_PILL_NUDGE * w;
  const top = -corner - COUNT_PILL_NUDGE * h;
  const left = right - w;
  const cx = left + w / 2;
  const cy = top + h / 2;

  ctx.save();
  setShadow(ctx, "rgba(0,0,0,0.9)", 2 * dpr, 0, 0);
  ctx.fillStyle = "rgba(0,0,0,0.82)";
  roundRectPath(ctx, left, top, w, h, h / 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = COUNT_PILL_BORDER;
  roundRectPath(ctx, left, top, w, h, h / 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#fff";
  // APPROXIMATION: the DOM pill inherits the app font and `tabular-nums`; the
  // canvas asks for the same generic UI stack with a numeric-friendly fallback,
  // so digit shapes can differ by a hair from the DOM badge.
  ctx.font = `700 ${COUNT_FONT_SIZE}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

function roundRectPath(
  ctx: PinContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  ctx.lineTo(x + rr, y + h);
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rr);
  ctx.arc(x + rr, y + rr, rr, Math.PI, (Math.PI * 3) / 2);
  ctx.closePath();
}

// ------------------------------------------------------------ badge glyphs ---

/**
 * Lucide glyphs as canvas paths. `lucide-react` is a React/SSR dependency the
 * GL engine deliberately does NOT take (plan: "badges are canvas-composed"), so
 * the three shapes it needs are transcribed here in lucide's own 24×24 viewBox,
 * with lucide's round caps/joins and `strokeWidth` semantics: the stroke is
 * specified in viewBox units and scales with the glyph, so a `size = 15`
 * `strokeWidth = 3.5` badge really strokes at `3.5 × 15/24 ≈ 2.2` CSS px.
 */
type GlyphSegment =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "poly"; points: readonly number[] };

/** `CheckCircle`: circle(12,12,10) + path "m9 12 2 2 4-4". */
const CHECK_CIRCLE: readonly GlyphSegment[] = [
  { kind: "circle", cx: 12, cy: 12, r: 10 },
  { kind: "poly", points: [9, 12, 11, 14, 15, 10] },
];
/** `ChevronUp`: path "m18 15-6-6-6 6". */
const CHEVRON_UP: readonly GlyphSegment[] = [
  { kind: "poly", points: [18, 15, 12, 9, 6, 15] },
];
/** `ChevronDown`: path "m6 9 6 6 6-6". */
const CHEVRON_DOWN: readonly GlyphSegment[] = [
  { kind: "poly", points: [6, 9, 12, 15, 18, 9] },
];

function drawGlyph(
  ctx: PinContext2D,
  segments: readonly GlyphSegment[],
  cx: number,
  cy: number,
  strokeWidth: number,
  color: string,
  dpr: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  const k = BADGE_SIZE / 24;
  ctx.scale(k, k);
  ctx.translate(-12, -12);
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // The badges' `drop-shadow(0 0 1.5px rgba(0,0,0,0.9))` halo. Blur is in
  // device pixels (CTM-independent), so it must not pick up the 15/24 scale.
  setShadow(ctx, "rgba(0,0,0,0.9)", 1.5 * dpr, 0, 0);
  for (const seg of segments) {
    ctx.beginPath();
    if (seg.kind === "circle") {
      ctx.arc(seg.cx, seg.cy, seg.r, 0, TAU);
    } else {
      for (let i = 0; i + 1 < seg.points.length; i += 2) {
        if (i === 0) ctx.moveTo(seg.points[0], seg.points[1]);
        else ctx.lineTo(seg.points[i], seg.points[i + 1]);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Shadow parameters live in DEVICE pixels: the CTM does not transform them. */
function setShadow(
  ctx: PinContext2D,
  color: string,
  blur: number,
  offsetX: number,
  offsetY: number,
): void {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = offsetX;
  ctx.shadowOffsetY = offsetY;
}

// --------------------------------------------------------------- packing ---

/** Atlas page edge in DEVICE pixels. 2048² is safe on every WebGL target. */
export const ATLAS_PAGE_SIZE = 2048;
/** Transparent gutter between packed bitmaps, so bilinear sampling can't bleed. */
export const ATLAS_PADDING = 1;

export interface AtlasRect {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Shelf (row) packer. Pins are near-uniform squares, so shelf packing wastes
 * almost nothing while staying O(1) per insert and append-only — an atlas that
 * never repacks is an atlas whose already-issued UV rects stay valid.
 *
 * Growth is by PAGE: when the next shelf would run past the bottom of the
 * current page a new page starts. Rectangles larger than a page are rejected
 * (`null`) rather than silently clamped.
 */
export class ShelfPacker {
  private readonly pageSize: number;
  private readonly padding: number;
  private pageIndex = 0;
  private shelfY = 0;
  private shelfHeight = 0;
  private cursorX = 0;
  private packed = 0;

  constructor(pageSize: number = ATLAS_PAGE_SIZE, padding: number = ATLAS_PADDING) {
    this.pageSize = pageSize > 0 ? Math.floor(pageSize) : ATLAS_PAGE_SIZE;
    this.padding = padding >= 0 ? Math.floor(padding) : ATLAS_PADDING;
  }

  /** Pages actually in use (0 before the first successful insert). */
  get pageCount(): number {
    return this.packed === 0 ? 0 : this.pageIndex + 1;
  }

  get size(): number {
    return this.pageSize;
  }

  /** Forget everything packed so far (the atlas recomposes at a new DPR). */
  reset(): void {
    this.pageIndex = 0;
    this.shelfY = 0;
    this.shelfHeight = 0;
    this.cursorX = 0;
    this.packed = 0;
  }

  add(w: number, h: number): AtlasRect | null {
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    const width = Math.ceil(w);
    const height = Math.ceil(h);
    if (width > this.pageSize || height > this.pageSize) return null;

    if (this.cursorX + width > this.pageSize) {
      this.shelfY += this.shelfHeight + this.padding;
      this.shelfHeight = 0;
      this.cursorX = 0;
    }
    if (this.shelfY + height > this.pageSize) {
      // A fresh page always fits: `height <= pageSize` was checked above.
      this.pageIndex += 1;
      this.shelfY = 0;
      this.shelfHeight = 0;
      this.cursorX = 0;
    }
    const rect: AtlasRect = {
      page: this.pageIndex,
      x: this.cursorX,
      y: this.shelfY,
      w: width,
      h: height,
    };
    this.cursorX += width + this.padding;
    if (height > this.shelfHeight) this.shelfHeight = height;
    this.packed++;
    return rect;
  }
}

// ----------------------------------------------------------------- atlas ---

export interface PinEntry {
  /** {@link pinSignature} of the spec this entry was composed from. */
  key: string;
  page: number;
  /** Sprite edge in CSS pixels (screen-constant, not scaled by zoom). */
  size: number;
  /** Clickable content edge in CSS pixels — see {@link PinGeometry.hitSize}. */
  hitSize: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface PinAtlasOptions {
  /** Default: {@link createDomCanvasFactory}. */
  createCanvas?: PinCanvasFactory;
  /** Default: {@link createDomImageLoader}. */
  loadImage?: PinImageLoader;
  /**
   * Bitmap resolution. Default 1 — the atlas never reads `window`. The owner is
   * expected to pass (and keep updating, via
   * {@link PinAtlas.setDevicePixelRatio}) the renderer's capped ratio; the
   * marker layer does that automatically from every frame's
   * `RenderFrameContext.pixelRatio`.
   */
  devicePixelRatio?: number;
  /** Page edge in device pixels. Default {@link ATLAS_PAGE_SIZE}. */
  pageSize?: number;
  /** Convenience listener, same as {@link PinAtlas.addUpdateListener}. */
  onUpdate?: () => void;
}

interface AtlasPage {
  canvas: PinCanvas;
  texture: Texture;
}

interface ImageSlot {
  image: PinDrawable | null;
  failed: boolean;
  /** Entry keys waiting to be recomposed once the image resolves. */
  waiting: Set<string>;
}

interface AtlasEntry {
  entry: PinEntry;
  spec: PinSpec;
  geometry: PinGeometry;
  rect: AtlasRect;
}

/**
 * Signature-keyed cache of composed pin bitmaps, packed into `CanvasTexture`
 * pages. One `get` per marker per rebuild is cheap: a string build plus a map
 * hit for everything but the first marker of each appearance.
 *
 * Icon images load asynchronously. The bitmap is composed IMMEDIATELY (without
 * the image — the circular variant still paints its ring and backing, exactly as
 * the DOM does before an `<img>` decodes), and recomposed in place when the
 * image arrives; the entry's rect and size never change, so no caller has to
 * rebuild anything — it only needs a repaint, which is what the update
 * listeners are for. A load failure falls back to the `pin` dot (except the
 * circular variant, which keeps its ring).
 *
 * SAFE TO SHARE between layers, including layers with different themes: the
 * signature carries a theme fingerprint. What a sharer must respect is
 * {@link generation} — a DPR change throws every page away, so a consumer holding
 * page textures has to notice and rebind.
 */
export class PinAtlas {
  private readonly createCanvas: PinCanvasFactory;
  private readonly loadImage: PinImageLoader;
  private dpr: number;
  private readonly packer: ShelfPacker;
  private readonly pageSize: number;
  private generationCounter = 0;
  private readonly pages: AtlasPage[] = [];
  private readonly entries = new Map<string, AtlasEntry>();
  private readonly images = new Map<string, ImageSlot>();
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(opts: PinAtlasOptions = {}) {
    this.createCanvas = opts.createCanvas ?? createDomCanvasFactory();
    this.loadImage = opts.loadImage ?? createDomImageLoader();
    this.dpr = opts.devicePixelRatio && opts.devicePixelRatio > 0 ? opts.devicePixelRatio : 1;
    this.pageSize = opts.pageSize && opts.pageSize > 0 ? Math.floor(opts.pageSize) : ATLAS_PAGE_SIZE;
    this.packer = new ShelfPacker(this.pageSize, ATLAS_PADDING);
    if (opts.onUpdate) this.listeners.add(opts.onUpdate);
  }

  get devicePixelRatio(): number {
    return this.dpr;
  }

  /**
   * Bumped every time the pages are thrown away and recomposed (currently: a DPR
   * change). Consumers that hold page textures must compare it each frame and
   * rebind when it moves — the old textures are disposed.
   */
  get generation(): number {
    return this.generationCounter;
  }

  /**
   * Recompose every pin at a new device pixel ratio, discarding the pages.
   *
   * Without this the atlas would be frozen at its construction ratio: dragging
   * the window onto a 2x panel (or ctrl+scrolling browser zoom) makes the
   * renderer rebuild its drawing buffer while the pins stay 1x and get upscaled
   * with `LinearFilter` and no mipmaps; a host that pins the renderer to 1x gets
   * the reverse, a 4x-oversized atlas downscaled without mipmaps.
   *
   * Entry KEYS are unchanged (the signature has no DPR in it), so already-loaded
   * icons and pending loads carry straight over. Returns whether anything moved.
   */
  setDevicePixelRatio(dpr: number): boolean {
    if (this.disposed) return false;
    if (!(dpr > 0) || !Number.isFinite(dpr) || dpr === this.dpr) return false;
    this.dpr = dpr;
    this.generationCounter++;
    for (const page of this.pages) page.texture.dispose();
    this.pages.length = 0;
    this.entries.clear();
    this.packer.reset();
    // Pending image loads keep their waiter keys: the recomposed entries reuse
    // the very same keys, so `onImageSettled` still finds them.
    this.notify();
    return true;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  get entryCount(): number {
    return this.entries.size;
  }

  /** Repaint hook: an icon arrived and a page texture changed. */
  addUpdateListener(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** The texture backing a page, or null for an index that does not exist. */
  pageTexture(page: number): Texture | null {
    return this.pages[page]?.texture ?? null;
  }

  /**
   * The atlas entry for a spec, composing it on first sight. Returns null only
   * when the bitmap cannot be packed at all (larger than a page) or the atlas is
   * disposed — the caller then simply draws no sprite.
   */
  get(spec: PinSpec): PinEntry | null {
    if (this.disposed) return null;
    const key = pinSignature(spec);
    const cached = this.entries.get(key);
    if (cached) return cached.entry;

    const geometry = pinGeometry(spec);
    const device = Math.max(1, Math.round(geometry.size * this.dpr));
    const rect = this.packer.add(device, device);
    if (!rect) return null;
    const page = this.ensurePage(rect.page);

    const record: AtlasEntry = {
      spec,
      geometry,
      rect,
      entry: {
        key,
        page: rect.page,
        size: geometry.size,
        hitSize: geometry.hitSize,
        u0: rect.x / this.pageSize,
        v0: rect.y / this.pageSize,
        u1: (rect.x + rect.w) / this.pageSize,
        v1: (rect.y + rect.h) / this.pageSize,
      },
    };
    this.entries.set(key, record);

    const slot = this.requestImage(spec, key);
    this.blit(record, page, slot);
    return record.entry;
  }

  /** Start (or join) the load of a spec's icon; null when it needs no image. */
  private requestImage(spec: PinSpec, key: string): ImageSlot | null {
    if (spec.variant === "pin" || spec.iconUrl === "") return null;
    const url = spec.iconUrl;
    const existing = this.images.get(url);
    if (existing) {
      if (!existing.image && !existing.failed) existing.waiting.add(key);
      return existing;
    }
    const slot: ImageSlot = { image: null, failed: false, waiting: new Set([key]) };
    this.images.set(url, slot);
    this.loadImage(url).then(
      (image) => {
        slot.image = image;
        this.onImageSettled(slot);
      },
      () => {
        slot.failed = true;
        this.onImageSettled(slot);
      },
    );
    return slot;
  }

  private onImageSettled(slot: ImageSlot): void {
    if (this.disposed) return;
    const keys = [...slot.waiting];
    slot.waiting.clear();
    let changed = false;
    for (const key of keys) {
      const record = this.entries.get(key);
      if (!record) continue;
      const page = this.pages[record.rect.page];
      if (!page) continue;
      this.blit(record, page, slot);
      changed = true;
    }
    if (changed) this.notify();
  }

  /** Compose (or recompose) one entry into its page rect. */
  private blit(record: AtlasEntry, page: AtlasPage, slot: ImageSlot | null): void {
    const bitmap = composePinBitmap({
      spec: record.spec,
      geometry: record.geometry,
      devicePixelRatio: this.dpr,
      createCanvas: this.createCanvas,
      image: slot?.image ?? null,
      imageFailed: !!slot?.failed,
    });
    const ctx = page.canvas.getContext("2d");
    if (!ctx) return;
    const { x, y, w, h } = record.rect;
    ctx.clearRect(x, y, w, h);
    ctx.drawImage(bitmap, x, y, w, h);
    page.texture.needsUpdate = true;
  }

  private ensurePage(index: number): AtlasPage {
    while (this.pages.length <= index) {
      const canvas = this.createCanvas(this.pageSize, this.pageSize);
      const texture = new CanvasTexture(canvas as unknown as HTMLCanvasElement);
      // Same sampling rules as the tile textures, and the renderer's Y-DOWN
      // contract: `flipY = false` so the canvas' first row is the sprite's top.
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = false;
      texture.wrapS = ClampToEdgeWrapping;
      texture.wrapT = ClampToEdgeWrapping;
      texture.flipY = false;
      texture.needsUpdate = true;
      this.pages.push({ canvas, texture });
      // A new page means a new draw batch for the marker layer.
      this.notify();
    }
    return this.pages[index];
  }

  private notify(): void {
    if (this.listeners.size === 0) return;
    for (const fn of [...this.listeners]) fn();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    for (const page of this.pages) page.texture.dispose();
    this.pages.length = 0;
    this.entries.clear();
    this.images.clear();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}
