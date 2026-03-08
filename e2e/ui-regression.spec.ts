import { type Locator, type Page, expect, test } from '@playwright/test'

async function getStableBoundingBoxY(page: Page, locator: Locator) {
  let previousY: number | null = null
  for (let index = 0; index < 16; index += 1) {
    const box = await locator.boundingBox()
    if (!box) {
      throw new Error('Expected sticky rail anchor to have a bounding box.')
    }
    if (previousY !== null && Math.abs(box.y - previousY) < 0.75) {
      return box.y
    }
    previousY = box.y
    await page.waitForTimeout(40)
  }

  if (previousY === null) {
    throw new Error('Unable to read stable sticky rail position.')
  }
  return previousY
}

test('articles query syncs to URL', async ({ page }) => {
  await page.goto('/articles')

  const searchInput = page.getByPlaceholder('Search articles')
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
  await page.goto('/')
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.evaluate(() => window.scrollTo(0, 1200))
  await page.waitForTimeout(200)
  const railAnchor = page.getByText('Send a message').first()
  await expect(railAnchor).toBeVisible()
  const firstBox = await railAnchor.boundingBox()

  await page.evaluate(() => window.scrollTo(0, 2000))
  await page.waitForTimeout(200)
  const secondBox = await railAnchor.boundingBox()

  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  expect(Math.abs((secondBox?.y ?? 0) - (firstBox?.y ?? 0))).toBeLessThan(140)
})

test('about desktop sticky right rail remains pinned while scrolling', async ({
  page,
}) => {
  await page.goto('/about')
  await page.setViewportSize({ width: 1440, height: 1000 })

  await page.evaluate(() => window.scrollTo(0, 900))
  await page.waitForTimeout(200)
  const railAnchor = page.getByText('Follow on X').first()
  await expect(railAnchor).toBeVisible()
  const firstBox = await railAnchor.boundingBox()

  await page.evaluate(() => window.scrollTo(0, 1700))
  await page.waitForTimeout(200)
  const secondBox = await railAnchor.boundingBox()

  expect(firstBox).not.toBeNull()
  expect(secondBox).not.toBeNull()
  expect(Math.abs((secondBox?.y ?? 0) - (firstBox?.y ?? 0))).toBeLessThan(70)
})
