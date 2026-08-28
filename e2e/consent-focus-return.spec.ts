import { expect, test, type Locator, type Page } from '@playwright/test'

import { interactUntil } from './support/hydration'

/**
 * Regression guard for #112 — closing the consent dialog must return keyboard
 * focus to the control that opened it, never to `<body>`.
 *
 * Root cause (fixed in `src/components/consent/consent-focus.ts` +
 * `CookieDialog`): `CookieBanner` un-renders itself the moment `activeUI`
 * becomes `'dialog'`, so its "Customize" / "cookie details" button was already
 * gone by the time `CookieDialog`'s open effect read `document.activeElement`
 * — which had fallen back to `<body>`. With Radix's own restoration
 * `preventDefault`ed (the #110 no-scroll open path), focus stayed on `<body>`
 * after close: a WCAG 2.4.3 break for keyboard and screen-reader users.
 *
 * This MUST run in a real browser. The jsdom guard in `CookieDialog.test.tsx`
 * pins the restoration *wiring*, but the ordering it depends on — the banner
 * remounting in the same commit that closes the dialog, and Radix's focus scope
 * releasing focus a frame later — only exists here (the #110 lesson).
 */

// The banner-originated flows are the whole point of this spec, so it needs the
// banner present: the global config default supplies a non-consent geo (#114
// mechanism B), overridden here with a consent-required geo (FR ∈ EU) so
// `src/proxy.ts` resolves `cookieConsentRequired` to true. This exercises the
// real geo path — it does NOT touch the fail-closed default.
test.use({ extraHTTPHeaders: { 'x-vercel-ip-country': 'FR' } })

const ARTICLES = '/articles'

function banner(page: Page): Locator {
  return page.getByRole('region', { name: 'Cookie consent' })
}

async function gotoWithBanner(page: Page): Promise<void> {
  await page.goto(ARTICLES, { waitUntil: 'networkidle' })
  // Hydration gate (#114 mechanism A): CookieBanner is client-rendered and
  // returns null until the consent runtime mounts and reads the geo cookie, so
  // its appearance proves the consent island's handlers are attached.
  await expect(banner(page)).toBeVisible()
}

/**
 * Opens the dialog from `trigger`, closes it with Escape, and asserts focus
 * came back to `returnTarget`.
 *
 * @remarks `returnTarget` is re-resolved *after* the close on purpose: for the
 * banner flows the button that comes back is a different DOM node than the one
 * clicked, which is exactly why a captured-node-only restoration could not fix
 * this.
 */
async function expectFocusReturns(
  page: Page,
  open: () => Promise<void>,
  returnTarget: () => Locator,
): Promise<void> {
  const dialog = page.getByRole('dialog')

  // Retry the trigger until it lands (#114 mechanism A). Both banner triggers
  // and the footer link call setActiveUI('dialog', {force:true}) — idempotent,
  // so a retry can never toggle an open dialog shut.
  await interactUntil(async () => {
    await open()
    await expect(dialog).toBeVisible({ timeout: 2500 })
  })

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()

  await expect(returnTarget()).toBeFocused()
  // Named explicitly: `<body>` is the exact pre-fix symptom, and a bare
  // toBeFocused failure would not say so.
  expect(
    await page.evaluate(() => document.activeElement?.tagName ?? 'NONE'),
    'focus must not fall back to <body>',
  ).not.toBe('BODY')
}

test.describe('consent dialog returns focus to its opener (#112)', () => {
  test('banner "Customize" trigger', async ({ page }) => {
    await gotoWithBanner(page)
    const customize = () =>
      banner(page).getByRole('button', { name: 'Customize' })
    await expectFocusReturns(
      page,
      async () => {
        await customize().click()
      },
      customize,
    )
  })

  test('banner "cookie details" trigger', async ({ page }) => {
    await gotoWithBanner(page)
    const details = () =>
      banner(page).getByRole('button', { name: 'cookie details' })
    await expectFocusReturns(
      page,
      async () => {
        await details().click()
      },
      details,
    )
  })

  test('footer "Manage cookies" trigger stays correct', async ({ page }) => {
    // The unaffected flow (its trigger never unmounts) — pinned so the #112
    // fix cannot regress the behavior 0f7bd362 shipped.
    await gotoWithBanner(page)
    const manage = () => page.getByRole('button', { name: 'Manage cookies' })
    await expectFocusReturns(
      page,
      async () => {
        await manage().click()
      },
      manage,
    )
  })

  test('a banner trigger that never comes back falls back to the footer link', async ({
    page,
  }) => {
    // An explicit choice made *inside* the dialog dismisses the banner for
    // good, so the originating trigger cannot be restored. Focus must still
    // land on a sensible control rather than on `<body>`.
    await gotoWithBanner(page)
    const dialog = page.getByRole('dialog')

    await interactUntil(async () => {
      await banner(page).getByRole('button', { name: 'Customize' }).click()
      await expect(dialog).toBeVisible({ timeout: 2500 })
    })
    await dialog.getByRole('button', { name: 'Accept all' }).click()
    await expect(dialog).toBeHidden()
    await expect(banner(page)).toBeHidden()

    await expect(
      page.getByRole('button', { name: 'Manage cookies' }),
    ).toBeFocused()
  })
})
