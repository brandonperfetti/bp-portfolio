import { expect, test } from '@playwright/test'

/**
 * Tech-stack visualization (wow moment #3) regressions: URL-synced filters,
 * slash shortcut, and graceful no-signal rendering. Signal badges themselves
 * are environment-dependent (GITHUB_TOKEN), so specs assert presence-agnostic
 * behavior.
 */

test('tech category filter syncs to URL and back', async ({ page }) => {
  await page.goto('/tech')

  const chip = page.getByRole('button', { name: 'Language', exact: true })
  await chip.click()
  await expect(page).toHaveURL(/category=Language/)
  await expect(chip).toHaveAttribute('aria-pressed', 'true')

  // Toggling the active chip clears the filter.
  await chip.click()
  await expect(page).not.toHaveURL(/category=/)
})

test('tech search filters cards and slash focuses input', async ({ page }) => {
  await page.goto('/tech')
  const input = page.getByRole('searchbox', { name: 'Search technologies' })

  await page.keyboard.press('/')
  await expect(input).toBeFocused()

  await input.fill('typescript')
  await expect(page).toHaveURL(/q=typescript/, { timeout: 5000 })
  // The grid sits below the fold on short viewports; reveal is
  // scroll-triggered (autoAlpha), so bring it into view first.
  await page.getByRole('list').last().scrollIntoViewIfNeeded()
  await expect(
    page.getByRole('heading', { name: 'TypeScript', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Playwright', exact: true }),
  ).toBeHidden()
})

test('deep-linked tech query pre-filters the grid', async ({ page }) => {
  await page.goto('/tech?q=vitest')
  await page.getByRole('list').last().scrollIntoViewIfNeeded()
  await expect(
    page.getByRole('heading', { name: 'Vitest', exact: true }),
  ).toBeVisible()
  const status = page.getByRole('status')
  await expect(status).toContainText(/results? for "vitest"/i)
})

test('uses page renders shared tool cards', async ({ page }) => {
  await page.goto('/uses')
  await page.getByRole('list').first().scrollIntoViewIfNeeded()
  // Section headings + at least one card list render regardless of CMS state.
  await expect(
    page.getByRole('heading', { name: /workstation/i }).first(),
  ).toBeVisible()
  expect(await page.locator('li h3, li h2').count()).toBeGreaterThan(3)
})
