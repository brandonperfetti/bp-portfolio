import { useEffect } from 'react'

import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { ConsentManagerProvider, useConsentManager } from '@c15t/react'

import { buildConsentManagerOptions } from './consent-config'
import { CookieBanner } from './CookieBanner'
import { CookieDialog } from './CookieDialog'
import { ManageCookiesLink } from './ManageCookiesLink'

/**
 * Resets c15t consent state on mount so each story starts unconsented.
 *
 * @remarks c15t caches its consent store in a module-level singleton, so a
 * prior story that recorded consent (e.g. `RequiredBanner` "accept all")
 * leaves `hasConsented()` true for every later story — and `meta.beforeEach`'s
 * `localStorage.clear()` does NOT reset that in-memory store. Without this,
 * `UnknownFailClosed`'s fail-closed banner is suppressed by the carried-over
 * consent ({@link shouldShowBanner} = `consentRequired !== false && !hasConsented`),
 * so the assertion depends on story order. `resetConsents()` clears the record
 * (`consentInfo: null` + deletes storage), restoring real per-story isolation.
 */
function ResetConsentOnMount() {
  const { resetConsents } = useConsentManager()
  useEffect(() => {
    resetConsents()
    // Run once per mount; resetConsents is a stable store method.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/**
 * The custom (headless c15t) cookie banner + manage dialog in bp's design
 * system. Geo is decided upstream (the `cookieConsentRequired` cookie); here
 * the required-ness is passed directly to `CookieBanner` so each story renders
 * a specific state without middleware. No GA script is registered (empty
 * scripts). The a11y addon (`test:'error'`) runs on every story; light/dark
 * parity is reviewable via the toolbar theme toggle. `play` functions run under
 * `pnpm test:storybook` / CI, not in a headless sandbox.
 */
function ConsentHarness({
  consentRequired,
}: {
  consentRequired: boolean | null
}) {
  return (
    <ConsentManagerProvider
      options={buildConsentManagerOptions({ scripts: [] })}
    >
      <ResetConsentOnMount />
      {/* The trigger sits well below the fold (tall spacer above it) so the
          scroll-preservation play function can scroll it into view first —
          reproducing the app's "scrolled down, footer Manage-cookies in view"
          scenario — and then assert the dialog opens WITHOUT jumping the window
          scroll (#110). A trigger at the top would be scrolled back into view by
          userEvent.click, moving the window itself and masking the real check. */}
      <div className="p-6">
        <div aria-hidden className="h-[200vh]" />
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Demo surface. Use “Manage cookies” to open the dialog.
        </p>
        <ManageCookiesLink className="mt-3 inline-block text-sm font-medium text-zinc-800 dark:text-zinc-200" />
        <div aria-hidden className="h-[50vh]" />
      </div>
      <CookieBanner consentRequired={consentRequired} />
      <CookieDialog />
    </ConsentManagerProvider>
  )
}

const meta = {
  title: 'UI/ConsentManager',
  component: ConsentHarness,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  async beforeEach() {
    try {
      window.localStorage.clear()
    } catch {
      // Storage unavailable in some sandboxes — stories still render.
    }
  },
} satisfies Meta<typeof ConsentHarness>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Consent required (e.g. an EU visitor): the banner shows with everything
 * denied by default. Accepting dismisses it.
 */
export const RequiredBanner: Story = {
  args: { consentRequired: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const banner = await canvas.findByRole('region', {
      name: /cookie consent/i,
    })
    expect(banner).toBeInTheDocument()
    await userEvent.click(
      await canvas.findByRole('button', { name: /accept all/i }),
    )
    await waitFor(() =>
      expect(
        canvas.queryByRole('region', { name: /cookie consent/i }),
      ).not.toBeInTheDocument(),
    )
  },
}

/**
 * Not required (e.g. a US-WA visitor): NO banner shows — analytics run
 * unconsented — but the "Manage cookies" button still opens the dialog so the
 * visitor can opt out.
 */
export const NotRequiredSuppressed: Story = {
  args: { consentRequired: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(
      canvas.queryByRole('region', { name: /cookie consent/i }),
    ).not.toBeInTheDocument()

    // The persistent link label is CMS-driven; with no ConsentConfigProvider
    // the context default renders exactly "Manage Cookies".
    const trigger = await canvas.findByRole('button', {
      name: 'Manage Cookies',
    })
    expect(trigger).toBeInTheDocument()
    // Scroll-lock regression guard (#110): scroll down so the trigger is in
    // view, then opening the dialog must NOT jump the window scroll (was
    // scrollY 2200 → 0 before the fix). Scroll the trigger into view first so
    // userEvent.click doesn't scroll it (and the window) itself — the check is
    // then the real one: does opening the dialog preserve the scroll position.
    trigger.scrollIntoView({ block: 'center' })
    const scrolled = window.scrollY
    // Guard the guard: the page must actually be scrolled, or a "reset to 0"
    // bug would be invisible from an already-0 position.
    expect(
      scrolled,
      'the page must be scrolled to exercise the #110 guard',
    ).toBeGreaterThan(5)
    await userEvent.click(trigger)
    const body = within(document.body)
    const dialog = await body.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(
      Math.abs(window.scrollY - scrolled),
      `scroll preserved on open (was ${scrolled}, now ${window.scrollY})`,
    ).toBeLessThan(5)
    // Toggle the analytics switch and save.
    const analytics = within(dialog).getByRole('switch', { name: /analytics/i })
    await userEvent.click(analytics)
    await userEvent.click(
      within(dialog).getByRole('button', { name: /save choices/i }),
    )
  },
}

/**
 * Unknown geo (fail-closed): the banner shows, same as a required visitor.
 */
export const UnknownFailClosed: Story = {
  args: { consentRequired: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(
      await canvas.findByRole('region', { name: /cookie consent/i }),
    ).toBeInTheDocument()
  },
}

/**
 * #112: opening the dialog from a **banner** trigger and closing it must return
 * focus to that trigger, not to `<body>`. The banner hides itself while the
 * dialog is open, so the button that comes back is a *new node* — the reason
 * `document.activeElement` alone could never restore it.
 *
 * @remarks Escape-to-close and the focus trap (0f7bd362) stay intact — this
 * story exercises both on the way to the assertion.
 */
export const BannerTriggerReturnsFocus: Story = {
  args: { consentRequired: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('region', { name: /cookie consent/i })

    await userEvent.click(
      await canvas.findByRole('button', { name: /customize/i }),
    )
    const body = within(document.body)
    const dialog = await body.findByRole('dialog')

    // The originating trigger is gone while the dialog is open — the reason
    // `document.activeElement` alone can no longer name a return target.
    expect(canvas.queryByRole('button', { name: /customize/i })).toBeNull()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(dialog).not.toBeInTheDocument())

    const remounted = await canvas.findByRole('button', { name: /customize/i })
    await waitFor(() => expect(document.activeElement).toBe(remounted))
    expect(document.activeElement).not.toBe(document.body)
  },
}
