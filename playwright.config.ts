import { defineConfig, devices } from '@playwright/test'

import { GOOGLE_HOSTS, TAG_SCRIPT_HOST } from './e2e/support/google-hosts'

const isCi = Boolean(process.env.CI)

/**
 * Hosts Google's tag and its measurement endpoints are served from, made
 * unresolvable for every browser this suite launches (#361).
 *
 * @remarks CI builds the e2e target with Google Analytics configured, so the
 * consent proof (`e2e/consent-google-analytics.spec.ts`) runs against a build
 * that really registers the tag. That same build serves every other spec, and
 * the suite's default geo is one where consent is not required, so the app
 * would ask Google for gtag.js on their pages too. A per-spec request
 * interceptor cannot cover specs that never install one; a resolver rule on
 * the browser does, before any connection is attempted. Playwright's own
 * `route` handlers run ahead of DNS, so the consent spec can still answer
 * these requests itself.
 *
 * `GA_E2E_LIVE=1`, the hand-run mode that observes the real tag
 * (`docs/ANALYTICS.md`), keeps every rule and adds one exception: the exact
 * host gtag.js is served from. The rest of that domain and the measurement
 * hosts stay unresolvable there too, so a hit to a listed host that the
 * consent spec's interceptor somehow missed still has nowhere to go, and
 * running the whole suite in that mode by mistake loads the tag but delivers
 * no measurement hit. Google's country domains are not in the list and are
 * neither blocked nor recorded (`e2e/support/google-hosts.ts`), which is why
 * that mode is run by hand with a placeholder or test id only.
 *
 * `^NOTFOUND` is the value Chromium's resolver treats as "fail this lookup"
 * (`net/dns/mapped_host_resolver.cc`): the request fails with
 * `ERR_NAME_NOT_RESOLVED` without a DNS query being made. The list of hosts is
 * shared with the consent spec's interceptor (`e2e/support/google-hosts.ts`).
 *
 * Chromium-only: a Firefox or WebKit project would need its own block, and
 * this argument would have to move into the `chromium` project.
 */
const blockGoogleHosts = [
  `--host-resolver-rules=${[
    ...GOOGLE_HOSTS.flatMap((host) => [
      `MAP ${host} ^NOTFOUND`,
      `MAP *.${host} ^NOTFOUND`,
    ]),
    ...(process.env.GA_E2E_LIVE === '1' ? [`EXCLUDE ${TAG_SCRIPT_HOST}`] : []),
  ].join(', ')}`,
]

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: isCi ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    // Deterministic consent geo (#114 mechanism B). The suite runs without a
    // Vercel edge, so `src/proxy.ts` sees no `x-vercel-ip-*` headers and
    // fail-closes `cookieConsentRequired` to true — the fixed-bottom consent
    // banner then overlays bottom-of-page controls (e.g. the Corvus Send
    // button) and 30s-timeouts the click. Supplying a non-consent geo (AU: not
    // EU/EEA/UK, not a US/CA privacy subdivision — immune to future
    // CONSENT_REQUIRED_SUBDIVISIONS edits) resolves consent to NOT-required so
    // the banner is absent by default — exercising the real product geo path,
    // NOT weakening the fail-closed default (that governs *absent* geo, which
    // production never has). The consent-scroll-lock spec overrides this with a
    // consent-required geo so it keeps testing the banner-present path.
    extraHTTPHeaders: { 'x-vercel-ip-country': 'AU' },
    // Drive the suite in the app's first-class reduced-motion path: every
    // animated surface (ScrollReveal, AnimatedHeadline, …) renders static,
    // fully-visible DOM under `prefers-reduced-motion`. Without this the
    // scroll-reveal (`autoAlpha` → `visibility:hidden`) leaves deep-linked and
    // below-the-fold content invisible until a scroll fires GSAP's
    // ScrollTrigger, which races the assertion and flakes (e.g. the tech
    // deep-link and sticky-rail specs). The specs assert URL sync, filtering,
    // focus and layout — none assert that the reveal animation played.
    contextOptions: { reducedMotion: 'reduce' },
    // Sandboxed/cloud agents pin a preinstalled Chromium via env; CI and
    // local runs resolve Playwright's own managed browser when unset.
    launchOptions: {
      args: blockGoogleHosts,
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : {}),
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: isCi ? 'pnpm start' : 'pnpm dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
})
