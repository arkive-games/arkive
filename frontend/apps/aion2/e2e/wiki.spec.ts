import { expect, test } from "@playwright/test";

test.describe("wiki", () => {
  test("home TOC renders groups", async ({ page }) => {
    await page.goto("/wiki?lng=en-US");
    await expect(page.getByTestId("wiki-home")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("wiki-group-main")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("wiki-search")).toBeVisible();
    await expect(
      page.getByTestId("wiki-home").getByRole("heading", { name: "AION2 Wiki" }),
    ).toHaveCount(0);
  });

  test("group list renders sections and navigates to quest page", async ({
    page,
  }) => {
    await page.goto("/wiki/quest/main?lng=en-US");
    await expect(page.getByTestId("wiki-group-list")).toBeVisible();
    await expect(page.getByTestId("wiki-back")).toHaveAttribute(
      "href",
      "/wiki/quest",
    );
    await page.getByTestId("wiki-entry-1101010").click();
    await expect(page.getByTestId("wiki-quest-page")).toBeVisible();
    await expect(page.getByTestId("quest-rewards")).toBeVisible();
    await expect(page.getByTestId("wiki-back")).toHaveAttribute(
      "href",
      "/wiki/quest/main",
    );
  });

  test("quest page embedded map shows only POI pins", async ({ page }) => {
    await page.goto("/wiki/quest/main?lng=en-US");
    await page.locator('[data-testid^="wiki-entry-"]').first().click();
    const embed = page.getByTestId("embedded-map");
    if (await embed.isVisible()) {
      const pins = embed.locator(".leaflet-marker-icon");
      expect(await pins.count()).toBeGreaterThan(0);
      expect(await pins.count()).toBeLessThan(60);
    }
  });

  test("hub search finds quests", async ({ page }) => {
    await page.goto("/wiki/quest?lng=en-US");
    await page.getByTestId("wiki-search").fill("a");
    await expect(page.getByTestId("wiki-search-results")).toBeVisible();
  });

  test("desktop hub opens flat groups directly and filters factions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/wiki/quest?lng=en-US");
    const mainGroup = page.getByTestId("wiki-hub-group-main");
    await expect(page.getByTestId("wiki-rail-group-main")).toBeVisible();
    await expect(mainGroup.getByTestId("faction-col-light")).toBeVisible();
    await expect(mainGroup.getByTestId("faction-col-dark")).toBeVisible();

    await page.getByTestId("wiki-rail-group-side").click();
    await expect(page).toHaveURL(/\/wiki\/quest\/side$/);
    await expect(page.getByTestId("wiki-group-list")).toBeVisible();
    await expect(page.getByTestId("wiki-section-nav")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Other" })).toHaveCount(0);
    const scrollPane = page.locator("main");
    const lastFlatEntry = page.locator('[data-testid^="wiki-entry-"]').last();
    await lastFlatEntry.scrollIntoViewIfNeeded();
    await lastFlatEntry.click();
    await expect(page.getByTestId("wiki-quest-page")).toBeVisible();
    await expect(page.getByTestId("wiki-back")).toBeVisible();
    await expect(page.getByTestId("wiki-back")).toHaveAccessibleName(
      /Back to .+/,
    );
    await expect
      .poll(() => scrollPane.evaluate((element) => element.scrollTop))
      .toBe(0);
    await expect(
      page.getByTestId("wiki-quest-page").getByText("Other", { exact: true }),
    ).toHaveCount(0);

    await page.getByTestId("wiki-back").click();
    await page.getByTestId("wiki-back").click();
    await page.getByTestId("wiki-rail-group-main").click();
    await page.getByTestId("hub-faction-light").click();
    await expect(page.getByTestId("faction-col-light")).toBeVisible();
    await expect(page.getByTestId("faction-col-dark")).toHaveCount(0);
  });

  test("mobile hub exposes group navigation without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/wiki/quest?lng=en-US");
    await expect(page.getByTestId("wiki-workspace-rail")).toBeHidden();
    await expect(page.getByTestId("wiki-hub-toc-main")).toBeVisible();

    await page.getByTestId("wiki-hub-toc-side").click();
    await expect(page).toHaveURL(/\/wiki\/quest\/side$/);
    await expect(page.getByTestId("wiki-group-list")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Other" })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
  });

  test("faction deep link", async ({ page }) => {
    await page.goto("/wiki/quest/main?faction=dark&lng=en-US");
    await expect(page.getByTestId("faction-dark")).toHaveAttribute(
      "data-state",
      "on",
    );
  });

  test("map deep-link ?pos= flies without error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/?map=World_L_A&pos=4000,4000&lng=en-US");
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });
});
