import {
  expect,
  test,
  type Page,
  type Request,
  type Route,
} from '@playwright/test'

import { interactUntil } from './support/hydration'

/**
 * #377 — the mailing-list tick reaches Clerk with the request that starts the
 * sign-up, for email and password and for Google, and cannot be changed once
 * that request is in flight.
 *
 * The unit tests pin what the form hands to Clerk's hooks. This is the hop
 * after that, which only a browser can show: the real clerk-js, loaded on the
 * built site, putting that value in the request it sends. #373 left that hop
 * unproven for Clerk's prebuilt form.
 *
 * ## Nothing reaches Clerk's sign-up endpoint: no account, no email
 *
 * Every write to `/v1/client/sign_ups` (the create, and anything under it) is
 * intercepted before it leaves the browser. The spec reads the request body,
 * then answers it itself with a Clerk-shaped error, so the form is seen to
 * unlock and show the error too. No sign-up attempt, no user, no verification
 * email and no Resend contact can come of it. The addresses typed are
 * `example.com`'s.
 *
 * **The interception is fail-closed.** A second rule, on the whole browser
 * context, aborts every request that is not a read (GET, or an OPTIONS
 * preflight) to a Clerk Frontend API path
 * (`/v1/…` on any host but the site's) that a test's own interceptor did not
 * take, and fails the test that caused it. It does not share the
 * interceptor's pattern, so it also covers that pattern going stale: a
 * sign-up write under a path the interceptor no longer matches is still
 * aborted. One call is allowed through, by exact path:
 * `POST /v1/environment`, which is how clerk-js fetches the instance settings
 * when a page loads; it creates nothing. What the guard cannot cover is a Clerk
 * release that moves its API off `/v1/`; the spec would then fail for want
 * of a request to read, not pass. `SIGN_UP_E2E_NEGATIVE_CONTROL=1` is the
 * hand-run proof: it leaves the interceptor out, and every test that submits
 * must then fail with the write aborted.
 *
 * clerk-js itself, and its read-only calls (the instance settings, the
 * browser's client record), do reach the Clerk instance the build is
 * configured with, as they do on every page of every other spec. Each test
 * attaches the list of every non-GET request the page made to a Clerk
 * Frontend API path (`clerk-non-get-requests`), so what clerk-js did beyond
 * reading can be read from the report.
 *
 * ## The bot check is a stand-in
 *
 * The Clerk instance behind the build has Clerk's Turnstile bot check on, and
 * clerk-js waits for a Turnstile token before it sends the sign-up request.
 * On this spec's first run (2026-11-18) the automated browser was not
 * issued one: the Google cases sat in the challenge, the form correctly
 * locked, until they timed out. So Cloudflare's Turnstile script is
 * answered with a stand-in that hands clerk-js a placeholder token at once.
 * The token goes no further than the intercepted request. What this spec
 * proves is therefore what the form and clerk-js put in the request; that
 * the real bot check lets a person through is checked by hand on staging
 * (`docs/JOURNEYS.md`).
 *
 * ## The build must have Clerk configured
 *
 * Without both Clerk keys the page renders a "not configured" notice and
 * there is no form to drive. CI sets them from secrets on the e2e job; this
 * spec **fails** there when they are missing, and skips locally with the
 * reason. A skip is not proof.
 */

const CLERK_CONFIGURED =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.CLERK_SECRET_KEY)

/** The site under test (`use.baseURL`); every other host is third-party. */
const isSiteHost = (hostname: string): boolean =>
  hostname === '127.0.0.1' || hostname === 'localhost'

/**
 * The non-GET Clerk calls the guard lets through, by exact method and path.
 * `POST /v1/environment` is clerk-js fetching the instance settings at page
 * load; it creates nothing.
 */
const ALLOWED_CLERK_WRITES = new Set(['POST /v1/environment'])

/** Hand-run only: drop the per-test interceptor to prove the guard catches it. */
const NEGATIVE_CONTROL = process.env.SIGN_UP_E2E_NEGATIVE_CONTROL === '1'

const SIGN_UP_PATH = /\/v1\/client\/sign_ups(\/|$)/

/**
 * The stand-in for Cloudflare's Turnstile script; see the file comment. It
 * implements the calls clerk-js makes (`render`, `remove`, `reset`) and
 * answers `render` with a token on the next tick.
 */
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

const OPT_IN_LABEL =
  'Keep me posted when new articles are published. Unsubscribe anytime.'

const isSignUpWrite = (request: Request): boolean => {
  if (request.method() === 'GET' || request.method() === 'OPTIONS') return false
  try {
    return SIGN_UP_PATH.test(new URL(request.url()).pathname)
  } catch {
    return false
  }
}

/** The form-encoded body of an intercepted sign-up request. */
const bodyOf = (request: Request): URLSearchParams =>
  new URLSearchParams(request.postData() ?? '')

