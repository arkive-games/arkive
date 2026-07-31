import { test, expect } from "@playwright/test";
import { openMap, WORLD_L_A_HEIGHT } from "./engines";

/**
 * Regression for the vertical orientation of DATA/image space (y DOWN, used by
 * markers, regions and the tiles) once it reaches the screen.
 *
 * The invariant is the same for both engines and is stated in DATA terms: a
 * point near the TOP of the map image (small y) must land ABOVE a point near
 * the BOTTOM (large y) — and each must land on its own side of the map centre.
 * How that is achieved differs, so each engine gets its own body:
 *
 *  - Leaflet uses `CRS.Simple`, whose latitude counts UP, so the app has to
 *    flip: `lat = mapHeight - y`, `lng = x`. The original bug was this flip
 *    going missing, putting markers and tiles in different spaces. Projected
 *    through the real `L.Map`, layer-point Y increases DOWNWARD on screen.
 *  - The WebGL engine has no CRS: its camera works in DATA pixels directly, so
 *    the assertion is that `project()` keeps y pointing down (and x right)
 *    rather than that a flip was applied.
 */

// DATA points (image space) from World_L_A: the min-Y and max-Y markers.
const TOP_DATA = { x: 1813, y: 1257 };
const BOTTOM_DATA = { x: 5071, y: 6309 };

test("markers are projected with the image->Leaflet vertical flip [leaflet]", async ({
  page,
}) => {
  await openMap(page, "leaflet");
  await page.locator(".leaflet-marker-icon").first().waitFor({ timeout: 15_000 });

  const result = await page.evaluate(
    ({ mapHeight, topData, bottomData }) => {
      const map = window.__leafletMap;
      if (!map) return null;
      const z = map.getMaxZoom();

      const dataToLatLng = (x: number, y: number): [number, number] => [
        mapHeight - y,
        x,
      ];

      const topPt = map.project(dataToLatLng(topData.x, topData.y), z);
      const bottomPt = map.project(dataToLatLng(bottomData.x, bottomData.y), z);
      const fullH = map.project([mapHeight, 0], z).y; // layer Y at lat=mapHeight (top)
      const fullBottom = map.project([0, 0], z).y; // layer Y at lat=0 (bottom)

      return { topY: topPt.y, bottomY: bottomPt.y, fullH, fullBottom };
    },
    { mapHeight: WORLD_L_A_HEIGHT, topData: TOP_DATA, bottomData: BOTTOM_DATA },
  );

  expect(result, "Leaflet map handle not exposed on window").not.toBeNull();
  const r = result!;

  // Layer-point Y increases downward. After the flip, the bottom-of-image data
  // point must have a LARGER layer Y than the top-of-image one.
  expect(r.bottomY).toBeGreaterThan(r.topY);

  // The top-of-image point sits in the upper half, the bottom in the lower half
  // of the [fullH(top) .. fullBottom(bottom)] pixel span.
  const span = r.fullBottom - r.fullH;
  const mid = r.fullH + span / 2;
  expect(r.topY).toBeLessThan(mid);
  expect(r.bottomY).toBeGreaterThan(mid);
});

test("the GL camera projects DATA space with y down and x right [gl]", async ({
  page,
}) => {
  await openMap(page, "gl");

  const r = await page.evaluate(
    ({ mapHeight, topData, bottomData }) => {
      const gl = window.__glMap;
      if (!gl) return null;
      // Centre the map so "above/below the centre" is measurable, and use a
      // fixed zoom so the projection cannot depend on the fit-to-viewport zoom.
      const centre = { x: mapHeight / 2, y: mapHeight / 2 };
      gl.flyTo(centre.x, centre.y, -2, 0);
      return {
        top: gl.project(topData.x, topData.y),
        bottom: gl.project(bottomData.x, bottomData.y),
        centre: gl.project(centre.x, centre.y),
      };
    },
    { mapHeight: WORLD_L_A_HEIGHT, topData: TOP_DATA, bottomData: BOTTOM_DATA },
  );

  expect(r, "GL map handle not exposed on window").not.toBeNull();

  // Screen Y increases downward, so the bottom-of-image point must project
  // lower, and each point must land on its own side of the map's centre.
  expect(r!.bottom.sy).toBeGreaterThan(r!.top.sy);
  expect(r!.top.sy).toBeLessThan(r!.centre.sy);
  expect(r!.bottom.sy).toBeGreaterThan(r!.centre.sy);

  // …and X is NOT mirrored either: BOTTOM_DATA is right of TOP_DATA in the data
  // and must stay right of it on screen.
  expect(r!.bottom.sx).toBeGreaterThan(r!.top.sx);
});
