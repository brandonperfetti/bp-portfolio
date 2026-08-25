import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ConsentManagerProvider } from '@c15t/react'

import { buildConsentManagerOptions } from './consent-config'
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

afterEach(cleanup)

function renderDialog() {
  return render(
    <ConsentManagerProvider
      options={buildConsentManagerOptions({ scripts: [] })}
    >
      <ManageCookiesLink />
      <CookieDialog />
    </ConsentManagerProvider>,
  )
}

describe('CookieDialog open focus (Fix 2 — no scroll jump)', () => {
  it('opens from the manage trigger and focuses the dialog content (a11y kept, no top-focus jump)', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: /manage cookies/i }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // The disclosure copy is in the dialog (resolves the review Sp-2 gap).
    expect(screen.getByText(/consent mode v2/i)).toBeInTheDocument()
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