/** What the request carries as `unsafe_metadata`, parsed. */
const unsafeMetadataOf = (request: Request): unknown => {
  const raw = bodyOf(request).get('unsafe_metadata')
  return raw === null ? undefined : JSON.parse(raw)
}

type Intercepted = {
  /** Every sign-up write the page attempted, in order. */
  requests: Request[]
  /** Resolves with the first one. */
  first: Promise<Request>
  /** Lets the held request be answered. */
  release: () => void
}

/**
 * Catches every sign-up write, holds it "in flight" until `release()`, then
 * answers it with an error clerk-js understands. Nothing is forwarded.
 */
async function interceptSignUpWrites(
  page: Page,
  error: { code: string; message: string; param?: string },
): Promise<Intercepted> {
  const requests: Request[] = []
  let resolveFirst!: (request: Request) => void
  const first = new Promise<Request>((resolve, reject) => {
    resolveFirst = resolve
    // If the guard takes a write instead of this interceptor, fail at once
    // with the reason, instead of waiting out the test's timeout.
    onUnintercepted.set(page, (where) =>
      reject(
        new Error(
          `a sign-up write was not intercepted and was aborted: ${where}`,
        ),
      ),
    )
  })
  // The page may close before a rejection is awaited; it is still reported
  // by the guard's own check after the test.
  first.catch(() => {})
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })

  if (NEGATIVE_CONTROL) return { requests, first, release }

  await page.route(
    (url) => SIGN_UP_PATH.test(url.pathname),
    async (route: Route) => {
      const request = route.request()
      if (!isSignUpWrite(request)) return route.continue()
      requests.push(request)
      resolveFirst(request)
      await released
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
  return { requests, first, release }
}

const optIn = (page: Page) => page.getByRole('checkbox', { name: OPT_IN_LABEL })

/** Opens `/sign-up` and waits until the form's handlers are attached. */
async function openForm(page: Page) {
  await page.goto('/sign-up')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Create your account' }),
  ).toBeVisible()
  // Ticking and unticking is idempotent, and only a hydrated form reacts.
  await interactUntil(async () => {
    await optIn(page).check()
    await expect(optIn(page)).toBeChecked()
  })
  await optIn(page).uncheck()
  await expect(optIn(page)).not.toBeChecked()
}

/** Per page: what to do when the guard, not the interceptor, takes a write. */
const onUnintercepted = new WeakMap<Page, (where: string) => void>()

/** Per test: sign-up writes the guard aborted, and every non-GET Clerk call. */
let unintercepted: string[] = []
let clerkNonGet: string[] = []

test.beforeEach(async ({ context, page }) => {
  if (!CLERK_CONFIGURED) {
    const reason =
      'this build has no Clerk: set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY for both the build and this run'
    if (process.env.CI) throw new Error(`#377 proof cannot run: ${reason}`)
    test.skip(true, reason)
    return
  }

  unintercepted = []
  clerkNonGet = []

  // The fail-closed guard. Context routes run after page routes, so this
  // sees only what a test's own interceptor did not take. Its rule is its
  // own, not the interceptor's pattern: any write to a Clerk API path.
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
      // Path only: the query carries the browser's Clerk dev token, which
      // does not belong in a report.
      const where = `${request.method()} ${pathname}`
      unintercepted.push(where)
      await route.abort('blockedbyclient')
      onUnintercepted.get(page)?.(where)
    },
  )

  // Nothing is requested from Cloudflare: its script is the stand-in.
  await context.route(
    (url) => url.hostname.endsWith('challenges.cloudflare.com'),
    (route: Route) =>
      /\/turnstile\/v0\/api\.js$/.test(new URL(route.request().url()).pathname)
        ? route.fulfill({
            contentType: 'application/javascript',
            body: TURNSTILE_STAND_IN,
          })
        : route.abort('blockedbyclient'),
  )

  page.on('request', (request) => {
    if (request.method() === 'GET') return
    try {
      const url = new URL(request.url())
      if (url.pathname.startsWith('/v1/')) {
        clerkNonGet.push(`${request.method()} ${url.pathname}`)
      }
    } catch {
      // Not a URL we can read; not a Clerk call.
    }
  })
})

test.afterEach(async ({}, testInfo) => {
  if (!CLERK_CONFIGURED) return
  await testInfo.attach('clerk-non-get-requests', {
    body: JSON.stringify(clerkNonGet, null, 2),
    contentType: 'application/json',
  })
  expect(
    unintercepted,
    "every write to Clerk's sign-up endpoint must be intercepted by the test; these were aborted by the guard instead",
  ).toEqual([])
})

