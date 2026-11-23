import {
  expect,
  test,
  type Page,
  type Request,
  type Route,
} from '@playwright/test'

import { interactUntil } from './support/hydration'

/**
 * #379 — `/sign-in` is the site's own form, and the real clerk-js on the
 * built site sends what the form hands it.
 *
 * The unit tests (`SignInForm.test.tsx`) pin which Clerk call each control
 * makes. This is the hop after that: clerk-js putting the typed address in
 * the request it sends, and the form showing Clerk's answer.
 *
 * ## Nothing reaches Clerk's sign-in endpoint: no session, no email
 *
 * Every write to `/v1/client/sign_ins` is intercepted before it leaves the
 * browser and answered with a Clerk-shaped error. A second rule on the whole
 * browser context aborts every other non-read request to a Clerk Frontend
 * API path, except `POST /v1/environment` (clerk-js reading the instance
 * settings), and fails the test that caused it; it is the same fail-closed
 * guard as `sign-up-opt-in.spec.ts`. The address typed is `example.com`'s.
 * Cloudflare's Turnstile script is answered with the same stand-in as there.
 *
 * ## The build must have Clerk configured
 *
 * Without both Clerk keys the page shows a "not configured" notice. CI sets
 * them on the e2e job; this spec fails there when they are missing, and
 * skips locally with the reason. A skip is not proof.
 */

const CLERK_CONFIGURED =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY)

const isSiteHost = (hostname: string): boolean =>
  hostname === '127.0.0.1' || hostname === 'localhost'

const ALLOWED_CLERK_WRITES = new Set(['POST /v1/environment'])
const SIGN_IN_PATH = /\/v1\/client\/sign_ins(\/|$)/
const TURNSTILE_HOST = 'challenges.cloudflare.com'
const TURNSTILE_STAND_IN = `
window.turnstile = {
  render: function (_container, options) {
    setTimeout(function () {
      if (options && typeof options.callback === 'function') {
        options.callback('e2e-placeholder-turnstile-token')
      }
    }, 0)
    return 'e2e-widget'
  },
  execute: function () {},
  reset: function () {},
  remove: function () {},
  getResponse: function () { return 'e2e-placeholder-turnstile-token' },
  isExpired: function () { return false },
  ready: function (callback) { callback() },
}
`
const EMAIL = 'reader@example.com'

const isSignInWrite = (request: Request): boolean => {
  if (request.method() === 'GET' || request.method() === 'OPTIONS') return false
  try {
    return SIGN_IN_PATH.test(new URL(request.url()).pathname)
  } catch {
    return false
  }
}

/** The form-encoded body of an intercepted request. */
const bodyOf = (request: Request): URLSearchParams =>
  new URLSearchParams(request.postData() ?? '')

/**
 * Catches every sign-in write and answers it with `error`. Nothing is
 * forwarded.
 */
async function interceptSignInWrites(
  page: Page,
  error: { code: string; message: string; param?: string },
): Promise<Request[]> {
  const requests: Request[] = []
  await page.route(
    (url) => SIGN_IN_PATH.test(url.pathname),
    async (route: Route) => {
      const request = route.request()
      if (!isSignInWrite(request)) return route.continue()
      requests.push(request)
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': new URL(page.url()).origin,
          'access-control-allow-credentials': 'true',
        },
        body: JSON.stringify({
          errors: [
            {
              code: error.code,
              message: error.message,
              long_message: error.message,
              ...(error.param ? { meta: { param_name: error.param } } : {}),
            },
          ],
          clerk_trace_id: 'e2e-intercepted',
        }),
      })
    },
  )
  return requests
}

/** Opens `/sign-in` and waits until the form's handlers are attached. */
async function openForm(page: Page) {
  await page.goto('/sign-in')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sign in' }),
  ).toBeVisible()
  // React's handlers are attached once the show/hide toggle answers, a
  // control only React can change (as in `sign-up-opt-in.spec.ts`).
  const reveal = page.getByRole('button', { name: /^(Show|Hide) password$/ })
  await interactUntil(async () => {
    if ((await reveal.getAttribute('aria-pressed')) !== 'true') {
      await reveal.click()
    }
    await expect(reveal).toHaveAttribute('aria-pressed', 'true')
  })
  await reveal.click()
  await expect(reveal).toHaveAttribute('aria-pressed', 'false')
}

