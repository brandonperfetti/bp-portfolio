import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Regression guard for #115 — while the consent banner is shown it must not
 * overlay bottom-of-page interactive controls.
 *
 * The banner is `fixed inset-x-0 bottom-0 z-50` and reserved no layout space,
 * so a visitor landing **directly** on `/corvus` before making a consent choice
 * found the composer ("Ask Corvus…" + Send) partially covered — the same
 * collision the Build·E2E suite hit and worked around with a non-consent geo
 * (#114, mechanism B).
 *
 * The fix is Option 1 from the ticket, the pattern Brandon recorded there on
 * 2026-08-28: the shell reserves the banner's measured height at its bottom
 * edge while consent is required **and undecided**, released on choice
 * (`src/components/consent/consent-inset.ts`).
 *
 * This MUST run in a real browser against the built app: the whole assertion is
 * about layout geometry, which neither jsdom nor the Storybook harness's
 * synthetic page can stand in for at the app-shell level.
 */

// This spec is *about* the banner, so it needs the banner present. The global
// config default supplies a non-consent geo (#114 mechanism B); override it
// with a consent-required geo (FR ∈ EU) so `src/proxy.ts` resolves
// `cookieConsentRequired` to true. The real geo path — NOT a weakening of the
// fail-closed default.
test.use({ extraHTTPHeaders: { 'x-vercel-ip-country': 'FR' } })

const CORVUS = '/corvus'

function banner(page: Page): Locator {
  return page.getByRole('region', { name: 'Cookie consent' })
}

/** Asserts `control`'s box sits entirely above the banner's top edge. */
async function expectClearOfBanner(
  page: Page,
  control: Locator,
  label: string,
): Promise<void> {
  const bannerBox = await banner(page).boundingBox()
  const controlBox = await control.boundingBox()
  expect(bannerBox, 'banner must be laid out').not.toBeNull()
  expect(controlBox, `${label} must be laid out`).not.toBeNull()
  expect(
    controlBox!.y + controlBox!.height,
    `${label} must clear the banner (bottom ${controlBox!.y + controlBox!.height}, banner top ${bannerBox!.y})`,
  ).toBeLessThanOrEqual(bannerBox!.y)
}

test.describe('consent banner reserves space instead of overlaying (#115)', () => {
  test('the Corvus composer is fully visible and clickable on a direct landing', async ({
    page,
  }) => {
    await page.goto(CORVUS, { waitUntil: 'networkidle' })
    // Hydration gate (#114 mechanism A): the banner is client-rendered, so its
    // appearance proves the consent island mounted and applied the inset.
    await expect(banner(page)).toBeVisible()

    // The shell reserves the banner's height — non-zero, and matching what the
    // banner actually occupies.
    const reserved = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.body).paddingBottom),
    )
    const bannerHeight = (await banner(page).boundingBox())!.height
    expect(reserved, 'the shell must reserve bottom space').toBeGreaterThan(0)
    expect(Math.abs(reserved - bannerHeight)).toBeLessThanOrEqual(1)

    // The direct-landing case: scrolled to the bottom, where the overlap bit.
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    )
    await page.waitForTimeout(150)

    const composer = page.getByRole('textbox', { name: 'Message Corvus' })
    const send = page.getByRole('button', { name: 'Send' })
    await expectClearOfBanner(page, composer, 'the Corvus composer input')
    await expectClearOfBanner(page, send, 'the Corvus Send button')

    // Actionability, not just geometry: a trial click runs Playwright's full
    // visible/stable/enabled/receives-events checks — the exact set the banner
    // used to fail by intercepting pointer events (#114 mechanism B).
    await send.click({ trial: true })
    await composer.click({ trial: true })
  })

  test('the reservation survives opening the dialog and is released on choice', async ({
    page,
  }) => {
    await page.goto(CORVUS, { waitUntil: 'networkidle' })
    await expect(banner(page)).toBeVisible()

    const reservedPx = () =>
      page.evaluate(() =>
        parseFloat(getComputedStyle(document.body).paddingBottom),
      )
    const whileShown = await reservedPx()
    expect(whileShown).toBeGreaterThan(0)

    // Opening the dialog un-renders the banner but is NOT a choice: releasing
    // the reservation here would resize the document mid-interaction, which is
    // the #110 scroll-jump shape the guard suite pins.
    await banner(page).getByRole('button', { name: 'Customize' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await reservedPx()).toBe(whileShown)

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    expect(await reservedPx()).toBe(whileShown)

    // Released on an explicit choice — the shell gets its own bottom edge back.
    await banner(page).getByRole('button', { name: 'Accept all' }).click()
    await expect(banner(page)).toBeHidden()
    await expect(async () => {
      expect(await reservedPx()).toBe(0)
    }).toPass({ timeout: 5_000 })
  })
})
