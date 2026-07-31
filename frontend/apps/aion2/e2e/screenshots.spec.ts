import { test } from "@playwright/test";
import { mapUrl } from "./engines";

// Review screenshots of the map. They exist to be LOOKED AT, so they are taken
// on the engine visitors actually get — the WebGL one (default since 9e1495d) —
// pinned explicitly so a shot can never silently change renderer because of a
// default flip or a stale stored preference.
//
// The old readiness gate (`.leaflet-container` + `.leaflet-tile-loaded`) has no
// counterpart here: GL tiles are uploaded as textures, not DOM, so there is no
// per-tile element to wait for. The gate is the canvas, the engine handle and
// then NETWORK IDLE — verified necessary: at 1920x1080 the whole 8x8 tile set is
// requested at once and the old flat 2.5s settle caught the map with a third of
// it still missing (white blocks in the shot), while Leaflet's progressive
// <img> decode looked complete by then.
const MAPS = ["World_L_A", "Abyss_Reshanta_A"];
const THEMES = ["light", "dark"] as const;
const LANGS = ["en-US", "zh-CN"] as const;

for (const map of MAPS) {
  for (const theme of THEMES) {
    for (const lng of LANGS) {
      test(`shot ${map} ${theme} ${lng}`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem("aion2.theme", t), theme);
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto(mapUrl("gl", `map=${map}&lng=${lng}`));
        await page
          .getByTestId("gl-map-canvas")
          .waitFor({ state: "visible", timeout: 20_000 });
        await page.waitForFunction(() => !!window.__glMap, null, { timeout: 20_000 });
        await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => {});
        await page.waitForTimeout(2500); // let the last textures upload + markers settle
        await page.screenshot({ path: `.screenshots/${map}-${theme}-${lng}.png`, fullPage: false });
      });
    }
  }
}
