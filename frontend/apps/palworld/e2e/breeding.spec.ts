import { test, expect } from '@playwright/test'

// The breeding calculator carries a small mutation info badge (violet, matching
// the Passive Skills page badge) whose tooltip explains the mutation mechanic.

test('breeding page shows the mutation info badge with an explanatory tooltip', async ({ page }) => {
  await page.goto('/breeding')
  const badge = page.getByTestId('breeding-mutation-info')
  await expect(badge).toBeVisible()
  await expect(badge).toContainText('Mutation')
  await badge.hover()
  // Tooltip text names the game items involved (en-US default locale).
  await expect(page.getByText('Extravagant Vegetable Cake')).toBeVisible()
})

// Multi-layer drill-down: clicking a recipe hides the list and shows how to
// breed each parent; sub-recipes recurse; Back collapses the last click.
test('clicking a recipe opens the breeding tree with a section per parent', async ({ page }) => {
  await page.goto('/breeding')
  // Default view: the browsable unique recipes. Drill into the first one via
  // the card's expand button (the keyboard-accessible affordance).
  const expandButtons = page.getByRole('button', { name: 'How to breed the parents' })
  await expect(expandButtons.first()).toBeVisible()
  expect(await expandButtons.count()).toBeGreaterThan(1)
  await expandButtons.first().click()

  // Tree mode: the tree is in the URL, two parent sections render, and the
  // exit button appears.
  await expect(page).toHaveURL(/tree=/)
  const sections = page.getByText(/^How to breed /)
  await expect(sections).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'All recipes' })).toBeVisible()

  // Drill one level deeper inside the first parent section.
  await page.getByRole('button', { name: 'How to breed the parents' }).first().click()
  await expect(page.getByText(/^How to breed /)).toHaveCount(4)

  // Browser Back undoes the last drill (the tree lives in the URL).
  await page.goBack()
  await expect(page.getByText(/^How to breed /)).toHaveCount(2)

  // Exit tree mode: the full recipe list returns.
  await page.getByRole('button', { name: 'All recipes' }).click()
  await expect(page.getByText(/^How to breed /)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'How to breed the parents' }).first()).toBeVisible()
})
