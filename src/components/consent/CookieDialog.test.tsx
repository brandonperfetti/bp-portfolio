import { useEffect } from 'react'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ConsentManagerProvider, useConsentManager } from '@c15t/react'

import { buildConsentManagerOptions } from './consent-config'
import {
  CONSENT_TRIGGER_ATTR,
  captureConsentTrigger,
  clearConsentTrigger,
  takeConsentTrigger,
} from './consent-focus'
import { CookieDialog } from './CookieDialog'
import { ManageCookiesLink } from './ManageCookiesLink'

// jsdom has no matchMedia; c15t's color-scheme hook needs it (mirrors the
// repo's ShareModal.test pattern).
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
})

afterEach(() => {
  cleanup()
  clearConsentTrigger()
})

/**
 * Resets c15t's module-level singleton on mount. Without this, a test that
 * leaves the dialog open (or records consent) leaks `activeUI`/`hasConsented`
 * into every later test in the file — the same singleton-leak lesson the
 * Storybook harness learned in #111.
 */
function ResetConsentOnMount() {
  const { resetConsents, setActiveUI } = useConsentManager()
  useEffect(() => {
    resetConsents()
    setActiveUI('none')
    // Run once per mount; both are stable store methods.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderDialog() {
  return render(
    <ConsentManagerProvider
      options={buildConsentManagerOptions({ scripts: [] })}
    >
      <ResetConsentOnMount />
      <ManageCookiesLink />
      <CookieDialog />
    </ConsentManagerProvider>,
  )
}

/**
 * A stand-in for `CookieBanner`'s "Customize" button, reproducing the one
 * property that causes #112: it un-renders itself the moment the dialog opens
 * and comes back as a *new node* when the dialog closes. Kept local so this
 * spec exercises `CookieDialog`'s restoration wiring without pulling the whole
 * banner (its own capture/attribute contract is pinned in CookieBanner.test).
 */
function UnmountingTrigger() {
  const { activeUI, setActiveUI } = useConsentManager()
  if (activeUI === 'dialog') return null
  return (
    <button
      type="button"
      {...{ [CONSENT_TRIGGER_ATTR]: 'banner-customize' }}
      onClick={(event) => {
        captureConsentTrigger('banner-customize', event.currentTarget)
        setActiveUI('dialog', { force: true })
      }}
    >
      Customize
    </button>
  )
}

describe('CookieDialog open focus (Fix 2 — no scroll jump)', () => {
  it('opens from the manage trigger and focuses the dialog content (a11y kept, no top-focus jump)', async () => {
    const user = userEvent.setup()
    renderDialog()

    // The persistent link label is CMS-driven; with no provider the context
    // default renders exactly "Manage Cookies".
    expect(
      screen.getByRole('button', { name: 'Manage Cookies' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /manage cookies/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // The disclosure copy is in the dialog (resolves the review Sp-2 gap).
    expect(screen.getByText(/consent mode v2/i)).toBeInTheDocument()
    // Default (empty-CMS) categories: Essential + Analytics render; Social and
    // Advertising are OFF by default and must NOT render.
    expect(screen.getByText(/strictly necessary/i)).toBeInTheDocument()
    expect(screen.getByText(/analytics \(measurement\)/i)).toBeInTheDocument()
    expect(screen.queryByText(/social media/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^advertising$/i)).not.toBeInTheDocument()
    // The content is the programmatically-focusable target (tabIndex -1) that
    // the open path focuses with `preventScroll`, instead of Radix's default
    // auto-focus that scrolled the page to the top guard. The actual focus
    // landing + no-scroll is a browser/play-fn check (not observable in jsdom).
    expect(dialog).toHaveAttribute('tabindex', '-1')
    // Escape still closes (focus trap + Escape preserved).
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  })
})

describe('CookieDialog return focus (#112)', () => {
  it('labels the persistent footer trigger and records it on click', async () => {
    const user = userEvent.setup()
    renderDialog()
    const trigger = screen.getByRole('button', { name: 'Manage Cookies' })
    // The footer trigger doubles as the fallback return target when a banner
    // trigger is gone for good, so it must be findable by attribute.
    expect(trigger).toHaveAttribute(CONSENT_TRIGGER_ATTR, 'footer-manage')

    await user.click(trigger)
    await screen.findByRole('dialog')

    // The dialog consumed the capture on open — nothing is left pending for a
    // later programmatic open to inherit.
    expect(takeConsentTrigger()).toBeNull()
  })

  it('returns focus to the footer trigger on close (0f7bd362 behavior kept)', async () => {
    const user = userEvent.setup()
    renderDialog()
    const trigger = screen.getByRole('button', { name: 'Manage Cookies' })

    await user.click(trigger)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )

    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('returns focus to a banner-style trigger that unmounted and remounted', async () => {
    const user = userEvent.setup()
    render(
      <ConsentManagerProvider
        options={buildConsentManagerOptions({ scripts: [] })}
      >
        <ResetConsentOnMount />
        <UnmountingTrigger />
        <ManageCookiesLink />
        <CookieDialog />
      </ConsentManagerProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Customize' }))
    await screen.findByRole('dialog')
    // The #112 shape: the trigger is gone while the dialog is open, so
    // `document.activeElement` alone can no longer name a return target.
    expect(screen.queryByRole('button', { name: 'Customize' })).toBeNull()

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )

    const remounted = await screen.findByRole('button', { name: 'Customize' })
    await waitFor(() => expect(document.activeElement).toBe(remounted))
    expect(document.activeElement).not.toBe(document.body)
  })
})
