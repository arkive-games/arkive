/**
 * The DOM facts the React layer needs and the core deliberately refuses to know:
 * how big the container is, what device pixel ratio the browser is at, and what
 * a CSS custom property currently resolves to.
 *
 * Everything here is feature-detected, because the same component tree is
 * rendered under jsdom (no `ResizeObserver`, no layout, no `matchMedia`
 * transitions) and must not throw there.
 */

/** Measured CSS-pixel size of an element, floored at 0. */
export function measureElement(el: HTMLElement): { width: number; height: number } {
  const width = el.clientWidth;
  const height = el.clientHeight;
  return {
    width: Number.isFinite(width) && width > 0 ? width : 0,
    height: Number.isFinite(height) && height > 0 ? height : 0,
  };
}

/**
 * `MapRendererOptions.observeSize` for a DOM element: a `ResizeObserver` when the
 * host has one, else a `resize` listener on the element's own window (which
 * catches the only case that matters for a full-height map container).
 *
 * The callback is NOT invoked immediately — the renderer is constructed with the
 * measured size already.
 */
export function observeElementSize(
  el: HTMLElement,
  onResize: (width: number, height: number) => void,
): () => void {
  const report = (): void => {
    const { width, height } = measureElement(el);
    onResize(width, height);
  };
  const view = el.ownerDocument?.defaultView;
  const Observer = (view as unknown as { ResizeObserver?: typeof ResizeObserver })
    ?.ResizeObserver;
  if (typeof Observer === "function") {
    const observer = new Observer(() => report());
    observer.observe(el);
    return () => observer.disconnect();
  }
  if (view) {
    view.addEventListener("resize", report);
    return () => view.removeEventListener("resize", report);
  }
  return () => {};
}

/**
 * Notify when the device pixel ratio changes.
 *
 * Browser zoom changes the DPR WITHOUT changing the container's CSS size, so a
 * `ResizeObserver` never fires and the drawing buffer would stay at the old
 * ratio — a permanently blurry (or 2× over-rendered) map until the next resize.
 * The idiomatic detector is a `(resolution: Xdppx)` media query that matches the
 * CURRENT ratio: the moment it stops matching, the ratio changed. It must then
 * be re-registered for the new ratio, hence the self-rearming chain.
 */
export function observeDevicePixelRatio(
  view: Window,
  onChange: (dpr: number) => void,
): () => void {
  if (typeof view.matchMedia !== "function") return () => {};
  let query: MediaQueryList | null = null;
  let disposed = false;

  const detach = (): void => {
    if (!query) return;
    // `removeEventListener` on a MediaQueryList is not universal (Safari < 14);
    // the deprecated `removeListener` is, and is what the polyfill-free fallback
    // below pairs with.
    if (typeof query.removeEventListener === "function") {
      query.removeEventListener("change", handle);
    } else if (typeof query.removeListener === "function") {
      query.removeListener(handle);
    }
    query = null;
  };

  function handle(): void {
    if (disposed) return;
    detach();
    const dpr = view.devicePixelRatio;
    if (typeof dpr === "number" && dpr > 0) onChange(dpr);
    arm();
  }

  function arm(): void {
    if (disposed) return;
    const dpr = view.devicePixelRatio;
    if (typeof dpr !== "number" || !(dpr > 0)) return;
    const next = view.matchMedia(`(resolution: ${dpr}dppx)`);
    query = next;
    if (typeof next.addEventListener === "function") {
      next.addEventListener("change", handle);
    } else if (typeof next.addListener === "function") {
      next.addListener(handle);
    }
  }

  arm();
  return () => {
    disposed = true;
    detach();
  };
}

/**
 * Colour notations `THREE.Color` can parse. Anything else (notably Tailwind v4's
 * default `oklch(...)` tokens) must be rejected rather than handed to three,
 * which would warn per material and render black.
 */
const PARSEABLE_COLOR =
  /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|[a-z]+$)/i;

/**
 * Resolve a CSS custom property from an element's computed style.
 *
 * GL shaders cannot read CSS variables, so the region/border colour the Leaflet
 * engine expresses as `var(--primary, #2E97FF)` has to be resolved here and
 * pushed into `VectorLayer.setColors`. Returns `null` when the property is unset
 * or is a notation three cannot parse, so the caller keeps its own default.
 */
export function resolveCssColor(el: HTMLElement, property: string): string | null {
  const view = el.ownerDocument?.defaultView;
  if (!view || typeof view.getComputedStyle !== "function") return null;
  const raw = view.getComputedStyle(el).getPropertyValue(property).trim();
  if (!raw) return null;
  if (!PARSEABLE_COLOR.test(raw)) return null;
  return raw;
}

/**
 * Call `onChange` whenever the host's theme could have flipped, i.e. whenever the
 * `class` attribute of `<html>` (shadcn/Tailwind put `.dark` there) or of the map
 * root itself changes. The values behind `--primary` and friends change with no
 * event of their own, so the class mutation is the only signal available.
 *
 * A `themeKey`-style prop was rejected on purpose: `GameMapViewProps` must stay
 * field-for-field identical to the Leaflet engine's so the app can swap engines
 * with one object.
 */
export function observeThemeClass(el: HTMLElement, onChange: () => void): () => void {
  const doc = el.ownerDocument;
  const view = doc?.defaultView;
  const Observer = (view as unknown as { MutationObserver?: typeof MutationObserver })
    ?.MutationObserver;
  if (!doc || typeof Observer !== "function") return () => {};
  const observer = new Observer(() => onChange());
  const options = { attributes: true, attributeFilter: ["class"] };
  if (doc.documentElement) observer.observe(doc.documentElement, options);
  observer.observe(el, options);
  return () => observer.disconnect();
}
