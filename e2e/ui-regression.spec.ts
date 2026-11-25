import {
  type Locator,
  type Page,
  type Response,
  expect,
  test,
} from '@playwright/test'

import { interactUntil } from './support/hydration'

// About rail should remain visually tighter because the right column is more
// static while the left narrative content scrolls.
const ABOUT_STICKY_RAIL_MAX_DRIFT_RATIO = 0.07
const STICKY_RAIL_STABILITY_TOLERANCE_PX = 0.75
const STICKY_RAIL_REQUIRED_CONSECUTIVE_STABLE_READS = 2
const STICKY_RAIL_SAMPLE_INTERVAL_MS = 40
const STICKY_RAIL_MAX_SAMPLES = 16

/**
 * The anchor `ColumnShell` emits, mirrored from `STICKY_RAIL_TEST_ID`.
 *
 * @remarks A literal rather than an import: no spec in `e2e/` reaches into
 * `src/`, and the Playwright project carries no `@/*` alias. Mirrored, so
 * named — if the constant in `src/blocks/Column/ColumnShell.tsx` ever moves,
 * this is the one place to follow it.
 */
const STICKY_RAIL_TEST_ID = 'cms-sticky-rail'

/**
 * Whether this page's rail column actually opted into sticky behaviour.
 *
 * @remarks `ColumnShell` emits the anchor if and only if the Column block's
 * `sticky` field is true — "Stick to the top while scrolling" in the admin —
 * and React drops the attribute entirely when it is false. So the anchor's
 * absence is not a bug to fail on: it is an editor having left the flag off,
 * which is a legitimate choice the CMS offers.
 *
 * **The page must have loaded before its absence means anything (#205).** An
 * earlier version waited for the anchor and turned ANY failure into `false`,
 * so a 500, a navigation error or a page that never rendered became a green
 * skip. The load is asserted first, and those fail the spec. After that the
 * anchor needs no waiting: it is server-rendered with the column, so once
 * `main` is visible it is either in the DOM or the flag is off.
 *
 * `count`, not visibility: the about rail is `desktopOnly`, so visibility is a
 * second, viewport-dependent question. Presence of the mechanism is the
 * question the skip decision turns on.
 *
 * @param page - Active Playwright page.
 * @param response - What `page.goto` returned for that page.
 * @returns `true` when the sticky mechanism exists on this page.
 */
async function hasStickyRail(
  page: Page,
  response: Response | null,
): Promise<boolean> {
  expect(response?.status(), 'the page loaded before the sticky probe').toBe(
    200,
  )
  await expect(page.locator('main')).toBeVisible()
  return (await page.getByTestId(STICKY_RAIL_TEST_ID).count()) > 0
}

/** The skip reason, naming the CMS control a reader has to go turn on. */
const STICKY_RAIL_SKIP_REASON =
  'This page\'s rail Column block has "Stick to the top while scrolling" ' +
  "(the Column block's `sticky` field) switched off, so ColumnShell emits no " +
  `\`${STICKY_RAIL_TEST_ID}\` anchor and there is no sticky mechanism to ` +
  'measure. Turn the flag on for this page in the CMS to exercise this spec.'

async function getStableBoundingBoxY(page: Page, locator: Locator) {
  let previousY: number | null = null
  let consecutiveStableCount = 0

  for (let index = 0; index < STICKY_RAIL_MAX_SAMPLES; index += 1) {
    const box = await locator.boundingBox()
    if (!box) {
      throw new Error('Expected sticky rail anchor to have a bounding box.')
    }

    if (
      previousY !== null &&
      Math.abs(box.y - previousY) < STICKY_RAIL_STABILITY_TOLERANCE_PX
    ) {
      consecutiveStableCount += 1
      if (
        consecutiveStableCount >= STICKY_RAIL_REQUIRED_CONSECUTIVE_STABLE_READS
      ) {
        return box.y
      }
    } else {
      consecutiveStableCount = 0
    }

    previousY = box.y
    await page.waitForTimeout(STICKY_RAIL_SAMPLE_INTERVAL_MS)
  }

  throw new Error('Sticky rail position did not stabilize in time.')
}

/**
 * Waits for `/articles` to hydrate into exactly one of its two mutually
 * exclusive states before the skip decision is made.
 *
 * @remarks The search input is client-only (it lives in `ArticlesExplorer`,
 * mounted under `<Suspense>`), so a bare `count()` right after `goto` races
 * hydration and can read 0 while articles actually exist. Blocking on the
 * `searchInput.or(emptyState)` locator removes that race so both members of
 * the articles test pair skip in the correct environment.
 *
 * @param page - Active Playwright page positioned on `/articles`.
 * @returns `'articles'` when published articles are present, otherwise
 * `'empty'`.
 */
