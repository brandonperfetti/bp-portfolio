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
 * A skip here is reported, not swallowed: CI runs `pnpm test:e2e` with
 * `reporter: 'html'` (`playwright.config.ts:11`) and uploads
 * `playwright-report/` as an artifact (`.github/workflows/ci.yml`, "Upload
 * Playwright report"), where every skipped test is listed by title with the
 * reason string it skipped on. No workflow greps e2e output for skips and no
 * step fails on one — that is the suite's standing convention for
 * content-dependent cases (`docs/TESTING.md`) — so each `test.skip` below
 * carries a reason naming *its own surface*, and a reader of the report can
 * tell which surfaces were actually exercised.
 *
 * The suite runs with `reducedMotion: 'reduce'` (see `playwright.config.ts`),
 * so the anchor takes its `behavior: 'auto'` branch and the scroll has landed
 * by the time the URL has changed — no settle-wait is needed or wanted.
 */

/**
 * How far below the viewport top the anchored results container may sit and
 * still count as anchored: **96px = 64 + 32**.
 *
 * @remarks 64px is the anchor's own `scroll-mt-16` (`4rem`), which exists to
 * clear the sticky header — `src/components/Header.tsx` renders that bar at
 * `h-16`, so the offset is the header's height exactly, not an approximation.
 * The extra 32px is settling margin, and it is that size for a reason: it
 * absorbs sub-pixel rounding in `boundingBox()`, the 1–2px the browser can
 * leave behind when `scrollIntoView` lands against the document's scroll
 * limits, and the container's own top border/padding — while staying well
 * under the ~64px that would let a visibly un-anchored container pass.
 */
const ANCHOR_TOLERANCE_PX = 96

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
 * @param results - Locator resolving to the anchored results container — the
 * element that carries `tabIndex={-1}` and `scroll-mt-16`.
 * @param firstCard - Locator resolving to the first result inside it.
 *
 * @remarks The tolerance is measured against the *container*, not the first
 * card: the container is what `scrollIntoView` targets and what `scroll-mt-16`
 * offsets, and it is the only element whose distance from the viewport top
 * means the same thing on all four surfaces (`/uses` renders a section
 * heading above its first card). The first card is then asserted to be in the
 * viewport, which is the reader-facing half of the AC.
 */
async function assertPageStepReAnchors(
  page: Page,
  results: Locator,
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
  const offset = await topOffset(results)
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
  await expect(firstCard).toBeInViewport()
}

/**
 * Settle a surface into one of its states and report whether pagination is
 * exercisable in this environment.
 *
 * @param page - The page under test, already on the route.
 * @param surface - A locator that proves the populated surface rendered.
 * @param emptyState - A locator for this route's *specific* empty state.
 * @param paginationLabel - The `aria-label` of the surface's pagination nav.
 *
 * @remarks The `.or(…)` settle mirrors `articles-pagination.spec.ts:34`: block
 * on the surface resolving to EITHER its populated state or its empty state
 * before deciding, so the skip is made on real content rather than on a race —
 * and an empty database skips rather than fails. The empty-state locator has
 * to be the route's own copy (`getByText('Uses list coming soon')`), never
 * something both branches render: an `h1` is server-rendered on every route
 * and visible before hydration, so an `.or()` on it settles immediately and
 * the count below is taken too early — a silent skip instead of a failure.
 */
async function hasPagination(
  page: Page,
  surface: Locator,
  emptyState: Locator,
  paginationLabel: string,
): Promise<boolean> {
  await expect(surface.or(emptyState).first()).toBeVisible()
  if ((await surface.count()) === 0) {
    return false
  }
  return (
    (await page.locator(`nav[aria-label="${paginationLabel}"]`).count()) > 0
  )
}

/**
 * The reason one surface skipped, named so the CI report says which.
 *
 * @param route - The route that renders a single page here.
 * @returns The skip annotation text.
 */
function skipReason(route: string): string {
  return `${route} renders a single page in this environment, so its pagination control is a deliberate no-op.`
}

test('a page step on /articles anchors the reader to the results', async ({
  page,
}) => {
  await page.goto('/articles')
  const paginated = await hasPagination(
    page,
    page.getByPlaceholder('Search articles'),
    page.getByText('No published articles'),
    'Articles pagination',
  )
  test.skip(!paginated, skipReason('/articles'))

  await assertPageStepReAnchors(
    page,
    page.getByRole('region', { name: 'Article results' }),
    page.locator('article').first(),
  )
})

test('a page step on /tech anchors the reader to the results', async ({
  page,
}) => {
  await page.goto('/tech')
  const paginated = await hasPagination(
    page,
    page.getByPlaceholder('Search tech'),
    page.getByText('Tech stack coming soon'),
    'Tech pagination',
  )
  test.skip(!paginated, skipReason('/tech'))

  const results = page.getByRole('list', { name: 'Tech results' })
  await assertPageStepReAnchors(
    page,
    results,
    results.getByRole('listitem').first(),
  )
})

test('a page step on /uses anchors the reader to the results', async ({
  page,
}) => {
  await page.goto('/uses')
  const results = page.getByRole('region', { name: 'Uses results' })
  const paginated = await hasPagination(
    page,
    results,
    page.getByText('Uses list coming soon'),
    'Uses pagination',
  )
  test.skip(!paginated, skipReason('/uses'))

  await assertPageStepReAnchors(
    page,
    results,
    results.getByRole('listitem').first(),
  )
})

test('a page step on /projects anchors the reader to the results', async ({
  page,
}) => {
  await page.goto('/projects')
  const results = page.getByRole('list', { name: 'Projects results' })
  const paginated = await hasPagination(
    page,
    results,
    page.getByText('Projects coming soon'),
    'Projects pagination',
  )
  test.skip(!paginated, skipReason('/projects'))

  await assertPageStepReAnchors(
    page,
    results,
    results.getByRole('listitem').first(),
  )
})

test('a filter change does not steal focus out of the search box', async ({
  page,
}) => {
  await page.goto('/articles?page=2')
  const paginated = await hasPagination(
    page,
    page.getByPlaceholder('Search articles'),
    page.getByText('No published articles'),
    'Articles pagination',
  )
  test.skip(!paginated, skipReason('/articles'))

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
