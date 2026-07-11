import { test, expect } from '@playwright/test'

// Effigy & boss subtypes are completable: the popup pill toggles a per-map
// completed set persisted in localStorage, and the subtype filter button
// shows an X/N progress badge instead of a plain count.

test('marking a field boss completed flips the pill, badge, and survives reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.leaflet-container')).toBeVisible()

  // Completable subtypes render a progress badge (starts at 0/N).
  const toggle = page.getByTestId('subtype-toggle-fieldBoss')
  await expect(toggle).toContainText(/0\/\d+/)

  // fieldBoss is not defaultActive — enable it. Boss markers are circular pal
  // portraits (…_icon_normal); pal spawns are hidden by default, so the first
  // portrait marker is a boss.
  await toggle.click()
  const boss = page
    .locator('.leaflet-marker-pane .leaflet-marker-icon', {
      has: page.locator('img[src*="_icon_normal"]'),
    })
    .first()
  await expect(boss).toBeVisible({ timeout: 15_000 })
  // Boss markers overlap at the default zoom, so a hit-tested click can be
  // intercepted by a stacked sibling — dispatch the click on the element.
  await boss.dispatchEvent('click')

  const pill = page.getByTestId('marker-complete-toggle')
  await expect(pill).toBeVisible()
  await expect(pill).toHaveAttribute('aria-pressed', 'false')
  await pill.click()
  await expect(pill).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toContainText(/1\/\d+/)

  // Persistence: the badge is computed from localStorage + marker data, so it
  // shows 1/N again after a reload even before re-enabling the subtype.
  await page.reload()
  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(page.getByTestId('subtype-toggle-fieldBoss')).toContainText(/1\/\d+/, { timeout: 15_000 })
})

test('non-completable subtypes keep a plain count (no slash)', async ({ page }) => {
  await page.goto('/')
  const ft = page.getByTestId('subtype-toggle-fastTravel')
  await expect(ft).toBeVisible()
  await expect(ft).not.toContainText('/')
})