async function resolveArticlesState(page: Page): Promise<'articles' | 'empty'> {
  const searchInput = page.getByPlaceholder('Search articles')
  const emptyState = page.getByText('No published articles')
  // Wait until hydration resolves to one state or the other before deciding.
  await expect(searchInput.or(emptyState).first()).toBeVisible()
  return (await searchInput.count()) > 0 ? 'articles' : 'empty'
}

test('articles query syncs to URL', async ({ page }) => {
  await page.goto('/articles')

  test.skip(
    (await resolveArticlesState(page)) === 'empty',
    'No published articles available in this environment to exercise query sync.',
  )

  const searchInput = page.getByPlaceholder('Search articles')
  await expect(searchInput).toBeVisible()

  // Typing syncs to the URL only once ArticlesExplorer's onChange handler is
  // hydrated; under cacheComponents/PPR that lands after load (#114 mechanism
  // A). Retry the fill until the URL reflects it (the debounced write itself
  // is fast, ~0).
  await interactUntil(async () => {
    await searchInput.fill('react')
    await expect
      .poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 2000 })
      .toBe('react')
  })
})

test('articles shows empty-state message when no published articles', async ({
  page,
}) => {
  await page.goto('/articles')

  test.skip(
    (await resolveArticlesState(page)) === 'articles',
    'Published articles are available in this environment.',
  )

  await expect(page.getByText('No published articles')).toBeVisible()
})

test('command palette opens and closes via escape', async ({ page }) => {
  await page.goto('/')

  const openPaletteButton = page.getByRole('button', {
    name: /open command palette/i,
  })
  const paletteInput = page.getByPlaceholder(
    /search articles or type a command/i,
  )

  // The palette open button is server-rendered but its onClick attaches on
  // hydration (post-load under cacheComponents/PPR, #114 mechanism A). Retry
  // the open until the palette actually appears.
  await interactUntil(async () => {
    await openPaletteButton.click()
    await expect(paletteInput).toBeVisible({ timeout: 1000 })
  })

  await page.keyboard.press('Escape')
  await expect(paletteInput).not.toBeVisible()
})

test('corvus empty submit focuses input', async ({ page }) => {
  await page.goto('/corvus')

  const input = page.getByPlaceholder('Ask Corvus...')
  await expect(input).toBeVisible()

  // With the deterministic non-consent geo (playwright.config.ts) the consent
  // banner is absent, so it no longer overlays this bottom Send button (#114
  // mechanism B). The submit→focus behavior still depends on the hydrated
  // onClick, so retry until it lands (#114 mechanism A).
  await interactUntil(async () => {
    await page.getByRole('button', { name: /send/i }).click()
    await expect(input).toBeFocused({ timeout: 1000 })
  })
})

test('about desktop sticky right rail remains pinned while scrolling', async ({
  page,
}) => {
  // The site's sticky-rail coverage (#205). The home rail is not sticky by
  // Brandon's decision (2026-09-09), so a home variant of this spec only ever
  // measured a configuration production does not use; `/about` is the page
  // that sticks.
  await page.setViewportSize({ width: 1440, height: 1000 })
  const response = await page.goto('/about')

  // About is a CMS page-builder doc (#44 flip): its right rail is the sticky
  // Column shell, so target the stable testid ColumnShell emits when `sticky`
  // is on. Whether it IS on is content, not code (#119).
  test.skip(!(await hasStickyRail(page, response)), STICKY_RAIL_SKIP_REASON)

  const viewportHeight = page.viewportSize()?.height ?? 1000

  await page.evaluate(
    (topOffset) => window.scrollTo(0, topOffset),
    Math.round(viewportHeight * 0.9),
  )
  const railAnchor = page.getByTestId(STICKY_RAIL_TEST_ID)
  await expect(railAnchor).toBeVisible()
  const firstY = await getStableBoundingBoxY(page, railAnchor)

  await page.evaluate(
    (topOffset) => window.scrollTo(0, topOffset),
    Math.round(viewportHeight * 1.7),
  )
  const secondY = await getStableBoundingBoxY(page, railAnchor)
  const maxDrift = viewportHeight * ABOUT_STICKY_RAIL_MAX_DRIFT_RATIO
  expect(Math.abs(secondY - firstY)).toBeLessThan(maxDrift)
})