let unintercepted: string[] = []

test.beforeEach(async ({ context }) => {
  if (!CLERK_CONFIGURED) {
    const reason =
      'this build has no Clerk: set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY for both the build and this run'
    if (process.env.CI) throw new Error(`#379 proof cannot run: ${reason}`)
    test.skip(true, reason)
    return
  }
  unintercepted = []

  await context.route(
    (url) => url.pathname.startsWith('/v1/') && !isSiteHost(url.hostname),
    async (route: Route) => {
      const request = route.request()
      const { pathname } = new URL(request.url())
      const isRead =
        request.method() === 'GET' || request.method() === 'OPTIONS'
      if (
        isRead ||
        ALLOWED_CLERK_WRITES.has(`${request.method()} ${pathname}`)
      ) {
        return route.continue()
      }
      // Path only: the query carries the browser's Clerk dev token.
      unintercepted.push(`${request.method()} ${pathname}`)
      await route.abort('blockedbyclient')
    },
  )

  await context.route(
    (url) =>
      url.hostname === TURNSTILE_HOST ||
      url.hostname.endsWith(`.${TURNSTILE_HOST}`),
    (route: Route) =>
      /\/turnstile\/v0\/api\.js$/.test(new URL(route.request().url()).pathname)
        ? route.fulfill({
            contentType: 'application/javascript',
            body: TURNSTILE_STAND_IN,
          })
        : route.abort('blockedbyclient'),
  )
})

test.afterEach(() => {
  if (!CLERK_CONFIGURED) return
  expect(
    unintercepted,
    "every write to Clerk's sign-in endpoint must be intercepted by the test; these were aborted by the guard instead",
  ).toEqual([])
})

test.describe("sign-in: the site's own form on Clerk's hooks", () => {
  test("is the site's form, not Clerk's prebuilt card", async ({ page }) => {
    await openForm(page)
    await expect(
      page.getByRole('button', { name: 'Continue with Google' }),
    ).toBeVisible()
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Forgot password?' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      /^\/sign-up/,
    )
    // Clerk's prebuilt card carried this footer; the site's form does not.
    await expect(page.getByText('Secured by')).toHaveCount(0)
  })

  test("sends the typed address, and shows Clerk's refusal under the password", async ({
    page,
  }) => {
    const requests = await interceptSignInWrites(page, {
      code: 'form_password_incorrect',
      message: 'Password is incorrect. Try again, or use another method.',
      param: 'password',
    })
    await openForm(page)
    await page.getByLabel('Email address').fill(EMAIL)
    await page.getByLabel('Password').fill('not the password')
    await page.getByRole('button', { name: 'Continue' }).click()

    await expect(page.getByLabel('Password')).toHaveAccessibleDescription(
      /password is incorrect/i,
    )
    expect(requests.length).toBeGreaterThan(0)
    expect(bodyOf(requests[0]).get('identifier')).toBe(EMAIL)
    // The form unlocks for another try.
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  test('starts Google with the sign-in callback page as the way back', async ({
    page,
  }) => {
    const requests = await interceptSignInWrites(page, {
      code: 'e2e_intercepted',
      message: 'Intercepted by the e2e spec.',
    })
    await openForm(page)
    await page.getByRole('button', { name: 'Continue with Google' }).click()

    await expect(page.getByRole('alert')).toContainText(
      'Intercepted by the e2e spec.',
    )
    const google = requests.find(
      (request) => bodyOf(request).get('strategy') === 'oauth_google',
    )
    expect(google, 'a sign-in write with strategy oauth_google').toBeDefined()
    expect(bodyOf(google!).get('redirect_url')).toContain(
      '/sign-in/sso-callback',
    )
  })
})
