import { test, expect } from '@playwright/test'
import { clickMarker, openMap, pickClickableMarker } from './glMap'

// Effigy & boss subtypes are completable: the popup pill toggles a per-map
// completed set persisted in localStorage, and the subtype filter button
// shows an X/N progress badge instead of a plain count.
//
// Reaching a boss popup means clicking a boss marker, and markers are drawn into
// the canvas rather than the DOM — so the target is picked from the served data
// and clicked at its projected screen point (see glMap.ts).

test('marking a field boss completed flips the pill, badge, and survives reload', async ({ page }) => {
  await openMap(page)

  // Completable subtypes render a progress badge (starts at 0/N).
  const toggle = page.getByTestId('subtype-toggle-fieldBoss')
  await expect(toggle).toContainText(/0\/\d+/)

  // fieldBoss is not defaultActive — enable it, and tell the picker it is drawn
  // so clearance is measured against the boss markers too.
  await toggle.click()
  const { target } = await pickClickableMarker(page, 'fieldBoss', ['fieldBoss'])
  await clickMarker(page, target)

  const pill = page.getByTestId('marker-complete-toggle')
  await expect(pill).toBeVisible()
  await expect(pill).toHaveAttribute('aria-pressed', 'false')
  await pill.click()
  await expect(pill).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toContainText(/1\/\d+/)

  // Persistence: the badge is computed from localStorage + marker data, so it
  // shows 1/N again after a reload even before re-enabling the subtype.
  await page.reload()
  await expect(page.getByTestId('gl-map-canvas')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('subtype-toggle-fieldBoss')).toContainText(/1\/\d+/, { timeout: 15_000 })

  await page.getByTestId('map-clear-completed').click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByTestId('confirm-clear-completed').click()
  await expect(page.getByTestId('subtype-toggle-fieldBoss')).toContainText(/0\/\d+/)

  await page.reload()
  await expect(page.getByTestId('gl-map-canvas')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('subtype-toggle-fieldBoss')).toContainText(/0\/\d+/, { timeout: 15_000 })
})

test('non-completable subtypes keep a plain count (no slash)', async ({ page }) => {
  await page.goto('/')
  const ft = page.getByTestId('subtype-toggle-fastTravel')
  await expect(ft).toBeVisible()
  await expect(ft).not.toContainText('/')
})
