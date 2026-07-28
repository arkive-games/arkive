import { test, expect } from "@playwright/test";

const PHONE = { width: 390, height: 844 };

test.describe("mobile chrome", () => {
  test.use({ viewport: PHONE });

  test("viewport meta opts into the safe area", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    const content = await page
      .locator('meta[name="viewport"]')
      .getAttribute("content");
    expect(content).toContain("viewport-fit=cover");
  });

  // Fixed by the "hide desktop top bar below md" task. Until then the bar
  // measures ~518px in a 390px viewport and the lang/theme/contact buttons sit
  // outside the viewport entirely.
  test.fail("KNOWN DEFECT: top bar overflows the viewport", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    // The bar only reaches its overflowing width once the i18n strings have
    // arrived over HTTP — measuring right after goto sees a still-empty bar.
    await page
      .locator('header a[href="https://archive.tc-imba.com/"]')
      .waitFor({ state: "attached" });
    const overflow = await page.evaluate(() => {
      const h = document.querySelector("header");
      return h ? h.scrollWidth - h.clientWidth : 0;
    });
    expect(overflow).toBe(0);
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
