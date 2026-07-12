import { test, expect } from "@playwright/test";

// Topbar global search: wiki entities and markers, prefix-only matching.
// Names are read from the served locale data itself (language pinned to en-US
// via the ?lng= querystring) so the test doesn't hardcode translated strings.

test("finds a wiki NPC and navigates to its page", async ({ page, request }) => {
  const npcNames = await request
    .get("/data/locales/en-US/wiki/npc.json")
    .then((r) => r.json() as Promise<Record<string, { name: string }>>);
  const [id, entry] = Object.entries(npcNames).find(([, v]) => v.name) ?? [];
  expect(id).toBeTruthy();

  await page.goto("/wiki?lng=en-US");
  await page.getByTestId("global-search-button").click();
  const input = page.getByTestId("global-search-input");
  await expect(input).toBeVisible();
  await input.fill(entry!.name);
  const hit = page
    .getByTestId("global-search-item")
    .filter({ hasText: entry!.name })
    .first();
  await expect(hit).toBeVisible({ timeout: 30_000 }); // first open loads all namespaces
  await hit.click();
  await expect(page).toHaveURL(/\/wiki\/npc\/\d+/);
});

test("finds a map marker and deep-links onto the map", async ({ page, request }) => {
  const markerNames = await request
    .get("/data/locales/en-US/markers/World_L_A.json")
    .then((r) => r.json() as Promise<Record<string, { name?: string }>>);
  const [markerId, entry] =
    Object.entries(markerNames).find(([, v]) => v.name) ?? [];
  expect(markerId).toBeTruthy();

  await page.goto("/wiki?lng=en-US");
  await page.getByTestId("global-search-button").click();
  await page.getByTestId("global-search-input").fill(entry!.name!);
  const hit = page.getByTestId("global-search-item").first();
  await expect(hit).toBeVisible({ timeout: 30_000 });
  await hit.click();
  // Marker picks do a full-page navigation to the map deep link.
  await page.waitForURL(/\/\?map=.+&marker=.+/);
  await expect(page.getByTestId("search-panel")).toBeVisible();
});
