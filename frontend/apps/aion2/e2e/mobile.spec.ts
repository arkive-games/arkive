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
    // The overflowing 518px-wide bar is gone. Assert the invariant that
    // actually matters rather than one testid's absence: exactly one <header>
    // exists, it is the mobile one, and none of the desktop-only controls that
    // used to sit off-screen are present anywhere.
    await expect(page.locator("header")).toHaveCount(1);
    await expect(page.getByTestId("wiki-mobile-header")).toBeVisible();
    await expect(page.getByTestId("desktop-topbar")).toHaveCount(0);
    await expect(page.getByTestId("lang-menu")).toHaveCount(0);
    await expect(page.getByTestId("theme-menu")).toHaveCount(0);
    await expect(page.getByTestId("contact-menu")).toHaveCount(0);
    const scrollW = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollW).toBe(390);
  });

  test("map fills the viewport width", async ({ page }) => {
    await page.goto("/?map=World_L_A&lng=en-US");
    const el = page.locator(".leaflet-container");
    await el.waitFor({ state: "visible" });
    const box = await el.boundingBox();
    // Was ~44px, squeezed beside the 346px desktop sidebar.
    expect(box!.width).toBeGreaterThanOrEqual(380);
    // And it has a real height, not a collapsed flex child.
    expect(box!.height).toBeGreaterThanOrEqual(500);
    await expect(page.getByTestId("marker-types-section")).toHaveCount(0);
  });

  test("filter and search sheets open from their FABs", async ({ page }) => {
    await page.goto("/?map=World_L_A&lng=en-US");
    await page.locator(".leaflet-container").waitFor({ state: "visible" });

    await page.getByTestId("map-fab-filter").click();
    const filterSheet = page.getByTestId("filter-sheet");
    await expect(filterSheet).toBeVisible();
    await expect(filterSheet.getByTestId("marker-types-section")).toBeVisible();
    await expect(filterSheet.getByTestId("show-names-toggle")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(filterSheet).toBeHidden();

    await page.getByTestId("map-fab-search").click();
    const searchSheet = page.getByTestId("search-sheet");
    await expect(searchSheet).toBeVisible();
    // Searching must still work from inside the sheet, not just render.
    await searchSheet.getByTestId("marker-search").fill("a");
    await expect(searchSheet.getByTestId("search-results")).toBeVisible();
  });

  test("map chrome is not trapped behind the bottom tab bar", async ({ page }) => {
    await page.goto("/?map=World_L_A&lng=en-US");
    await page.locator(".leaflet-container").waitFor({ state: "visible" });
    const barTop = (await page.getByTestId("bottom-tab-bar").boundingBox())!.y;

    // Every zoom button must be fully above the tab bar, or it cannot be
    // tapped. The zoom-out half used to sit entirely underneath it.
    const buttons = page.locator(".gm-zoom-btn");
    const n = await buttons.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const b = (await buttons.nth(i).boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(barTop);
    }

    // The FABs must clear the tab bar too, and must not overlap the zoom pill.
    const zoom = (await page.locator(".gm-zoom").boundingBox())!;
    for (const id of ["map-fab-search", "map-fab-filter"]) {
      const f = (await page.getByTestId(id).boundingBox())!;
      expect(f.y + f.height).toBeLessThanOrEqual(barTop);
      expect(f.y + f.height).toBeLessThanOrEqual(zoom.y);
    }
  });

  test("toggling a subtype in the filter sheet changes the map", async ({ page }) => {
    await page.goto("/?map=World_L_A&lng=en-US");
    await page.locator(".leaflet-container").waitFor({ state: "visible" });
    await expect
      .poll(() => page.locator(".leaflet-marker-icon").count())
      .toBeGreaterThan(0);
    const before = await page.locator(".leaflet-marker-icon").count();

    await page.getByTestId("map-fab-filter").click();
    const sheet = page.getByTestId("filter-sheet");
    await sheet.waitFor({ state: "visible" });
    await sheet
      .locator("button")
      .filter({ hasText: /^Hide all$/ })
      .first()
      .click();

    await expect
      .poll(() => page.locator(".leaflet-marker-icon").count())
      .toBeLessThan(before);
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

  test("type-hub section chips are touch-sized", async ({ page }) => {
    await page.goto("/wiki/item?lng=en-US");
    // Scoped to real TypeHub chips: `main a[href*="#"]` would also match any
    // unrelated in-page anchor and could pass while every chip stayed 24px.
    const chips = page.locator('[data-testid^="section-chip-"]');
    await chips.first().waitFor({ state: "visible" });
    const n = await chips.count();
    expect(n).toBeGreaterThan(10);
    // Check a spread of them, not just the first.
    for (const i of [0, Math.floor(n / 2), n - 1]) {
      const box = await chips.nth(i).boundingBox();
      expect(box!.height, `chip ${i} of ${n}`).toBeGreaterThanOrEqual(36);
    }
  });

  test("wiki pages get a compact header and clear the tab bar", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    await expect(page.getByTestId("wiki-mobile-header")).toBeVisible();
    // Global search must stay reachable now that the desktop bar is hidden.
    await page.getByTestId("global-search-button").click();
    await expect(page.getByPlaceholder(/Search quests/i)).toBeVisible();
    await page.keyboard.press("Escape");

    // The footer is the last element in the scroll column, so it carries the
    // clearance for the fixed tab bar.
    const pad = await page.evaluate(() => {
      const f = document.querySelector("footer");
      return f ? parseFloat(getComputedStyle(f).paddingBottom) : 0;
    });
    expect(pad).toBeGreaterThanOrEqual(64);
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

  test("an open More sheet does not survive to desktop", async ({ page }) => {
    // The <nav> is md:hidden but the sheet portals to <body>, so without an
    // explicit close it stayed draped over the desktop layout after a rotation.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/wiki?lng=en-US");
    await page.getByTestId("tab-more").click();
    await expect(page.getByTestId("more-sheet")).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId("more-sheet")).toHaveCount(0);
  });

  test("type-hub chips stay compact on desktop", async ({ page }) => {
    await page.goto("/wiki/item?lng=en-US");
    const chips = page.locator('[data-testid^="section-chip-"]');
    await chips.first().waitFor({ state: "visible" });
    const box = await chips.first().boundingBox();
    expect(box!.height).toBeLessThanOrEqual(28);
  });

  test("sidebar still renders the marker-types section", async ({ page }) => {
    await page.goto("/?map=World_L_A&lng=en-US");
    await expect(page.getByTestId("marker-types-section")).toBeVisible();
    await expect(page.getByTestId("show-names-toggle")).toBeVisible();
  });
});
