import { expect, test } from '@playwright/test'

/**
 * Guards the wave-1 header fix: the inline nav collapses to the mobile "Menu"
 * popover below `lg` (raised from `md`) so tablet widths don't overflow — the
 * signed-in account avatar was previously pushed off-screen (horizontal
 * scroll) at `md`.
 *
 * @remarks Auth-independent by design: it asserts the responsive breakpoint
 * toggle (Menu popover vs inline nav), which is exactly what reintroducing the
 * old `md:` breakpoint would break. The overflow only manifested when the
 * signed-in `HeaderUserButton` was mounted, which the e2e suite can't stand up
 * without Clerk — but the breakpoint is the root cause, so guarding it guards
 * the bug.
 */
test('header uses the Menu popover on tablet and the inline nav on desktop', async ({
  page,
}) => {
  const header = page.locator('header').first()
  const menuButton = header.getByRole('button', { name: 'Menu' })
  const inlineNavLink = header.getByRole('link', { name: 'Articles' })

  // Tablet (768–1023px): mobile "Menu" popover shown, inline nav hidden.
  await page.setViewportSize({ width: 820, height: 900 })
  await page.goto('/')
  await expect(menuButton).toBeVisible()
  await expect(inlineNavLink).toBeHidden()

  // Desktop (>= lg / 1024px): inline nav shown, Menu popover hidden.
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(inlineNavLink).toBeVisible()
  await expect(menuButton).toBeHidden()
})
