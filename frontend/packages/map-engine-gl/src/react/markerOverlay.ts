import type { Camera } from "../core/camera.ts";
import { isMarkerVisible, type LayerMarker } from "../core/markerLayer.ts";
import type { PixelBounds, Point } from "../core/types.ts";

/**
 * The DOM half of the marker overlay: the hover tooltip and the permanent name
 * labels.
 *
 * These are the only marker visuals that are NOT drawn in GL. Text rendering in
 * a shader would mean a glyph atlas, a font pipeline and a shaping pass for 17
 * locales including CJK — for a handful of nodes that the browser already
 * renders with perfect subpixel quality, in the host's own font, and that the
 * Leaflet engine styles with the very same CSS. So they stay DOM, and the price
 * is paid where DOM is expensive: they must be CULLED and CAPPED (see
 * {@link cullLabelSources}), and they must never go through React state — one
 * `setState` per pan frame with 300 children mounted is exactly the stutter the
 * GL engine exists to remove.
 *
 * {@link MarkerOverlay} therefore owns its nodes imperatively inside a container
 * that React renders empty (`<div ref={...} />`), and repositions them from a
 * single batched projection pass.
 */

/** Cap on simultaneously mounted permanent labels; the overflow is skipped. */
export const MAX_LABELS = 300;

/**
 * Culling pad as a FRACTION OF THE VIEWPORT on each side — Leaflet's
 * `VIEWPORT_PAD`. It keeps a ring of off-screen labels mounted so panning slides
 * them in from outside instead of popping them into existence at the edge.
 *
 * Converted to map pixels by {@link cullPadPx} before it reaches
 * `Camera.visibleBounds`, which takes map pixels.
 */
export const LABEL_VIEWPORT_PAD = 0.5;

/**
 * {@link LABEL_VIEWPORT_PAD} in MAP pixels for the camera's current zoom.
 *
 * The pad is defined in screen space (half a viewport), and one map pixel is
 * `camera.scale()` screen pixels, hence the division: zoomed in, half a viewport
 * is a small slice of the map; zoomed out, a large one. The larger of the two
 * axes is used so the ring is symmetric, which is what makes the pad
 * pan-direction-independent.
 */
export function cullPadPx(camera: Camera): number {
  const scale = camera.scale();
  if (!(scale > 0)) return 0;
  const longest = Math.max(camera.viewportWidth, camera.viewportHeight);
  return (longest * LABEL_VIEWPORT_PAD) / scale;
}

/**
 * Vertical offset of a label/tooltip box's BOTTOM edge above the marker's
 * anchor, in CSS pixels — the Leaflet engine's `Tooltip offset={[0, -18]}` with
 * `direction="top"`.
 */
export const LABEL_OFFSET_Y = 18;

/**
 * The marker fields a label needs. `EngineMarker` satisfies it structurally, so
 * this module never imports the React-layer prop types.
 */
export interface LabelMarker extends LayerMarker {
  localizedName?: string;
  name?: string;
  subtypeLabel?: string;
}

/**
 * Leaflet's fallback chain, verbatim: `localizedName || name || subtypeLabel`.
 * Every step can legitimately be "" (an unnamed marker of a subtype whose label
 * failed to resolve), and the result is then "" — which suppresses the label.
 */
export function markerLabelText(marker: LabelMarker): string {
  return marker.localizedName || marker.name || marker.subtypeLabel || "";
}

/** A label to draw: its text and its FANNED position in map-pixel space. */
export interface LabelSource {
  id: string;
  text: string;
  x: number;
  y: number;
}

export interface CollectLabelOptions {
  /**
   * Fanned map-pixel position of a marker — `MarkerLayer.positionOf`. Markers
   * without one (not in the layer's set) are skipped.
   */
  positionOf: (id: string) => Point | null;
  selectedId: string | null;
  visibleSubtypes?: ReadonlySet<string>;
  forceShowIds?: ReadonlySet<string>;
  lodEnabled: boolean;
  visibleTier: number;
}

/**
 * The markers that get a permanent label, in marker order.
 *
 * Three filters, all ported from `GameMarker.tsx`:
 * - the marker must be VISIBLE by the same rules as its sprite
 *   ({@link isMarkerVisible}), so a label can never outlive its pin;
 * - `subtypeMeta.hideTooltip` opts a subtype out of always-on labels (dense
 *   sets like gathering nodes);
 * - the SELECTED marker gets none — its popup already names it.
 *
 * Position lookup happens here (once per marker-set change), never per frame.
 */
export function collectLabelSources(
  markers: readonly LabelMarker[],
  opts: CollectLabelOptions,
): LabelSource[] {
  const out: LabelSource[] = [];
  for (const marker of markers) {
    if (marker.id === opts.selectedId) continue;
    if (marker.subtypeMeta?.hideTooltip) continue;
    if (!isMarkerVisible(marker, opts)) continue;
    const text = markerLabelText(marker);
    if (!text) continue;
    const position = opts.positionOf(marker.id);
    if (!position) continue;
    out.push({ id: marker.id, text, x: position.x, y: position.y });
  }
  return out;
}

/**
 * Labels inside `bounds`, at most `cap` of them. `bounds` is expected to be
 * PADDED (see {@link cullPadPx}) so labels are mounted just outside the viewport
 * and slide in rather than popping in at the edge.
 *
 * The overflow is SKIPPED rather than prioritised: any ranking (by tier, by
 * distance from the centre) would make labels appear and disappear as the view
 * moves, which reads as flicker. At the zoom levels where labels are readable a
 * viewport rarely holds 300 markers anyway, so the cap is a guard against the
 * pathological case (every subtype on, fully zoomed out) rather than a feature.
 */
