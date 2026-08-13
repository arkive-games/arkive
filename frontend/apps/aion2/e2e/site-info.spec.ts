import { test, expect } from "@playwright/test";
import { openMap } from "./engines";

const PHONE = { width: 390, height: 844 };
const QQ_GROUP = "1091411026";

async function openInfoSidebar(page: import("@playwright/test").Page) {
  const toggle = page.getByTestId("sidebar-toggle-right");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

test.describe("site info — desktop", () => {
  test("the right sidebar shows the feedback group in zh-CN", async ({ page }) => {
    await page.goto("/?lng=zh-CN");
    await openInfoSidebar(page);
    await expect(page.getByTestId("site-info-panel")).toHaveCount(1);
    await expect(page.getByTestId("site-info-group-number")).toHaveText(QQ_GROUP);
  });

  test("the shared feedback group and game contact both survive in en-US", async ({ page }) => {
    await page.goto("/?lng=en-US");
    await openInfoSidebar(page);
    await expect(page.getByTestId("site-info-panel")).toHaveCount(1);
    await expect(page.getByTestId("site-info-group-number")).toHaveText(QQ_GROUP);
    await expect(page.getByText("discord.gg/cqn9sKbWPU").first()).toBeVisible();
  });

  // The version section is two links now, not a dialog: this game's own history
  // stays in-app, while the shared platform history lives on the Arkive home
  // page. Scope to the <aside> landmark so the top-bar popover's copy of the
  // panel cannot satisfy the assertions instead.
  test("the version section links this game's history and the shared platform one", async ({
    page,
  }) => {
    await page.goto("/?lng=en-US");
    await openInfoSidebar(page);
    const about = page.getByRole("complementary", { name: "About" });

    const gameUpdates = about.getByTestId("site-info-game-updates-link");
    await expect(gameUpdates).toBeVisible();
    await expect(gameUpdates).toHaveAttribute("href", "/changelog");
    // Shape, not a pinned literal — the version changes on every release.
    await expect(gameUpdates).toHaveText(/^View version \d+\.\d+\.\d+$/);

    // The platform link is the Arkive home URL with the updates hash, so derive
    // it from the attribution link rather than restating the deploy target.
    const arkiveHome = await about.getByTestId("site-info-arkive-link").getAttribute("href");
    expect(arkiveHome).toBeTruthy();
    const platformUpdates = about.getByTestId("site-info-platform-updates-link");
    await expect(platformUpdates).toBeVisible();
    await expect(platformUpdates).toHaveAttribute("href", `${arkiveHome}#updates`);
    await expect(platformUpdates).toHaveAttribute("target", "_blank");
  });

  test("the left sidebar toggle is still unique", async ({ page }) => {
    await page.goto("/?lng=en-US");
    await expect(page.getByTestId("sidebar-toggle")).toHaveCount(1);
  });

  test("collapsing the right sidebar is remembered across reloads", async ({ page }) => {
    await page.goto("/?lng=zh-CN");
    const toggle = page.getByTestId("sidebar-toggle-right");
    await openInfoSidebar(page);
    await expect(page.getByTestId("site-info-panel")).toHaveCount(1);
    await expect(page.getByTestId("site-info-group-number")).toBeVisible();
    await toggle.click();
    await expect(page.getByTestId("site-info-group-number")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("sidebar-toggle-right")).toBeVisible();
    await expect(page.getByTestId("site-info-group-number")).toHaveCount(0);
  });

  test("the top-bar popover carries the panel on a wiki page", async ({ page }) => {
    await page.goto("/wiki?lng=zh-CN");
    await expect(page.getByTestId("site-info-panel")).toBeVisible();
    await expect(page.getByTestId("site-info-group-number")).toHaveText(QQ_GROUP);
  });

  test("the popover opens alongside the sidebar panel on the map", async ({ page }) => {
    await page.goto("/?lng=zh-CN");
    await openInfoSidebar(page);
    await expect(page.getByTestId("site-info-panel")).toHaveCount(1);
    await expect(page.getByTestId("site-info-panel")).toHaveCount(2);
    await expect(page.getByTestId("site-info-group-number").nth(1)).toHaveText(QQ_GROUP);
  });

  // The sidebar's collapse tab overhangs into the map column and used to sit
  // above the portalled popover. Assert that the named popover layer genuinely
  // wins wherever the two overlap, rather than just that both exist.
  test("the collapse tab does not cover the open popover", async ({ page }) => {
    await page.goto("/?lng=en-US");
    const toggle = page.getByTestId("sidebar-toggle-right");
    await openInfoSidebar(page);
    const popover = page.getByTestId("site-info-panel").nth(1);
    await expect(popover).toBeVisible();

    const tab = await toggle.boundingBox();
    const pop = await popover.boundingBox();
    if (!tab || !pop) throw new Error("expected both the tab and the popover to have a box");

    const overlapsX = tab.x < pop.x + pop.width && pop.x < tab.x + tab.width;
    const overlapsY = tab.y < pop.y + pop.height && pop.y < tab.y + tab.height;
    if (!overlapsX || !overlapsY) return; // no overlap on this viewport: nothing to prove

    // Topmost element at the tab's centre must belong to the popover, not the tab.
    const owner = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return {
          inPopover: !!el?.closest('[data-testid="site-info-panel"]'),
          inTab: !!el?.closest('[data-testid="sidebar-toggle-right"]'),
        };
      },
      { x: tab.x + tab.width / 2, y: tab.y + tab.height / 2 },
    );
    expect(owner.inTab).toBe(false);
    expect(owner.inPopover).toBe(true);
  });

  test("the right sidebar is a named landmark reporting its expanded state", async ({ page }) => {
    await page.goto("/?lng=en-US");
    await expect(page.getByRole("complementary", { name: "About" })).toBeVisible();
    const toggle = page.getByTestId("sidebar-toggle-right");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("site info — phone", () => {
  test.use({ viewport: PHONE });

  test("the More sheet carries the panel, and a phone map has no right sidebar", async ({ page }) => {
    await page.goto("/?lng=zh-CN");
    await expect(page.getByTestId("tab-more")).toBeVisible(); // page really rendered
    await expect(page.getByTestId("sidebar-toggle-right")).toHaveCount(0); // now meaningful
    await page.getByTestId("tab-more").click();
    await expect(page.getByTestId("site-info-panel")).toBeVisible();
    await expect(page.getByTestId("site-info-group-number")).toHaveText(QQ_GROUP);
  });
});

// The engine caches the size of the box it renders into. Collapsing a sidebar
// changes the map column's width WITHOUT resizing the window, so an engine that
// only listened for window `resize` would keep rendering for the old width and the
// freed strip would stay permanently blank — panning and zooming do not heal it.
//
// There is one canvas and CSS stretches it, so the tell is its DRAWING BUFFER: a
// stale buffer keeps the old pixel width and the browser scales it up.
test.describe("map resize", () => {
  test("the map refills after the right sidebar collapses", async ({ page }) => {
    await openMap(page, "lng=en-US");
    const toggle = page.getByTestId("sidebar-toggle-right");
    await openInfoSidebar(page);

    const shortfall = async () =>
      page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>("canvas.gmgl-map-canvas");
        if (!c) throw new Error("no canvas.gmgl-map-canvas");
        const box = c.getBoundingClientRect();
        // Drawing-buffer width back in CSS pixels vs the box it fills.
        const drawn = c.width / (window.devicePixelRatio || 1);
        return { gap: Math.round(box.width - drawn), width: Math.round(box.width) };
      });

    const before = await shortfall();
    expect(before.gap).toBeLessThan(64); // baseline: the map covers the column

    await toggle.click();
    // Outlast the 300ms width transition plus the resize debounce.
    await page.waitForTimeout(1200);

    const after = await shortfall();
    expect(after.width).toBeGreaterThan(before.width); // the column really grew
    expect(after.gap).toBeLessThan(64); // and the map refilled it
  });
});
