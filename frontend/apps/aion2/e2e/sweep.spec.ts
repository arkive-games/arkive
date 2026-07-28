import { test, expect } from "@playwright/test";
test.use({ viewport: { width: 390, height: 844 } });

const ROUTES = [
  "/?map=World_L_A&lng=en-US",
  "/wiki?lng=en-US",
  "/wiki/quest?lng=en-US",
  "/wiki/npc?lng=en-US",
  "/wiki/item?lng=en-US",
  "/wiki/quest/main?lng=en-US",
  "/wiki/quest/2101010?lng=en-US",
  "/wiki/item/equipment?lng=en-US",
];

for (const route of ROUTES) {
  test(`no overflow, tab bar present: ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      bar: !!document.querySelector('[data-testid="bottom-tab-bar"]'),
      // anything wider than the viewport inside main content
      wide: [...document.querySelectorAll("main *, [data-testid] *")]
        .filter((e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.right > 391 && !e.closest(".leaflet-pane") && !e.closest(".gm-map-canvas");
        })
        .slice(0, 3)
        .map((e) => (e.className || "").toString().slice(0, 45)),
    }));
    expect(r.scrollW, "horizontal overflow").toBe(r.innerW);
    expect(r.bar, "tab bar mounted").toBe(true);
    expect(r.wide, "elements past the right edge").toEqual([]);
  });
}
