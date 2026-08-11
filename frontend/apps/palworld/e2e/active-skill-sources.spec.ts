import { expect, test } from '@playwright/test'

test('active skill detail shows its fruit item and acquisition sources', async ({ page }) => {
  await page.goto('/active-skills/PowerShot')

  const sources = page.getByTestId('active-skill-sources')
  await expect(sources.locator('a[href$="/items/SkillCard_PowerShot"]')).toBeVisible()

  const worldSources = sources.getByTestId('bp-sources')
  await expect(worldSources).toContainText('Treasure chests')
  await expect(worldSources).toContainText('Grasslands')
  await expect(worldSources).toContainText('Fishing spots')
  await expect(worldSources).toContainText('Rayne Syndicate Test Drilling Rig')

  const dungeonSources = sources.getByTestId('active-skill-dungeon-sources')
  await expect(dungeonSources.locator('a[href^="/dungeons/"]').first()).toBeVisible()
})
