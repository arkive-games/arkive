import { test, expect } from '@playwright/test'

// Multi-generation planner: pick Parent A + Child + a generation budget, and
// the page lists breeding chains grouped by length (direct first). The mode
// lives in the `?gen=` search param.

test('multi-gen mode lists direct recipes and 2-gen chains, no 3-gen group at gen=2', async ({ page }) => {
  // SheepBall → PinkRabbit has direct recipes AND multi-gen chains.
  await page.goto('/breeding?gen=2&a=SheepBall&c=PinkRabbit')

  await expect(page.getByText('Direct recipes')).toBeVisible()
  await expect(page.getByText('2-generation chains')).toBeVisible()
  await expect(page.getByText('3-generation chains')).toHaveCount(0)
  await expect(page.getByText('4-generation chains')).toHaveCount(0)

  // Chain cards render with one row per step; step rows carry partner chips.
  const chains = page.getByTestId('breeding-chain')
  expect(await chains.count()).toBeGreaterThan(0)
})

test('gen=3 adds the 3-generation group and gen=6 adds 4-gen through 6-gen groups for a deep target', async ({ page }) => {
  // PinkRabbit is reachable in 1 step from SheepBall, so gen=3 adds 3-gen chains.
  await page.goto('/breeding?gen=3&a=SheepBall&c=PinkRabbit')
  await expect(page.getByText('3-generation chains')).toBeVisible()

  // DomeArmorDragon requires min 4 steps from SheepBall; gen=6 should show 4-gen chains.
  await page.goto('/breeding?gen=6&a=SheepBall&c=DomeArmorDragon')
  await expect(page.getByText('4-generation chains')).toBeVisible()
})

test('mode toggle enters and leaves the planner, keeping the selection', async ({ page }) => {
  await page.goto('/breeding?a=SheepBall&c=PinkRabbit')

  // Classic mode by default: Parent B picker exists, no group headers.
  await expect(page.getByText('Parent B')).toBeVisible()
  await expect(page.getByText('Direct recipes')).toHaveCount(0)

  await page.getByRole('button', { name: 'Multi-generation' }).click()
  await expect(page).toHaveURL(/gen=2/)
  await expect(page.getByText('Parent B')).toHaveCount(0)
  await expect(page.getByText('Max generations')).toBeVisible()
  await expect(page.getByText('Direct recipes')).toBeVisible()

  // Back to recipes: gen drops from the URL, Parent B returns.
  await page.getByRole('button', { name: 'Recipes', exact: true }).click()
  await expect(page).not.toHaveURL(/gen=/)
  await expect(page.getByText('Parent B')).toBeVisible()
})

test('tree view groups chains by first step, reveals hidden branches with show-more', async ({ page }) => {
  // SheepBall→Anubis gen3: 79 chains sharing first-step groups — a real tree.
  await page.goto('/breeding?gen=3&a=SheepBall&c=Anubis&view=tree')

  // Still sectioned by generation count, like the list view.
  await expect(page.getByText('3-generation chains')).toBeVisible()

  // Root level: first-step groups, capped at 5 with a show-more reveal.
  const groups = page.getByTestId('breeding-chain-group')
  await expect(groups.first()).toBeVisible()
  const initial = await groups.count()
  expect(initial).toBeLessThanOrEqual(5)
  const showMore = page.getByRole('button', { name: /Show \d+ more/ })
  await expect(showMore.first()).toBeVisible()
  await showMore.last().click() // the root-level button is the last one on the page
  expect(await groups.count()).toBeGreaterThan(initial)

  // Show-more is reversible: Collapse restores the initial cap.
  await page.getByRole('button', { name: 'Collapse' }).click()
  expect(await groups.count()).toBe(initial)

  // Nested rows render recursively down to the target (3 levels for a 3-gen chain).
  expect(await groups.first().getByTestId('breeding-tree-node').count()).toBeGreaterThanOrEqual(2)

  // The icon toggle returns to the flat list (and the URL drops view=tree).
  await page.getByRole('button', { name: 'List view' }).click()
  await expect(page).not.toHaveURL(/view=tree/)
  await expect(page.getByTestId('breeding-chain').first()).toBeVisible()

  // And back into the tree.
  await page.getByRole('button', { name: 'Tree view' }).click()
  await expect(page).toHaveURL(/view=tree/)
  await expect(page.getByTestId('breeding-chain-group').first()).toBeVisible()
})

test('unreachable target shows the empty-chains message', async ({ page }) => {
  // Jetragon (JetDragon) is a legendary: self-bred only, so no chain can reach it.
  await page.goto('/breeding?gen=3&a=SheepBall&c=JetDragon')
  await expect(page.getByText(/No breeding chain within 3 generations/)).toBeVisible()
})
