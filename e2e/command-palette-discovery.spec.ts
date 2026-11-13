import { expect, test } from '@playwright/test'

import { interactUntil } from './support/hydration'

/** The existing seed stores this excerpt as the article's body too. */
const ARTICLE = {
  title: 'React Server Components in practice',
  path: '/articles/react-server-components-in-practice',
  body: 'Notes from building a content platform on the App Router — where server components pay off and where they get in the way.',
}

const TITLES = [
  ARTICLE.title,
  'Shipping reliable software with small, focused changes',
  'Product-minded engineering',
]
const SKIP_REASON =
  'command-palette-discovery: required seeded palette entries unavailable (run `pnpm seed:e2e`); this run proves nothing about the journey.'

// Real endpoint, ranking, router and clipboard: synthetic navigation proof,
// not relevance for a reader. CI fails on absent fixtures; local restores skip.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`global search reaches an article and copies its link (${colorScheme})`, async ({
    page,
    context,
    baseURL,
  }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: baseURL,
    })
    await page.goto('/about')
    await expect(page.locator('html')).toHaveClass(
      new RegExp(`(^|\\s)${colorScheme}(\\s|$)`),
    )
    const dialog = page.getByRole('dialog', { name: 'Command palette' })
    const trigger = page.getByRole('button', { name: 'Open command palette' })

    const query = dialog.getByRole('combobox')
    const searchResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/search' &&
        response.request().method() === 'GET',
    )
    // The dialog wrapper has no width; assert the visible input inside it.
    // The button sets open=true, so retries cannot toggle an open dialog shut.
    await interactUntil(async () => {
      if (!(await query.isVisible())) await trigger.click()
      await expect(query).toBeVisible({ timeout: 2000 })
    })
    // Inspect the UI's own response, so a failed fetch never becomes a skip.
    const response = await searchResponse
    expect(response.ok()).toBe(true)
    const items: Array<{ title: string }> = await response.json()
    expect(Array.isArray(items)).toBe(true)
    // An empty query shows the first six entries in the real palette.
    const seeded = TITLES.every((title) =>
      items.slice(0, 6).some((item) => item.title === title),
    )
    if (!seeded) {
      if (process.env.CI) throw new Error(SKIP_REASON)
      test.skip(true, SKIP_REASON)
    }
    // Positive controls: exclusions below must start as actual search results.
    for (const title of TITLES) {
      await expect(
        dialog.getByRole('option', { name: new RegExp(title) }),
      ).toBeVisible()
    }
    await query.fill('server components')
    const result = dialog.getByRole('option', {
      name: new RegExp(ARTICLE.title),
    })
    await expect(result).toBeVisible()
    await expect(
      dialog.getByRole('option', { name: /Shipping reliable software/ }),
    ).toHaveCount(0)
    await expect(
      dialog.getByRole('option', { name: /Product-minded engineering/ }),
    ).toHaveCount(0)

    // Keyboard selection exercises cmdk and the real router, not a direct goto.
    await query.press('Home')
    await expect(result).toHaveAttribute('aria-selected', 'true')
    await query.press('Enter')
    const articleUrl = new URL(ARTICLE.path, baseURL).href
    await expect(page).toHaveURL(articleUrl)
    await expect(query).not.toBeVisible()
    await expect(
      page.getByRole('heading', { level: 1, name: ARTICLE.title }),
    ).toBeVisible()
    await expect(
      page.getByRole('article').getByText(ARTICLE.body),
    ).toBeVisible()

    // Check actual clipboard bytes; closing the palette alone proves no copy.
    await page.evaluate(() => navigator.clipboard.writeText('before-copy'))
    await trigger.click()
    await dialog.getByRole('option', { name: 'Copy current page link' }).click()
    await expect(query).not.toBeVisible()
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(articleUrl)

    // History returns to the actual entry page, so the control promises Back.
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page).toHaveURL(new URL('/about', baseURL).href)
  })
}
