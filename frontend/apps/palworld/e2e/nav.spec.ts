import { test, expect } from '@playwright/test'

test('Database dropdown opens and navigates to a catalog route', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByTestId('nav-dropdown-database')
  await expect(trigger).toBeVisible()
  await trigger.click()
  const itemsLink = page.getByRole('menuitem', { name: 'Items' })
  await expect(itemsLink).toBeVisible()
  await itemsLink.click()
  await expect(page).toHaveURL(/\/items$/)
})

test('Database trigger shows active styling on a catalog route', async ({ page }) => {
  await page.goto('/buildings')
  await expect(page.getByTestId('nav-dropdown-database')).toHaveClass(/text-primary/)
})
