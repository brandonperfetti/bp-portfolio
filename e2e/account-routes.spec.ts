import { expect, test } from '@playwright/test'

/**
 * #391 — a direct load of an account sub-page reaches the account route.
 *
 * Clerk's `<UserProfile>` path-routes its sub-pages, so `/account/security` is
 * a URL a reader can refresh, bookmark or follow. Before the route became the
 * `[[...account]]` catch-all, that load fell through to the CMS catch-all and
 * returned 404, while a click inside the profile (client-side) worked.
 *
 * No spec signs in (it would need a Clerk user), so this proves the route
 * from the signed-out side: every account URL is served by the account page,
 * which sends an anonymous visitor to `/sign-in` when Clerk is configured and
 * home when it is not. A 404 here is the #391 regression. The signed-in
 * render of the profile is pinned by the page's unit test.
 */

const CLERK_CONFIGURED =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY)

const expectedPath = CLERK_CONFIGURED ? '/sign-in' : '/'

for (const accountPath of ['/account', '/account/security']) {
  test(`a signed-out direct load of ${accountPath} is redirected to ${expectedPath}, not a 404`, async ({
    page,
  }) => {
    const response = await page.goto(accountPath)

    expect(response?.status()).not.toBe(404)
    await expect(page).toHaveURL((url) => url.pathname === expectedPath)
  })
}