export function cullLabelSources(
  sources: readonly LabelSource[],
  bounds: PixelBounds,
  cap: number = MAX_LABELS,
): LabelSource[] {
  const out: LabelSource[] = [];
  if (cap <= 0) return out;
  for (const source of sources) {
    if (source.x < bounds.minX || source.x > bounds.maxX) continue;
    if (source.y < bounds.minY || source.y > bounds.maxY) continue;
    out.push(source);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * The CSS transform that puts a label/tooltip box's bottom-centre at a screen
 * point, lifted by {@link LABEL_OFFSET_Y}.
 *
 * `translate(-50%, -100%)` is applied AFTER the pixel translation in the same
 * (unrotated, unscaled) space, so the two compose additively and the box needs
 * no measurement — which is what keeps this a pure string build with no layout
 * read, and therefore no forced reflow per frame.
 */
export function labelTransform(screen: Point): string {
  const x = Math.round(screen.x);
  const y = Math.round(screen.y - LABEL_OFFSET_Y);
  return `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
}

interface TooltipState {
  text: string;
  x: number;
  y: number;
}

/**
 * Owns the overlay's DOM: one tooltip node and a pool of label nodes, inside a
 * container React renders empty.
 *
 * Nodes are POOLED (reused, hidden when unneeded) rather than created and
 * destroyed per frame: at the cap that would be 300 element allocations plus 300
 * removals every time the label set shifts.
 */
export class MarkerOverlay {
  private readonly container: HTMLElement;
  private readonly doc: Document;
  private readonly labelNodes: HTMLElement[] = [];
  private tooltipNode: HTMLElement | null = null;

  private sources: readonly LabelSource[] = [];
  private tooltip: TooltipState | null = null;
  private labelsEnabled = false;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    // No `document` global: the container knows its own document, which is what
    // keeps this usable inside an iframe (and in jsdom).
    this.doc = container.ownerDocument;
  }

  /** Whether permanent labels are drawn at all (`showLabels`). */
  setLabelsEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.labelsEnabled) return;
    this.labelsEnabled = enabled;
    if (!enabled) this.hideLabelsFrom(0);
  }

  /** Replace the label candidates (marker set / filter / selection change). */
  setLabelSources(sources: readonly LabelSource[]): void {
    if (this.disposed) return;
    this.sources = sources;
  }

  /**
   * Show the hover tooltip for a marker at its FANNED map-pixel position, or
   * hide it with `null`. Idempotent, so a pointermove that stays on the same
   * marker costs nothing.
   */
  setTooltip(text: string | null, position: Point | null): void {
    if (this.disposed) return;
    if (!text || !position) {
      if (!this.tooltip) return;
      this.tooltip = null;
      if (this.tooltipNode) this.tooltipNode.style.display = "none";
      return;
    }
    const current = this.tooltip;
    if (
      current &&
      current.text === text &&
      current.x === position.x &&
      current.y === position.y
    ) {
      return;
    }
    this.tooltip = { text, x: position.x, y: position.y };
    const node = this.ensureTooltipNode();
    node.textContent = text;
    node.style.display = "";
  }

  /** The tooltip's marker text, or null. */
  get tooltipText(): string | null {
    return this.tooltip?.text ?? null;
  }

  /** Labels currently mounted and visible (diagnostics / tests). */
  visibleLabelTexts(): string[] {
    const out: string[] = [];
    for (const node of this.labelNodes) {
      if (node.style.display === "none") continue;
      out.push(node.textContent ?? "");
    }
    return out;
  }

  /**
   * Project everything and write the transforms. ONE pass, called from a single
   * coalesced frame — no layout is read, so this never forces a reflow.
   */
  reposition(camera: Camera): void {
    if (this.disposed) return;
    if (this.tooltip && this.tooltipNode) {
      this.tooltipNode.style.transform = labelTransform(
        camera.pixelToScreen(this.tooltip.x, this.tooltip.y),
      );
    }
    if (!this.labelsEnabled) return;
    const visible = cullLabelSources(this.sources, camera.visibleBounds(cullPadPx(camera)));
    for (let i = 0; i < visible.length; i++) {
      const source = visible[i];
      const node = this.ensureLabelNode(i);
      if (node.textContent !== source.text) node.textContent = source.text;
      node.style.transform = labelTransform(camera.pixelToScreen(source.x, source.y));
      node.style.display = "";
    }
    this.hideLabelsFrom(visible.length);
  }

  private hideLabelsFrom(index: number): void {
    for (let i = index; i < this.labelNodes.length; i++) {
      this.labelNodes[i].style.display = "none";
    }
  }

  private ensureLabelNode(index: number): HTMLElement {
    const existing = this.labelNodes[index];
    if (existing) return existing;
    const node = this.doc.createElement("div");
    node.className = "gmgl-label";
    this.labelNodes[index] = node;
    this.container.appendChild(node);
    return node;
  }

  private ensureTooltipNode(): HTMLElement {
    if (this.tooltipNode) return this.tooltipNode;
    const node = this.doc.createElement("div");
    node.className = "gmgl-tooltip";
    this.tooltipNode = node;
    // Appended last so it paints over the permanent labels — the hovered
    // marker's name must stay readable in a dense cluster.
    this.container.appendChild(node);
    return node;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const node of this.labelNodes) node.remove();
    this.labelNodes.length = 0;
    this.tooltipNode?.remove();
    this.tooltipNode = null;
    this.sources = [];
    this.tooltip = null;
  }
}
