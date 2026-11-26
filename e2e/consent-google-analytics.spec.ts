import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test'

import { isGoogleHost } from './support/google-hosts'
import { interactUntil } from './support/hydration'

/**
 * #361 — Google Analytics loads only after the visitor grants `measurement`.
 *
 * Before the fix, c15t's prebuilt Google tag was always-loaded: in a
 * consent-required region, with no choice made, gtag.js loaded and one
 * cookieless `page_view` went to Google, under a banner that says "Google
 * Analytics only with your consent" (measured on production, 2026-11-18). This
 * spec is the browser-level proof on a production build that it no longer
 * does: it reads every request the browser makes and every resource entry the
 * page records, in three regions and across a grant and a withdrawal.
 *
 * ## The build must have GA configured
 *
 * GA is registered only when `NEXT_PUBLIC_VERCEL_ENV === 'production'` and
 * `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set, and both are inlined at build time.
 * A build without them registers no Google code at all, so every "no request"
 * assertion here would pass for the wrong reason. CI sets both on its Build
 * and E2E steps (`.github/workflows/ci.yml`); this spec reads the same two
 * variables and **fails** in CI when they are missing. Locally it skips with
 * the reason, and a skip is not proof. That the id reached the bundle is
 * checked for real by the grant cases, which wait for a request carrying it.
 *
 * ## What reaches Google from this spec: nothing, by default
 *
 * Every request to a Google host is intercepted. By default gtag.js is
 * answered with a stand-in that does the one thing the assertions need from
 * it: on load, and on each history navigation, it sends a `page_view` to
 * `google-analytics.com/g/collect`, provided the page queued a `config` for
 * this id, and unless gtag's documented opt-out switch
 * (`window['ga-disable-<id>']`) is set. Like the real tag it sends while
 * storage is denied too, marked cookieless, so only the switch silences it. So the default run proves what the
 * site does (when it asks for the tag, and the state of the switch) and takes
 * no dependency on Google's servers in a required check.
 *
 * This build serves the whole suite, and most specs run in a region where
 * measurement is granted by default, so the app asks for gtag.js on their
 * pages too and they install no interceptor. `playwright.config.ts` therefore
 * makes Google's hosts unresolvable in every browser the suite launches; the
 * last case here proves that rule is in force.
 *
 * `GA_E2E_LIVE=1` lifts that rule for the tag's own host and lets the real
 * gtag.js through instead, to observe the real tag's behaviour. The `collect`
 * hits are still answered locally with a 204, and the measurement hosts stay
 * unresolvable underneath, so the browser demonstrably sends them and nothing
 * is delivered. Run that mode by hand, this spec alone, with a placeholder or
 * test id, when the gating changes; `docs/ANALYTICS.md` says how.
 */

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? ''
const BUILD_HAS_GA =
  GA_ID !== '' && process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
const LIVE = process.env.GA_E2E_LIVE === '1'

const isGoogle = (url: string): boolean => {
  try {
    return isGoogleHost(new URL(url).hostname)
  } catch {
    return false
  }
}

const isTagScript = (url: string): boolean =>
  /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?/.test(url) &&
  url.includes(`id=${GA_ID}`)

const isPageView = (url: string): boolean =>
  /\/g\/collect\?/.test(url) && url.includes('en=page_view')

/** The stand-in for gtag.js; see the file comment. */
const TAG_STAND_IN = `(() => {
  const id = ${JSON.stringify(GA_ID)}
  // Like the real tag under Consent Mode v2: it needs a config command for
  // this id before it sends anything, and it sends whether or not analytics
  // storage is granted. Denied storage only makes the hit cookieless (gcs=G100
  // instead of G111). That denied-state hit is the one #361 is about, so the
  // stand-in must not go quiet on it: after a withdrawal, the opt-out switch
  // is the only thing that may silence it.
  const commands = () =>
    (window.dataLayer || []).map((entry) => Array.from(entry))
  const configured = () =>
    commands().some((c) => c[0] === 'config' && c[1] === id)
  const storageGranted = () => {
    const consent = commands()
      .filter((c) => c[0] === 'consent')
      .pop()
    return !!consent && !!consent[2] && consent[2].analytics_storage === 'granted'
  }
  const send = () => {
    if (window['ga-disable-' + id] === true) return
    if (!configured()) return
    navigator.sendBeacon(
      'https://www.google-analytics.com/g/collect?v=2&tid=' + id +
        '&gcs=' + (storageGranted() ? 'G111' : 'G100') +
        '&en=page_view&dl=' + encodeURIComponent(location.href),
    )
  }
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method]
    history[method] = function (...args) {
      const before = location.href
      const result = original.apply(this, args)
      if (location.href !== before) send()
      return result
    }
  }
  send()
})()`

