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
      // Visible, not merely present: a mistakenly `hidden md:hidden` bar would
      // otherwise pass.
      bar: (() => {
        const el = document.querySelector('[data-testid="bottom-tab-bar"]');
        if (!el) return "missing";
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? "visible" : "hidden";
      })(),
      // Overflow on EITHER edge. Includes the [data-testid] elements themselves
      // (not just their descendants), so the tab bar / FABs / sheets / mobile
      // header are measured too.
      wide: [
        ...document.querySelectorAll("main, main *, [data-testid], [data-testid] *"),
      ]
        .filter((e) => {
          const b = e.getBoundingClientRect();
          if (b.width <= 0) return false;
          if (e.closest(".leaflet-pane") || e.closest(".gm-map-canvas")) return false;
          return b.right > 391 || b.left < -1;
        })
        .slice(0, 3)
        .map((e) => {
          const b = e.getBoundingClientRect();
          const id = e.getAttribute("data-testid");
          return `${id ? "#" + id : (e.className || "").toString().slice(0, 35)} [${Math.round(b.left)},${Math.round(b.right)}]`;
        }),
    }));
    expect(r.scrollW, "horizontal overflow").toBe(r.innerW);
    expect(r.bar, "tab bar visible").toBe("visible");
    expect(r.wide, "elements past the right edge").toEqual([]);
  });
}
