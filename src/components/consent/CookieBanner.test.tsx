import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ConsentManagerProvider } from '@c15t/react'

import { buildConsentManagerOptions } from './consent-config'
import { CookieBanner } from './CookieBanner'

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

function renderBanner(consentRequired: boolean | null) {
  return render(
    <ConsentManagerProvider
      options={buildConsentManagerOptions({ scripts: [] })}
    >
      <CookieBanner consentRequired={consentRequired} />
    </ConsentManagerProvider>,
  )
}

describe('CookieBanner layout (Fix 1 — centered, not left-pinned)', () => {
  it('shows the banner where consent is required and centers its card', () => {
    renderBanner(true)
    const region = screen.getByRole('region', { name: /cookie consent/i })
    // Gutters live on the fixed wrapper as padding (not margins on the card).
    expect(region.className).toContain('px-3')
    expect(region.className).toContain('sm:px-4')

    const card = region.firstElementChild as HTMLElement
    // The card stays mx-auto-centered at max-w-3xl; the `sm:mx-4` that used to
    // override mx-auto (and clip the left edge) is gone.
    expect(card.className).toContain('mx-auto')
    expect(card.className).toContain('max-w-3xl')
    expect(card.className).not.toContain('sm:mx-4')
  })

  it('does not render the banner where consent is confidently not required', () => {
    renderBanner(false)
    expect(
      screen.queryByRole('region', { name: /cookie consent/i }),
    ).not.toBeInTheDocument()
  })
})
