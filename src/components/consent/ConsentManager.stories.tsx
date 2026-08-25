import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { ConsentManagerProvider } from '@c15t/react'

import { buildConsentManagerOptions } from './consent-config'
import { CookieBanner } from './CookieBanner'
import { CookieDialog } from './CookieDialog'
import { ManageCookiesLink } from './ManageCookiesLink'

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
      <div className="min-h-[60vh] p-6">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Demo surface. Use “Manage cookies” to open the dialog.
        </p>
        <ManageCookiesLink className="mt-3 inline-block text-sm font-medium text-zinc-800 dark:text-zinc-200" />
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

    await userEvent.click(
      await canvas.findByRole('button', { name: /manage cookies/i }),
    )
    const body = within(document.body)
    const dialog = await body.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
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
