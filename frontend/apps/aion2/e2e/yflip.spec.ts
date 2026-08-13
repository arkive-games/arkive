import { test, expect } from "@playwright/test";
import { openMap } from "./engines";

/**
 * Regression for the vertical orientation of DATA/image space (y DOWN, used by
 * markers, regions and the tiles) once it reaches the screen.
 *
 * Stated in DATA terms: a point near the TOP of the map image (small y) must land
 * ABOVE a point near the BOTTOM (large y), and each must land on its own side of
 * the map centre.
 *
 * The engine's camera works in DATA pixels directly — there is no CRS and no
 * vertical flip anywhere in it — so the assertion is that `project()` keeps y
 * pointing down and x pointing right. (The retired Leaflet engine needed the
 * opposite: `CRS.Simple` counts latitude UP, so the app flipped every coordinate,
 * and the original bug was that flip going missing.)
 */

/** Height in DATA pixels of World_L_A: tileHeight 1024 × tilesCountY 8. */
const WORLD_L_A_HEIGHT = 8192;

// DATA points (image space) from World_L_A: the min-Y and max-Y markers.
const TOP_DATA = { x: 1813, y: 1257 };
const BOTTOM_DATA = { x: 5071, y: 6309 };

test("the camera projects DATA space with y down and x right", async ({
  page,
}) => {
  await openMap(page);

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