/**
 * Records every request to a Google host made by any page in the context, and
 * answers each one locally.
 */
async function watchGoogle(context: BrowserContext): Promise<string[]> {
  const seen: string[] = []
  context.on('request', (request) => {
    if (isGoogle(request.url())) seen.push(request.url())
  })
  await context.route(
    (url) => isGoogleHost(url.hostname),
    async (route) => {
      const url = route.request().url()
      if (isTagScript(url)) {
        if (LIVE) return route.continue()
        return route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: TAG_STAND_IN,
        })
      }
      // Measurement hits and anything else Google-bound: sent by the browser,
      // recorded above, never delivered.
      return route.fulfill({ status: 204, body: '' })
    },
  )
  return seen
}

/**
 * Waits until c15t has finished initialising on the current document.
 *
 * @remarks c15t makes its first script pass at the end of an async init, so
 * "no Google request yet" observed any earlier is true of an always-loaded
 * tag too. `hasFetchedBanner` flips in the store update that pass follows.
 */
async function consentRuntimeReady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const store = (
      window as unknown as {
        c15tStore?: { getState: () => { hasFetchedBanner?: boolean } }
      }
    ).c15tStore
    return store?.getState().hasFetchedBanner === true
  })
  await page.waitForLoadState('networkidle')
}

/** Every resource the page recorded, unfiltered, attached to the report. */
async function resourceDump(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<string[]> {
  const entries = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  )
  await testInfo.attach(`${name}.json`, {
    body: JSON.stringify(entries, null, 2),
    contentType: 'application/json',
  })
  return entries
}

const banner = (page: Page) =>
  page.getByRole('region', { name: 'Cookie consent' })

async function expectNothingFromGoogle(
  page: Page,
  seen: string[],
  testInfo: TestInfo,
): Promise<void> {
  await page.goto('/articles', { waitUntil: 'networkidle' })
  await expect(banner(page)).toBeVisible()
  await consentRuntimeReady(page)

  expect(seen, 'requests to Google hosts before any choice').toEqual([])
  const resources = await resourceDump(
    page,
    testInfo,
    'resources-before-choice',
  )
  // Guard the guard: an empty dump would make the next line vacuous.
  expect(resources.length).toBeGreaterThan(5)
  expect(resources.filter(isGoogle)).toEqual([])
  expect(
    await page.evaluate(() => ({
      dataLayer: 'dataLayer' in window,
      gtag: 'gtag' in window,
      tag: document.querySelector('script[src*="googletagmanager.com"]'),
    })),
    'the tag and its globals are not installed',
  ).toEqual({ dataLayer: false, gtag: false, tag: null })
}

test.beforeEach(() => {
  if (BUILD_HAS_GA) return
  const reason =
    'this build has no Google Analytics: set NEXT_PUBLIC_VERCEL_ENV=production and NEXT_PUBLIC_GA_MEASUREMENT_ID for both the build and this run'
  if (process.env.CI) throw new Error(`#361 proof cannot run: ${reason}`)
  test.skip(true, reason)
})

