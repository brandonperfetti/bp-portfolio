import { type Locator, type Page, expect, test } from '@playwright/test'

import { interactUntil } from './support/hydration'

/**
 * The #183 acceptance criterion: after a page step the reader is put at the
 * top of the new results, with focus in them.
 *
 * Surfaces page with `router.push(…, { scroll: false })` — deliberate under
 * #88, because Next's default scroll-to-top would jump the reader past the
 * hero and the history entry is what makes the back button restore position.
 * The flag stays; this spec asserts the behavior that was missing beside it.
 *
 * @remarks Content-dependent, like every other pagination spec here: the
 * control only exists above the surface's page-size threshold and the e2e seed
 * (`scripts/seed-e2e.ts`) plants far fewer rows than that, so each case skips
 * itself when this environment renders a single page. Interactions go through
 * `interactUntil` because the explorers' handlers attach post-hydration under
 * cacheComponents/PPR (#114 mechanism A).
 *
 * The suite runs with `reducedMotion: 'reduce'` (see `playwright.config.ts`),
 * so the anchor takes its `behavior: 'auto'` branch and the scroll has landed
 * by the time the URL has changed — no settle-wait is needed or wanted.
 */

/**
 * How far below the viewport top the results may sit and still count as
 * anchored.
 *
 * @remarks The anchor carries `scroll-mt-16` (64px) so the sticky header does
 * not cover the row it lands on — the same offset id-linked sections use. The
 * budget is that offset plus slack for the header's own measured height.
 */
const ANCHOR_TOLERANCE_PX = 160

/**
 * Scroll far enough down that "the viewport did not move" would be visible.
 *
 * @param page - The page under test.
 */
async function scrollToBottom(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0)
}

/** The distance from the viewport top to an element's top edge. */
async function topOffset(locator: Locator): Promise<number> {
  const box = await locator.boundingBox()
  if (!box) {
    throw new Error('the element under test has no layout box')
  }
  return box.y
}

/**
 * Walk one surface from page 1 to page 2 and assert the re-anchor.
 *
 * @param page - The page under test, already on the surface's route.
 * @param firstCard - Locator resolving to the first result card.
 */
async function assertPageStepReAnchors(
  page: Page,
  firstCard: Locator,
): Promise<void> {
  // Park the viewport at the bottom: `scroll: false` leaves it exactly here,
  // so anything at the top afterwards was put there by the anchor.
  await scrollToBottom(page)

  await interactUntil(async () => {
    await page.getByRole('link', { name: 'Go to page 2' }).click()
    await expect(page).toHaveURL(/[?&]page=2/, { timeout: 2000 })
  })

  // The results are at the top of the viewport, under the header offset.
  const offset = await topOffset(firstCard)
  expect(offset).toBeGreaterThanOrEqual(0)
  expect(offset).toBeLessThanOrEqual(ANCHOR_TOLERANCE_PX)

  // …and focus is on the results container the first card lives in, so the
  // next Tab continues from the results rather than restarting at the top of
  // the document.
  const focusHoldsResults = await page.evaluate(() => {
    const active = document.activeElement
    return Boolean(
      active &&
      active !== document.body &&
      active.getAttribute('tabindex') === '-1' &&
      active.querySelector('article, li'),
    )
  })
  expect(focusHoldsResults).toBe(true)
  await expect(firstCard).toBeVisible()
}

/**
 * Settle a surface into one of its states and report whether pagination is
 * exercisable in this environment.
 *
 * @param page - The page under test, already on the route.
 * @param explorer - A locator that proves the interactive surface rendered.
 * @param paginationLabel - The `aria-label` of the surface's pagination nav.
 *
 * @remarks The `.or(…)` settle mirrors `articles-pagination.spec.ts`: block on
 * the surface resolving to EITHER its explorer or its empty state before
 * deciding, so the skip is made on real content rather than on a race — and an
 * empty database skips rather than fails.
 */
async function hasPagination(
  page: Page,
  explorer: Locator,
  paginationLabel: string,
): Promise<boolean> {
  const emptyState = page.getByRole('heading', { level: 1 })
  await expect(explorer.or(emptyState).first()).toBeVisible()
  if ((await explorer.count()) === 0) {
    return false
  }
  return (
    (await page.locator(`nav[aria-label="${paginationLabel}"]`).count()) > 0
  )
}

const skipReason =
  'This environment renders a single page here, so the pagination control is a deliberate no-op.'

test('a page step on /articles anchors the reader to the results', async ({
  page,
}) => {
  await page.goto('/articles')
  const paginated = await hasPagination(
    page,
    page.getByPlaceholder('Search articles'),
    'Articles pagination',
  )
  test.skip(!paginated, skipReason)

  await assertPageStepReAnchors(page, page.locator('article').first())
})

test('a page step on /tech anchors the reader to the results', async ({
  page,
}) => {
  await page.goto('/tech')
  const paginated = await hasPagination(
    page,
    page.getByPlaceholder('Search tech'),
    'Tech pagination',
  )
  test.skip(!paginated, skipReason)

  await assertPageStepReAnchors(page, page.getByRole('listitem').first())
})

test('a filter change does not steal focus out of the search box', async ({
  page,
}) => {
  await page.goto('/articles?page=2')
  const paginated = await hasPagination(
    page,
    page.getByPlaceholder('Search articles'),
    'Articles pagination',
  )
  test.skip(!paginated, skipReason)

  // #88 drops `?page` when the query changes — a `page` change that arrives
  // mid-keystroke. The anchor is armed from the pagination click, never
  // inferred from `page`, precisely so this cannot yank the caret away.
  const searchInput = page.getByPlaceholder('Search articles')
  await interactUntil(async () => {
    await searchInput.fill('the')
    await expect
      .poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 2000 })
      .toBe('the')
  })

  await expect(searchInput).toBeFocused()
})
