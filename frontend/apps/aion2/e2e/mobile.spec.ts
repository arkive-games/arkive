import { test, expect } from "@playwright/test";
import { ENGINES, mapRoot, openMap, zoomButtons, zoomPill } from "./engines";

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
    await expect(page.getByTestId("arkive-mobile-header")).toBeVisible();
    await expect(page.getByTestId("desktop-topbar")).toHaveCount(0);
    await expect(page.getByTestId("lang-menu")).toHaveCount(0);
    await expect(page.getByTestId("theme-menu")).toHaveCount(0);
    await expect(page.getByTestId("contact-menu")).toHaveCount(0);
    const scrollW = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollW).toBe(390);
  });

  // Both engines: the mobile map layout is app CSS, but each engine brings its
  // own root element, and only the one actually mounted can prove the box is
  // full-width. (`.leaflet-container` vs the GL `<canvas>`.)
  for (const engine of ENGINES) {
    test(`map fills the viewport width [${engine}]`, async ({ page }) => {
      await openMap(page, engine);
      const box = await mapRoot(page, engine).boundingBox();
      // Was ~44px, squeezed beside the 346px desktop sidebar.
      expect(box!.width).toBeGreaterThanOrEqual(380);
      // And it has a real height, not a collapsed flex child.
      expect(box!.height).toBeGreaterThanOrEqual(500);
      await expect(page.getByTestId("marker-types-section")).toHaveCount(0);
    });
  }

  // Default engine only: the sheets are app chrome, nothing here touches the
  // renderer beyond needing a mounted map underneath.
  test("filter and search sheets open from their FABs", async ({ page }) => {
    await openMap(page, "gl");

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

  // Both engines, and this one has bitten before: the lift that clears the tab
  // bar is CSS keyed on the zoom pill's class, and the two engines emit
  // DIFFERENT prefixes (`.gm-zoom` vs `.gmgl-zoom`). A rule that matches
  // nothing reports no error — the zoom-out button just silently goes
  // untappable again — so the assertion has to run per engine.
  for (const engine of ENGINES) {
    test(`map chrome is not trapped behind the bottom tab bar [${engine}]`, async ({
      page,
    }) => {
      await openMap(page, engine);
      const barTop = (await page.getByTestId("bottom-tab-bar").boundingBox())!.y;

      // Every zoom button must be fully above the tab bar, or it cannot be
      // tapped. The zoom-out half used to sit entirely underneath it.
      const buttons = zoomButtons(page, engine);
      const n = await buttons.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const b = (await buttons.nth(i).boundingBox())!;
        expect(b.y + b.height).toBeLessThanOrEqual(barTop);
      }

      // One ordered right-edge stack: zoom, search, filter, then navigation.
      const zoom = (await zoomPill(page, engine).boundingBox())!;
      const search = (await page.getByTestId("map-fab-search").boundingBox())!;
      const filter = (await page.getByTestId("map-fab-filter").boundingBox())!;
      expect(zoom.y + zoom.height).toBeLessThanOrEqual(search.y);
      expect(search.y + search.height).toBeLessThanOrEqual(filter.y);
      expect(filter.y + filter.height).toBeLessThanOrEqual(barTop);
    });
  }

  // Both engines. What is counted differs because GL markers are not DOM: the
  // Leaflet engine has one node per marker, while the GL engine puts only the
  // permanent NAME LABELS in the DOM (`.gmgl-label`, which are POOLED — hidden
  // ones stay in the tree, hence `:visible`). Labels are on by default in
  // aion2, and a label can never outlive its pin, so they track what the canvas
  // draws closely enough for a "did the filter reach the map" assertion.
  // gl-map.spec.ts proves the same thing against the canvas itself, by clicking.
  for (const engine of ENGINES) {
    test(`toggling a subtype in the filter sheet changes the map [${engine}]`, async ({
      page,
    }) => {
      await openMap(page, engine);
      const drawn = page.locator(
        engine === "gl" ? ".gmgl-label:visible" : ".leaflet-marker-icon",
      );

      await expect.poll(() => drawn.count(), { timeout: 10_000 }).toBeGreaterThan(0);
      const before = await drawn.count();

      await page.getByTestId("map-fab-filter").click();
      const sheet = page.getByTestId("filter-sheet");
      await sheet.waitFor({ state: "visible" });
      await sheet
        .locator("button")
        .filter({ hasText: /^Hide all$/ })
        .first()
        .click();

      await expect.poll(() => drawn.count(), { timeout: 10_000 }).toBeLessThan(before);
    });
  }

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

  test("language and theme are reachable without a mobile renderer selector", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    await page.getByTestId("tab-more").click();
    const sheet = page.getByTestId("more-sheet");
    await expect(sheet).toBeVisible();
    // Theme sits on the main body; language is a drill-down, so the
    // sheet shows only the current value until its row is opened.
    await expect(sheet.getByTestId("more-theme-dark")).toBeVisible();
    await expect(sheet.locator('[data-testid^="more-engine-"]')).toHaveCount(0);
    await expect(sheet.getByTestId("site-info-arkive-link")).toBeVisible();
    await expect(sheet.getByTestId("more-lang-zh-CN")).toHaveCount(0);

    await sheet.getByTestId("more-lang-open").click();
    await expect(sheet.getByTestId("more-lang-zh-CN")).toBeVisible();
    // Picking a language returns to the main body rather than leaving the user
    // on a sub-page with nothing left to do.
    await sheet.getByTestId("more-lang-zh-CN").click();
    await expect(sheet.getByTestId("more-theme-dark")).toBeVisible();
    await expect(sheet.getByTestId("more-lang-back")).toHaveCount(0);
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
    await expect(page.getByTestId("arkive-mobile-header")).toBeVisible();
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
    await expect(page.getByRole("banner")).toBeVisible();
    const bar = page.getByTestId("bottom-tab-bar");
    await expect(bar).toHaveCount(1);
    await expect(bar).toBeHidden();
    await expect(page.getByTestId("lang-menu")).toBeVisible();
    await expect(page.getByTestId("theme-menu")).toBeVisible();
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
    const compactHeight = await page.evaluate(
      () =>
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) *
        2.25,
    );
    expect(box!.height).toBeLessThanOrEqual(compactHeight);
  });

  test("sidebar still renders the marker-types section", async ({ page }) => {
    await page.goto("/?map=World_L_A&lng=en-US");
    await expect(page.getByTestId("marker-types-section")).toBeVisible();
    await expect(page.getByTestId("show-names-toggle")).toBeVisible();
  });
});