test.describe('sign-up: the mailing-list tick travels with the request', () => {
  test('the opt-in is inside the form, unticked, before both ways of signing up', async ({
    page,
  }) => {
    await openForm(page)
    const form = page.getByRole('form', { name: 'Create your account' })
    await expect(
      form.getByRole('checkbox', { name: OPT_IN_LABEL }),
    ).toBeVisible()

    const order = await form.evaluate((el) =>
      Array.from(el.querySelectorAll('input, button, a')).map(
        (control) =>
          control.getAttribute('name') ??
          control.getAttribute('aria-label') ??
          control.textContent?.trim() ??
          '',
      ),
    )
    expect(order.slice(0, 4)).toEqual([
      'mailingListOptIn',
      'Continue with Google',
      'emailAddress',
      'password',
    ])
  })

  test('email and password, ticked: the request carries a literal true, and the box is locked while it is in flight', async ({
    page,
  }) => {
    const intercepted = await interceptSignUpWrites(page, {
      code: 'form_param_format_invalid',
      message: 'Intercepted by the e2e spec: nothing was sent to Clerk.',
      param: 'email_address',
    })
    await openForm(page)

    await page.getByLabel('Email address').fill('ticked-reader@example.com')
    await page
      .getByLabel('Password', { exact: true })
      .fill('a long enough e2e password')
    await optIn(page).check()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()

    const request = await intercepted.first
    expect(request.method()).toBe('POST')
    expect(bodyOf(request).get('email_address')).toBe(
      'ticked-reader@example.com',
    )
    expect(unsafeMetadataOf(request)).toEqual({ mailingListOptIn: true })

    // The request is still in flight. The visitor tries to untick: the box
    // is disabled, so it stays as it was sent.
    await expect(optIn(page)).toBeDisabled()
    await optIn(page).click({ force: true })
    await expect(optIn(page)).toBeChecked()
    await expect(
      page.getByRole('button', { name: 'Continue with Google' }),
    ).toBeDisabled()

    // Answered with an error: the form unlocks and shows it under the field.
    intercepted.release()
    await expect(optIn(page)).toBeEnabled()
    await expect(
      page.getByText('Intercepted by the e2e spec: nothing was sent to Clerk.'),
    ).toBeVisible()
    expect(intercepted.requests).toHaveLength(1)
    await expect(page).toHaveURL(/\/sign-up\/?$/)
  })

  test('email and password, unticked: the request carries an explicit false', async ({
    page,
  }) => {
    const intercepted = await interceptSignUpWrites(page, {
      code: 'form_param_format_invalid',
      message: 'Intercepted by the e2e spec: nothing was sent to Clerk.',
      param: 'email_address',
    })
    await openForm(page)

    await page.getByLabel('Email address').fill('unticked-reader@example.com')
    await page
      .getByLabel('Password', { exact: true })
      .fill('a long enough e2e password')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()

    const request = await intercepted.first
    expect(unsafeMetadataOf(request)).toEqual({ mailingListOptIn: false })
    intercepted.release()
    await expect(optIn(page)).toBeEnabled()
    expect(intercepted.requests).toHaveLength(1)
  })

  test('Google, ticked: the request that starts it carries a literal true, and the box is locked while it is in flight', async ({
    page,
  }) => {
    const intercepted = await interceptSignUpWrites(page, {
      code: 'e2e_intercepted',
      message: 'Intercepted by the e2e spec: nothing was sent to Clerk.',
    })
    await openForm(page)

    await optIn(page).check()
    await page.getByRole('button', { name: 'Continue with Google' }).click()

    const request = await intercepted.first
    expect(request.method()).toBe('POST')
    const body = bodyOf(request)
    expect(body.get('strategy')).toBe('oauth_google')
    expect(unsafeMetadataOf(request)).toEqual({ mailingListOptIn: true })
    // Google is told to come back to this site's callback page.
    expect(new URL(body.get('redirect_url') ?? '').pathname).toBe(
      '/sign-up/sso-callback',
    )

    await expect(optIn(page)).toBeDisabled()
    await optIn(page).click({ force: true })
    await expect(optIn(page)).toBeChecked()

    intercepted.release()
    await expect(optIn(page)).toBeEnabled()
    expect(intercepted.requests).toHaveLength(1)
    // The browser never left for Google.
    await expect(page).toHaveURL(/\/sign-up\/?$/)
  })

  test('Google, unticked: the request carries an explicit false', async ({
    page,
  }) => {
    const intercepted = await interceptSignUpWrites(page, {
      code: 'e2e_intercepted',
      message: 'Intercepted by the e2e spec: nothing was sent to Clerk.',
    })
    await openForm(page)

    await page.getByRole('button', { name: 'Continue with Google' }).click()

    const request = await intercepted.first
    expect(bodyOf(request).get('strategy')).toBe('oauth_google')
    expect(unsafeMetadataOf(request)).toEqual({ mailingListOptIn: false })
    intercepted.release()
    await expect(optIn(page)).toBeEnabled()
    expect(intercepted.requests).toHaveLength(1)
  })
})
