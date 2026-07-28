import { test, expect } from "@playwright/test";

/**
 * Regression for the mobile/desktop layout switch on the map route.
 *
 * 390x844 rotated to landscape is 844px wide — ABOVE the 767px mobile
 * breakpoint — so a phone rotation flips the map route between its mobile and
 * desktop presentation. An earlier version of that switch returned two separate
 * element trees, which remounted Leaflet and re-applied the mount-time
 * `initialView`, dumping the user back at the default whole-map centre. Both
 * presentations must therefore keep the map at the SAME position in the element
 * tree so the instance survives.
 */
type LeafletMapLike = {
  getCenter: () => { lat: number; lng: number };
  getZoom: () => number;
  setView: (
    center: [number, number],
    zoom: number,
    opts?: { animate?: boolean },
  ) => void;
};

test("map keeps its position across the 768px breakpoint (phone rotation)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?map=World_L_A&lng=en-US");
  await page.locator(".leaflet-container").waitFor({ state: "visible" });
  await page.waitForFunction(
    () => !!(window as unknown as { __leafletMap?: unknown }).__leafletMap,
  );

  // Pan somewhere distinctive, and let the view-persistence write settle.
  await page.evaluate(() => {
    const map = (window as unknown as { __leafletMap?: LeafletMapLike })
      .__leafletMap;
    map?.setView([2000, 6000], map.getZoom(), { animate: false });
  });
  await page.waitForTimeout(900);
  const before = await page.evaluate(() => {
    const map = (window as unknown as { __leafletMap?: LeafletMapLike })
      .__leafletMap;
    if (!map) return null;
    const c = map.getCenter();
    return { lat: Math.round(c.lat), lng: Math.round(c.lng) };
  });
  expect(before).not.toBeNull();

  // Rotate to landscape — crosses the breakpoint.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(1200);
  await page.waitForFunction(
    () => !!(window as unknown as { __leafletMap?: unknown }).__leafletMap,
  );
  const after = await page.evaluate(() => {
    const map = (window as unknown as { __leafletMap?: LeafletMapLike })
      .__leafletMap;
    if (!map) return null;
    const c = map.getCenter();
    return { lat: Math.round(c.lat), lng: Math.round(c.lng) };
  });
  expect(after).not.toBeNull();

  // The desktop sidebar appearing shifts the centre a little; a remount would
  // instead snap it to the map default (4096, 4096) — thousands of units away.
  expect(Math.abs(after!.lat - before!.lat)).toBeLessThan(600);
  expect(Math.abs(after!.lng - before!.lng)).toBeLessThan(600);
});
