import { type Locator, type Page, expect, test } from '@playwright/test'

// Home rail can legitimately shift more due to sticky offset transitions and
// stacked cards entering/leaving around the rail during long-scroll sampling.
const HOME_STICKY_RAIL_MAX_DRIFT_RATIO = 0.25
// About rail should remain visually tighter because the right column is more
// static while the left narrative content scrolls.
const ABOUT_STICKY_RAIL_MAX_DRIFT_RATIO = 0.07
const STICKY_RAIL_STABILITY_TOLERANCE_PX = 0.75
const STICKY_RAIL_REQUIRED_CONSECUTIVE_STABLE_READS = 2
const STICKY_RAIL_SAMPLE_INTERVAL_MS = 40
const STICKY_RAIL_MAX_SAMPLES = 16

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

test('articles query syncs to URL', async ({ page }) => {
  await page.goto('/articles')

  const searchInput = page.getByPlaceholder('Search articles')
  if ((await searchInput.count()) === 0) {
    await expect(page.getByText('No published articles')).toBeVisible()
    return
  }
  await expect(searchInput).toBeVisible()
  await searchInput.fill('react')

  await expect
    .poll(() => new URL(page.url()).searchParams.get('q'))
    .toBe('react')
})

test('header search modal opens and closes via escape', async ({ page }) => {
  await page.goto('/')

  const openSearchButton = page.getByRole('button', {
    name: /open search/i,
  })
  await openSearchButton.click()

  const modalInput = page.getByPlaceholder('Search articles')
  await expect(modalInput).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(modalInput).not.toBeVisible()
})

test('hermes empty submit focuses input', async ({ page }) => {
  await page.goto('/hermes')

  const input = page.getByPlaceholder('Ask Hermes...')
  await expect(input).toBeVisible()

  await page.getByRole('button', { name: /send/i }).click()
  await expect(input).toBeFocused()
})

test('home desktop sticky right rail remains pinned while scrolling', async ({
  page,
}) => {
  // Stabilize after each scroll, then compare drift against viewport-relative tolerance.
  await page.goto('/')
  await page.setViewportSize({ width: 1440, height: 1000 })
  const viewportHeight = page.viewportSize()?.height ?? 1000

  await page.evaluate(
    (topOffset) => window.scrollTo(0, topOffset),
    Math.round(viewportHeight * 1.2),
  )
  const railAnchor = page.getByTestId('home-sticky-rail-anchor')
  await expect(railAnchor).toBeVisible()
  const firstY = await getStableBoundingBoxY(page, railAnchor)

  await page.evaluate(
    (topOffset) => window.scrollTo(0, topOffset),
    Math.round(viewportHeight * 2),
  )
  const secondY = await getStableBoundingBoxY(page, railAnchor)
  const maxDrift = viewportHeight * HOME_STICKY_RAIL_MAX_DRIFT_RATIO
  expect(Math.abs(secondY - firstY)).toBeLessThan(maxDrift)
})

test('about desktop sticky right rail remains pinned while scrolling', async ({
  page,
}) => {
  await page.goto('/about')
  await page.setViewportSize({ width: 1440, height: 1000 })
  const viewportHeight = page.viewportSize()?.height ?? 1000

  await page.evaluate(
    (topOffset) => window.scrollTo(0, topOffset),
    Math.round(viewportHeight * 0.9),
  )
  const railAnchor = page.getByText('Follow on X').first()
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
