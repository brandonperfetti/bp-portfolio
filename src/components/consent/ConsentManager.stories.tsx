import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { ReactNode } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import '@c15t/react/styles.css'
import {
  ConsentBanner,
  ConsentDialog,
  ConsentManagerProvider,
} from '@c15t/react'

import { buildConsentManagerOptions } from './consent-config'
import { ManageCookiesLink } from './ManageCookiesLink'

/**
 * c15t consent banner + dialog, wired the way the app mounts them but in
 * `mode: 'offline'` with a forced jurisdiction (`overrides`) so each story
 * renders a specific policy without a backend. No GA4 script is registered in
 * Storybook (scripts are empty) — these stories exercise the consent UI and
 * the "Manage cookies" entry point, not Google Tag loading.
 *
 * The a11y addon (`test: 'error'`) runs on every story; light/dark parity is
 * reviewable via the toolbar theme toggle. The browser-mode `play` functions
 * only execute under `pnpm test:storybook` / CI — not in a headless sandbox.
 */
function ConsentHarness({
  country,
  region,
  children,
}: {
  country?: string
  region?: string
  children?: ReactNode
}) {
  const options = buildConsentManagerOptions({
    scripts: [],
    disableAnimation: false,
    overrides: { country, region },
  })
  return (
    <ConsentManagerProvider options={options}>
      <div className="min-h-[60vh] p-6">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Demo surface. Use “Manage cookies” to open the consent dialog.
        </p>
        <ManageCookiesLink className="mt-3 inline-block text-sm font-medium text-zinc-800 dark:text-zinc-200" />
        {children}
      </div>
      <ConsentBanner />
      <ConsentDialog />
    </ConsentManagerProvider>
  )
}

const meta = {
  title: 'UI/ConsentManager',
  component: ConsentHarness,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  // Each story starts from a clean consent state so the banner/dialog behave
  // deterministically (offline mode persists choices to localStorage).
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
 * GDPR-class visitor (Germany): the banner shows and every non-necessary
 * category defaults OFF (opt-in). This is also the shape a no-geo offline
 * visitor gets, since europeOptIn is the fallback pack.
 */
export const GdprGermany: Story = {
  args: { country: 'DE' },
  play: async ({ canvasElement }) => {
    const body = within(document.body)
    // The consent surface renders with recognizable consent copy.
    await waitFor(() =>
      expect(body.getByText(/cookie|consent|privacy/i)).toBeInTheDocument(),
    )
    // The persistent entry point is present regardless of banner state.
    expect(
      within(canvasElement).getByRole('button', { name: /manage cookies/i }),
    ).toBeInTheDocument()
  },
}

/**
 * CCPA-class visitor (California): opt-out model — no banner is shown, but the
 * "Manage cookies" entry point still opens the dialog (the Brytecore
 * ManageCookiesLink requirement). The play function opens the dialog and
 * toggles a category.
 */
export const CcpaCalifornia: Story = {
  args: { country: 'US', region: 'CA' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const manage = await canvas.findByRole('button', {
      name: /manage cookies/i,
    })
    await userEvent.click(manage)

    // The dialog (portaled to <body>) opens with consent controls.
    const body = within(document.body)
    await waitFor(() => expect(body.getByRole('dialog')).toBeInTheDocument())
    // Category toggles are real switches/checkboxes — toggle the first
    // non-necessary one if present (selectors are best-effort against c15t's
    // default English UI; confirm on the first CI Storybook run).
    const switches = body.queryAllByRole('switch')
    if (switches.length > 0) {
      await userEvent.click(switches[switches.length - 1])
    }
  },
}

/**
 * No-geo (offline default): with no `overrides`, offline mode falls back to
 * europeOptIn — banner shown, denied by default. Mirrors real production
 * offline behaviour.
 */
export const NoGeoFallback: Story = {
  args: {},
  play: async () => {
    const body = within(document.body)
    await waitFor(() =>
      expect(body.getByText(/cookie|consent|privacy/i)).toBeInTheDocument(),
    )
  },
}
