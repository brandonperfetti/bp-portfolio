import { expect, test, type Page } from '@playwright/test'

import { interactUntil } from './support/hydration'

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

// This spec is *about* the consent dialog, so it needs the banner present.
// The global config default supplies a non-consent geo (banner absent, #114
// mechanism B); override it here with a consent-required geo (FR ∈ EU) so
// `src/proxy.ts` resolves `cookieConsentRequired` to true and the banner shows.
// This exercises the real geo path — it does NOT touch the fail-closed default.
test.use({ extraHTTPHeaders: { 'x-vercel-ip-country': 'FR' } })

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

  // Hydration gate (#114 mechanism A): the consent banner is client-rendered —
  // CookieBanner returns null until the consent runtime mounts and reads the
  // geo cookie. Waiting for it to appear proves the consent island (and thus
  // the dialog triggers' onClick handlers) has hydrated, so the single
  // openDialog click below lands first try. This does NOT alter the scroll
  // assertions the #110 guard makes — it only removes the interact-before-
  // hydration race that made the trigger no-op under a slow CI build.
  await expect(
    page.getByRole('region', { name: 'Cookie consent' }),
  ).toBeVisible()

  const before = await scrollToBottom(page)

  const dialog = page.getByRole('dialog')
  // Open the dialog, retrying the trigger until it lands (#114 mechanism A):
  // even with the banner mounted, the c15t click handler can still be racing
  // hydration under a slow build. Both triggers call setActiveUI('dialog',
  // {force:true}) — idempotent — so a retry can never toggle an open dialog
  // shut. No-op (pre-hydration) clicks don't scroll, so `before` (captured at
  // max scroll) and the on-open measurement below stay exactly as the #110
  // guard intends; the scroll assertions are unchanged.
  await interactUntil(async () => {
    await openDialog(page)
    await expect(dialog).toBeVisible({ timeout: 2500 })
  })
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
