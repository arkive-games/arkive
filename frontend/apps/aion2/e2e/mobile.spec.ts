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
});
