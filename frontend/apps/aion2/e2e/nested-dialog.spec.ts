import { test, expect } from "@playwright/test";
import { openMap } from "./engines";

/**
 * "Clear completed" lives inside the mobile filter sheet, and its AlertDialog
 * portals to <body> as a sibling of the sheet. If the dialog's stacking order
 * is below the sheet's, the confirm buttons render behind the sheet and the UI
 * looks frozen.
 *
 * Runs on the WebGL engine — the DEFAULT one, and the one whose map root opens
 * its own stacking context (`isolation: isolate` on `.gmgl-map-root`), so it is
 * also the interesting case for a portalled dialog. Nothing here is
 * Leaflet-specific: the map is only a backdrop, so the old `.leaflet-container`
 * wait is just replaced by the GL canvas.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("Clear completed confirm is above the filter sheet", async ({ page }) => {
  await openMap(page, "gl");
  await page.getByTestId("map-fab-filter").click();
  const sheet = page.getByTestId("filter-sheet");
  await sheet.waitFor({ state: "visible" });

  await sheet
    .locator("button")
    .filter({ hasText: /^Clear completed$/ })
    .first()
    .click();

  const dialog = page.locator('[data-slot="alert-dialog-content"]');
  await expect(dialog).toBeVisible();

  // The real question: is the confirm button actually the topmost element at
  // its own centre? If the sheet covers it, elementFromPoint returns the sheet.
  const confirm = dialog.locator("button").filter({ hasText: /^Confirm$/ });
  await expect(confirm).toBeVisible();
  const box = (await confirm.boundingBox())!;
  const topmostIsInsideDialog = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest('[data-slot="alert-dialog-content"]');
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(topmostIsInsideDialog).toBe(true);
});
