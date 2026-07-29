import { test, expect } from "@playwright/test";

const PHONE = { width: 390, height: 844 };
const QQ_GROUP = "1091411026";

test.describe("site info — desktop", () => {
  test("the right sidebar shows the feedback group in zh-CN", async ({ page }) => {
    await page.goto("/?lng=zh-CN");
    await expect(page.getByTestId("sidebar-toggle-right")).toBeVisible();
    await expect(page.getByTestId("site-info-panel")).toHaveCount(1);
    await expect(page.getByTestId("site-info-group-number")).toHaveText(QQ_GROUP);
  });

  test("no feedback group in en-US, but the contact section survives", async ({ page }) => {
    await page.goto("/?lng=en-US");
    await expect(page.getByTestId("site-info-panel")).toHaveCount(1);
    await expect(page.getByTestId("site-info-group-number")).toHaveCount(0);
    await expect(page.getByText("discord.gg/cqn9sKbWPU").first()).toBeVisible();
  });

  test("the left sidebar toggle is still unique", async ({ page }) => {
    await page.goto("/?lng=en-US");
    await expect(page.getByTestId("sidebar-toggle")).toHaveCount(1);
  });

  test("collapsing the right sidebar is remembered across reloads", async ({ page }) => {
    await page.goto("/?lng=zh-CN");
    const toggle = page.getByTestId("sidebar-toggle-right");
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
    await page.getByTestId("contact-menu").click();
    await expect(page.getByTestId("site-info-panel")).toBeVisible();
    await expect(page.getByTestId("site-info-group-number")).toHaveText(QQ_GROUP);
  });

  test("the popover opens alongside the sidebar panel on the map", async ({ page }) => {
    await page.goto("/?lng=zh-CN");
    await expect(page.getByTestId("site-info-panel")).toHaveCount(1);
    await page.getByTestId("contact-menu").click();
    await expect(page.getByTestId("site-info-panel")).toHaveCount(2);
    await expect(page.getByTestId("site-info-group-number").nth(1)).toHaveText(QQ_GROUP);
  });

  // The sidebar's collapse tab overhangs into the map column and used to carry
  // z-20000 — above Radix's portalled popover (z-2000) — so it painted over the
  // open popover and won the hit test there. Assert the popover is genuinely on
  // top wherever the two overlap, rather than just that both exist.
  test("the collapse tab does not cover the open popover", async ({ page }) => {
    await page.goto("/?lng=en-US");
    const toggle = page.getByTestId("sidebar-toggle-right");
    await expect(toggle).toBeVisible();
    await page.getByTestId("contact-menu").click();
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
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
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
