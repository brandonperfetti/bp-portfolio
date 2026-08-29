import { type Page, expect, test } from '@playwright/test'

import { interactUntil } from './support/hydration'

/**
 * `/articles` URL-param pagination (#88) under option (b) — client windowing
 * over the already-fetched set.
 *
 * The contract exercised here: `?page=N` (absent = 1) composes with `q`, any
 * filter change resets to page 1 by dropping the param, an invalid `page`
 * clamps to 1 rather than 404ing, and refresh / back / forward all restore
 * position because the page lives only in the URL.
 *
 * @remarks Content-dependent, like the existing `/articles` specs: the control
 * only exists above the 12-per-page threshold, and the e2e seed
 * (`scripts/seed-e2e.ts`) plants far fewer posts than that. Each test therefore
 * skips itself when the environment has a single page of articles, exactly the
 * way `ui-regression.spec.ts` skips on the empty/non-empty articles split — the
 * assertions run against a production-like corpus and never flake on a thin
 * one. Interactions go through `interactUntil` because the explorer's handlers
 * attach post-hydration under cacheComponents/PPR (#114 mechanism A).
 */

const PAGINATION = 'nav[aria-label="Articles pagination"]'

/**
 * Settle `/articles` into one of its states and report whether pagination is
 * exercisable in this environment.
 *
 * @param page - Active Playwright page already positioned on `/articles`.
 * @returns `true` when the pagination control rendered.
 */
async function hasPagination(page: Page): Promise<boolean> {
  const searchInput = page.getByPlaceholder('Search articles')
  const emptyState = page.getByText('No published articles')
  // Block on hydration resolving to one state or the other before deciding,
  // so the skip is made on real content and not on a race.
  await expect(searchInput.or(emptyState).first()).toBeVisible()
  if ((await searchInput.count()) === 0) {
    return false
  }
  return (await page.locator(PAGINATION).count()) > 0
}

/** First rendered article title, the cheapest proof of which page is showing. */
async function firstArticleTitle(page: Page): Promise<string> {
  return (await page.locator('article h2').first().innerText()).trim()
}

const skipReason =
  'This environment renders a single page of articles (12 or fewer), so the pagination control is a deliberate no-op.'

test('page walk keeps position in the URL through refresh, back and forward', async ({
  page,
}) => {
  await page.goto('/articles')
  test.skip(!(await hasPagination(page)), skipReason)

  const firstPageTitle = await firstArticleTitle(page)
  await expect(page).not.toHaveURL(/[?&]page=/)
  expect(await page.locator('article').count()).toBeLessThanOrEqual(12)

  const secondPageLink = page.getByRole('link', { name: 'Go to page 2' })
  await interactUntil(async () => {
    await secondPageLink.click()
    await expect(page).toHaveURL(/[?&]page=2/, { timeout: 2000 })
  })

  const secondPageTitle = await firstArticleTitle(page)
  expect(secondPageTitle).not.toBe(firstPageTitle)
  await expect(
    page.getByRole('link', { name: 'Go to page 2' }),
  ).toHaveAttribute('aria-current', 'page')
  // Page 1 is always reachable, and its href is the bare URL (no `page=1`).
  await expect(
    page.getByRole('link', { name: 'Go to page 1' }),
  ).toHaveAttribute('href', '/articles')

  // Refresh preserves position.
  await page.reload()
  await expect(page).toHaveURL(/[?&]page=2/)
  await expect(page.locator('article h2').first()).toHaveText(secondPageTitle)

  // Back restores page 1 — the page change pushed a history entry.
  await page.goBack()
  await expect(page).not.toHaveURL(/[?&]page=/)
  await expect(page.locator('article h2').first()).toHaveText(firstPageTitle)

  // …and forward returns to page 2.
  await page.goForward()
  await expect(page).toHaveURL(/[?&]page=2/)
  await expect(page.locator('article h2').first()).toHaveText(secondPageTitle)
})

test('changing a filter from page 2 resets to page 1 and keeps the filter', async ({
  page,
}) => {
  await page.goto('/articles?page=2')
  test.skip(!(await hasPagination(page)), skipReason)

  await expect(page).toHaveURL(/[?&]page=2/)

  const searchInput = page.getByPlaceholder('Search articles')
  await interactUntil(async () => {
    await searchInput.fill('the')
    await expect
      .poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 2000 })
      .toBe('the')
  })

  // The filter param is written and the page param is dropped in the same
  // update — a filter change always lands the reader on page 1.
  await expect
    .poll(() => new URL(page.url()).searchParams.get('page'))
    .toBeNull()

  // If the filtered set is still long enough, pagination composes with `q`.
  if ((await page.locator(PAGINATION).count()) > 0) {
    await page.getByRole('link', { name: 'Go to page 2' }).click()
    await expect
      .poll(() => new URL(page.url()).searchParams.get('page'))
      .toBe('2')
    await expect
      .poll(() => new URL(page.url()).searchParams.get('q'))
      .toBe('the')
  }
})

test('an out-of-range or non-numeric page clamps to the first page', async ({
  page,
}) => {
  await page.goto('/articles')
  test.skip(!(await hasPagination(page)), skipReason)
  const firstPageTitle = await firstArticleTitle(page)

  for (const raw of ['9999', 'not-a-number', '0']) {
    await page.goto(`/articles?page=${raw}`)
    // No 404: the route renders, and the first page's content is shown.
    await expect(page.locator('article h2').first()).toHaveText(firstPageTitle)
    await expect(
      page.getByRole('link', { name: 'Go to page 1' }),
    ).toHaveAttribute('aria-current', 'page')
  }
})