test.describe('consent-required region (FR)', () => {
  test.use({ extraHTTPHeaders: { 'x-vercel-ip-country': 'FR' } })

  test('no request reaches a Google host before a choice', async ({
    context,
    page,
  }, testInfo) => {
    const seen = await watchGoogle(context)
    await expectNothingFromGoogle(page, seen, testInfo)
  })

  test('accepting loads the tag and sends a page view; rejecting on a later visit stops every request', async ({
    context,
    page,
  }, testInfo) => {
    const seen = await watchGoogle(context)
    await expectNothingFromGoogle(page, seen, testInfo)

    // Grant.
    await banner(page).getByRole('button', { name: 'Accept all' }).click()
    await expect
      .poll(() => seen.filter(isTagScript).length, {
        message: 'gtag.js is requested once measurement is granted',
      })
      .toBe(1)
    await expect
      .poll(() => seen.filter(isPageView).length, {
        message: 'a page_view is sent once measurement is granted',
      })
      .toBeGreaterThan(0)
    expect(
      await page.evaluate(
        (key) => (window as unknown as Record<string, unknown>)[key],
        `ga-disable-${GA_ID}`,
      ),
    ).toBe(false)

    // A later visit: the grant is remembered and the tag loads again.
    const beforeRevisit = seen.length
    await page.goto('/about', { waitUntil: 'networkidle' })
    await consentRuntimeReady(page)
    await expect
      .poll(() => seen.slice(beforeRevisit).filter(isPageView).length)
      .toBeGreaterThan(0)

    // Withdraw from the footer's persistent entry point. c15t reloads the
    // page when a saved choice revokes a category it had granted.
    const dialog = page.getByRole('dialog')
    await interactUntil(async () => {
      await page.getByRole('button', { name: 'Manage Cookies' }).click()
      await expect(dialog).toBeVisible({ timeout: 2500 })
    })
    // The baseline is taken before the click, so anything the installed tag
    // sends while the withdrawal is being processed counts against it too.
    const atWithdrawal = seen.length
    const reloaded = page.waitForEvent('load')
    await dialog.getByRole('button', { name: 'Reject non-essential' }).click()
    await reloaded
    await consentRuntimeReady(page)

    // The same document, then a client-side navigation, then a fresh load.
    await page.getByRole('link', { name: 'Articles' }).first().click()
    await page.waitForURL('**/articles')
    await page.waitForLoadState('networkidle')
    await page.goto('/uses', { waitUntil: 'networkidle' })
    await consentRuntimeReady(page)

    expect(
      seen.slice(atWithdrawal),
      'requests to Google hosts after the withdrawal',
    ).toEqual([])
    const resources = await resourceDump(
      page,
      testInfo,
      'resources-after-withdrawal',
    )
    expect(resources.filter(isGoogle)).toEqual([])
    await expect(banner(page)).toBeHidden()
  })
})

test.describe('unknown region (no geo headers, fail-closed)', () => {
  test.use({ extraHTTPHeaders: {} })

  test('no request reaches a Google host before a choice', async ({
    context,
    page,
  }, testInfo) => {
    const seen = await watchGoogle(context)
    await expectNothingFromGoogle(page, seen, testInfo)
  })
})

test.describe('region where consent is not required (AU, the suite default)', () => {
  test('is unchanged: measurement is granted by default and the tag loads without a click', async ({
    context,
    page,
  }) => {
    const seen = await watchGoogle(context)
    await page.goto('/articles', { waitUntil: 'networkidle' })
    await consentRuntimeReady(page)

    await expect(banner(page)).toBeHidden()
    await expect.poll(() => seen.filter(isTagScript).length).toBe(1)
    await expect.poll(() => seen.filter(isPageView).length).toBeGreaterThan(0)
  })
})

/**
 * #375 — the automatic grant is held in memory only. The suite's default
 * region (AU) grants Analytics without asking; these cases then move the
 * visitor into a region that asks (FR), by a fresh load and inside one visit.
 */
