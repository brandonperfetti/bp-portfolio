import { useEffect } from 'react'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { ConsentManagerProvider, useConsentManager } from '@c15t/react'

import { buildConsentManagerOptions } from './consent-config'
import {
  CONSENT_TRIGGER_ATTR,
  clearConsentTrigger,
  takeConsentTrigger,
} from './consent-focus'
import { CONSENT_INSET_PROPERTY, releaseConsentInset } from './consent-inset'
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

afterEach(() => {
  cleanup()
  clearConsentTrigger()
  releaseConsentInset()
})

/**
 * Resets c15t's module-level singleton on mount. Without this, a test that
 * opens the dialog (or records consent) leaves `activeUI`/`hasConsented` set
 * for every later test in the file — the same singleton-leak lesson the
 * Storybook harness learned in #111, where `localStorage.clear()` alone was not
 * enough.
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

function renderBanner(consentRequired: boolean | null) {
  return render(
    <ConsentManagerProvider
      options={buildConsentManagerOptions({ scripts: [] })}
    >
      <ResetConsentOnMount />
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

describe('CookieBanner default (empty-CMS) copy + toggles', () => {
  // Rendered without a ConsentConfigProvider → the context default
  // (DEFAULT_CONSENT_CONFIG) drives it, i.e. today's copy verbatim.
  it('renders the default message + buttons, including Customize (showManageButton on)', () => {
    renderBanner(true)
    expect(
      screen.getByText(/cookieless analytics baseline/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /cookie details/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^accept all$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /reject non-essential/i }),
    ).toBeInTheDocument()
    // showManageButton defaults on → the Customize control is present.
    expect(
      screen.getByRole('button', { name: /customize/i }),
    ).toBeInTheDocument()
  })
})

describe('CookieBanner dialog triggers (#112 — return-focus capture)', () => {
  it('labels both banner triggers so a remounted one can be re-found', () => {
    renderBanner(true)
    expect(screen.getByRole('button', { name: /customize/i })).toHaveAttribute(
      CONSENT_TRIGGER_ATTR,
      'banner-customize',
    )
    expect(
      screen.getByRole('button', { name: /cookie details/i }),
    ).toHaveAttribute(CONSENT_TRIGGER_ATTR, 'banner-cookie-details')
  })

  it.each([
    ['customize', /customize/i, 'banner-customize'],
    ['cookie details', /cookie details/i, 'banner-cookie-details'],
  ] as const)(
    'records the "%s" trigger synchronously, before the banner unmounts',
    async (_label, name, id) => {
      const user = userEvent.setup()
      renderBanner(true)
      const trigger = screen.getByRole('button', { name })

      await user.click(trigger)

      // The capture is what CookieDialog consumes on open. Without it the
      // dialog would read `document.activeElement` — already `<body>`, because
      // this banner un-renders itself the moment activeUI becomes 'dialog'.
      expect(takeConsentTrigger()).toEqual({ id, element: trigger })
      expect(
        screen.queryByRole('region', { name: /cookie consent/i }),
      ).not.toBeInTheDocument()
    },
  )
})

describe('CookieBanner shell inset (#115 — reserve space while shown)', () => {
  it('reserves bottom space while consent is required and undecided', () => {
    renderBanner(true)
    // jsdom has no layout, so the measured height is 0 — the *reservation*
    // (and its release below) is what is observable here; the real measurement
    // and the resulting no-overlap are covered by the story + e2e spec.
    expect(
      document.documentElement.style.getPropertyValue(CONSENT_INSET_PROPERTY),
    ).toBe('0px')
    expect(document.body.style.paddingBottom).toBe(
      `var(${CONSENT_INSET_PROPERTY})`,
    )
  })

  it('reserves nothing where consent is confidently not required', () => {
    renderBanner(false)
    expect(
      document.documentElement.style.getPropertyValue(CONSENT_INSET_PROPERTY),
    ).toBe('')
    expect(document.body.style.paddingBottom).toBe('')
  })
})
