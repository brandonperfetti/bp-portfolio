import { defineConfig, devices } from '@playwright/test'

const isCi = Boolean(process.env.CI)

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
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
          },
        }
      : {}),
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