test.describe('an automatic grant meeting a region that asks (#375)', () => {
  const FR = { 'x-vercel-ip-country': 'FR' }

  /** The stored consent record, as c15t keeps it in `localStorage`. */
  const storedRecord = (page: Page) =>
    page.evaluate(() => window.localStorage.getItem('bp-consent'))

  test('criterion (a): a fresh load in a region that asks, after an automatic grant, loads nothing from Google and shows the banner', async ({
    context,
    page,
  }, testInfo) => {
    const seen = await watchGoogle(context)
    await page.goto('/articles', { waitUntil: 'networkidle' })
    await consentRuntimeReady(page)
    await expect(banner(page)).toBeHidden()
    await expect.poll(() => seen.filter(isTagScript).length).toBe(1)
    expect(
      await storedRecord(page),
      'the automatic grant is not stored',
    ).toBeNull()

    await page.setExtraHTTPHeaders(FR)
    const atMove = seen.length
    await page.goto('/about', { waitUntil: 'networkidle' })
    await consentRuntimeReady(page)

    await expect(banner(page)).toBeVisible()
    expect(seen.slice(atMove), 'requests to Google hosts in FR').toEqual([])
    const resources = await resourceDump(page, testInfo, 'resources-fr')
    expect(resources.filter(isGoogle)).toEqual([])
    expect(await storedRecord(page)).toBeNull()
  })

  test('criterion (a), upgrade: a record the previous release stored as an automatic grant is not restored in a region that asks', async ({
    context,
    page,
  }, testInfo) => {
    const seen = await watchGoogle(context)
    await page.goto('/articles', { waitUntil: 'networkidle' })
    await consentRuntimeReady(page)

    // What the previous release left behind: the automatic grant saved
    // through c15t (`setConsent`), and the marker beside it.
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          c15tStore: {
            getState: () => {
              setConsent: (name: string, value: boolean) => unknown
            }
          }
        }
      ).c15tStore
      store.getState().setConsent('measurement', true)
      window.localStorage.setItem('bp-consent-autogrant', '1')
    })
    await expect
      .poll(() => storedRecord(page), {
        message: 'the legacy record is stored',
      })
      .not.toBeNull()

    await page.setExtraHTTPHeaders(FR)
    const atMove = seen.length
    await page.goto('/about', { waitUntil: 'networkidle' })
    await consentRuntimeReady(page)

    await expect(banner(page)).toBeVisible()
    expect(seen.slice(atMove), 'requests to Google hosts in FR').toEqual([])
    const resources = await resourceDump(page, testInfo, 'resources-fr-upgrade')
    expect(resources.filter(isGoogle)).toEqual([])
    expect(await storedRecord(page), 'the legacy record is deleted').toBeNull()
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem('bp-consent-autogrant'),
      ),
      'the marker is kept for tabs on the previous release',
    ).toBe('1')
  })

  /**
   * Moves the visitor into `headers`' region inside one visit, then follows
   * an internal link.
   *
   * @remarks The cookie is set as well as the header: a route the router
   * prefetched while the visitor was in AU commits without a new request, so
   * the header alone would not reach the proxy. Any request after the move
   * rewrites the cookie this way in production.
   */
  async function moveAndFollowLink(
    page: Page,
    context: BrowserContext,
    headers: Record<string, string>,
    required: boolean,
  ): Promise<void> {
    await page.setExtraHTTPHeaders(headers)
    await context.addCookies([
      {
        name: 'cookieConsentRequired',
        value: String(required),
        url: page.url(),
      },
    ])
    await page.getByRole('link', { name: 'Uses' }).first().click()
    await page.waitForURL('**/uses')
    await page.waitForLoadState('networkidle')
  }

  test('criterion (b): a region change inside a visit shows the banner, stores nothing and reports no page view for the landing route', async ({
    context,
    page,
  }) => {
    const seen = await watchGoogle(context)
    await page.goto('/articles', { waitUntil: 'networkidle' })
    await consentRuntimeReady(page)
    await expect.poll(() => seen.filter(isPageView).length).toBeGreaterThan(0)
    await expect(banner(page)).toBeHidden()

    const atMove = seen.length
    await moveAndFollowLink(page, context, FR, true)

    await expect(banner(page)).toBeVisible()
    expect(
      seen.slice(atMove).filter(isPageView),
      'page views after the move',
    ).toEqual([])
    expect(await storedRecord(page), 'no denial is stored').toBeNull()
    expect(
      await page.evaluate(
        (key) => (window as unknown as Record<string, unknown>)[key],
        `ga-disable-${GA_ID}`,
      ),
    ).toBe(true)
  })

  /**
   * Known gap, pinned (#375): the region is learned only from a request that
   * reaches the proxy. A link the router prefetched while the visitor was in
   * AU commits from that prefetch with no new request, so the cookie still
   * says "not required": the grant stays, the banner does not come back and
   * the landing route is reported, as in production. Measured 2026-11-26 on a
   * local production build: the cookie still `false` after two such
   * navigations, and a page view for each. Closing it needs a region check
   * the site does not make today, which is Brandon's decision; see the PR.
   * `test.fail` turns red the day this starts passing, so the note is
   * revisited.
   */
  test('criterion (b), the header alone: a prefetched route commits with no request, so the change is not seen (known gap)', async ({
    context,
    page,
  }) => {
    test.fail(
      true,
      'no request reaches the proxy on a prefetched navigation (#375)',
    )
    const prefetched: string[] = []
    page.on('request', (request) => {
      if (request.headers()['next-router-prefetch'])
        prefetched.push(request.url())
    })
    const seen = await watchGoogle(context)
    await page.goto('/articles', { waitUntil: 'networkidle' })
    await consentRuntimeReady(page)
    await expect.poll(() => seen.filter(isPageView).length).toBeGreaterThan(0)
    // The gap is about a route already prefetched; wait until it is.
    await expect
      .poll(() => prefetched.some((url) => new URL(url).pathname === '/uses'))
      .toBe(true)

    await page.setExtraHTTPHeaders(FR)
    const atMove = seen.length
    await page.getByRole('link', { name: 'Uses' }).first().click()
    await page.waitForURL('**/uses')
    await page.waitForLoadState('networkidle')

    await expect(banner(page)).toBeVisible({ timeout: 2000 })
    expect(
      seen.slice(atMove).filter(isPageView),
      'page views after the move',
    ).toEqual([])
  })

  test('control for (b): the same navigation where consent is still not required reports the landing route', async ({
    context,
    page,
  }) => {
    const seen = await watchGoogle(context)
    await page.goto('/articles', { waitUntil: 'networkidle' })
    await consentRuntimeReady(page)
    await expect.poll(() => seen.filter(isPageView).length).toBeGreaterThan(0)

    const atMove = seen.length
    await moveAndFollowLink(
      page,
      context,
      { 'x-vercel-ip-country': 'AU' },
      false,
    )

    await expect
      .poll(
        () =>
          seen
            .slice(atMove)
            .filter((url) => isPageView(url) && url.includes('%2Fuses')),
        { message: 'the stand-in reports the landing route' },
      )
      .toHaveLength(1)
    await expect(banner(page)).toBeHidden()
  })
})

test.describe('every other spec in this suite', () => {
  test.skip(LIVE, 'the live mode lets the tag host resolve on purpose')

  test('cannot reach Google: with no interceptor installed, the tag request fails to resolve', async ({
    page,
  }) => {
    // What an ordinary spec looks like to this build: the suite's default
    // region, measurement granted by default, the app asking for gtag.js,
    // and nothing in the test intercepting it.
    const failures: Array<{ url: string; error: string }> = []
    const finished: string[] = []
    page.on('requestfailed', (request) => {
      if (isGoogle(request.url()))
        failures.push({
          url: request.url(),
          error: request.failure()?.errorText ?? '',
        })
    })
    page.on('requestfinished', (request) => {
      if (isGoogle(request.url())) finished.push(request.url())
    })

    await page.goto('/articles', { waitUntil: 'networkidle' })
    await consentRuntimeReady(page)

    await expect
      .poll(() => failures.filter((failure) => isTagScript(failure.url)))
      .toHaveLength(1)
    expect(
      failures.every((f) => f.error.includes('ERR_NAME_NOT_RESOLVED')),
    ).toBe(true)
    expect(finished, 'requests to Google hosts that completed').toEqual([])
  })
})
