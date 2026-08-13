import { test, expect, type Page } from "@playwright/test";
import { mapRoot, openMap } from "./engines";

/**
 * The map itself.
 *
 * The engine draws every tile, marker and region into ONE `<canvas>`, so there
 * is no per-marker DOM to query or click. What this spec drives instead is
 * `window.__glMap`, the handle the view publishes when `exposeTestHandle` is on
 * (the app sets it in dev): project a DATA-space coordinate to canvas pixels,
 * then click that page point.
 *
 * This is therefore where the core map coverage lives — the map renders, markers
 * are really on it and clickable, and the subtype filter governs what the canvas
 * draws — while smoke.spec.ts keeps to app chrome.
 *
 * The engine renders on demand — there is no continuous frame loop — so nothing
 * here sleeps for an animation; it polls the handle instead.
 */

/** Screen-space clearance (CSS px) a click target must have from every other
 *  visible marker. The engine's hit rect is 40px wide and resolves overlaps by
 *  nearest centre, so 100px makes the hit unambiguous. */
const MIN_CLEARANCE = 100;

interface MarkerRow {
  id: string;
  category: string;
  subtype: string;
  x: number;
  y: number;
}

/** A click candidate: an isolated, named, currently-visible marker. */
interface Candidate {
  id: string;
  subtype: string;
  x: number;
  y: number;
  name: string;
}

async function getJson<T>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(path);
  expect(res.ok(), `GET ${path} -> ${res.status()}`).toBeTruthy();
  return (await res.json()) as T;
}

/**
 * Pick a marker that can be clicked unambiguously: named, of a subtype that is
 * ON at load, and at least {@link MIN_CLEARANCE} away on screen from every
 * other marker that is also on. Everything comes from the served data — no
 * coordinates are hard-coded.
 *
 * aion2's default filter is "every subtype of the `location` category"
 * (GameDataContext), so that is the visible set on a fresh profile.
 */
async function pickIsolatedMarker(page: Page) {
  const [markersFile, l10n] = await Promise.all([
    getJson<{ markers: MarkerRow[] }>(page, "/data/markers/World_L_A.json"),
    getJson<Record<string, { name?: string }>>(
      page,
      "/data/locales/en-US/markers/World_L_A.json",
    ),
  ]);

  const onMap: Candidate[] = markersFile.markers
    .filter((m) => m.category === "location")
    .map((m) => ({
      id: m.id,
      subtype: m.subtype,
      x: m.x,
      y: m.y,
      name: l10n[m.id]?.name ?? "",
    }));
  expect(onMap.length, "location markers on World_L_A").toBeGreaterThan(0);
  const named = onMap.filter((m) => m.name);
  expect(named.length, "named location markers").toBeGreaterThan(0);

  // Clearances are measured in projected screen space at zoom 0 (scale 1, so
  // one DATA pixel is one screen pixel) — the zoom `clickMarker` then clicks
  // at. The default view is the whole 8192px map in ~1000px of canvas, where
  // nothing is 100px from its neighbours.
  const target = await page.evaluate(
    ({ onMap, named, minClearance }) => {
      const gl = window.__glMap!;
      const c = gl.getCenter();
      gl.flyTo(c.x, c.y, 0, 0);
      const others = onMap.map((m) => ({ id: m.id, ...gl.project(m.x, m.y) }));
      let best: (typeof named)[number] | null = null;
      let bestClearance = 0;
      for (const cand of named) {
        const p = gl.project(cand.x, cand.y);
        let clearance = Number.POSITIVE_INFINITY;
        for (const o of others) {
          if (o.id === cand.id) continue;
          const d = Math.hypot(o.sx - p.sx, o.sy - p.sy);
          if (d < clearance) clearance = d;
        }
        if (clearance > bestClearance) {
          bestClearance = clearance;
          best = cand;
        }
      }
      return best && bestClearance >= minClearance ? best : null;
    },
    { onMap, named, minClearance: MIN_CLEARANCE },
  );
  expect(target, "an isolated named location marker").toBeTruthy();
  return target!;
}

/**
 * Fly the marker to the middle of the view at zoom 0 — the zoom the clearance
 * in {@link pickIsolatedMarker} was measured at — then click where it landed.
 */
async function clickMarker(page: Page, target: Candidate) {
  await page.evaluate((t) => window.__glMap!.flyTo(t.x, t.y, 0, 0), target);
  // `flyTo(..., 0)` applies synchronously, but poll rather than trust it: the
  // camera clamps against the map edges.
  await page.waitForFunction(
    () => Math.abs((window.__glMap?.getZoom() ?? -99) - 0) < 1e-6,
    null,
    { timeout: 10_000 },
  );

  const canvas = page.getByTestId("gl-map-canvas");
  const box = (await canvas.boundingBox())!;
  const pt = await page.evaluate((t) => window.__glMap!.project(t.x, t.y), target);
  expect(pt.sx, "target projects inside the canvas").toBeGreaterThan(0);
  expect(pt.sy, "target projects inside the canvas").toBeGreaterThan(0);
  expect(pt.sx).toBeLessThan(box.width);
  expect(pt.sy).toBeLessThan(box.height);
  await page.mouse.click(box.x + pt.sx, box.y + pt.sy);
}

