import { expect, test } from '@playwright/test'

test('homepage responds and renders body', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()
})
