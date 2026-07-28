import { test, expect } from "@playwright/test";

/**
 * "Clear completed" lives inside the mobile filter sheet, and its AlertDialog
 * portals to <body> as a sibling of the sheet. If the dialog's stacking order
 * is below the sheet's, the confirm buttons render behind the sheet and the UI
 * looks frozen.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("Clear completed confirm is above the filter sheet", async ({ page }) => {
  await page.goto("/?map=World_L_A&lng=en-US");
  await page.locator(".leaflet-container").waitFor({ state: "visible" });
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