test("renders the GL canvas, publishes the handle, and logs no console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await openMap(page);

  const view = await page.evaluate(() => ({
    zoom: window.__glMap!.getZoom(),
    centre: window.__glMap!.getCenter(),
  }));
  expect(Number.isFinite(view.zoom)).toBeTruthy();
  expect(Number.isFinite(view.centre.x)).toBeTruthy();
  expect(Number.isFinite(view.centre.y)).toBeTruthy();

  // The canvas' backing store is sized for the box it occupies (a zero-sized
  // drawing buffer renders nothing while still "being visible").
  const size = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("canvas.gmgl-map-canvas")!;
    return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight };
  });
  expect(size.cw).toBeGreaterThan(300);
  expect(size.ch).toBeGreaterThan(300);
  expect(size.w).toBeGreaterThan(0);
  expect(size.h).toBeGreaterThan(0);

  expect(errors, errors.join("\n")).toHaveLength(0);
});

test("clicking a marker opens its popup; clicking empty canvas closes it", async ({
  page,
}) => {
  await openMap(page);
  const target = await pickIsolatedMarker(page);
  await clickMarker(page, target);

  const popup = page.getByTestId("marker-detail-drawer");
  await expect(popup).toBeVisible({ timeout: 10_000 });
  await expect(popup).toContainText(target.name);

  // Selection is the popup's only source of truth, and a background tap clears
  // it. Click a spot that is clear of the marker (which sits at the centre) and
  // of the popup itself.
  const canvas = page.getByTestId("gl-map-canvas");
  const box = (await canvas.boundingBox())!;
  const popupBox = (await popup.boundingBox())!;
  const spot = { x: box.x + box.width * 0.12, y: box.y + box.height * 0.85 };
  const insidePopup =
    spot.x > popupBox.x - 10 &&
    spot.x < popupBox.x + popupBox.width + 10 &&
    spot.y > popupBox.y - 10 &&
    spot.y < popupBox.y + popupBox.height + 10;
  expect(insidePopup, "the background spot must not be under the popup").toBe(false);
  await page.mouse.click(spot.x, spot.y);
  await expect(popup).toHaveCount(0, { timeout: 10_000 });
});

test("a subtype toggle governs what the canvas draws", async ({ page }) => {
  await openMap(page);
  const target = await pickIsolatedMarker(page);

  // On by default: the click lands on a marker.
  await clickMarker(page, target);
  await expect(page.getByTestId("marker-detail-drawer")).toBeVisible({ timeout: 10_000 });

  // Hide its subtype. The marker is >100px from every other visible marker, so
  // if the filter really reaches the canvas the same point now hits nothing.
  // (Deselect first: the engine keeps the SELECTED marker visible on purpose.)
  const spot = (await mapRoot(page).boundingBox())!;
  await page.mouse.click(spot.x + spot.width * 0.12, spot.y + spot.height * 0.85);
  await expect(page.getByTestId("marker-detail-drawer")).toHaveCount(0);

  const toggle = page.getByTestId(`subtype-toggle-${target.subtype}`);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await clickMarker(page, target);
  await expect(page.getByTestId("marker-detail-drawer")).toHaveCount(0);

  // …and turning it back on restores it.
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // Retry the click: re-adding a subtype rebuilds the layer's instance buffers
  // asynchronously (~200ms here), so the first click can still land on a canvas
  // the marker has not been written back into. The retry stops at the first
  // popup, so a marker that never comes back still fails.
  await expect
    .poll(
      async () => {
        if (await page.getByTestId("marker-detail-drawer").count()) return true;
        await clickMarker(page, target);
        return (await page.getByTestId("marker-detail-drawer").count()) > 0;
      },
      { timeout: 10_000, message: "re-enabled marker is clickable again" },
    )
    .toBe(true);
  await expect(page.getByTestId("marker-detail-drawer")).toContainText(target.name);
});

test("the cursor readout follows the pointer over the canvas", async ({ page }) => {
  const canvas = await openMap(page);
  const box = (await canvas.boundingBox())!;
  const coords = page.getByTestId("map-coords");
  await expect(coords).toHaveText(/x:--,y:--/);

  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await expect(coords).toHaveText(/x:-?\d+,y:-?\d+/);
  const first = await coords.textContent();

  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6);
  await expect(coords).not.toHaveText(first!);
});
