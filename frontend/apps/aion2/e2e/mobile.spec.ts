import { test, expect } from "@playwright/test";

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test.describe("mobile chrome", () => {
  test.use({ viewport: PHONE });

  test("viewport meta opts into the safe area", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    const content = await page
      .locator('meta[name="viewport"]')
      .getAttribute("content");
    expect(content).toContain("viewport-fit=cover");
  });

  test("desktop top bar is not rendered on phones", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    // The overflowing 518px-wide bar is gone; the mobile header and the bottom
    // tab bar navigate instead. Assert it EXISTS but is not visible —
    // toBeHidden() alone also passes when the element is simply absent, which
    // would make this test green against a missing testid.
    const topbar = page.getByTestId("desktop-topbar");
    await expect(topbar).toHaveCount(1);
    await expect(topbar).toBeHidden();
    const scrollW = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollW).toBe(390);
  });

  // Fixed by the "mobile map branch" task. Until then the 346px sidebar leaves
  // the Leaflet container ~44px wide.
  test.fail("KNOWN DEFECT: map is a sliver next to the sidebar", async ({ page }) => {
    await page.goto("/?map=World_L_A&lng=en-US");
    const el = page.locator(".leaflet-container");
    await el.waitFor({ state: "visible" });
    const box = await el.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(380);
  });

  test("bottom tab bar navigates and marks the active tab", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    const bar = page.getByTestId("bottom-tab-bar");
    await expect(bar).toBeVisible();

    await page.getByTestId("tab-quest").click();
    await expect(page).toHaveURL(/\/wiki\/quest/);
    await expect(page.getByTestId("tab-quest")).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  test("language and theme are reachable in the More sheet", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    await page.getByTestId("tab-more").click();
    const sheet = page.getByTestId("more-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("more-lang-zh-CN")).toBeVisible();
    await expect(sheet.getByTestId("more-theme-dark")).toBeVisible();
    await expect(sheet.getByTestId("more-archive")).toBeVisible();
  });
});

test.describe("desktop is unchanged", () => {
  test.use({ viewport: DESKTOP });

  test("top bar shows, tab bar does not", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    await expect(page.getByTestId("desktop-topbar")).toBeVisible();
    const bar = page.getByTestId("bottom-tab-bar");
    await expect(bar).toHaveCount(1);
    await expect(bar).toBeHidden();
    await expect(page.getByTestId("lang-menu")).toBeVisible();
    await expect(page.getByTestId("theme-menu")).toBeVisible();
    await expect(page.getByTestId("contact-menu")).toBeVisible();
  });
});
