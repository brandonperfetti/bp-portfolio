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
 * absorbs sub-pixel rounding in the measured rect, whatever a `scrollIntoView`
 * that lands against the document's scroll limits stops short by, and the
 * container's own top border/padding — while staying well under the ~64px that
 * would let a visibly un-anchored container pass. That middle term used to be
 * written here as "1–2px"; the figure was never measured — the commit that
 * introduced it (#183) justifies the 32px as settling margin and cites no
 * number — and where it has since been measured the browser left nothing
 * behind at all: `/tech?page=2` reports `scrollY` 430 of a possible 430,
 * exactly its limit. It is stated as an unquantified term now, and
 * `SCROLL_END_EPSILON_PX` allows a pixel for it.
 */
const ANCHOR_TOLERANCE_PX = 96

/**
 * Slack allowed when deciding a document is at its scroll limit: **1px**.
 *
 * @remarks `scrollY`, `scrollHeight` and `innerHeight` are fractional on a
 * fractional device pixel ratio, so a viewport against its scroll limit can
 * report a `scrollY` a sliver short of `scrollHeight - innerHeight`. One pixel
 * covers that, and one pixel is what the only measurement of this supports:
 * `/tech?page=2` lands at 430 of a possible 430, dead on the limit, so nothing
 * observed here needs more (`ANCHOR_TOLERANCE_PX` carries the note about the
 * unmeasured "1–2px" this used to have to agree with). Widen it only against a
 * measurement: every pixel added here is a pixel of stopping-short that stops
 * failing.
 */
const SCROLL_END_EPSILON_PX = 1

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

/**
 * Where the anchored container sits, and how much room the document gave the
 * anchor to put it there.
 *
 * @param locator - The element to measure — the anchored results container.
 * @returns `offset`, the distance from the viewport top to the element's top
 * edge; `scrollY`, the scroll position it was measured at; and `maxScrollY`,
 * the furthest this document can scroll.
 *
 * @remarks All three come out of one `evaluate` round trip on purpose: the
 * assertion below compares them against each other, and an offset read in a
 * separate call can describe a different frame than the scroll metrics do.
 * `offset` is what `boundingBox().y` reported before; the zero-size guard is
 * slightly wider than that call's null check — a rect with a width but no
 * height throws here instead of yielding a top — which is stricter, never
 * looser, for an element whose job is to hold the results.
 */
async function anchorMetrics(locator: Locator): Promise<{
  offset: number
  scrollY: number
  maxScrollY: number
}> {
  const { offset, laidOut, scrollY, maxScrollY } = await locator.evaluate(
    (element) => {
      const box = element.getBoundingClientRect()
      return {
        offset: box.top,
        laidOut: box.width > 0 && box.height > 0,
        scrollY: window.scrollY,
        maxScrollY: Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        ),
      }
    },
  )
  if (!laidOut) {
    throw new Error('the element under test has no layout box')
  }
  return { offset, scrollY, maxScrollY }
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

  // The results are at the top of the viewport, under the header offset — or
  // as near it as the document's height permits. Scrolling clamps at
  // `scrollHeight - innerHeight`, so a surface whose last page is shorter than
  // one viewport cannot put anything below the hero at the top however it is
  // scrolled: on `/tech?page=2` the two remaining rows leave a 1343px document
  // in a 913px viewport, so `scrollY` maxes out at 430. Landing the list under
  // the header takes 728 (its 792px document position less `scroll-mt-16`'s
  // 64), and even the looser position the tolerance would accept — 696, which
  // is what `scrollNeededToAnchor` computes — is past the limit. The list
  // lands 362px down (169px in CI's viewport, same cause), and
  // `window.scrollTo({ top: 728 })` by hand lands at 430 too. `/articles`,
  // `/uses` and `/projects` carry enough rows onto page 2 that the scroll the
  // tolerance needs stays inside that range, so it binds there exactly as it
  // always did.
  //
  // On a document that can still scroll, the second clause is false and the
  // tolerance binds exactly as it did before: an anchor that ran late, or
  // stopped short by more than the tolerance, fails on it, and one that never
  // ran leaves the viewport below the results, where the lower bound catches
  // it instead. On a document at its scroll limit the clause is permissive by
  // construction, and worth being honest about: substitute
  // `scrollY >= maxScrollY - 1` into `scrollNeededToAnchor > maxScrollY` and
  // it reduces to `offset > 97`, already true of anything that got past the
  // first clause. The clamp erases the difference between an anchor that ran
  // and one that never did, so no scroll assertion can separate them there —
  // the clause states a fact about the document, it does not vouch for the
  // anchor. Focus is what still separates them, and it is asserted below,
  // separately and unconditionally: no clamp applies to it, and on `/tech` it
  // is the whole of the guard.
  const { offset, scrollY, maxScrollY } = await anchorMetrics(results)
  const scrollNeededToAnchor = scrollY + offset - ANCHOR_TOLERANCE_PX
  const anchorOutOfRoom =
    scrollNeededToAnchor > maxScrollY &&
    scrollY >= maxScrollY - SCROLL_END_EPSILON_PX

  expect(
    offset,
    `the results start ${offset}px above the viewport top at scrollY ${scrollY} of a possible ${maxScrollY} — the viewport is still below them, where both an anchor that never ran and one that scrolled past them leave it`,
  ).toBeGreaterThanOrEqual(0)
  expect(
    offset <= ANCHOR_TOLERANCE_PX || anchorOutOfRoom,
    `the results sit ${offset}px below the viewport top, past the ${ANCHOR_TOLERANCE_PX}px tolerance, at scrollY ${scrollY} of a possible ${maxScrollY} — the tolerance is met from scrollY ${scrollNeededToAnchor}, and the document could have brought them closer to the top than this`,
  ).toBe(true)

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
