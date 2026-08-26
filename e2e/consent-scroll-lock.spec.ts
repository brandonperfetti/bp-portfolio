import { expect, test, type Page } from '@playwright/test'

/**
 * Regression guard for #110 — the consent dialog must NOT jump the page scroll.
 *
 * Root cause (fixed in `src/app/(frontend)/layout.tsx`): Radix Dialog's
 * `react-remove-scroll` lock injects `body[data-scroll-locked]{overflow:hidden}`.
 * With the old `body.h-full` (a fixed, viewport `height:100%`), `overflow:hidden`
 * collapsed the document's scrollable overflow and the window snapped to
 * `scrollY:0` on open (and stayed there on close). `min-h-full` lets the body
 * grow to its content height, so the lock has nothing to collapse.
 *
 * This MUST run against the real `(frontend)` app shell (built + `next start`),
 * not Storybook/jsdom — the bug only exists under the global `html.h-full`
 * + `body` layout, which neither of those mounts. See the handoff for why the
 * prior Storybook play-fn guard (0f7bd362) passed while the app jumped.
 */

const ARTICLES = '/articles'
const DELTA_TOLERANCE = 5

async function scrollToBottom(page: Page): Promise<number> {
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  )
  await page.waitForTimeout(150)
  const y = await page.evaluate(() => Math.round(window.scrollY))
  // Guard the guard: the page must actually be scrolled, or the test proves
  // nothing (the bug is a *reset to 0*, invisible from an already-0 position).
  expect(
    y,
    'page must be scrolled away from the top to exercise the bug',
  ).toBeGreaterThan(DELTA_TOLERANCE)
  return y
}

async function expectNoScrollJump(
  page: Page,
  openDialog: (page: Page) => Promise<void>,
): Promise<void> {
  await page.goto(ARTICLES, { waitUntil: 'networkidle' })
  const before = await scrollToBottom(page)

  await openDialog(page)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(150)
  const whileOpen = await page.evaluate(() => Math.round(window.scrollY))
  expect(
    Math.abs(whileOpen - before),
    `scroll preserved on open (was ${before}, now ${whileOpen})`,
  ).toBeLessThan(DELTA_TOLERANCE)

  // Escape closes the dialog (focus trap / Escape-to-close still intact).
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.waitForTimeout(150)
  const afterClose = await page.evaluate(() => Math.round(window.scrollY))
  expect(
    Math.abs(afterClose - before),
    `scroll preserved on close (was ${before}, now ${afterClose})`,
  ).toBeLessThan(DELTA_TOLERANCE)
}

test.describe('consent dialog preserves window scroll (#110)', () => {
  test('footer "Manage cookies" trigger', async ({ page }) => {
    await expectNoScrollJump(page, async (p) => {
      // The persistent footer entry point. At max scroll it sits under the
      // fixed consent banner overlay, so invoke its real click handler directly
      // rather than hit-testing through the overlay.
      await p
        .getByRole('button', { name: 'Manage cookies' })
        .evaluate((el) => (el as HTMLElement).click())
    })
  })

  test('banner "Customize" trigger', async ({ page }) => {
    await expectNoScrollJump(page, async (p) => {
      await p
        .getByRole('region', { name: 'Cookie consent' })
        .getByRole('button', { name: 'Customize' })
        .click()
    })
  })

  test('banner "cookie details" trigger', async ({ page }) => {
    await expectNoScrollJump(page, async (p) => {
      await p
        .getByRole('region', { name: 'Cookie consent' })
        .getByRole('button', { name: 'cookie details' })
        .click()
    })
  })
})
