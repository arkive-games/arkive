import { test, expect } from "@playwright/test";

// App chrome only. Everything about the MAP itself — that it renders, that
// markers are on it and clickable, that the subtype filter governs what is drawn
// — lives in map.spec.ts, because the engine draws all of it into one canvas and
// those assertions have to go through the view's window handle rather than the
// DOM.

test("search returns hits", async ({ page }) => {
  await page.goto("/?map=World_L_A&lng=en-US");
  await page.getByTestId("marker-search").fill("a");
  await expect(
    page.getByTestId("search-results").locator("li, button").first(),
  ).toBeVisible({ timeout: 10_000 });
});

test("theme switch applies the theme class", async ({ page }) => {
  await page.goto("/?map=World_L_A&lng=en-US");
  await page.getByTestId("theme-menu").click();
  await page.getByTestId("theme-dark").click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("language switch changes labels", async ({ page }) => {
  await page.goto("/?map=World_L_A&lng=en-US");
  const sel = page.getByTestId("map-select");
  const enText = (await sel.textContent())?.trim() ?? "";
  await page.getByTestId("lang-menu").click();
  await page.getByTestId("lang-zh-CN").click();
  await expect(sel).not.toHaveText(enText, { timeout: 10_000 });
});
