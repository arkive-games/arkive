import { test, expect } from "@playwright/test";
import { mapRoot, openMap, panTo, readCentre, waitForHandle } from "./engines";

/**
 * Regression for the mobile/desktop layout switch on the map route.
 *
 * 390x844 rotated to landscape is 844px wide — ABOVE the 767px mobile
 * breakpoint — so a phone rotation flips the map route between its mobile and
 * desktop presentation. An earlier version of that switch returned two separate
 * element trees, which remounted the map and re-applied the mount-time
 * `initialView`, dumping the user back at the default whole-map centre. Both
 * presentations must therefore keep the map at the SAME position in the element
 * tree so the instance survives.
 *
 * The trap is app-side — one element tree, plus `initialViewForMount` re-reading
 * the persisted view — so this is about the app's structure, not the renderer.
 */
test("map keeps its position across the 768px breakpoint (phone rotation)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openMap(page);

  // Pan somewhere distinctive, and let the view-persistence write settle.
  await panTo(page, 6000, 6192);
  await page.waitForTimeout(900);
  const before = await readCentre(page);
  expect(before).not.toBeNull();

  // Rotate to landscape — crosses the breakpoint.
  await page.setViewportSize({ width: 844, height: 390 });
  await mapRoot(page).waitFor({ state: "visible", timeout: 20_000 });
  await waitForHandle(page);
  await page.waitForTimeout(1200);
  const after = await readCentre(page);
  expect(after).not.toBeNull();

  // The desktop sidebar appearing shifts the centre a little; a remount would
  // instead snap it to the map default (4096, 4096) — thousands of units away.
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(600);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(600);
});
